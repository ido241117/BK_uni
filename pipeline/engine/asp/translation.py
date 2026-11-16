"""Translation layer: dataset and student records to ASP facts.

Everything in this module is deterministic and side-effect free.  It builds
curriculum, grading/graduation, tuition, and student facts; it never invokes
clingo or renders plans.
"""

from __future__ import annotations


import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:  # package import
    from .data import Policy, Requirement, TuitionError, TuitionPolicy, TuitionRule
except ImportError:  # script/test import
    from data import Policy, Requirement, TuitionError, TuitionPolicy, TuitionRule

# Milestone rules are not represented in the JSON dataset yet.  These are the
# only curriculum-specific course hooks the planner still knows by name; they
# are skipped automatically when a test curriculum does not contain them.
MILESTONE_COURSES: tuple[tuple[str, str], ...] = (
    ("co3335", "internship_pct"),
    ("co4029", "specialized_project_pct"),
    ("co4337", "capstone_pct"),
)
CAPSTONE_COURSE = "co4337"
CAPSTONE_EXTRA_PREREQUISITE = "eng_gc"


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


def _frequency_terms(course: dict[str, Any]) -> list[tuple[int, int]]:
    """Map ``offered_terms`` onto main semesters only (v1).

    The curriculum lists three terms per year (1=fall, 2=spring, 3=summer).
    Version 1 plans main semesters only, so a course is mapped to:

    * every main semester when it is offered in both term 1 and term 2;
    * odd semesters when it is offered only in term 1;
    * even semesters when it is offered only in term 2.

    The returned pairs are ``(period, offset)`` for ``freq(E,K,O)``.  Summer
    (term 3) is ignored; a summer-only course is conservatively treated as
    available every main semester because the ASP encoding cannot express
    "never offered" with frequency facts.
    """
    raw_terms = course.get("offered_terms")
    terms = {int(term) for term in raw_terms} if raw_terms else {1, 2, 3}
    main_terms = terms & {1, 2}
    if main_terms == {1, 2}:
        return []
    if main_terms == {1}:
        return [(2, 1)]
    if main_terms == {2}:
        return [(2, 0)]
    return []


def _offered_types(course: dict[str, Any]) -> tuple[str, ...]:
    """Return the term types in which a course is offered.

    ``offered_terms`` uses 1/2 for regular terms and 3 for summer.  An empty
    list means "no restriction" (the historical default).
    """
    raw_terms = course.get("offered_terms")
    terms = {int(term) for term in raw_terms} if raw_terms else {1, 2, 3}
    result: list[str] = []
    if terms & {1, 2}:
        result.append("regular")
    if 3 in terms:
        result.append("summer")
    return tuple(result)


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


def build_curriculum(curriculum: dict[str, Any], policy: Policy) -> str:
    """Return the ASP program for ``curriculum`` as a string."""
    courses = {course["id"]: course for course in curriculum.get("courses", [])}
    credits = {cid: int(course.get("credits", 0)) for cid, course in courses.items()}
    course_atom = {cid: asp_name(cid) for cid in courses}
    total_credits = int(curriculum.get("total_credits", 0))

    group_rows: list[dict[str, Any]] = []
    for raw_group in curriculum.get("groups", []):
        members = [cid for cid in raw_group.get("course_ids", []) if cid in courses]
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
    lines.append("% " + "-" * 66)
    lines.append("% Prerequisites: prereq(B, A) means A is credited before B")
    lines.append("% " + "-" * 66)
    prerequisite_alt: list[tuple[str, str, str]] = []
    for cid in sorted(courses, key=str.lower):
        course = courses[cid]
        alt_index = 0
        for alternatives in course.get("prerequisites", []):
            alternatives = [item for item in alternatives if item in courses]
            if not alternatives:
                continue
            if len(alternatives) == 1:
                lines.append(_fact("prereq", asp_name(cid), asp_name(alternatives[0])))
            else:
                alt_index += 1
                group_atom = f"pre_{asp_name(cid)}_{alt_index}"
                lines.append(_fact("prereq_group", asp_name(cid), group_atom))
                for option in alternatives:
                    prerequisite_alt.append((asp_name(cid), group_atom, asp_name(option)))
    if prerequisite_alt:
        lines.append("")
        lines.append("% One alternative from each prerequisite OR-group is enough;")
        lines.append("% extension.lp enforces the group.")
        for cid, group_atom, option in prerequisite_alt:
            lines.append(_fact("prereq_option", cid, group_atom, option))
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Co-requisites: co/2 must be credited in the same or an earlier term")
    lines.append("% " + "-" * 66)
    corequisite_alt: list[tuple[str, str, str]] = []
    for cid in sorted(courses, key=str.lower):
        course = courses[cid]
        alt_index = 0
        for alternatives in course.get("corequisites", []):
            alternatives = [item for item in alternatives if item in courses]
            if not alternatives:
                continue
            if len(alternatives) == 1:
                lines.append(_fact("coreq", asp_name(cid), asp_name(alternatives[0])))
            else:
                alt_index += 1
                group_atom = f"co_{asp_name(cid)}_{alt_index}"
                lines.append(_fact("coreq_group", asp_name(cid), group_atom))
                for option in alternatives:
                    corequisite_alt.append((asp_name(cid), group_atom, asp_name(option)))
    if corequisite_alt:
        lines.append("")
        lines.append("% One alternative from each co-requisite OR-group is enough;")
        lines.append("% extension.lp enforces the group.")
        for cid, group_atom, option in corequisite_alt:
            lines.append(_fact("coreq_option", cid, group_atom, option))
    lines.append("")

    # ------------------------------------------------------------------
    # Offering frequency (main semesters only, v1)
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Offering frequency: freq(E,K,O) = every I with (I+shift) mod K = O")
    lines.append("% v1 maps curriculum terms 1/2 onto odd/even main semesters.")
    lines.append("% " + "-" * 66)
    frequency_courses: dict[tuple[int, int], list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        for pair in _frequency_terms(courses[cid]):
            frequency_courses[pair].append(asp_name(cid))
    for (period, offset), members in sorted(frequency_courses.items()):
        for chunk in _chunks(members, 8):
            lines.append(_fact("freq", _tuple(chunk), period, offset))
    lines.append("")
    lines.append("% Term-type offering facts (regular/summer).  These take")
    lines.append("% precedence over the legacy freq/3 encoding.")
    offered_by_type: dict[str, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        for term_type in _offered_types(courses[cid]):
            offered_by_type[term_type].append(asp_name(cid))
    for term_type in sorted(offered_by_type):
        for chunk in _chunks(sorted(offered_by_type[term_type]), 8):
            lines.append(_fact("offered_in", _tuple(chunk), term_type))
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
    # Credit accounting
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Credit accounting")
    lines.append("% " + "-" * 66)
    lines.append("% Group membership, compulsory/elective views, credit sets,")
    lines.append("% selected-elective choices, and credit bounds are derived")
    lines.append("% generically in extension.lp from the facts above.")
    lines.append("")

    # ------------------------------------------------------------------
    # Milestone credit thresholds
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Milestone thresholds (credits accumulated before the course)")
    lines.append("% Percentages are planner defaults in data.py. plan.lp enforces")
    lines.append("% the generic milestone constraint.")
    lines.append("% " + "-" * 66)
    for course_id, percent_field in MILESTONE_COURSES:
        atom = asp_name(course_id)
        if atom not in course_atom.values():
            continue
        percent = int(getattr(policy, percent_field))
        minimum = _percent_credits(total_credits, percent)
        lines.append(
            f"% {course_id}: {percent}% of {total_credits} -> {minimum}"
        )
        lines.append(_fact("milestone", atom, minimum))
    lines.append("")

    capstone_atom = asp_name(CAPSTONE_COURSE)
    prerequisite_atom = asp_name(CAPSTONE_EXTRA_PREREQUISITE)
    if (
        capstone_atom in course_atom.values()
        and prerequisite_atom in course_atom.values()
    ):
        lines.append("% Capstone additionally requires ENG_GC to be passed beforehand.")
        lines.append(_fact("prereq", capstone_atom, prerequisite_atom))
        lines.append("")

    lines.append("% Curriculum-derived file ends here; see policy.lp and plan.lp.")
    lines.append("")

    return "\n".join(lines)


def _requirement_value(requirement: Requirement) -> int | None:
    if requirement.value is None:
        return None
    if isinstance(requirement.value, int):
        return requirement.value
    # Decimal GPA values are stored x100 in ASP to stay integral.
    return int(requirement.value * 100)


def build_policy(policy: Policy) -> str:
    """Return the ASP facts for the shared grading/graduation policy."""
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
    lines.append(f"#const shift = {policy.calendar_shift}.")
    lines.append(f"#const term_offset = {policy.term_offset}.")
    lines.append(f"#const min_load = {policy.default_min_load}.")
    lines.append(f"#const max_load = {policy.default_max_load}.")
    lines.append(f"#const min_load_summer = {policy.summer_min_load}.")
    lines.append(f"#const max_load_summer = {policy.summer_max_load}.")
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Numeric scales (all values are fixed-point integers)")
    lines.append("% " + "-" * 66)
    default_scale_atom = asp_name(policy.default_scale)
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
    policy_text = build_policy(policy)
    if extra_policy:
        policy_text = policy_text.rstrip() + "\n\n" + extra_policy.lstrip()
    policy_output.write_text(policy_text, encoding="utf-8")


"""Boundary helpers for student attempts and student-history JSON.

The boundary is deliberately policy-aware in only one direction: it maps
JSON terms/grades to ASP atoms and derives attempt metadata.  It does not
decide whether a grade passes, earns credit or enters GPA; those decisions
belong to the compiled policy facts.

Withdrawn attempts are kept in the attempt count (so retake limits match the
audit tools), but ASP treats them as ``withdrawn`` rather than ``failed``.
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


def student_to_facts(
    student: dict[str, Any],
    *,
    curriculum: dict[str, Any] | None = None,
    as_of_term: str | None = None,
) -> StudentFacts:
    """Render one ``student_history.json`` record as ASP facts."""
    enrollment_term = student.get("enrollment_term")
    if enrollment_term is None:
        raise ValueError("student record is missing enrollment_term")
    expected = student.get("expected") or {}
    as_of = as_of_term or expected.get("as_of_term")
    if as_of is None:
        terms = [attempt.get("term") for attempt in student.get("attempts", [])]
        terms = [term for term in terms if term]
        if not terms:
            raise ValueError("student record has no attempts or as_of_term")
        as_of = max(terms, key=lambda term: parse_term(term))

    attempts_raw = []
    for order, raw_attempt in enumerate(student.get("attempts", [])):
        term = raw_attempt.get("term")
        if term is None:
            continue
        if parse_term(term) > parse_term(as_of):
            continue
        attempt = dict(raw_attempt)
        attempt["semester"] = term_to_index(term, enrollment_term)
        attempt["order"] = order
        attempts_raw.append(attempt)

    numbered = prepare_attempts(attempts_raw, withdrawn=())
    lines: list[str] = [
        f"% student {student.get('student_id', '?')}",
        f"% enrollment_term {enrollment_term}; as_of_term {as_of}",
        "",
    ]
    counts: dict[str, int] = defaultdict(int)
    last: dict[str, NumberedAttempt] = {}
    last_graded: dict[str, NumberedAttempt] = {}

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
        if not attempt.grade or str(attempt.grade).strip().upper() != "W":
            last_graded[attempt.course_atom] = attempt

    if lines:
        lines.append("")
    for course_atom in sorted(counts):
        lines.append(f"attempt_count({course_atom}, {counts[course_atom]}).")
        chosen = last_graded.get(course_atom, last[course_atom])
        lines.append(f"last_attempt({course_atom}, {chosen.attempt_atom}).")

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

    budget = student.get("budget")
    if budget is not None:
        lines.append(f"budget({int(budget)}).")
    return StudentFacts(
        student_id=str(student.get("student_id", "")),
        facts="\n".join(lines) + "\n",
        studied_terms=term_to_index(as_of, enrollment_term),
        as_of_term=as_of,
        enrollment_term=enrollment_term,
        program=student.get("program") or enrolled_program(curriculum),
        budget=int(budget) if budget is not None else None,
    )


def _is_withdrawn(attempt: dict[str, Any], withdrawn: set[str]) -> bool:
    grade = attempt.get("grade")
    return grade is not None and str(grade).strip().upper() in withdrawn


def prepare_attempts(
    attempts: Iterable[dict[str, Any]],
    withdrawn: Iterable[str] = (),
) -> list[NumberedAttempt]:
    """Number retakes among kept attempts.

    By default every registration is kept, including ``W``.  Pass
    ``withdrawn=("W",)`` to restore the old filtering behaviour.
    """
    withdrawn_set = {str(value).strip().upper() for value in withdrawn}
    kept = [
        dict(attempt)
        for attempt in attempts
        if not _is_withdrawn(attempt, withdrawn_set)
    ]

    by_course: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for attempt in kept:
        by_course[str(attempt["course"])].append(attempt)

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
) -> str:
    """Render attempt dictionaries as ASP facts."""
    numbered = prepare_attempts(attempts, withdrawn=withdrawn)
    lines: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    last: dict[str, NumberedAttempt] = {}
    last_graded: dict[str, NumberedAttempt] = {}

    for attempt in numbered:
        lines.append(
            f"taken({attempt.attempt_atom}, {attempt.semester})."
        )
        if attempt.grade is not None:
            lines.append(
                f"map(g, {attempt.attempt_atom}, "
                f"{asp_grade_name(attempt.grade)})."
            )
        if attempt.result is not None:
            lines.append(
                f"result({attempt.attempt_atom}, {attempt.result})."
            )
        if attempt.course_kind:
            lines.append(
                f"course_kind({attempt.attempt_atom}, "
                f"{asp_name(attempt.course_kind)})."
            )
            lines.append(f"kind_known({attempt.attempt_atom}).")
        counts[attempt.course_atom] += 1
        last[attempt.course_atom] = attempt
        if not attempt.grade or str(attempt.grade).strip().upper() != "W":
            last_graded[attempt.course_atom] = attempt

    if lines:
        lines.append("")
    for course_atom in sorted(counts):
        lines.append(f"attempt_count({course_atom}, {counts[course_atom]}).")
        chosen = last_graded.get(course_atom, last[course_atom])
        lines.append(f"last_attempt({course_atom}, {chosen.attempt_atom}).")

    return "\n".join(lines) + ("\n" if lines else "")


def _program_matches(rule: TuitionRule, program: str | None) -> bool:
    if "*" in rule.programs:
        return True
    if program is None:
        return False
    wanted = program.strip().lower()
    return any(item.strip().lower() == wanted for item in rule.programs)


def build_tuition(policy: TuitionPolicy, program: str | None = None) -> str:
    """Compile selected tuition rules to fixed-point ASP facts."""
    selected: dict[str, TuitionRule] = {}
    for rule in policy.rules:
        if not _program_matches(rule, program):
            continue
        for semester_type in rule.semester_types:
            if semester_type in selected:
                raise TuitionError(
                    f"tuition policy: multiple rules match "
                    f"{semester_type!r} for program {program!r}"
                )
            selected[semester_type] = rule

    lines: list[str] = []
    lines.append("% " + "=" * 69)
    lines.append("% tuition.lp : generated from tuition_policy.json")
    lines.append("% " + "=" * 69)
    lines.append("")
    lines.append(_fact("money_scale", 10 ** policy.precision))
    lines.append(_fact("money_currency", asp_name(policy.currency)))
    lines.append(_fact("money_unit", asp_name(policy.money_unit)))
    for semester_type in sorted(selected):
        for tier in selected[semester_type].tiers:
            lines.append(
                _fact(
                    "fee_rule",
                    asp_name(semester_type),
                    asp_name(tier.fee_type),
                    tier.min_credits,
                    tier.max_credits,
                    policy.scaled(tier.amount),
                )
            )
    lines.append("")
    return "\n".join(lines)
