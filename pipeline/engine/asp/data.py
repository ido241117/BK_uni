"""Typed input data and JSON loaders for the ASP planner.

This module owns the dataset schema: grading and graduation policies, tuition
rules, curriculum validation, and the loader entry points.  It turns JSON into
immutable dataclasses; it does not emit ASP facts or run clingo.
"""

from __future__ import annotations


import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ScaleRule:
    """One numeric scale declared by ``grading_policy.json``.

    ``precision`` is the number of decimal places used when the scale is
    compiled to ASP.  Everything the engine sees is an integer:
    ``value * 10**precision``.
    """

    id: str
    minimum: Decimal
    maximum: Decimal
    precision: int
    role: str = "gpa"
    default: bool = False
    representative: str = "midpoint"

    def scaled(self, value: Decimal) -> int:
        factor = 10**self.precision
        scaled = value * factor
        if scaled != scaled.to_integral_value():
            raise ValueError(
                f"scale {self.id!r}: {value} does not fit precision "
                f"{self.precision}"
            )
        return int(scaled)

    def representative_value(self, minimum: Decimal, maximum: Decimal) -> Decimal:
        if self.representative == "min":
            return minimum
        if self.representative == "max":
            return maximum
        # Score bands are written with as many decimals as the source
        # transcript needs (``8.5``..``9.49``), so the midpoint can have one
        # more decimal than the scale.  Round only the midpoint to the scale
        # precision; an explicit min/max must already fit it.
        value = (minimum + maximum) / 2
        quantum = Decimal(1).scaleb(-self.precision)
        return value.quantize(quantum, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class GradeRule:
    """One row of ``grading_policy.json`` -> ``grade_scale[]``."""

    symbol: str
    points: Decimal | None
    passing: bool
    in_gpa: bool
    earns_credit: bool
    min_score: Decimal | None = None
    max_score: Decimal | None = None
    scale_points: tuple[tuple[str, Decimal], ...] = ()

    @property
    def points_scaled(self) -> int | None:
        """Default-scale grade points x100 (4.00 -> 400)."""
        if self.points is None:
            return None
        return int(self.points * 100)

    def value_for(self, scale: ScaleRule, default_scale: str) -> Decimal | None:
        """Return this grade's value on ``scale``, if the policy defines one."""
        for scale_id, value in self.scale_points:
            if scale_id == scale.id:
                return value
        if scale.id == default_scale and self.points is not None:
            return self.points
        if (
            scale.role == "score"
            and self.min_score is not None
            and self.max_score is not None
        ):
            return scale.representative_value(self.min_score, self.max_score)
        return None


@dataclass(frozen=True)
class Requirement:
    """One graduation requirement from ``graduation_requirements.json``."""

    id: str
    type: str
    value: int | Decimal | None = None


@dataclass(frozen=True)
class ExternalMilestone:
    deadline_type: str
    year: int | None
    minimum: int


@dataclass(frozen=True)
class ExternalRequirement:
    id: str
    unit: str
    mode: str
    enforcement: str
    milestones: tuple[ExternalMilestone, ...] = ()


@dataclass(frozen=True)
class Policy:
    """All non-curriculum constants needed to build ``policy.lp``.

    Data-backed fields are filled by ``load_bundle``.  The
    final block contains planner defaults that the dataset does not describe
    yet; keeping them here makes every other module data-driven.
    """

    # --- grading_policy.json ------------------------------------------------
    policy_id: str
    schema_version: int
    effective_from: int
    effective_to: int | None
    grades: tuple[GradeRule, ...]
    scales: tuple[ScaleRule, ...] = ()
    default_scale: str = "gpa_4"
    gpa_formula: str = "credit_weighted_mean"
    included_course_kinds: tuple[str, ...] = ("regular",)
    scale_max: Decimal = Decimal("4.00")
    rounding_mode: str = "half_up"
    rounding_decimals: int = 2
    gpa_attempt_selection: str = "latest"
    retake_grade_cap: str | None = None
    keep_old_attempts: bool = True
    equivalence: str = "use_course_equivalents"

    # --- graduation_requirements.json --------------------------------------
    graduation_requirements: tuple[Requirement, ...] = ()
    external_requirements: tuple[ExternalRequirement, ...] = ()
    min_total_credits: int | None = None
    min_cumulative_gpa: Decimal | None = None
    graduation_curriculum_id: str | None = None

    # --- planner defaults (not in the JSON dataset yet) ---------------------
    # Credits accumulated *before* a milestone course, as a percentage of the
    # degree.  These used to be module-level constants in engine.py.
    internship_pct: int = 65
    specialized_project_pct: int = 70
    capstone_pct: int = 85
    # Semester load bounds used by the ASP layer when the CLI does not
    # override them.
    default_min_load: int = 14
    default_max_load: int = 21
    summer_min_load: int = 0
    summer_max_load: int = 9
    default_horizon: int = 12
    # Academic calendar: term parts cycle 1..term_parts, each named by
    # term_part_types; the listed types are optional "extra" terms (summer).
    term_parts: int = 3
    term_part_types: tuple[str, ...] = ("regular", "regular", "summer")
    extra_semester_types: tuple[str, ...] = ("summer",)
    # Calendar shift/offset of the semester index (kept as clingo constants).
    calendar_shift: int = 0
    term_offset: int = 0

    def scale(self, scale_id: str) -> ScaleRule:
        for item in self.scales:
            if item.id == scale_id:
                return item
        raise KeyError(scale_id)

    @property
    def default_scale_rule(self) -> ScaleRule:
        return self.scale(self.default_scale)

    grade_map: dict[str, GradeRule] = field(default_factory=dict, repr=False)

    def grade(self, symbol: str) -> GradeRule:
        return self.grade_map[symbol]

    def requirement(self, requirement_type: str) -> Requirement | None:
        for item in self.graduation_requirements:
            if item.type == requirement_type:
                return item
        return None


"""Load and validate the JSON inputs used by the ASP planner.

Only ground-truth files are read here:

* ``curriculum.json``
* ``grading_policy.json``
* ``graduation_requirements.json``

``student_history.json`` is intentionally not loaded: the example file is
incomplete.  Student data is still supplied to clingo through a hand-written
``student.lp`` for now.
"""


class DataError(ValueError):
    """Raised when a JSON input is structurally invalid or inconsistent."""


def _need(obj: dict[str, Any], key: str, context: str) -> Any:
    if key not in obj:
        raise DataError(f"{context}: missing required field {key!r}")
    return obj[key]


def _str(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DataError(f"{context}: expected a non-empty string")
    return value


def _int(value: Any, context: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise DataError(f"{context}: expected an integer")
    return value


def _bool(value: Any, context: str) -> bool:
    if not isinstance(value, bool):
        raise DataError(f"{context}: expected a boolean")
    return value


def _list(value: Any, context: str) -> list[Any]:
    if not isinstance(value, list):
        raise DataError(f"{context}: expected a list")
    return value


def _dict(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DataError(f"{context}: expected an object")
    return value


def _decimal(value: Any, context: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise DataError(
            f'{context}: expected a decimal value such as "2.50"'
        )
    text = str(value).strip()
    if not text:
        raise DataError(f"{context}: expected a non-empty decimal value")
    try:
        result = Decimal(text)
    except InvalidOperation as exc:
        raise DataError(f"{context}: invalid decimal value {value!r}") from exc
    if not result.is_finite():
        raise DataError(f"{context}: decimal value must be finite")
    return result


def _decimal_or_none(value: Any, context: str) -> Decimal | None:
    return None if value is None else _decimal(value, context)


def load_json(path: Path) -> dict[str, Any]:
    if not Path(path).is_file():
        raise DataError(f"missing data file: {path}")
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataError(f"{Path(path).name}: invalid JSON: {exc}") from exc
    return _dict(raw, Path(path).name)


def validate_curriculum(curriculum: dict[str, Any]) -> None:
    """Validate the parts of ``curriculum.json`` the planner relies on."""
    context = "curriculum.json"
    _int(_need(curriculum, "schema_version", context), f"{context}.schema_version")
    _str(_need(curriculum, "id", context), f"{context}.id")
    _str(_need(curriculum, "name", context), f"{context}.name")
    total_credits = _int(
        _need(curriculum, "total_credits", context), f"{context}.total_credits"
    )
    if total_credits < 0:
        raise DataError(f"{context}.total_credits: must be non-negative")

    courses = _list(_need(curriculum, "courses", context), f"{context}.courses")
    course_ids: set[str] = set()
    for index, raw_course in enumerate(courses):
        item = _dict(raw_course, f"{context}.courses[{index}]")
        item_context = f"{context}.courses[{index}]"
        course_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if course_id in course_ids:
            raise DataError(f"{item_context}: duplicate course id {course_id!r}")
        course_ids.add(course_id)
        _str(_need(item, "name", item_context), f"{item_context}.name")
        credits = _int(
            _need(item, "credits", item_context), f"{item_context}.credits"
        )
        if credits < 0:
            raise DataError(f"{item_context}: credits must be non-negative")
        for field in ("prerequisites", "corequisites"):
            for row in _list(
                _need(item, field, item_context), f"{item_context}.{field}"
            ):
                for required in _list(row, f"{item_context}.{field}[]"):
                    _str(required, f"{item_context}.{field}[]")
        for term in _list(
            _need(item, "offered_terms", item_context),
            f"{item_context}.offered_terms",
        ):
            _int(term, f"{item_context}.offered_terms[]")

    groups = _list(_need(curriculum, "groups", context), f"{context}.groups")
    group_ids: set[str] = set()
    for index, raw_group in enumerate(groups):
        item = _dict(raw_group, f"{context}.groups[{index}]")
        item_context = f"{context}.groups[{index}]"
        group_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if group_id in group_ids:
            raise DataError(f"{item_context}: duplicate group id {group_id!r}")
        group_ids.add(group_id)
        group_type = _str(
            _need(item, "type", item_context), f"{item_context}.type"
        )
        if group_type not in {"mandatory", "elective"}:
            raise DataError(
                f"{item_context}: unsupported group type {group_type!r}"
            )
        members = _list(
            _need(item, "course_ids", item_context), f"{item_context}.course_ids"
        )
        for member in members:
            member_id = _str(member, f"{item_context}.course_ids[]")
            if member_id not in course_ids:
                raise DataError(
                    f"{item_context}: unknown course {member_id!r}"
                )
        for field in ("min_credits", "min_courses", "max_courses"):
            if item.get(field) is not None:
                _int(item[field], f"{item_context}.{field}")

    for index, raw_course in enumerate(courses):
        item = _dict(raw_course, f"{context}.courses[{index}]")
        course_id = item["id"]
        for field in ("prerequisites", "corequisites"):
            for row in item.get(field, []):
                for required in row:
                    if required not in course_ids:
                        raise DataError(
                            f"{context}: course {course_id!r} lists unknown "
                            f"{field[:-1]} {required!r}"
                        )


def _parse_scales(grading: dict[str, Any]) -> tuple[ScaleRule, ...]:
    context = "grading_policy.json.scales"
    raw_scales = grading.get("scales")
    rows: list[ScaleRule] = []
    if raw_scales is None:
        # Backwards-compatible default: the old ``gpa`` block describes the
        # only scale.  A 10-point scale is synthesized when grade bands exist.
        gpa = _dict(_need(grading, "gpa", "grading_policy.json"), "grading_policy.json.gpa")
        decimals = _int(
            _dict(
                _need(gpa, "rounding", "grading_policy.json.gpa"),
                "grading_policy.json.gpa.rounding",
            ).get("decimals", 2),
            "grading_policy.json.gpa.rounding.decimals",
        )
        rows.append(
            ScaleRule(
                id="gpa_4",
                minimum=Decimal("0"),
                maximum=_decimal(
                    _need(gpa, "scale_max", "grading_policy.json.gpa"),
                    "grading_policy.json.gpa.scale_max",
                ),
                precision=decimals,
                role="gpa",
                default=True,
            )
        )
        if any(
            isinstance(item, dict)
            and item.get("min_score") is not None
            and item.get("max_score") is not None
            for item in _list(
                _need(grading, "grade_scale", "grading_policy.json"),
                "grading_policy.json.grade_scale",
            )
        ):
            rows.append(
                ScaleRule(
                    id="score_10",
                    minimum=Decimal("0"),
                    maximum=Decimal("10"),
                    precision=2,
                    role="score",
                    representative="midpoint",
                )
            )
        return tuple(rows)

    for index, raw in enumerate(_list(raw_scales, context)):
        item = _dict(raw, f"{context}[{index}]")
        item_context = f"{context}[{index}]"
        rows.append(
            ScaleRule(
                id=_str(_need(item, "id", item_context), f"{item_context}.id"),
                minimum=_decimal(
                    _need(item, "min", item_context), f"{item_context}.min"
                ),
                maximum=_decimal(
                    _need(item, "max", item_context), f"{item_context}.max"
                ),
                precision=_int(
                    _need(item, "precision", item_context),
                    f"{item_context}.precision",
                ),
                role=_str(item.get("role", "gpa"), f"{item_context}.role"),
                default=_bool(item.get("default", False), f"{item_context}.default"),
                representative=_str(
                    item.get("representative", "midpoint"),
                    f"{item_context}.representative",
                ),
            )
        )
    if not rows:
        raise DataError(f"{context}: at least one scale is required")
    seen: set[str] = set()
    for row in rows:
        if row.id in seen:
            raise DataError(f"{context}: duplicate scale id {row.id!r}")
        seen.add(row.id)
        if row.minimum >= row.maximum:
            raise DataError(f"{context}[{row.id}]: min must be below max")
        if row.precision < 0 or row.precision > 6:
            raise DataError(f"{context}[{row.id}]: unsupported precision")
        if row.role not in {"gpa", "score"}:
            raise DataError(f"{context}[{row.id}]: unsupported role {row.role!r}")
        if row.representative not in {"min", "max", "midpoint"}:
            raise DataError(
                f"{context}[{row.id}]: unsupported representative "
                f"{row.representative!r}"
            )
    defaults = [row for row in rows if row.default]
    if len(defaults) > 1:
        raise DataError(f"{context}: only one scale may be the default")
    return tuple(rows)


def _parse_grade_scale(grading: dict[str, Any]) -> tuple[GradeRule, ...]:
    context = "grading_policy.json.grade_scale"
    rows: list[GradeRule] = []
    seen: set[str] = set()
    for index, raw in enumerate(_list(_need(grading, "grade_scale", context), context)):
        item = _dict(raw, f"{context}[{index}]")
        item_context = f"{context}[{index}]"
        symbol = _str(_need(item, "grade", item_context), f"{item_context}.grade")
        if symbol in seen:
            raise DataError(f"{item_context}: duplicate grade {symbol!r}")
        seen.add(symbol)
        scale_points_raw = item.get("scale_points", item.get("values", {}))
        scale_points: list[tuple[str, Decimal]] = []
        if scale_points_raw:
            for scale_id, value in _dict(
                scale_points_raw, f"{item_context}.scale_points"
            ).items():
                scale_points.append(
                    (
                        _str(scale_id, f"{item_context}.scale_points key"),
                        _decimal(
                            value,
                            f"{item_context}.scale_points[{scale_id!r}]",
                        ),
                    )
                )
        min_score = _decimal_or_none(
            item.get("min_score"), f"{item_context}.min_score"
        )
        max_score = _decimal_or_none(
            item.get("max_score"), f"{item_context}.max_score"
        )
        if (min_score is None) != (max_score is None):
            raise DataError(
                f"{item_context}: min_score and max_score must both be null "
                "or both be numbers"
            )
        if min_score is not None and max_score is not None and min_score > max_score:
            raise DataError(
                f"{item_context}: min_score must not exceed max_score"
            )
        rows.append(
            GradeRule(
                symbol=symbol,
                points=_decimal_or_none(
                    item.get("points"), f"{item_context}.points"
                ),
                passing=_bool(
                    _need(item, "passing", item_context), f"{item_context}.passing"
                ),
                in_gpa=_bool(
                    _need(item, "in_gpa", item_context), f"{item_context}.in_gpa"
                ),
                earns_credit=_bool(
                    _need(item, "earns_credit", item_context),
                    f"{item_context}.earns_credit",
                ),
                min_score=min_score,
                max_score=max_score,
                scale_points=tuple(scale_points),
            )
        )
    if not rows:
        raise DataError(f"{context}: at least one grade is required")
    return tuple(rows)


def _parse_requirements(
    graduation: dict[str, Any],
) -> tuple[tuple[Requirement, ...], tuple[ExternalRequirement, ...]]:
    context = "graduation_requirements.json"
    requirements: list[Requirement] = []
    seen: set[str] = set()
    for index, raw in enumerate(
        _list(
            _need(graduation, "requirements", context),
            f"{context}.requirements",
        )
    ):
        item = _dict(raw, f"{context}.requirements[{index}]")
        item_context = f"{context}.requirements[{index}]"
        requirement_id = _str(
            _need(item, "id", item_context), f"{item_context}.id"
        )
        if requirement_id in seen:
            raise DataError(
                f"{item_context}: duplicate requirement id {requirement_id!r}"
            )
        seen.add(requirement_id)
        requirement_type = _str(
            _need(item, "type", item_context), f"{item_context}.type"
        )
        value: int | Decimal | None = None
        if requirement_type == "min_total_credits":
            value = _int(
                _need(item, "value", item_context), f"{item_context}.value"
            )
        elif requirement_type == "min_cumulative_gpa":
            value = _decimal(
                _need(item, "value", item_context), f"{item_context}.value"
            )
        elif requirement_type != "all_groups_satisfied":
            raise DataError(
                f"{item_context}: unsupported requirement type "
                f"{requirement_type!r}"
            )
        requirements.append(
            Requirement(id=requirement_id, type=requirement_type, value=value)
        )

    external: list[ExternalRequirement] = []
    external_ids: set[str] = set()
    for index, raw in enumerate(
        _list(
            _need(graduation, "external_requirements", context),
            f"{context}.external_requirements",
        )
    ):
        item = _dict(raw, f"{context}.external_requirements[{index}]")
        item_context = f"{context}.external_requirements[{index}]"
        requirement_id = _str(
            _need(item, "id", item_context), f"{item_context}.id"
        )
        if requirement_id in external_ids:
            raise DataError(
                f"{item_context}: duplicate external requirement id "
                f"{requirement_id!r}"
            )
        external_ids.add(requirement_id)
        milestones: list[ExternalMilestone] = []
        for milestone_index, raw_milestone in enumerate(
            _list(
                _need(item, "milestones", item_context),
                f"{item_context}.milestones",
            )
        ):
            milestone = _dict(
                raw_milestone,
                f"{item_context}.milestones[{milestone_index}]",
            )
            milestone_context = f"{item_context}.milestones[{milestone_index}]"
            deadline = _dict(
                _need(milestone, "deadline", milestone_context),
                f"{milestone_context}.deadline",
            )
            deadline_type = _str(
                _need(deadline, "type", f"{milestone_context}.deadline"),
                f"{milestone_context}.deadline.type",
            )
            if deadline_type not in {"end_of_year", "graduation"}:
                raise DataError(
                    f"{milestone_context}: unsupported deadline "
                    f"{deadline_type!r}"
                )
            year = (
                _int(
                    _need(deadline, "year", f"{milestone_context}.deadline"),
                    f"{milestone_context}.deadline.year",
                )
                if deadline_type == "end_of_year"
                else None
            )
            milestones.append(
                ExternalMilestone(
                    deadline_type=deadline_type,
                    year=year,
                    minimum=_int(
                        _need(milestone, "min", milestone_context),
                        f"{milestone_context}.min",
                    ),
                )
            )
        external.append(
            ExternalRequirement(
                id=requirement_id,
                unit=_str(
                    _need(item, "unit", item_context), f"{item_context}.unit"
                ),
                mode=_str(
                    _need(item, "mode", item_context), f"{item_context}.mode"
                ),
                enforcement=_str(
                    _need(item, "enforcement", item_context),
                    f"{item_context}.enforcement",
                ),
                milestones=tuple(milestones),
            )
        )
    return tuple(requirements), tuple(external)


def parse_policy(
    grading: dict[str, Any], graduation: dict[str, Any]
) -> Policy:
    """Build a :class:`Policy` from the two policy JSON documents."""
    context = "grading_policy.json"
    _int(_need(grading, "schema_version", context), f"{context}.schema_version")
    policy_id = _str(_need(grading, "id", context), f"{context}.id")

    effective = _dict(
        _need(grading, "effective_for_cohorts", context),
        f"{context}.effective_for_cohorts",
    )
    effective_from = _int(
        _need(effective, "from", f"{context}.effective_for_cohorts"),
        f"{context}.effective_for_cohorts.from",
    )
    effective_to = (
        None
        if effective["to"] is None
        else _int(
            effective["to"], f"{context}.effective_for_cohorts.to"
        )
    )

    grades = _parse_grade_scale(grading)
    grade_map = {row.symbol: row for row in grades}
    scales = _parse_scales(grading)
    default_scale = next(
        (row.id for row in scales if row.default),
        scales[0].id,
    )
    if not any(row.default for row in scales):
        # Keep the first scale as the default when the JSON omits the flag.
        scales = tuple(
            ScaleRule(
                id=row.id,
                minimum=row.minimum,
                maximum=row.maximum,
                precision=row.precision,
                role=row.role,
                default=row.id == default_scale,
                representative=row.representative,
            )
            for row in scales
        )
    scale_ids = {row.id for row in scales}
    for grade in grades:
        for scale_id, _ in grade.scale_points:
            if scale_id not in scale_ids:
                raise DataError(
                    f"{context}.grade_scale: grade {grade.symbol!r} uses "
                    f"unknown scale {scale_id!r}"
                )
        for scale in scales:
            value = grade.value_for(scale, default_scale)
            if value is None:
                if grade.in_gpa and scale.role == "gpa":
                    raise DataError(
                        f"{context}.grade_scale: grade {grade.symbol!r} is "
                        f"in_gpa but has no value on scale {scale.id!r}"
                    )
                continue
            try:
                scale.scaled(value)
            except ValueError as exc:
                raise DataError(f"{context}.grade_scale: {exc}") from exc

    gpa = _dict(_need(grading, "gpa", context), f"{context}.gpa")
    rounding = _dict(_need(gpa, "rounding", f"{context}.gpa"), f"{context}.gpa.rounding")
    retake = _dict(_need(grading, "retake", context), f"{context}.retake")

    selection = _str(
        _need(retake, "gpa_attempt_selection", f"{context}.retake"),
        f"{context}.retake.gpa_attempt_selection",
    )
    if selection in {"highest", "highest_grade"}:
        selection = "best"
    if selection not in {"latest", "best"}:
        raise DataError(
            f"{context}.retake.gpa_attempt_selection: unsupported value "
            f"{selection!r}; use 'latest' or 'best'"
        )

    grade_cap = retake.get("grade_cap")
    grade_cap = {} if grade_cap is None else _dict(grade_cap, f"{context}.retake.grade_cap")
    applies_to = _str(
        grade_cap.get("applies_to", "retakes"),
        f"{context}.retake.grade_cap.applies_to",
    )
    if applies_to != "retakes":
        raise DataError(
            f"{context}.retake.grade_cap.applies_to: unsupported value "
            f"{applies_to!r}; only 'retakes' is implemented"
        )
    max_grade = grade_cap.get("max_grade")
    if max_grade is not None:
        max_grade = _str(max_grade, f"{context}.retake.grade_cap.max_grade")
        if max_grade not in grade_map:
            raise DataError(
                f"{context}.retake.grade_cap.max_grade: unknown grade {max_grade!r}"
            )
        cap_rule = grade_map[max_grade]
        if not cap_rule.in_gpa:
            raise DataError(
                f"{context}.retake.grade_cap.max_grade: grade {max_grade!r} "
                "does not carry GPA points"
            )
        if not cap_rule.passing or not cap_rule.earns_credit:
            raise DataError(
                f"{context}.retake.grade_cap.max_grade: grade {max_grade!r} "
                "must be passing and earn credit"
            )
        default_scale_rule = next(row for row in scales if row.id == default_scale)
        if cap_rule.value_for(default_scale_rule, default_scale) is None:
            raise DataError(
                f"{context}.retake.grade_cap.max_grade: grade {max_grade!r} "
                f"has no value on the default scale {default_scale!r}"
            )

    grad_context = "graduation_requirements.json"
    _int(
        _need(graduation, "schema_version", grad_context),
        f"{grad_context}.schema_version",
    )
    graduation_curriculum = _str(
        _need(graduation, "curriculum_id", grad_context),
        f"{grad_context}.curriculum_id",
    )
    graduation_policy = _str(
        _need(graduation, "grading_policy", grad_context),
        f"{grad_context}.grading_policy",
    )
    if graduation_policy != policy_id:
        raise DataError(
            f"{grad_context}: grading_policy {graduation_policy!r} does not "
            f"match grading_policy.json id {policy_id!r}"
        )

    requirements, external = _parse_requirements(graduation)
    min_total_credits = next(
        (
            int(item.value)
            for item in requirements
            if item.type == "min_total_credits"
        ),
        None,
    )
    min_cumulative_gpa = next(
        (
            item.value
            for item in requirements
            if item.type == "min_cumulative_gpa"
        ),
        None,
    )

    planner = _dict(grading.get("planner", {}), f"{context}.planner")
    default_min_load = _int(
        planner.get("min_load", 14), f"{context}.planner.min_load"
    )
    default_max_load = _int(
        planner.get("max_load", 21), f"{context}.planner.max_load"
    )
    summer_min_load = _int(
        planner.get("summer_min_load", 0),
        f"{context}.planner.summer_min_load",
    )
    summer_max_load = _int(
        planner.get("summer_max_load", 9),
        f"{context}.planner.summer_max_load",
    )
    default_horizon = _int(
        planner.get("horizon", 12), f"{context}.planner.horizon"
    )
    term_offset = _int(
        planner.get("term_offset", 0), f"{context}.planner.term_offset"
    )
    if default_min_load < 0 or default_max_load < default_min_load:
        raise DataError(f"{context}.planner: invalid regular load bounds")
    if summer_min_load < 0 or summer_max_load < summer_min_load:
        raise DataError(f"{context}.planner: invalid summer load bounds")
    if default_horizon <= 0:
        raise DataError(f"{context}.planner.horizon: must be positive")

    policy = Policy(
        policy_id=policy_id,
        schema_version=_int(
            grading["schema_version"], f"{context}.schema_version"
        ),
        effective_from=effective_from,
        effective_to=effective_to,
        grades=grades,
        scales=scales,
        default_scale=default_scale,
        gpa_formula=_str(_need(gpa, "formula", f"{context}.gpa"), f"{context}.gpa.formula"),
        included_course_kinds=tuple(
            _str(kind, f"{context}.gpa.included_course_kinds[]")
            for kind in _list(
                _need(gpa, "included_course_kinds", f"{context}.gpa"),
                f"{context}.gpa.included_course_kinds",
            )
        ),
        scale_max=_decimal(
            _need(gpa, "scale_max", f"{context}.gpa"), f"{context}.gpa.scale_max"
        ),
        rounding_mode=_str(
            _need(rounding, "mode", f"{context}.gpa.rounding"),
            f"{context}.gpa.rounding.mode",
        ),
        rounding_decimals=_int(
            _need(rounding, "decimals", f"{context}.gpa.rounding"),
            f"{context}.gpa.rounding.decimals",
        ),
        gpa_attempt_selection=selection,
        retake_grade_cap=max_grade,
        keep_old_attempts=_bool(
            _need(
                retake,
                "keep_old_attempts_on_transcript",
                f"{context}.retake",
            ),
            f"{context}.retake.keep_old_attempts_on_transcript",
        ),
        equivalence=_str(
            _need(retake, "equivalence", f"{context}.retake"),
            f"{context}.retake.equivalence",
        ),
        graduation_requirements=requirements,
        external_requirements=external,
        min_total_credits=min_total_credits,
        min_cumulative_gpa=(
            Decimal(min_cumulative_gpa)
            if min_cumulative_gpa is not None
            else None
        ),
        graduation_curriculum_id=graduation_curriculum,
        default_min_load=default_min_load,
        default_max_load=default_max_load,
        summer_min_load=summer_min_load,
        summer_max_load=summer_max_load,
        default_horizon=default_horizon,
        term_offset=term_offset,
    )
    object.__setattr__(policy, "grade_map", grade_map)
    return policy


@dataclass(frozen=True)
class Bundle:
    curriculum: dict[str, Any]
    policy: Policy
    curriculum_path: Path | None = None
    grading_path: Path | None = None
    graduation_path: Path | None = None

    @property
    def total_credits(self) -> int:
        return int(self.curriculum["total_credits"])


def load_bundle(
    curriculum_path: Path,
    grading_path: Path,
    graduation_path: Path,
) -> Bundle:
    curriculum = load_json(curriculum_path)
    validate_curriculum(curriculum)
    grading = load_json(grading_path)
    graduation = load_json(graduation_path)
    policy = parse_policy(grading, graduation)

    expected_curriculum = policy.graduation_curriculum_id
    if expected_curriculum != curriculum["id"]:
        raise DataError(
            "graduation_requirements.json: curriculum_id "
            f"{expected_curriculum!r} does not match curriculum.json id "
            f"{curriculum['id']!r}"
        )
    if (
        policy.min_total_credits is not None
        and policy.min_total_credits != int(curriculum["total_credits"])
    ):
        raise DataError(
            "graduation_requirements.json: min_total_credits "
            f"{policy.min_total_credits} does not match curriculum total_credits "
            f"{curriculum['total_credits']}"
        )
    return Bundle(
        curriculum=curriculum,
        policy=policy,
        curriculum_path=Path(curriculum_path),
        grading_path=Path(grading_path),
        graduation_path=Path(graduation_path),
    )


"""Data models and parsing for ``tuition_policy.json``.

This module validates fee tiers and normalises money to fixed-point integers.
Fact compilation (``fee_rule/5``) lives in translation.py, keeping the data
and translation layers separate.
"""


class TuitionError(ValueError):
    """Raised when tuition policy data is invalid."""


@dataclass(frozen=True)
class FeeTier:
    min_credits: int
    max_credits: int
    fee_type: str
    amount: Decimal


@dataclass(frozen=True)
class TuitionRule:
    programs: tuple[str, ...]
    semester_types: tuple[str, ...]
    tiers: tuple[FeeTier, ...]


@dataclass(frozen=True)
class TuitionPolicy:
    policy_id: str
    currency: str
    money_unit: str
    precision: int
    effective_from: int
    effective_to: int | None
    rules: tuple[TuitionRule, ...]

    def scaled(self, value: Decimal) -> int:
        factor = 10**self.precision
        quantized = value.quantize(Decimal(1).scaleb(-self.precision), rounding=ROUND_HALF_UP)
        return int(quantized * factor)


def _tuition_need(obj: dict[str, Any], key: str, context: str) -> Any:
    if key not in obj:
        raise TuitionError(f"{context}: missing required field {key!r}")
    return obj[key]


def _tuition_dict(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TuitionError(f"{context}: expected an object")
    return value


def _tuition_list(value: Any, context: str) -> list[Any]:
    if not isinstance(value, list):
        raise TuitionError(f"{context}: expected a list")
    return value


def _tuition_str(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TuitionError(f"{context}: expected a non-empty string")
    return value


def _tuition_int(value: Any, context: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TuitionError(f"{context}: expected an integer")
    return value


def _tuition_decimal(value: Any, context: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise TuitionError(f"{context}: expected a decimal value")
    try:
        result = Decimal(str(value))
    except InvalidOperation as exc:
        raise TuitionError(f"{context}: invalid decimal value {value!r}") from exc
    if not result.is_finite():
        raise TuitionError(f"{context}: decimal value must be finite")
    return result


def _tuition_load(path: Path) -> dict[str, Any]:
    try:
        return _tuition_dict(json.loads(Path(path).read_text(encoding="utf-8")), Path(path).name)
    except json.JSONDecodeError as exc:
        raise TuitionError(f"{Path(path).name}: invalid JSON: {exc}") from exc


def parse_tuition(raw: dict[str, Any]) -> TuitionPolicy:
    context = "tuition_policy.json"
    _tuition_int(_tuition_need(raw, "schema_version", context), f"{context}.schema_version")
    policy_id = _tuition_str(_tuition_need(raw, "id", context), f"{context}.id")
    effective = _tuition_dict(
        _tuition_need(raw, "effective_for_cohorts", context),
        f"{context}.effective_for_cohorts",
    )
    effective_from = _tuition_int(
        _tuition_need(effective, "from", f"{context}.effective_for_cohorts"),
        f"{context}.effective_for_cohorts.from",
    )
    effective_to = (
        None
        if effective.get("to") is None
        else _tuition_int(effective["to"], f"{context}.effective_for_cohorts.to")
    )
    currency = _tuition_str(_tuition_need(raw, "currency", context), f"{context}.currency")
    money_unit = _tuition_str(_tuition_need(raw, "money_unit", context), f"{context}.money_unit")
    precision = _tuition_int(raw.get("precision", 3), f"{context}.precision")
    if precision < 0 or precision > 6:
        raise TuitionError(f"{context}.precision: unsupported precision")
    calculation_basis = _tuition_str(
        _tuition_need(raw, "calculation_basis", context), f"{context}.calculation_basis"
    )
    if calculation_basis != "per_semester":
        raise TuitionError(
            f"{context}.calculation_basis: unsupported value {calculation_basis!r}"
        )

    rules: list[TuitionRule] = []
    raw_rules = _tuition_list(_tuition_need(raw, "tuition_rules", context), f"{context}.tuition_rules")
    for rule_index, raw_rule in enumerate(raw_rules):
        rule_context = f"{context}.tuition_rules[{rule_index}]"
        rule = _tuition_dict(raw_rule, rule_context)
        programs = tuple(
            _tuition_str(item, f"{rule_context}.programs[]")
            for item in _tuition_list(_tuition_need(rule, "programs", rule_context), f"{rule_context}.programs")
        )
        semester_types = tuple(
            _tuition_str(item, f"{rule_context}.semester_types[]")
            for item in _tuition_list(
                _tuition_need(rule, "semester_types", rule_context),
                f"{rule_context}.semester_types",
            )
        )
        for semester_type in semester_types:
            if semester_type not in {"regular", "summer"}:
                raise TuitionError(
                    f"{rule_context}: unsupported semester type {semester_type!r}"
                )
        fee_model = _tuition_dict(_tuition_need(rule, "fee_model", rule_context), f"{rule_context}.fee_model")
        model_type = _tuition_str(_tuition_need(fee_model, "type", f"{rule_context}.fee_model"), f"{rule_context}.fee_model.type")
        if model_type == "piecewise":
            raw_tiers = _tuition_list(
                _tuition_need(fee_model, "tiers", f"{rule_context}.fee_model"),
                f"{rule_context}.fee_model.tiers",
            )
        elif model_type == "per_credit":
            raw_tiers = [
                {
                    "condition": {"min_credits": 0},
                    "fee_type": "per_credit",
                    "rate_per_credit": _tuition_need(
                        fee_model, "rate_per_credit", f"{rule_context}.fee_model"
                    ),
                }
            ]
        else:
            raise TuitionError(
                f"{rule_context}.fee_model.type: unsupported value {model_type!r}"
            )

        tiers: list[FeeTier] = []
        previous_max = -1
        for tier_index, raw_tier in enumerate(raw_tiers):
            tier_context = f"{rule_context}.fee_model.tiers[{tier_index}]"
            tier = _tuition_dict(raw_tier, tier_context)
            condition = _tuition_dict(
                _tuition_need(tier, "condition", tier_context), f"{tier_context}.condition"
            )
            default_min = 0 if tier_index == 0 else previous_max + 1
            min_credits = _tuition_int(
                condition.get("min_credits", default_min),
                f"{tier_context}.condition.min_credits",
            )
            max_credits = (
                999
                if condition.get("max_credits") is None
                else _tuition_int(
                    condition["max_credits"],
                    f"{tier_context}.condition.max_credits",
                )
            )
            if min_credits < 0 or max_credits < min_credits:
                raise TuitionError(f"{tier_context}: invalid credit condition")
            previous_max = max_credits
            fee_type = _tuition_str(_tuition_need(tier, "fee_type", tier_context), f"{tier_context}.fee_type")
            if fee_type == "flat":
                flat_fee = _tuition_decimal(
                    _tuition_need(tier, "flat_fee", tier_context), f"{tier_context}.flat_fee"
                )
                # ``discount`` is the current key; ``percentage`` is the
                # legacy name for the fraction off the full-load flat fee.
                discount_value = tier.get("discount")
                if discount_value is None:
                    discount_value = tier.get("percentage", 0)
                discount = _tuition_decimal(
                    discount_value, f"{tier_context}.discount"
                )
                if flat_fee < 0 or not (0 <= discount <= 1):
                    raise TuitionError(f"{tier_context}: invalid flat fee/discount")
                amount = flat_fee * (Decimal(1) - discount)
            elif fee_type == "per_credit":
                amount = _tuition_decimal(
                    _tuition_need(tier, "rate_per_credit", tier_context),
                    f"{tier_context}.rate_per_credit",
                )
                if amount < 0:
                    raise TuitionError(f"{tier_context}: negative per-credit rate")
            else:
                raise TuitionError(
                    f"{tier_context}.fee_type: unsupported value {fee_type!r}"
                )
            tiers.append(
                FeeTier(
                    min_credits=min_credits,
                    max_credits=max_credits,
                    fee_type=fee_type,
                    amount=amount,
                )
            )

        tiers.sort(key=lambda item: (item.min_credits, item.max_credits))
        _validate_tiers(tiers, rule_context)
        rules.append(
            TuitionRule(
                programs=programs,
                semester_types=semester_types,
                tiers=tuple(tiers),
            )
        )

    if not rules:
        raise TuitionError(f"{context}: at least one tuition rule is required")
    return TuitionPolicy(
        policy_id=policy_id,
        currency=currency,
        money_unit=money_unit,
        precision=precision,
        effective_from=effective_from,
        effective_to=effective_to,
        rules=tuple(rules),
    )


def _validate_tiers(tiers: list[FeeTier], context: str) -> None:
    if not tiers:
        raise TuitionError(f"{context}: fee model has no tiers")
    if tiers[0].min_credits != 0:
        raise TuitionError(f"{context}: first tier must start at 0 credits")
    for previous, current in zip(tiers, tiers[1:]):
        if current.min_credits != previous.max_credits + 1:
            raise TuitionError(
                f"{context}: tiers must be contiguous; "
                f"{previous.max_credits} -> {current.min_credits}"
            )
    if tiers[-1].max_credits != 999:
        raise TuitionError(f"{context}: final tier must be open-ended")


def load_tuition(path: Path) -> TuitionPolicy:
    return parse_tuition(_tuition_load(path))



