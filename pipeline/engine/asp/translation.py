"""Translation layer: dataset and student records to ASP facts.

Everything in this module is deterministic and side-effect free.  It builds
curriculum, grading/graduation, tuition, and student facts; it never invokes
clingo or renders plans.

The module is data-driven: it knows the *structure* of the agreed JSON files
(curriculum, grading policy, tuition policy, student history) but no concrete
course code, credit value, load bound, percentage or program name.  Everything
curriculum-specific comes from curriculum.json:

``planning``     min_load, max_load, summer_min_load, summer_max_load, horizon
``milestones``   [{"course": ID, "min_credit_percent": P | "min_credits": N}]
``equivalents``  {"OLD_CODE": "CANONICAL_CODE"}
``program``      program name (otherwise derived from ``name``)
``majors``       [{"id", "name", "rule": {"type": "required_courses",
                   "min_courses": K, "course_ids": [...]}}]
``courses``      prerequisites / corequisites / offered_terms as before; an
                 extra prerequisite (e.g. a capstone's language requirement)
                 is just another prerequisite group.
"""

from __future__ import annotations


import json
import re
from collections import defaultdict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Iterable

try:  # package import
    from .data import Policy, Requirement, TuitionError
except ImportError:  # script/test import
    from data import Policy, Requirement, TuitionError


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def asp_name(value: str) -> str:
    """Turn an arbitrary identifier into a safe ASP constant."""
    name = re.sub(r"[^0-9a-zA-Z_]", "_", value.strip().lower())
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "item"
    if name[0].isdigit():
        name = f"c_{name}"
    return name


def asp_grade_name(value: str) -> str:
    """Turn a grade symbol into a unique ASP constant (B+ -> b_plus)."""
    name = value.strip().lower()
    name = name.replace("+", "_plus").replace("-", "_minus")
    name = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "grade"
    if name[0].isdigit():
        name = f"g_{name}"
    return name


def _fact(predicate: str, *args: Any) -> str:
    return f"{predicate}({', '.join(str(arg) for arg in args)})."


def _percent_credits(total: int, percent: int) -> int:
    """Smallest integer credit count satisfying ``percent`` of ``total``."""
    return (total * percent + 99) // 100


def _tuple(items: Iterable[str]) -> str:
    return "(" + "; ".join(items) + ")"


def _chunks(items: list[str], size: int = 8) -> Iterable[list[str]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _emit_membership(
    lines: list[str],
    members: Iterable[str],
    group: str,
    predicate: str = "in",
) -> None:
    """Emit ``predicate((member; ...), group).`` in readable chunks."""
    ordered = sorted(set(members), key=str.lower)
    for chunk in _chunks(ordered, 8):
        lines.append(_fact(predicate, _tuple(chunk), group))


def load_json(path: str | Path) -> dict[str, Any]:
    """Read one of the agreed JSON data files."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _check_cohort(
    cohort: int | None,
    effective_from: Any,
    effective_to: Any,
    label: str,
) -> None:
    """Raise when ``cohort`` lies outside ``[effective_from, effective_to]``."""
    if cohort is None:
        return
    if effective_from is not None and cohort < int(effective_from):
        raise ValueError(
            f"{label} is effective from cohort {effective_from}; "
            f"cohort {cohort} is outside its range"
        )
    if effective_to is not None and cohort > int(effective_to):
        raise ValueError(
            f"{label} is effective up to cohort {effective_to}; "
            f"cohort {cohort} is outside its range"
        )


# ---------------------------------------------------------------------------
# Policy switches the ASP layer really implements
# ---------------------------------------------------------------------------
SUPPORTED_POLICY_SWITCHES: dict[str, set[str]] = {
    "gpa_attempt_selection": {"latest"},
    "credit_counting": {"once_per_course"},
    "equivalence": {"use_course_equivalents"},
}


def validate_policy_support(policy: Policy) -> None:
    """Refuse policy switches that the ASP rules cannot honour.

    The switches are echoed as comments in policy.lp but the rules hard-wire
    one behaviour; silently accepting another value would do nothing.
    """
    for attribute, supported in SUPPORTED_POLICY_SWITCHES.items():
        value = getattr(policy, attribute, None)
        if value is not None and value not in supported:
            raise ValueError(
                f"grading policy {attribute}={value!r} is not implemented; "
                f"supported: {sorted(supported)}"
            )


# ---------------------------------------------------------------------------
# Curriculum
# ---------------------------------------------------------------------------
def _offered_slots(course: dict[str, Any]) -> tuple[int, ...]:
    """Term parts (1 = fall, 2 = spring, 3 = summer) a course is offered in.

    A missing or empty ``offered_terms`` means "every part".
    """
    raw_terms = course.get("offered_terms")
    terms = {int(term) for term in raw_terms} if raw_terms else {1, 2, 3}
    bad = terms - {1, 2, 3}
    if bad:
        raise ValueError(
            f"course {course.get('id')!r}: offered_terms {sorted(bad)} "
            "must be 1, 2 or 3"
        )
    return tuple(sorted(terms))


def _course_level(course_id: str) -> int | None:
    """Return the course level from the first digit in its code."""
    match = re.search(r"\d", course_id)
    return int(match.group(0)) if match else None


def _course_counts_implied(
    group: dict[str, Any],
    members: list[str],
    credits: dict[str, int],
    lower: int,
    upper: int,
) -> bool:
    """True when min/max_courses add nothing beyond the credit bounds."""
    if "min_courses" not in group and "max_courses" not in group:
        return True

    values = {credits[member] for member in members}
    if len(values) != 1:
        return False

    unit = next(iter(values))
    min_courses = group.get("min_courses")
    max_courses = group.get("max_courses")
    min_ok = min_courses is None or lower == int(min_courses) * unit
    max_ok = max_courses is None or upper == int(max_courses) * unit
    return min_ok and max_ok


def _group_upper_bound(
    group: dict[str, Any],
    members: list[str],
    credits: dict[str, int],
    mandatory: bool,
) -> int:
    if mandatory:
        return sum(credits.get(course, 0) for course in members)

    if "max_credits" in group:
        return int(group["max_credits"])

    if "max_courses" in group:
        best = sorted((credits.get(course, 0) for course in members), reverse=True)
        return sum(best[: int(group["max_courses"])])

    # No explicit upper quota: the whole pool is the theoretical maximum.
    return sum(credits.get(course, 0) for course in members)


def _require_course(courses: dict[str, Any], course_id: str, where: str) -> None:
    if course_id not in courses:
        raise ValueError(f"{where}: unknown course {course_id!r}")


def curriculum_aliases(curriculum: dict[str, Any] | None) -> dict[str, str]:
    """Return ``{old_code: canonical_code}`` declared by the curriculum."""
    if not curriculum:
        return {}
    courses = {course["id"] for course in curriculum.get("courses", [])}
    aliases: dict[str, str] = {}
    for old, new in (curriculum.get("equivalents") or {}).items():
        if new not in courses:
            raise ValueError(f"equivalents: {old!r} maps to unknown course {new!r}")
        if old in courses and old != new:
            raise ValueError(f"equivalents: {old!r} is itself a curriculum course")
        aliases[str(old)] = str(new)
    return aliases


def curriculum_majors(curriculum: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Validated majors keyed by ASP atom: ``{atom: {id, name, min, courses}}``."""
    result: dict[str, dict[str, Any]] = {}
    if not curriculum:
        return result
    courses = {course["id"] for course in curriculum.get("courses", [])}
    for major in curriculum.get("majors", []):
        rule = major.get("rule") or {}
        rule_type = rule.get("type", "required_courses")
        if rule_type != "required_courses":
            raise ValueError(
                f"major {major.get('id')!r}: unsupported rule type {rule_type!r}"
            )
        ids = list(rule.get("course_ids", []))
        for cid in ids:
            _require_course(courses, cid, f"major {major.get('id')!r}")
        if "min_courses" not in rule:
            raise ValueError(
                f"major {major.get('id')!r}: rule needs min_courses "
                "(how many of course_ids must be earned)"
            )
        minimum = int(rule["min_courses"])
        if not 1 <= minimum <= len(set(ids)):
            raise ValueError(
                f"major {major.get('id')!r}: min_courses={minimum} is outside "
                f"1..{len(set(ids))}"
            )
        atom = asp_name(str(major["id"]))
        result[atom] = {
            "id": str(major["id"]),
            "name": major.get("name", ""),
            "min": minimum,
            "courses": ids,
        }
    return result


def planning_constants(
    curriculum: dict[str, Any] | None,
    policy: Policy | None = None,
) -> dict[str, int]:
    """Load/horizon constants from ``curriculum['planning']``.

    Values missing from the JSON fall back to the policy defaults so older
    datasets keep working.
    """
    planning = (curriculum or {}).get("planning") or {}
    fallback = {
        "min_load": "default_min_load",
        "max_load": "default_max_load",
        "summer_min_load": "summer_min_load",
        "summer_max_load": "summer_max_load",
    }
    values: dict[str, int] = {}
    for key, attribute in fallback.items():
        if key in planning:
            values[key] = int(planning[key])
        elif policy is not None and hasattr(policy, attribute):
            values[key] = int(getattr(policy, attribute))
        else:
            raise ValueError(f"planning.{key} is missing from curriculum.json")
    if values["min_load"] > values["max_load"]:
        raise ValueError("planning: min_load exceeds max_load")
    if values["summer_min_load"] > values["summer_max_load"]:
        raise ValueError("planning: summer_min_load exceeds summer_max_load")
    values["horizon"] = int(planning.get("horizon", 12))
    return values


def planning_horizon(studied_terms: int, curriculum: dict[str, Any] | None) -> int:
    """Value for ``-c n=...``: future terms to plan, counted after history."""
    horizon = int(((curriculum or {}).get("planning") or {}).get("horizon", 12))
    return studied_terms + horizon


def build_curriculum(curriculum: dict[str, Any], policy: Policy | None = None) -> str:
    """Return the ASP program for ``curriculum`` as a string.

    ``policy`` is accepted for backwards compatibility and is not used: the
    milestones now come from the curriculum itself.
    """
    courses = {course["id"]: course for course in curriculum.get("courses", [])}
    credits = {cid: int(course.get("credits", 0)) for cid, course in courses.items()}
    course_atom = {cid: asp_name(cid) for cid in courses}
    total_credits = int(curriculum.get("total_credits", 0))

    group_rows: list[dict[str, Any]] = []
    for raw_group in curriculum.get("groups", []):
        for cid in raw_group.get("course_ids", []):
            _require_course(courses, cid, f"group {raw_group.get('id')!r}")
        members = list(raw_group.get("course_ids", []))
        if not members:
            continue
        group_id = asp_name(raw_group["id"])
        mandatory = raw_group.get("type", "").lower() == "mandatory"
        lower = int(raw_group.get("min_credits", sum(credits[c] for c in members)))
        if mandatory:
            lower = sum(credits[c] for c in members)
        upper = _group_upper_bound(raw_group, members, credits, mandatory)
        group_rows.append(
            {
                "atom": group_id,
                "members": members,
                "mandatory": mandatory,
                "lower": lower,
                "upper": upper,
                "min_courses": raw_group.get("min_courses"),
                "max_courses": raw_group.get("max_courses"),
                "counts_implied": _course_counts_implied(
                    raw_group, members, credits, lower, upper
                ),
            }
        )

    group_rows.sort(key=lambda row: row["atom"])

    lines: list[str] = []
    lines.append("% " + "=" * 69)
    lines.append("% cs-2023.lp : curriculum data and mappings")
    lines.append("% Generated from curriculum.json by the planner CLI -- do not edit by hand.")
    lines.append("% Load together with policy.lp, encoding.lp, extension.lp and plan.lp.")
    lines.append("% " + "=" * 69)
    lines.append("")
    lines.append(f"% Total degree credit requirement: {total_credits}")
    lines.append("% This file contains only curriculum facts and mappings. Generic")
    lines.append("% derivations and constraints live in extension.lp; school-specific")
    lines.append("% loads, tuition, objectives and display live in plan.lp.")
    lines.append("")

    # ------------------------------------------------------------------
    # Groups and course membership
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course groups and membership (in/2)")
    lines.append("% " + "-" * 66)
    for row in group_rows:
        _emit_membership(
            lines,
            [course_atom[cid] for cid in row["members"]],
            row["atom"],
        )
    lines.append("")
    lines.append("% group/1, in(E,m) and in(E,comp) are derived generically in")
    lines.append("% extension.lp from the membership and bound facts below.")
    for row in group_rows:
        if not row["mandatory"]:
            lines.append(_fact("elective_group", row["atom"]))
    lines.append("")

    # ------------------------------------------------------------------
    # Credit values
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course credits (map/3 with key 'c')")
    lines.append("% " + "-" * 66)
    by_credit: dict[int, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        by_credit[credits[cid]].append(course_atom[cid])
    for value in sorted(by_credit):
        for chunk in _chunks(sorted(by_credit[value], key=str.lower), 8):
            lines.append(_fact("map", "c", _tuple(chunk), value))
    lines.append("")

    # ------------------------------------------------------------------
    # Course levels
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course levels (first digit of the course code)")
    lines.append("% " + "-" * 66)
    by_level: dict[int, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        level = _course_level(cid)
        if level is not None:
            by_level[level].append(course_atom[cid])
    for level in sorted(by_level):
        for chunk in _chunks(sorted(by_level[level], key=str.lower), 8):
            lines.append(_fact("course_level", _tuple(chunk), level))
    lines.append("")

    # ------------------------------------------------------------------
    # Prerequisites and co-requisites
    # ------------------------------------------------------------------
    def emit_requisites(
        key: str, single: str, group_pred: str, option_pred: str, prefix: str
    ) -> tuple[list[str], list[str]]:
        direct: list[str] = []
        options: list[str] = []
        for cid in sorted(courses, key=str.lower):
            alt_index = 0
            for alternatives in courses[cid].get(key, []):
                if not alternatives:
                    continue
                for item in alternatives:
                    _require_course(courses, item, f"{key} of {cid}")
                if len(alternatives) == 1:
                    direct.append(_fact(single, asp_name(cid), asp_name(alternatives[0])))
                else:
                    alt_index += 1
                    group_atom = f"{prefix}_{asp_name(cid)}_{alt_index}"
                    direct.append(_fact(group_pred, asp_name(cid), group_atom))
                    for option in alternatives:
                        options.append(
                            _fact(option_pred, asp_name(cid), group_atom, asp_name(option))
                        )
        return direct, options

    lines.append("% " + "-" * 66)
    lines.append("% Prerequisites: prereq(B, A) means A is credited before B")
    lines.append("% " + "-" * 66)
    direct, options = emit_requisites(
        "prerequisites", "prereq", "prereq_group", "prereq_option", "pre"
    )
    lines.extend(direct)
    if options:
        lines.append("")
        lines.append("% One alternative from each prerequisite OR-group is enough;")
        lines.append("% extension.lp enforces the group.")
        lines.extend(options)
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Co-requisites: coreq(C, A): A credited in the same or an earlier term")
    lines.append("% " + "-" * 66)
    direct, options = emit_requisites(
        "corequisites", "coreq", "coreq_group", "coreq_option", "co"
    )
    lines.extend(direct)
    if options:
        lines.append("")
        lines.append("% One alternative from each co-requisite OR-group is enough;")
        lines.append("% extension.lp enforces the group.")
        lines.extend(options)
    lines.append("")

    # ------------------------------------------------------------------
    # Offering: course E runs in term part P of every academic year
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Offering: offered_slot(E, P) = course E runs in term part P")
    lines.append("% (1 = fall, 2 = spring, 3 = summer) of every academic year.")
    lines.append("% " + "-" * 66)
    by_slot: dict[int, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        for slot in _offered_slots(courses[cid]):
            by_slot[slot].append(course_atom[cid])
    for slot in sorted(by_slot):
        for chunk in _chunks(sorted(by_slot[slot]), 8):
            lines.append(_fact("offered_slot", _tuple(chunk), slot))
    lines.append("")

    # ------------------------------------------------------------------
    # Group bounds
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Group credit bounds: map(l, Group, Lower) and map(u, Group, Upper)")
    lines.append("% " + "-" * 66)
    for row in group_rows:
        lines.append(f"map(l, {row['atom']}, {row['lower']}).")
        lines.append(f"map(u, {row['atom']}, {row['upper']}).")
        if not row["counts_implied"]:
            if row["min_courses"] is not None:
                lines.append(_fact("map", "min_courses", row["atom"], int(row["min_courses"])))
            if row["max_courses"] is not None:
                lines.append(_fact("map", "max_courses", row["atom"], int(row["max_courses"])))
    lines.append("")
    lines.append("% Total degree bounds are a graduation requirement and live in policy.lp.")
    lines.append("")

    # ------------------------------------------------------------------
    # Majors
    # ------------------------------------------------------------------
    majors = curriculum_majors(curriculum)
    if majors:
        lines.append("% " + "-" * 66)
        lines.append("% Majors: earned by crediting at least major_min(M, K) courses")
        lines.append("% from major_course(M, E).")
        lines.append("% " + "-" * 66)
        for atom in sorted(majors):
            info = majors[atom]
            lines.append(f"% {info['id']}: {info['name']}")
            lines.append(_fact("major", atom))
            lines.append(_fact("major_min", atom, info["min"]))
            members = sorted({course_atom[cid] for cid in info["courses"]})
            for chunk in _chunks(members, 8):
                lines.append(_fact("major_course", atom, _tuple(chunk)))
        lines.append("")

    # ------------------------------------------------------------------
    # Milestone credit thresholds
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Milestone thresholds (credits accumulated before the course)")
    lines.append("% from curriculum.json 'milestones'. plan.lp enforces the generic")
    lines.append("% milestone constraint.")
    lines.append("% " + "-" * 66)
    for entry in curriculum.get("milestones", []):
        course_id = entry["course"]
        _require_course(courses, course_id, "milestones")
        if "min_credits" in entry:
            minimum = int(entry["min_credits"])
            note = f"{minimum} credits"
        elif "min_credit_percent" in entry:
            percent = int(entry["min_credit_percent"])
            minimum = _percent_credits(total_credits, percent)
            note = f"{percent}% of {total_credits} -> {minimum}"
        else:
            raise ValueError(
                f"milestones: {course_id!r} needs min_credits or min_credit_percent"
            )
        lines.append(f"% {course_id}: {note}")
        lines.append(_fact("milestone", asp_name(course_id), minimum))
    lines.append("")

    lines.append("% Curriculum-derived file ends here; see policy.lp and plan.lp.")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Grading / graduation policy
# ---------------------------------------------------------------------------
def _requirement_value(requirement: Requirement) -> int | None:
    if requirement.value is None:
        return None
    if isinstance(requirement.value, int):
        return requirement.value
    # Decimal GPA values are stored x100 in ASP to stay integral.
    return int(requirement.value * 100)


def build_policy(
    policy: Policy,
    planning: dict[str, int] | None = None,
) -> str:
    """Return the ASP facts for the shared grading/graduation policy.

    ``planning`` is the dict returned by :func:`planning_constants`; when it
    is omitted the load bounds come from the policy defaults.
    """
    validate_policy_support(policy)
    planning = planning or planning_constants(None, policy)

    lines: list[str] = []
    lines.append("% " + "=" * 69)
    lines.append("% policy.lp : grading, graduation and tuition policy")
    lines.append("% Generated from grading_policy.json, graduation_requirements.json")
    lines.append("% and tuition_policy.json by the planner CLI -- do not edit by hand.")
    lines.append("% " + "=" * 69)
    lines.append("")
    lines.append(f"% Grading policy: {policy.policy_id}")
    lines.append(f"% Effective cohorts: {policy.effective_from}..{policy.effective_to or 'open'}")
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Planner constants")
    lines.append("% " + "-" * 66)
    lines.append(f"#const maxtries = {policy.max_attempts}.")
    lines.append(f"#const min_load = {planning['min_load']}.")
    lines.append(f"#const max_load = {planning['max_load']}.")
    lines.append(f"#const min_load_summer = {planning['summer_min_load']}.")
    lines.append(f"#const max_load_summer = {planning['summer_max_load']}.")
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Numeric scales (all values are fixed-point integers)")
    lines.append("% " + "-" * 66)
    for scale in policy.scales:
        scale_atom = asp_name(scale.id)
        lines.append(
            _fact(
                "scale",
                scale_atom,
                scale.scaled(scale.minimum),
                scale.scaled(scale.maximum),
            )
        )
        lines.append(_fact("scale_precision", scale_atom, scale.precision))
        lines.append(_fact("scale_role", scale_atom, asp_name(scale.role)))
        if scale.id == policy.default_scale:
            lines.append(_fact("default_scale", scale_atom))
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Grade scale")
    lines.append("% " + "-" * 66)
    for rank, grade in enumerate(policy.grades):
        atom = asp_grade_name(grade.symbol)
        lines.append(_fact("grade", atom))
        lines.append(_fact("grade_symbol", atom, _quote(grade.symbol)))
        lines.append(_fact("grade_rank", atom, rank))
        if grade.passing:
            lines.append(_fact("grade_passing", atom))
        if grade.earns_credit:
            lines.append(_fact("grade_earns_credit", atom))
        if grade.provisional:
            lines.append(_fact("grade_provisional", atom))
        for scale in policy.scales:
            scale_atom = asp_name(scale.id)
            value = grade.value_for(scale, policy.default_scale)
            if value is None:
                continue
            scaled = scale.scaled(value)
            lines.append(_fact("grade_points", scale_atom, atom, scaled))
            if grade.in_gpa:
                lines.append(_fact("grade_in_gpa", scale_atom, atom))
            if scale.id == policy.default_scale:
                # Backwards-compatible aliases used by older rules.
                lines.append(_fact("grade_points", atom, scaled))
                if grade.in_gpa:
                    lines.append(_fact("grade_in_gpa", atom))
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% GPA course-kind filter")
    lines.append("% " + "-" * 66)
    for kind in policy.included_course_kinds:
        lines.append(_fact("included_course_kind", asp_name(kind)))
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Retake policy")
    lines.append("% " + "-" * 66)
    if policy.retake_eligibility_max_grade is not None:
        lines.append(
            _fact(
                "retake_eligibility",
                asp_grade_name(policy.retake_eligibility_max_grade),
            )
        )
    if policy.retake_grade_cap is not None:
        lines.append(
            _fact("retake_grade_cap", asp_grade_name(policy.retake_grade_cap))
        )
    lines.append(f"% gpa_attempt_selection = {policy.gpa_attempt_selection}")
    lines.append(f"% credit_counting = {policy.credit_counting}")
    lines.append(f"% equivalence = {policy.equivalence}")
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Graduation requirements")
    lines.append("% " + "-" * 66)
    for requirement in policy.graduation_requirements:
        value = _requirement_value(requirement)
        if value is None:
            lines.append(_fact("graduation_requirement", asp_name(requirement.type)))
        else:
            lines.append(
                _fact("graduation_requirement", asp_name(requirement.type), value)
            )
    if policy.min_total_credits is not None:
        lines.append(_fact("map", "l", "total_degree", policy.min_total_credits))
        lines.append(_fact("map", "u", "total_degree", policy.min_total_credits))
    if policy.min_cumulative_gpa is not None:
        default_scale = policy.default_scale_rule
        lines.append(
            _fact(
                "min_gpa",
                asp_name(default_scale.id),
                default_scale.scaled(policy.min_cumulative_gpa),
            )
        )
    lines.append("")

    if policy.external_requirements:
        lines.append("% " + "-" * 66)
        lines.append("% External requirements (reported; not yet planned)")
        lines.append("% " + "-" * 66)
        for requirement in policy.external_requirements:
            lines.append(
                _fact(
                    "external_requirement",
                    asp_name(requirement.id),
                    asp_name(requirement.unit),
                    asp_name(requirement.mode),
                    asp_name(requirement.enforcement),
                )
            )
            for milestone in requirement.milestones:
                deadline = asp_name(milestone.deadline_type)
                if milestone.year is not None:
                    lines.append(
                        _fact(
                            "external_milestone",
                            asp_name(requirement.id),
                            deadline,
                            milestone.year,
                            milestone.minimum,
                        )
                    )
                else:
                    lines.append(
                        _fact(
                            "external_milestone",
                            asp_name(requirement.id),
                            deadline,
                            milestone.minimum,
                        )
                    )
        lines.append("")

    return "\n".join(lines)


def _quote(value: str) -> str:
    """Quote a display string for clingo (used for reports only)."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def write_programs(
    curriculum: dict[str, Any],
    policy: Policy,
    curriculum_output: Path,
    policy_output: Path,
    extra_policy: str = "",
) -> None:
    curriculum_output.write_text(
        build_curriculum(curriculum, policy), encoding="utf-8"
    )
    policy_text = build_policy(policy, planning_constants(curriculum, policy))
    if extra_policy:
        policy_text = policy_text.rstrip() + "\n\n" + extra_policy.lstrip()
    policy_output.write_text(policy_text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Student attempts and student-history JSON
# ---------------------------------------------------------------------------
"""Boundary helpers for student attempts and student-history JSON.

The boundary is deliberately policy-aware in only one direction: it maps
JSON terms/grades to ASP atoms and derives attempt metadata.  It does not
decide whether a grade passes, earns credit or enters GPA; those decisions
belong to the compiled policy facts.  It does validate that every grade,
course and result is known, so a typo cannot silently turn into a failed or
missing course.

Student record fields understood here (all but the first three optional):

    student_id, enrollment_term ("YYYY-P"), attempts[]
    as_of_term | expected.as_of_term     term the history is complete up to
    program, major                       major must be a curriculum major id
    budget                               in the tuition policy's money_unit
    external_progress[]                  {requirement, term, amount}
    request[]                            courses to retake on purpose
    avoid[] / prefer[]                   elective taste
    offer[] / closed[]                   {course, term} offering overrides
"""


@dataclass(frozen=True)
class NumberedAttempt:
    """One kept attempt after numbering retakes among all registrations."""

    course: str
    course_atom: str
    attempt_atom: str
    retake: int | None
    semester: int
    grade: str | None
    result: str | None
    course_kind: str | None
    attempt_id: str | None
    order: int


@dataclass(frozen=True)
class StudentFacts:
    student_id: str
    facts: str
    studied_terms: int
    as_of_term: str | None
    enrollment_term: str | None
    program: str | None
    budget: int | None
    major: str | None = None
    enroll_part: int = 1
    warnings: tuple[str, ...] = ()


_TERM_RE = re.compile(r"^(\d{4})-([1-3])$")


def parse_term(term: str) -> tuple[int, int]:
    match = _TERM_RE.match(str(term).strip())
    if not match:
        raise ValueError(f"invalid term {term!r}; expected YYYY-1/2/3")
    return int(match.group(1)), int(match.group(2))


def term_to_index(term: str, enrollment_term: str) -> int:
    """Convert an academic term to a 1-based planning index.

    One academic year has three terms: regular 1, regular 2, summer 3.
    """
    year, part = parse_term(term)
    enroll_year, enroll_part = parse_term(enrollment_term)
    index = (year - enroll_year) * 3 + (part - enroll_part) + 1
    if index <= 0:
        raise ValueError(
            f"term {term!r} is before enrollment term {enrollment_term!r}"
        )
    return index


def load_student_history(path: Path) -> dict[str, Any]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(raw.get("students"), list):
        raise ValueError(f"{path}: expected an object with a students list")
    return raw


def find_student(raw: dict[str, Any], student_id: str | None = None) -> dict[str, Any]:
    students = raw.get("students", [])
    if student_id is not None:
        for student in students:
            if student.get("student_id") == student_id:
                return student
        raise ValueError(f"unknown student id {student_id!r}")
    if not students:
        raise ValueError("student_history.json has no students")
    return students[0]


def enrolled_program(curriculum: dict[str, Any] | None) -> str | None:
    if not curriculum:
        return None
    explicit = curriculum.get("program")
    if explicit:
        return str(explicit)
    name = str(curriculum.get("name", "")).strip()
    # "Computer Science 2023" -> "Computer Science"
    return re.sub(r"\s+\d{4}$", "", name) or None


def scaled_money(amount: Any, money_scale: int) -> int:
    """Convert an amount in the tuition money unit to fixed point (half up)."""
    return int((Decimal(str(amount)) * money_scale).to_integral_value(ROUND_HALF_UP))


def _non_counting_symbols(policy: Policy | None) -> set[str]:
    """Grade symbols that never become a GPA attempt (W plus provisional)."""
    symbols = {"W"}
    if policy is not None:
        symbols |= {g.symbol.strip().upper() for g in policy.grades if g.provisional}
    return symbols


def _resolve_as_of(
    student: dict[str, Any],
    as_of_term: str | None,
    infer_as_of: bool,
) -> str:
    expected = student.get("expected") or {}
    as_of = as_of_term or student.get("as_of_term") or expected.get("as_of_term")
    if as_of is not None:
        parse_term(as_of)
        return str(as_of)
    if not infer_as_of:
        raise ValueError(
            "as_of_term is required: the last attempt's term is not today's "
            "term after a leave of absence (pass infer_as_of=True to accept it)"
        )
    terms = [attempt.get("term") for attempt in student.get("attempts", [])]
    terms = [term for term in terms if term]
    if not terms:
        raise ValueError("student record has no attempts or as_of_term")
    return max(terms, key=lambda term: parse_term(term))


def _term_list(
    student: dict[str, Any], key: str, enrollment_term: str, known: set[str],
    canon: dict[str, str],
) -> list[tuple[str, int]]:
    """``offer`` / ``closed`` entries as ``(course_atom, term_index)``."""
    result: list[tuple[str, int]] = []
    for entry in student.get(key, []) or []:
        course = canon.get(str(entry["course"]), str(entry["course"]))
        if course not in known:
            raise ValueError(f"{key}: unknown course {course!r}")
        result.append((asp_name(course), term_to_index(entry["term"], enrollment_term)))
    return result


def _render_attempts(
    numbered: list[NumberedAttempt],
    non_counting: set[str],
) -> list[str]:
    """Render numbered attempts as ASP facts (shared by both entry points)."""
    lines: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    last: dict[str, NumberedAttempt] = {}
    last_graded: dict[str, NumberedAttempt] = {}
    gpa_last: dict[str, NumberedAttempt] = {}

    for attempt in numbered:
        lines.append(f"taken({attempt.attempt_atom}, {attempt.semester}).")
        if attempt.grade is not None:
            lines.append(
                f"map(g, {attempt.attempt_atom}, {asp_grade_name(attempt.grade)})."
            )
        if attempt.result is not None:
            lines.append(
                f"result({attempt.attempt_atom}, {asp_name(attempt.result)})."
            )
        if attempt.course_kind:
            lines.append(
                f"course_kind({attempt.attempt_atom}, {asp_name(attempt.course_kind)})."
            )
            lines.append(f"kind_known({attempt.attempt_atom}).")
        counts[attempt.course_atom] += 1
        last[attempt.course_atom] = attempt
        symbol = str(attempt.grade).strip().upper() if attempt.grade else ""
        if symbol != "W":
            last_graded[attempt.course_atom] = attempt
        if symbol and symbol not in non_counting:
            gpa_last[attempt.course_atom] = attempt

    if lines:
        lines.append("")
    for course_atom in sorted(counts):
        lines.append(f"attempt_count({course_atom}, {counts[course_atom]}).")
        chosen = last_graded.get(course_atom, last[course_atom])
        lines.append(f"last_attempt({course_atom}, {chosen.attempt_atom}).")
    for course_atom in sorted(gpa_last):
        lines.append(f"gpa_last({course_atom}, {gpa_last[course_atom].attempt_atom}).")
    return lines


def _exhausted_warnings(
    numbered: list[NumberedAttempt],
    curriculum: dict[str, Any] | None,
    policy: Policy | None,
) -> list[str]:
    """Compulsory courses that can never be credited (no attempts left)."""
    if curriculum is None or policy is None:
        return []
    compulsory = {
        cid
        for group in curriculum.get("groups", [])
        if str(group.get("type", "")).lower() == "mandatory"
        for cid in group.get("course_ids", [])
    }
    by_symbol = {g.symbol.strip().upper(): g for g in policy.grades}
    per_course: dict[str, list[NumberedAttempt]] = defaultdict(list)
    for attempt in numbered:
        per_course[attempt.course].append(attempt)

    warnings: list[str] = []
    for course, attempts in sorted(per_course.items()):
        if course not in compulsory or len(attempts) < int(policy.max_attempts):
            continue

        def earned(item: NumberedAttempt) -> bool:
            if item.result is not None:
                return item.result.strip().lower() == "passed"
            grade = by_symbol.get(str(item.grade or "").strip().upper())
            return bool(grade and grade.earns_credit)

        if any(earned(item) for item in attempts):
            continue
        final = [a for a in attempts if str(a.grade or "").strip().upper() != "W"]
        last = (final or attempts)[-1]
        if last.result is not None:
            failing = last.result.strip().lower() == "failed"
        else:
            grade = by_symbol.get(str(last.grade or "").strip().upper())
            failing = grade is not None and not grade.provisional
        if failing:
            warnings.append(
                f"{course} is compulsory with {len(attempts)} attempt(s) "
                f"(limit {policy.max_attempts}) and no credit earned: the plan "
                "is unsatisfiable until the registrar grants another attempt"
            )
    return warnings


def student_to_facts(
    student: dict[str, Any],
    *,
    curriculum: dict[str, Any] | None = None,
    policy: Policy | None = None,
    as_of_term: str | None = None,
    money_scale: int | None = None,
    strict: bool = True,
    infer_as_of: bool = False,
) -> StudentFacts:
    """Render one ``student_history.json`` record as ASP facts.

    ``policy`` enables the cohort check, grade validation, the
    withdrawal-counting switch and the provisional-grade list.
    ``money_scale`` (``10**precision`` of the tuition policy) is required when
    the student has a budget, which is given in the tuition money unit.
    ``strict`` raises on unknown courses; otherwise they are skipped.
    """
    enrollment_term = student.get("enrollment_term")
    if enrollment_term is None:
        raise ValueError("student record is missing enrollment_term")
    enroll_year, enroll_part = parse_term(enrollment_term)

    if policy is not None:
        validate_policy_support(policy)
        _check_cohort(
            enroll_year, policy.effective_from, policy.effective_to,
            f"grading policy {policy.policy_id}",
        )

    as_of = _resolve_as_of(student, as_of_term, infer_as_of)
    if parse_term(as_of) < parse_term(enrollment_term):
        raise ValueError(f"as_of_term {as_of} is before enrollment {enrollment_term}")

    aliases = curriculum_aliases(curriculum)
    known_courses = (
        {course["id"] for course in curriculum.get("courses", [])}
        if curriculum else None
    )
    known_grades = (
        {g.symbol.strip().upper() for g in policy.grades} if policy is not None else None
    )

    attempts_raw: list[dict[str, Any]] = []
    for order, raw_attempt in enumerate(student.get("attempts", [])):
        term = raw_attempt.get("term")
        if term is None:
            if strict:
                raise ValueError(f"attempt #{order} has no term")
            continue
        if parse_term(term) > parse_term(as_of):
            continue
        attempt = dict(raw_attempt)
        course = aliases.get(str(attempt["course"]), str(attempt["course"]))
        if known_courses is not None and course not in known_courses:
            if strict:
                raise ValueError(f"attempt #{order}: unknown course {course!r}")
            continue
        attempt["course"] = course
        grade = attempt.get("grade")
        if (
            grade is not None
            and known_grades is not None
            and str(grade).strip().upper() not in known_grades
        ):
            raise ValueError(f"attempt #{order} ({course}): unknown grade {grade!r}")
        if attempt.get("result") not in (None, "passed", "failed"):
            raise ValueError(
                f"attempt #{order} ({course}): unknown result {attempt['result']!r}"
            )
        attempt["semester"] = term_to_index(term, enrollment_term)
        attempt["order"] = order
        attempts_raw.append(attempt)

    count_withdrawals = (
        bool(getattr(policy, "count_withdrawals_as_attempts", True))
        if policy is not None else True
    )
    numbered = prepare_attempts(
        attempts_raw, withdrawn=() if count_withdrawals else ("W",)
    )

    lines: list[str] = [
        f"% student {student.get('student_id', '?')}",
        f"% enrollment_term {enrollment_term}; as_of_term {as_of}",
        _fact("enroll_part_in", enroll_part),
        "",
    ]
    lines.extend(_render_attempts(numbered, _non_counting_symbols(policy)))

    for progress in student.get("external_progress", []):
        term = progress.get("term")
        if term is None or parse_term(term) > parse_term(as_of):
            continue
        lines.append(
            "external_progress("
            f"{asp_name(str(progress.get('requirement', 'unknown')))}, "
            f"{term_to_index(term, enrollment_term)}, "
            f"{int(progress.get('amount', 0))})."
        )

    # ---- declared major -------------------------------------------------
    majors = curriculum_majors(curriculum)
    major = student.get("major")
    if major is not None and curriculum is not None:
        atom = asp_name(str(major))
        if atom not in majors:
            raise ValueError(
                f"unknown major {major!r}; curriculum majors: "
                f"{sorted(info['id'] for info in majors.values())}"
            )
        lines.append(_fact("student_major", atom))

    # ---- planning inputs the student may state -----------------------------
    known = known_courses if known_courses is not None else set()
    for key, predicate in (("request", "request"), ("avoid", "avoid"), ("prefer", "pref")):
        for course in student.get(key, []) or []:
            course = aliases.get(str(course), str(course))
            if known_courses is not None and course not in known:
                raise ValueError(f"{key}: unknown course {course!r}")
            lines.append(_fact(predicate, asp_name(course)))
    for key in ("offer", "closed"):
        for atom, index in _term_list(student, key, enrollment_term, known, aliases):
            lines.append(_fact(key, atom, index))

    # ---- budget (tuition money unit -> fixed point) -------------------------
    budget = student.get("budget")
    scaled_budget: int | None = None
    if budget is not None:
        if money_scale is None:
            raise ValueError(
                "student has a budget but money_scale is not given; pass "
                "money_scale=10**precision of the tuition policy"
            )
        scaled_budget = scaled_money(budget, money_scale)
        lines.append(_fact("budget", scaled_budget))

    warnings = _exhausted_warnings(numbered, curriculum, policy)

    return StudentFacts(
        student_id=str(student.get("student_id", "")),
        facts="\n".join(lines) + "\n",
        studied_terms=term_to_index(as_of, enrollment_term),
        as_of_term=as_of,
        enrollment_term=enrollment_term,
        program=student.get("program") or enrolled_program(curriculum),
        budget=scaled_budget,
        major=(asp_name(str(major)) if major is not None else None),
        enroll_part=enroll_part,
        warnings=tuple(warnings),
    )


def _is_withdrawn(attempt: dict[str, Any], withdrawn: set[str]) -> bool:
    grade = attempt.get("grade")
    return grade is not None and str(grade).strip().upper() in withdrawn


def prepare_attempts(
    attempts: Iterable[dict[str, Any]],
    withdrawn: Iterable[str] = (),
    aliases: dict[str, str] | None = None,
) -> list[NumberedAttempt]:
    """Number retakes among kept attempts.

    By default every registration is kept, including ``W``.  Pass
    ``withdrawn=("W",)`` to drop withdrawals.  ``aliases`` maps equivalent
    old course codes onto their canonical code *before* numbering, because
    the attempt index decides what counts as a retake.
    """
    aliases = aliases or {}
    withdrawn_set = {str(value).strip().upper() for value in withdrawn}
    kept = [
        dict(attempt)
        for attempt in attempts
        if not _is_withdrawn(attempt, withdrawn_set)
    ]

    by_course: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for attempt in kept:
        course = str(attempt["course"])
        by_course[aliases.get(course, course)].append(attempt)

    numbered: list[NumberedAttempt] = []
    for course in sorted(by_course, key=str.lower):
        course_atom = asp_name(course)
        records = sorted(
            by_course[course],
            key=lambda item: (
                int(item.get("semester", 0)),
                int(item.get("order", 0)),
            ),
        )
        for index, attempt in enumerate(records):
            retake = None if index == 0 else index
            atom = (
                course_atom
                if retake is None
                else f"rt({course_atom},{retake})"
            )
            grade = attempt.get("grade")
            result = attempt.get("result")
            numbered.append(
                NumberedAttempt(
                    course=course,
                    course_atom=course_atom,
                    attempt_atom=atom,
                    retake=retake,
                    semester=int(attempt.get("semester", 0)),
                    grade=str(grade) if grade is not None else None,
                    result=str(result) if result is not None else None,
                    course_kind=(
                        str(attempt.get("course_kind"))
                        if attempt.get("course_kind") is not None
                        else None
                    ),
                    attempt_id=(
                        str(attempt.get("attempt_id"))
                        if attempt.get("attempt_id") is not None
                        else None
                    ),
                    order=int(attempt.get("order", 0)),
                )
            )
    return numbered


def attempts_to_facts(
    attempts: Iterable[dict[str, Any]],
    withdrawn: Iterable[str] = (),
    aliases: dict[str, str] | None = None,
    policy: Policy | None = None,
) -> str:
    """Render attempt dictionaries as ASP facts."""
    numbered = prepare_attempts(attempts, withdrawn=withdrawn, aliases=aliases)
    lines = _render_attempts(numbered, _non_counting_symbols(policy))
    return "\n".join(lines) + ("\n" if lines else "")


# ---------------------------------------------------------------------------
# Tuition
# ---------------------------------------------------------------------------
_MAX_CREDITS = 999


def _program_matches(
    rule: dict[str, Any], program: str | None, major: str | None
) -> bool:
    programs = [str(item).strip().lower() for item in rule.get("programs", [])]
    if "*" in programs:
        return True
    wanted = {value.strip().lower() for value in (program, major) if value}
    return bool(wanted & set(programs))


def _exact_scaled(amount: Decimal, scale: int, what: str) -> int:
    scaled = amount * scale
    if scaled != scaled.to_integral_value():
        raise TuitionError(
            f"tuition policy: {what} {amount} is not exact at precision "
            f"{len(str(scale)) - 1}; raise 'precision'"
        )
    return int(scaled)


def _compile_tiers(
    rule: dict[str, Any], scale: int
) -> list[tuple[int, int, int, int, int]]:
    """Return ``(min, max, base, rate, over)`` tuples, all fixed point.

    The fee of a tier is ``base + rate * max(0, credits - over)``.
    """
    model = rule.get("fee_model") or {}
    raw_tiers = model.get("tiers")
    if raw_tiers is None:
        raw_tiers = [model]          # single tier covering every credit count
    out: list[tuple[int, int, int, int, int]] = []
    previous_max: int | None = None
    for position, tier in enumerate(raw_tiers):
        condition = tier.get("condition") or {}
        lo = condition.get("min_credits")
        hi = condition.get("max_credits")
        if lo is None:
            lo = 0 if previous_max is None else previous_max + 1
        lo = int(lo)
        hi = _MAX_CREDITS if hi is None else int(hi)
        if hi < lo:
            raise TuitionError(f"tuition tier #{position}: max_credits below min_credits")
        if previous_max is not None and lo != previous_max + 1:
            raise TuitionError(
                f"tuition tier #{position}: starts at {lo} but the previous tier "
                f"ended at {previous_max} (gap or overlap)"
            )
        kind = tier.get("fee_type", model.get("type"))
        discount = Decimal(str(tier.get("percentage", 0)))
        if kind == "flat":
            base = Decimal(str(tier["flat_fee"])) * (1 - discount)
            base_scaled = int((base * scale).to_integral_value(ROUND_HALF_UP))
            out.append((lo, hi, base_scaled, 0, 0))
        elif kind == "per_credit":
            if discount != 0:
                raise TuitionError("tuition: 'percentage' is only valid on flat tiers")
            rate = _exact_scaled(
                Decimal(str(tier["rate_per_credit"])), scale, "rate_per_credit"
            )
            applies_to = tier.get("applies_to", "all_credits")
            if applies_to == "all_credits":
                out.append((lo, hi, 0, rate, 0))
            elif applies_to == "excess_over":
                over = int(tier["excess_over"])
                base = Decimal(str(tier.get("base_fee", 0)))
                base_scaled = int((base * scale).to_integral_value(ROUND_HALF_UP))
                out.append((lo, hi, base_scaled, rate, over))
            else:
                raise TuitionError(f"tuition: unknown applies_to {applies_to!r}")
        else:
            raise TuitionError(f"tuition: unknown fee_type {kind!r}")
        previous_max = hi
    return out


def build_tuition(
    policy: dict[str, Any],
    program: str | None = None,
    major: str | None = None,
    *,
    cohort: int | None = None,
    required_semester_types: Iterable[str] = ("regular", "summer"),
) -> str:
    """Compile the tuition policy JSON to fixed-point ASP facts.

    ``policy`` is the parsed tuition_policy.json.  Rules are selected by
    program name *or* major id (a rule listing ``"*"`` matches everybody).
    Every semester type in ``required_semester_types`` must end up with a
    rule: a missing one would otherwise bill 0.
    """
    _check_cohort(
        cohort,
        (policy.get("effective_for_cohorts") or {}).get("from"),
        (policy.get("effective_for_cohorts") or {}).get("to"),
        f"tuition policy {policy.get('id')}",
    )
    precision = int(policy.get("precision", 3))
    scale = 10**precision

    selected: dict[str, dict[str, Any]] = {}
    for rule in policy.get("tuition_rules", []):
        if not _program_matches(rule, program, major):
            continue
        for semester_type in rule.get("semester_types", []):
            if semester_type in selected:
                raise TuitionError(
                    f"tuition policy: multiple rules match "
                    f"{semester_type!r} for program {program!r} / major {major!r}"
                )
            selected[semester_type] = rule

    for needed in required_semester_types:
        if needed not in selected:
            raise TuitionError(
                f"tuition policy: no rule for semester type {needed!r} and "
                f"program {program!r} / major {major!r}"
            )

    lines: list[str] = []
    lines.append("% " + "=" * 69)
    lines.append("% tuition.lp : generated from tuition_policy.json")
    lines.append("% fee_rule(Type, Min, Max, Base, Rate, Over):")
    lines.append("%   Min <= credits <= Max costs Base + Rate * max(0, credits - Over)")
    lines.append("% " + "=" * 69)
    lines.append("")
    lines.append(_fact("money_scale", scale))
    lines.append(_fact("money_currency", asp_name(str(policy.get("currency", "unit")))))
    lines.append(_fact("money_unit", asp_name(str(policy.get("money_unit", "unit")))))
    for semester_type in sorted(selected):
        for lo, hi, base, rate, over in _compile_tiers(selected[semester_type], scale):
            lines.append(
                _fact("fee_rule", asp_name(semester_type), lo, hi, base, rate, over)
            )
    lines.append("")
    return "\n".join(lines)