"""Shared fixtures for the ASP planner tests."""

from __future__ import annotations

import itertools
from dataclasses import replace
from pathlib import Path
from typing import Any

from data import Policy, parse_policy
from translation import build_curriculum, build_policy

TINY_CURRICULUM: dict[str, Any] = {
    "schema_version": 1,
    "id": "tiny",
    "name": "Tiny Test Curriculum",
    "total_credits": 22,
    "courses": [
        {
            "id": "C1001",
            "name": "Intro A",
            "credits": 3,
            "prerequisites": [[]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C1002",
            "name": "Intro B",
            "credits": 3,
            "prerequisites": [[]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C1003",
            "name": "Intro C",
            "credits": 2,
            "prerequisites": [[]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C2001",
            "name": "Intermediate A",
            "credits": 4,
            "prerequisites": [["C1001"]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C2002",
            "name": "Intermediate B",
            "credits": 3,
            "prerequisites": [["C1002"]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C3001",
            "name": "Advanced A",
            "credits": 4,
            "prerequisites": [["C2001"]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
        {
            "id": "C3002",
            "name": "Advanced B",
            "credits": 3,
            "prerequisites": [["C2002"]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        },
    ],
    "groups": [
        {
            "id": "ALL",
            "type": "mandatory",
            "course_ids": [
                "C1001",
                "C1002",
                "C1003",
                "C2001",
                "C2002",
                "C3001",
                "C3002",
            ],
        }
    ],
    "majors": [],
    "default_major": "Tiny",
}

TINY_GRADING: dict[str, Any] = {
    "schema_version": 1,
    "id": "tiny_policy",
    "effective_for_cohorts": {"from": 2024, "to": None},
    "grade_scale": [
        {"grade": "A", "points": "4.00", "passing": True, "in_gpa": True, "earns_credit": True},
        {"grade": "B", "points": "3.00", "passing": True, "in_gpa": True, "earns_credit": True},
        {"grade": "C", "points": "2.00", "passing": True, "in_gpa": True, "earns_credit": True},
        {"grade": "D", "points": "1.00", "passing": True, "in_gpa": True, "earns_credit": True},
        {"grade": "F", "points": "0.00", "passing": False, "in_gpa": True, "earns_credit": False},
    ],
    "gpa": {
        "formula": "credit_weighted_mean",
        "included_course_kinds": ["regular"],
        "scale_max": "4.00",
        "rounding": {"mode": "half_up", "decimals": 2, "applied_to": "final_only"},
    },
    "retake": {
        "gpa_attempt_selection": "latest",
        "grade_cap": {"applies_to": "retakes", "max_grade": "B"},
        "keep_old_attempts_on_transcript": True,
        "equivalence": "use_course_equivalents",
    },
    "pipeline_order": [
        "resolve_equivalents",
        "select_attempts",
        "sum_credits_and_gpa",
        "round",
    ],
}

TINY_GRADUATION: dict[str, Any] = {
    "schema_version": 1,
    "curriculum_id": "tiny",
    "grading_policy": "tiny_policy",
    "requirements": [
        {"id": "groups", "type": "all_groups_satisfied"},
        {"id": "credits", "type": "min_total_credits", "value": 22},
        {"id": "gpa", "type": "min_cumulative_gpa", "value": "2.00"},
    ],
    "external_requirements": [],
}


def tiny_policy(**overrides: Any) -> Policy:
    policy = parse_policy(TINY_GRADING, TINY_GRADUATION)
    return replace(policy, **overrides)


def write_programs(
    directory: Path,
    policy: Policy,
    curriculum: dict[str, Any] | None = None,
    *,
    fees: bool = True,
) -> tuple[Path, Path]:
    curriculum = curriculum or TINY_CURRICULUM
    curriculum_path = directory / "tiny-curriculum.lp"
    policy_path = directory / "tiny-policy.lp"
    curriculum_path.write_text(
        build_curriculum(curriculum, policy), encoding="utf-8"
    )
    policy_text = build_policy(policy)
    if fees:
        # plan.lp refuses a billed semester without a matching fee rule, so
        # every tiny fixture needs a (free) schedule unless a test overrides
        # it.  Keep the shape identical to build_tuition output.
        policy_text += (
            "\nmoney_scale(1).\n"
            "money_currency(vnd).\n"
            "money_unit(unit).\n"
            "fee_rule(regular, 0, 999, 0, 0, 0).\n"
            "fee_rule(summer, 0, 999, 0, 0, 0).\n"
        )
    policy_path.write_text(policy_text, encoding="utf-8")
    return curriculum_path, policy_path


def brute_force_tiny(
    horizon: int = 5,
    min_load: int = 6,
    max_load: int = 9,
) -> tuple[int, ...]:
    """Independent exhaustive optimum for TINY_CURRICULUM (no history)."""
    courses = {course["id"]: course for course in TINY_CURRICULUM["courses"]}
    ids = list(courses)
    best: tuple[int, ...] | None = None

    for assignment in itertools.product(range(1, horizon + 1), repeat=len(ids)):
        semester = dict(zip(ids, assignment))
        used = set(assignment)
        if max(used) != len(used):
            continue
        loads = {
            value: sum(
                courses[course]["credits"]
                for course in ids
                if semester[course] == value
            )
            for value in used
        }
        last = max(used)
        # The final used semester may be below min_load: only the remaining
        # credits have to fit, so plan.lp does not force a full last term.
        if any(
            load > max_load or (value < last and load < min_load)
            for value, load in loads.items()
        ):
            continue
        prerequisites_ok = True
        for course_id, course in courses.items():
            for alternatives in course["prerequisites"]:
                if not alternatives:
                    continue
                if not any(
                    semester[option] < semester[course_id]
                    for option in alternatives
                ):
                    prerequisites_ok = False
                    break
            if not prerequisites_ok:
                break
        if not prerequisites_ok:
            continue

        def level(course_id: str) -> int:
            return int(next(char for char in course_id if char.isdigit()))

        objective = (
            max(used),
            0,
            0,  # tuition cost: the tiny fixture has no tuition policy
            sum(
                semester[course]
                for course in ids
                if level(course) <= 2
            ),
            max(loads.values()),
            0,
        )
        if best is None or objective < best:
            best = objective
    assert best is not None
    return best


def check_plan(
    plan,
    curriculum: dict[str, Any] = TINY_CURRICULUM,
    *,
    min_load: int = 6,
    max_load: int = 9,
    passed_history: set[str] | None = None,
) -> list[str]:
    """Independent Python checker for a returned plan (not ASP)."""
    passed_history = set(passed_history or ())
    courses = {course["id"]: course for course in curriculum["courses"]}
    groups = {group["id"]: group for group in curriculum["groups"]}
    problems: list[str] = []
    scheduled: dict[str, int] = {}

    last_used = max(
        (semester.semester for semester in plan.semesters if semester.courses),
        default=0,
    )
    for semester in plan.semesters:
        if not semester.courses:
            problems.append(f"semester {semester.semester} is empty")
        credits = sum(course.credits for course in semester.courses)
        if credits != semester.credits:
            problems.append(
                f"semester {semester.semester}: credits {semester.credits} "
                f"but courses sum to {credits}"
            )
        if credits > max_load:
            problems.append(
                f"semester {semester.semester}: {credits} credits > {max_load}"
            )
        if semester.semester < last_used and credits < min_load:
            problems.append(
                f"semester {semester.semester}: {credits} credits < {min_load}"
            )
        for course in semester.courses:
            if course.code in scheduled:
                problems.append(f"{course.code} scheduled more than once")
            scheduled[course.code] = semester.semester

    used = sorted(set(scheduled.values()))
    if used and used != list(range(min(used), max(used) + 1)):
        problems.append(f"planned semesters are not contiguous: {used}")
    if used and min(used) != 1 + (
        plan.history[-1]["semester"] if plan.history else 0
    ):
        problems.append("plan does not start in the first future semester")

    for course_id, semester in scheduled.items():
        course = courses.get(course_id)
        if course is None:
            problems.append(f"unknown course {course_id}")
            continue
        for alternatives in course["prerequisites"]:
            if not alternatives:
                continue
            credit_before = any(
                option in passed_history or (option in scheduled and scheduled[option] < semester)
                for option in alternatives
            )
            if not credit_before:
                problems.append(
                    f"{course_id} in semester {semester} misses prerequisite "
                    f"{alternatives}"
                )

    for group in groups.values():
        if group["type"] != "mandatory":
            continue
        for course_id in group["course_ids"]:
            if course_id not in scheduled and course_id not in passed_history:
                problems.append(
                    f"mandatory course {course_id} is not passed or planned"
                )

    total = sum(course["credits"] for course in courses.values())
    planned_plus_history = total - sum(
        courses[course]["credits"] for course in passed_history
    )
    if plan.total_planned != planned_plus_history:
        problems.append(
            f"total_planned {plan.total_planned} != {planned_plus_history}"
        )
    if not plan.degree_complete:
        problems.append("degree_complete is false")

    expected_objective = [
        max(used) if used else 0,
        sum(
            semester
            for course_id, semester in scheduled.items()
            if course_id in set(plan.must)
        ),
        0,  # tuition cost: the tiny fixture has no tuition policy
        sum(
            semester
            for course_id, semester in scheduled.items()
            if int(next(char for char in course_id if char.isdigit())) <= 2
        ),
        max((semester.credits for semester in plan.semesters), default=0),
        0,
    ]
    if plan.objective[: len(expected_objective)] != expected_objective:
        problems.append(
            f"objective {plan.objective} != independent {expected_objective}"
        )
    return problems
