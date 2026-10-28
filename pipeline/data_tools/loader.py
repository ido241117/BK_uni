"""Load and validate the academic-advising JSON dataset."""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from data_tools.model import (
    Attempt,
    Course,
    Curriculum,
    DataBundle,
    Deadline,
    Expected,
    ExternalProgress,
    ExternalRequirement,
    GradeRule,
    GradingPolicy,
    GraduationRequirements,
    Group,
    Major,
    MajorRule,
    Milestone,
    Requirement,
    Student,
)

TERM_RE = re.compile(r"^\d{4}-[1-3]$")
SUPPORTED_MAJOR_RULES = {"required_courses"}
DEADLINE_TYPES = {"end_of_year", "graduation"}


class DataValidationError(ValueError):
    """Raised when the JSON files are structurally invalid or do not link up."""

    def __init__(self, messages: Iterable[str]):
        self.messages = list(messages)
        super().__init__("\n".join(self.messages))


def term_key(term: str) -> tuple[int, int]:
    year, part = term.split("-", 1)
    return int(year), int(part)


def _fail(context: str, message: str) -> None:
    raise DataValidationError([f"{context}: {message}"])


def _need(obj: dict[str, Any], key: str, context: str) -> Any:
    if key not in obj:
        _fail(context, f"missing required field '{key}'")
    return obj[key]


def _str(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(context, "expected a non-empty string")
    return value


def _int(value: Any, context: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail(context, "expected an integer")
    return value


def _bool(value: Any, context: str) -> bool:
    if not isinstance(value, bool):
        _fail(context, "expected a boolean")
    return value


def _decimal_string(value: Any, context: str) -> Decimal:
    if not isinstance(value, str) or not value.strip():
        _fail(context, "expected a decimal string such as \"2.50\"")
    try:
        return Decimal(value)
    except InvalidOperation:
        _fail(context, f"invalid decimal value {value!r}")


def _decimal_or_none(value: Any, context: str) -> Decimal | None:
    if value is None:
        return None
    return _decimal_string(value, context)


def _list(value: Any, context: str) -> list[Any]:
    if not isinstance(value, list):
        _fail(context, "expected a list")
    return value


def _dict(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(context, "expected an object")
    return value


def _term(value: Any, context: str) -> str:
    term = _str(value, context)
    if not TERM_RE.match(term):
        _fail(context, f"invalid term {term!r}; expected YYYY-T")
    return term


def _string_list(value: Any, context: str) -> tuple[str, ...]:
    items = _list(value, context)
    return tuple(_str(item, f"{context}[{index}]") for index, item in enumerate(items))


def _string_matrix(value: Any, context: str) -> tuple[tuple[str, ...], ...]:
    items = _list(value, context)
    return tuple(
        tuple(
            _str(course_id, f"{context}[{row_index}][{column_index}]")
            for column_index, course_id in enumerate(_list(row, f"{context}[{row_index}]"))
        )
        for row_index, row in enumerate(items)
    )


def _int_list(value: Any, context: str) -> tuple[int, ...]:
    items = _list(value, context)
    return tuple(_int(item, f"{context}[{index}]") for index, item in enumerate(items))


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise DataValidationError([f"missing data file: {path}"])
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataValidationError([f"{path.name}: invalid JSON: {exc}"]) from exc
    return _dict(raw, path.name)


def _parse_curriculum(raw: dict[str, Any]) -> Curriculum:
    context = "curriculum.json"
    schema_version = _int(_need(raw, "schema_version", context), f"{context}.schema_version")
    curriculum_id = _str(_need(raw, "id", context), f"{context}.id")
    name = _str(_need(raw, "name", context), f"{context}.name")
    total_credits = _int(_need(raw, "total_credits", context), f"{context}.total_credits")

    courses: dict[str, Course] = {}
    for index, item in enumerate(_list(_need(raw, "courses", context), f"{context}.courses")):
        item_context = f"{context}.courses[{index}]"
        course = Course(
            id=_str(_need(item, "id", item_context), f"{item_context}.id"),
            name=_str(_need(item, "name", item_context), f"{item_context}.name"),
            credits=_int(_need(item, "credits", item_context), f"{item_context}.credits"),
            prerequisites=_string_matrix(
                _need(item, "prerequisites", item_context), f"{item_context}.prerequisites"
            ),
            corequisites=_string_matrix(
                _need(item, "corequisites", item_context), f"{item_context}.corequisites"
            ),
            offered_terms=_int_list(
                _need(item, "offered_terms", item_context), f"{item_context}.offered_terms"
            ),
        )
        if course.id in courses:
            _fail(item_context, f"duplicate course id {course.id!r}")
        if course.credits <= 0:
            _fail(item_context, "credits must be positive")
        courses[course.id] = course

    groups: list[Group] = []
    group_ids: set[str] = set()
    for index, item in enumerate(_list(_need(raw, "groups", context), f"{context}.groups")):
        item_context = f"{context}.groups[{index}]"
        group_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if group_id in group_ids:
            _fail(item_context, f"duplicate group id {group_id!r}")
        group_ids.add(group_id)
        group = Group(
            id=group_id,
            type=_str(_need(item, "type", item_context), f"{item_context}.type"),
            course_ids=_string_list(
                _need(item, "course_ids", item_context), f"{item_context}.course_ids"
            ),
            min_credits=(
                _int(item["min_credits"], f"{item_context}.min_credits")
                if item.get("min_credits") is not None
                else None
            ),
            min_courses=(
                _int(item["min_courses"], f"{item_context}.min_courses")
                if item.get("min_courses") is not None
                else None
            ),
            max_courses=(
                _int(item["max_courses"], f"{item_context}.max_courses")
                if item.get("max_courses") is not None
                else None
            ),
        )
        if group.type not in {"mandatory", "elective"}:
            _fail(item_context, f"unsupported group type {group.type!r}")
        groups.append(group)

    majors: list[Major] = []
    major_ids: set[str] = set()
    for index, item in enumerate(_list(_need(raw, "majors", context), f"{context}.majors")):
        item_context = f"{context}.majors[{index}]"
        major_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if major_id in major_ids:
            _fail(item_context, f"duplicate major id {major_id!r}")
        major_ids.add(major_id)
        rule_raw = _dict(_need(item, "rule", item_context), f"{item_context}.rule")
        rule_type = _str(_need(rule_raw, "type", f"{item_context}.rule"), f"{item_context}.rule.type")
        if rule_type not in SUPPORTED_MAJOR_RULES:
            _fail(item_context, f"unsupported major rule type {rule_type!r}")
        majors.append(
            Major(
                id=major_id,
                name=_str(_need(item, "name", item_context), f"{item_context}.name"),
                rule=MajorRule(
                    type=rule_type,
                    course_ids=_string_list(
                        _need(rule_raw, "course_ids", f"{item_context}.rule"),
                        f"{item_context}.rule.course_ids",
                    ),
                ),
            )
        )

    return Curriculum(
        schema_version=schema_version,
        id=curriculum_id,
        name=name,
        total_credits=total_credits,
        courses=courses,
        groups=tuple(groups),
        majors=tuple(majors),
        default_major=_str(_need(raw, "default_major", context), f"{context}.default_major"),
    )


def _parse_policy(raw: dict[str, Any]) -> GradingPolicy:
    context = "grading_policy.json"
    schema_version = _int(_need(raw, "schema_version", context), f"{context}.schema_version")
    policy_id = _str(_need(raw, "id", context), f"{context}.id")

    effective = _dict(
        _need(raw, "effective_for_cohorts", context), f"{context}.effective_for_cohorts"
    )
    effective_from = _int(
        _need(effective, "from", f"{context}.effective_for_cohorts"),
        f"{context}.effective_for_cohorts.from",
    )
    effective_to_raw = _need(effective, "to", f"{context}.effective_for_cohorts")
    effective_to = (
        None
        if effective_to_raw is None
        else _int(effective_to_raw, f"{context}.effective_for_cohorts.to")
    )

    grade_scale: dict[str, GradeRule] = {}
    for index, item in enumerate(
        _list(_need(raw, "grade_scale", context), f"{context}.grade_scale")
    ):
        item_context = f"{context}.grade_scale[{index}]"
        symbol = _str(_need(item, "grade", item_context), f"{item_context}.grade")
        if symbol in grade_scale:
            _fail(item_context, f"duplicate grade {symbol!r}")
        grade_scale[symbol] = GradeRule(
            grade=symbol,
            points=_decimal_or_none(item.get("points"), f"{item_context}.points"),
            passing=_bool(_need(item, "passing", item_context), f"{item_context}.passing"),
            in_gpa=_bool(_need(item, "in_gpa", item_context), f"{item_context}.in_gpa"),
            earns_credit=_bool(
                _need(item, "earns_credit", item_context), f"{item_context}.earns_credit"
            ),
            provisional=_bool(
                item.get("provisional", False), f"{item_context}.provisional"
            ),
        )

    gpa_raw = _dict(_need(raw, "gpa", context), f"{context}.gpa")
    included_course_kinds = _string_list(
        _need(gpa_raw, "included_course_kinds", f"{context}.gpa"),
        f"{context}.gpa.included_course_kinds",
    )
    rounding = _dict(_need(gpa_raw, "rounding", f"{context}.gpa"), f"{context}.gpa.rounding")

    retake_raw = _dict(_need(raw, "retake", context), f"{context}.retake")
    eligibility = _dict(
        _need(retake_raw, "eligibility", f"{context}.retake"), f"{context}.retake.eligibility"
    )
    eligibility_max_grade_raw = _need(
        eligibility, "only_if_grade_at_most", f"{context}.retake.eligibility"
    )
    eligibility_max_grade = (
        None
        if eligibility_max_grade_raw is None
        else _str(
            eligibility_max_grade_raw,
            f"{context}.retake.eligibility.only_if_grade_at_most",
        )
    )
    if eligibility_max_grade is not None and eligibility_max_grade not in grade_scale:
        _fail(
            f"{context}.retake.eligibility",
            f"unknown grade {eligibility_max_grade!r}",
        )

    grade_cap = _dict(
        _need(retake_raw, "grade_cap", f"{context}.retake"), f"{context}.retake.grade_cap"
    )
    grade_cap_max_grade_raw = _need(
        grade_cap, "max_grade", f"{context}.retake.grade_cap"
    )
    grade_cap_max_grade = (
        None
        if grade_cap_max_grade_raw is None
        else _str(grade_cap_max_grade_raw, f"{context}.retake.grade_cap.max_grade")
    )
    if grade_cap_max_grade is not None and grade_cap_max_grade not in grade_scale:
        _fail(f"{context}.retake.grade_cap", f"unknown grade {grade_cap_max_grade!r}")

    maximum_attempts = _int(
        _need(retake_raw, "max_attempts", f"{context}.retake"),
        f"{context}.retake.max_attempts",
    )
    if maximum_attempts <= 0:
        _fail(f"{context}.retake", "max_attempts must be positive")

    return GradingPolicy(
        schema_version=schema_version,
        id=policy_id,
        effective_from=effective_from,
        effective_to=effective_to,
        grade_scale=grade_scale,
        gpa_formula=_str(_need(gpa_raw, "formula", f"{context}.gpa"), f"{context}.gpa.formula"),
        included_course_kinds=included_course_kinds,
        scale_max=_decimal_string(_need(gpa_raw, "scale_max", f"{context}.gpa"), f"{context}.gpa.scale_max"),
        rounding_mode=_str(_need(rounding, "mode", f"{context}.gpa.rounding"), f"{context}.gpa.rounding.mode"),
        rounding_decimals=_int(
            _need(rounding, "decimals", f"{context}.gpa.rounding"),
            f"{context}.gpa.rounding.decimals",
        ),
        rounding_applied_to=_str(
            _need(rounding, "applied_to", f"{context}.gpa.rounding"),
            f"{context}.gpa.rounding.applied_to",
        ),
        gpa_attempt_selection=_str(
            _need(retake_raw, "gpa_attempt_selection", f"{context}.retake"),
            f"{context}.retake.gpa_attempt_selection",
        ),
        credit_counting=_str(
            _need(retake_raw, "credit_counting", f"{context}.retake"),
            f"{context}.retake.credit_counting",
        ),
        eligibility_max_grade=eligibility_max_grade,
        eligibility_max_points=(
            grade_scale[eligibility_max_grade].points
            if eligibility_max_grade is not None
            else None
        ),
        max_attempts=maximum_attempts,
        grade_cap_applies_to=_str(
            _need(grade_cap, "applies_to", f"{context}.retake.grade_cap"),
            f"{context}.retake.grade_cap.applies_to",
        ),
        grade_cap_max_grade=grade_cap_max_grade,
        grade_cap_max_points=(
            grade_scale[grade_cap_max_grade].points
            if grade_cap_max_grade is not None
            else None
        ),
        keep_old_attempts=_bool(
            _need(retake_raw, "keep_old_attempts_on_transcript", f"{context}.retake"),
            f"{context}.retake.keep_old_attempts_on_transcript",
        ),
        equivalence=_str(
            _need(retake_raw, "equivalence", f"{context}.retake"), f"{context}.retake.equivalence"
        ),
        pipeline_order=_string_list(
            _need(raw, "pipeline_order", context), f"{context}.pipeline_order"
        ),
    )


def _parse_graduation(raw: dict[str, Any]) -> GraduationRequirements:
    context = "graduation_requirements.json"
    schema_version = _int(_need(raw, "schema_version", context), f"{context}.schema_version")
    curriculum_id = _str(_need(raw, "curriculum_id", context), f"{context}.curriculum_id")
    grading_policy = _str(_need(raw, "grading_policy", context), f"{context}.grading_policy")

    requirements: list[Requirement] = []
    requirement_ids: set[str] = set()
    for index, item in enumerate(
        _list(_need(raw, "requirements", context), f"{context}.requirements")
    ):
        item_context = f"{context}.requirements[{index}]"
        requirement_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if requirement_id in requirement_ids:
            _fail(item_context, f"duplicate requirement id {requirement_id!r}")
        requirement_ids.add(requirement_id)
        requirement_type = _str(_need(item, "type", item_context), f"{item_context}.type")
        value: Any = item.get("value")
        if requirement_type == "min_total_credits":
            value = _int(_need(item, "value", item_context), f"{item_context}.value")
        elif requirement_type == "min_cumulative_gpa":
            value = _decimal_string(_need(item, "value", item_context), f"{item_context}.value")
        requirements.append(Requirement(id=requirement_id, type=requirement_type, value=value))

    external_requirements: list[ExternalRequirement] = []
    external_ids: set[str] = set()
    for index, item in enumerate(
        _list(
            _need(raw, "external_requirements", context),
            f"{context}.external_requirements",
        )
    ):
        item_context = f"{context}.external_requirements[{index}]"
        requirement_id = _str(_need(item, "id", item_context), f"{item_context}.id")
        if requirement_id in external_ids:
            _fail(item_context, f"duplicate external requirement id {requirement_id!r}")
        external_ids.add(requirement_id)
        milestones: list[Milestone] = []
        for milestone_index, milestone_raw in enumerate(
            _list(_need(item, "milestones", item_context), f"{item_context}.milestones")
        ):
            milestone_context = f"{item_context}.milestones[{milestone_index}]"
            deadline_raw = _dict(
                _need(milestone_raw, "deadline", milestone_context),
                f"{milestone_context}.deadline",
            )
            deadline_type = _str(
                _need(deadline_raw, "type", f"{milestone_context}.deadline"),
                f"{milestone_context}.deadline.type",
            )
            if deadline_type not in DEADLINE_TYPES:
                _fail(milestone_context, f"unsupported deadline type {deadline_type!r}")
            year = None
            if deadline_type == "end_of_year":
                year = _int(
                    _need(deadline_raw, "year", f"{milestone_context}.deadline"),
                    f"{milestone_context}.deadline.year",
                )
                if year <= 0:
                    _fail(milestone_context, "deadline year must be positive")
            milestones.append(
                Milestone(
                    deadline=Deadline(type=deadline_type, year=year),
                    min=_int(
                        _need(milestone_raw, "min", milestone_context),
                        f"{milestone_context}.min",
                    ),
                )
            )
        external_requirements.append(
            ExternalRequirement(
                id=requirement_id,
                unit=_str(_need(item, "unit", item_context), f"{item_context}.unit"),
                mode=_str(_need(item, "mode", item_context), f"{item_context}.mode"),
                enforcement=_str(
                    _need(item, "enforcement", item_context), f"{item_context}.enforcement"
                ),
                milestones=tuple(milestones),
            )
        )

    return GraduationRequirements(
        schema_version=schema_version,
        curriculum_id=curriculum_id,
        grading_policy=grading_policy,
        requirements=tuple(requirements),
        external_requirements=tuple(external_requirements),
    )


def _parse_students(raw: dict[str, Any], policy: GradingPolicy) -> tuple[Student, ...]:
    context = "student_history.json"
    students: list[Student] = []
    student_ids: set[str] = set()
    attempt_ids: set[str] = set()
    for index, item in enumerate(_list(_need(raw, "students", context), f"{context}.students")):
        item_context = f"{context}.students[{index}]"
        student_id = _str(_need(item, "student_id", item_context), f"{item_context}.student_id")
        if student_id in student_ids:
            _fail(item_context, f"duplicate student id {student_id!r}")
        student_ids.add(student_id)

        attempts: list[Attempt] = []
        for attempt_index, attempt_raw in enumerate(
            _list(_need(item, "attempts", item_context), f"{item_context}.attempts")
        ):
            attempt_context = f"{item_context}.attempts[{attempt_index}]"
            attempt_id = _str(
                _need(attempt_raw, "attempt_id", attempt_context),
                f"{attempt_context}.attempt_id",
            )
            if attempt_id in attempt_ids:
                _fail(attempt_context, f"duplicate attempt id {attempt_id!r}")
            attempt_ids.add(attempt_id)
            grade = _str(_need(attempt_raw, "grade", attempt_context), f"{attempt_context}.grade")
            if grade not in policy.grade_scale:
                _fail(attempt_context, f"unknown grade {grade!r}")
            attempts.append(
                Attempt(
                    attempt_id=attempt_id,
                    course=_str(
                        _need(attempt_raw, "course", attempt_context),
                        f"{attempt_context}.course",
                    ),
                    term=_term(
                        _need(attempt_raw, "term", attempt_context),
                        f"{attempt_context}.term",
                    ),
                    grade=grade,
                    course_kind=_str(
                        _need(attempt_raw, "course_kind", attempt_context),
                        f"{attempt_context}.course_kind",
                    ),
                    order=attempt_index,
                )
            )

        external_progress: list[ExternalProgress] = []
        for progress_index, progress_raw in enumerate(
            _list(item.get("external_progress", []), f"{item_context}.external_progress")
        ):
            progress_context = f"{item_context}.external_progress[{progress_index}]"
            external_progress.append(
                ExternalProgress(
                    requirement=_str(
                        _need(progress_raw, "requirement", progress_context),
                        f"{progress_context}.requirement",
                    ),
                    term=_term(
                        _need(progress_raw, "term", progress_context),
                        f"{progress_context}.term",
                    ),
                    amount=_int(
                        _need(progress_raw, "amount", progress_context),
                        f"{progress_context}.amount",
                    ),
                    order=progress_index,
                )
            )

        expected_raw = _dict(_need(item, "expected", item_context), f"{item_context}.expected")
        expected_context = f"{item_context}.expected"
        external_totals_raw = _dict(
            _need(expected_raw, "external_totals", expected_context),
            f"{expected_context}.external_totals",
        )
        expected = Expected(
            as_of_term=_term(
                _need(expected_raw, "as_of_term", expected_context),
                f"{expected_context}.as_of_term",
            ),
            counted_attempts=_string_list(
                _need(expected_raw, "counted_attempts", expected_context),
                f"{expected_context}.counted_attempts",
            ),
            effective_grades={
                _str(key, f"{expected_context}.effective_grades key"): _str(
                    value, f"{expected_context}.effective_grades[{key!r}]"
                )
                for key, value in _dict(
                    _need(expected_raw, "effective_grades", expected_context),
                    f"{expected_context}.effective_grades",
                ).items()
            },
            gpa_credits=_int(
                _need(expected_raw, "gpa_credits", expected_context),
                f"{expected_context}.gpa_credits",
            ),
            grade_points=_decimal_string(
                _need(expected_raw, "grade_points", expected_context),
                f"{expected_context}.grade_points",
            ),
            cgpa=_decimal_string(
                _need(expected_raw, "cgpa", expected_context), f"{expected_context}.cgpa"
            ),
            credits_earned=_int(
                _need(expected_raw, "credits_earned", expected_context),
                f"{expected_context}.credits_earned",
            ),
            external_totals={
                _str(key, f"{expected_context}.external_totals key"): _int(
                    value, f"{expected_context}.external_totals[{key!r}]"
                )
                for key, value in external_totals_raw.items()
            },
        )

        students.append(
            Student(
                student_id=student_id,
                curriculum_id=_str(
                    _need(item, "curriculum_id", item_context), f"{item_context}.curriculum_id"
                ),
                grading_policy=_str(
                    _need(item, "grading_policy", item_context), f"{item_context}.grading_policy"
                ),
                cohort=_int(_need(item, "cohort", item_context), f"{item_context}.cohort"),
                enrollment_term=_term(
                    _need(item, "enrollment_term", item_context),
                    f"{item_context}.enrollment_term",
                ),
                attempts=tuple(attempts),
                external_progress=tuple(external_progress),
                expected=expected,
                note=(
                    _str(item["note"], f"{item_context}.note")
                    if item.get("note") is not None
                    else None
                ),
            )
        )
    return tuple(students)


def _validate_cross_references(
    curriculum: Curriculum,
    policy: GradingPolicy,
    graduation: GraduationRequirements,
    students: tuple[Student, ...],
) -> None:
    errors: list[str] = []

    if graduation.curriculum_id != curriculum.id:
        errors.append(
            "graduation_requirements.json: curriculum_id "
            f"{graduation.curriculum_id!r} does not match curriculum id {curriculum.id!r}"
        )
    if graduation.grading_policy != policy.id:
        errors.append(
            "graduation_requirements.json: grading_policy "
            f"{graduation.grading_policy!r} does not match policy id {policy.id!r}"
        )

    for course_id, course in curriculum.courses.items():
        for prerequisite in course.prerequisites:
            for required_id in prerequisite:
                if required_id not in curriculum.courses:
                    errors.append(
                        f"curriculum.json: course {course_id!r} lists unknown prerequisite {required_id!r}"
                    )
        for corequisite in course.corequisites:
            for required_id in corequisite:
                if required_id not in curriculum.courses:
                    errors.append(
                        f"curriculum.json: course {course_id!r} lists unknown corequisite {required_id!r}"
                    )

    for group in curriculum.groups:
        for course_id in group.course_ids:
            if course_id not in curriculum.courses:
                errors.append(
                    f"curriculum.json: group {group.id!r} lists unknown course {course_id!r}"
                )

    for major in curriculum.majors:
        for course_id in major.rule.course_ids:
            if course_id not in curriculum.courses:
                errors.append(
                    f"curriculum.json: major {major.id!r} lists unknown course {course_id!r}"
                )

    external_ids = {item.id for item in graduation.external_requirements}
    for student in students:
        context = f"student_history.json: student {student.student_id!r}"
        if student.curriculum_id != curriculum.id:
            errors.append(
                f"{context}: curriculum_id {student.curriculum_id!r} does not match {curriculum.id!r}"
            )
        if student.grading_policy != policy.id:
            errors.append(
                f"{context}: grading_policy {student.grading_policy!r} does not match {policy.id!r}"
            )
        if student.cohort < policy.effective_from or (
            policy.effective_to is not None and student.cohort > policy.effective_to
        ):
            errors.append(
                f"{context}: cohort {student.cohort} is outside the policy's effective range"
            )
        if term_key(student.expected.as_of_term) < term_key(student.enrollment_term):
            errors.append(f"{context}: as_of_term is before enrollment_term")

        attempt_ids = {attempt.attempt_id for attempt in student.attempts}
        for attempt in student.attempts:
            if attempt.course not in curriculum.courses:
                errors.append(f"{context}: attempt {attempt.attempt_id!r} uses unknown course {attempt.course!r}")
        for counted_id in student.expected.counted_attempts:
            if counted_id not in attempt_ids:
                errors.append(
                    f"{context}: expected.counted_attempts references unknown attempt {counted_id!r}"
                )
        for attempt_id, grade in student.expected.effective_grades.items():
            if attempt_id not in attempt_ids:
                errors.append(
                    f"{context}: expected.effective_grades references unknown attempt {attempt_id!r}"
                )
            if grade not in policy.grade_scale:
                errors.append(
                    f"{context}: expected.effective_grades has unknown grade {grade!r}"
                )
        for progress in student.external_progress:
            if progress.requirement not in external_ids:
                errors.append(
                    f"{context}: external_progress references unknown requirement {progress.requirement!r}"
                )
            if progress.amount < 0:
                errors.append(f"{context}: external_progress amount cannot be negative")
        for requirement_id in student.expected.external_totals:
            if requirement_id not in external_ids:
                errors.append(
                    f"{context}: expected.external_totals references unknown requirement {requirement_id!r}"
                )

    if errors:
        raise DataValidationError(errors)


def load_data(data_dir: str | Path = "data") -> DataBundle:
    """Read the four dataset files, validate them and return a typed bundle."""

    root = Path(data_dir).resolve()
    curriculum = _parse_curriculum(_read_json(root / "curriculum.json"))
    policy = _parse_policy(_read_json(root / "grading_policy.json"))
    graduation = _parse_graduation(_read_json(root / "graduation_requirements.json"))
    students = _parse_students(_read_json(root / "student_history.json"), policy)
    _validate_cross_references(curriculum, policy, graduation, students)
    return DataBundle(
        data_dir=root,
        curriculum=curriculum,
        policy=policy,
        graduation=graduation,
        students=students,
    )
