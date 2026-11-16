"""Optimization tests: golden optimum, independent checking, invariance."""

from __future__ import annotations

from pathlib import Path

from engine import SolverOptions, plans_from_solutions, solve
from translation import attempts_to_facts
from support import (
    TINY_CURRICULUM,
    brute_force_tiny,
    check_plan,
    tiny_policy,
    write_programs,
)


def _solve(
    directory: Path,
    *,
    student: str = "",
    horizon: int = 5,
    min_load: int = 6,
    max_load: int = 9,
    plans: int = 1,
    seed: int | None = None,
    studied_terms: int | None = None,
    policy=None,
):
    directory.mkdir(parents=True, exist_ok=True)
    policy = policy or tiny_policy()
    curriculum_path, policy_path = write_programs(directory, policy)
    student_path = directory / "student.lp"
    student_path.write_text(student, encoding="utf-8")
    solutions = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(
            horizon=horizon,
            studied_terms=studied_terms,
            plans=plans,
            min_load=min_load,
            max_load=max_load,
            seed=seed,
        ),
    )
    return plans_from_solutions(solutions, TINY_CURRICULUM, policy)


def test_golden_case_matches_python_brute_force(tmp_path: Path) -> None:
    plans = _solve(tmp_path)
    assert plans, "expected at least one optimal plan"
    plan = plans[0]
    assert plan.objective == list(brute_force_tiny())
    assert plan.optimal is True
    assert plan.last_semester == 3
    assert check_plan(plan) == []


def test_config_invariance_across_seeds_and_plan_counts(tmp_path: Path) -> None:
    objectives = []
    for seed in (0, 1, 2):
        plans = _solve(tmp_path / f"seed-{seed}", seed=seed, plans=1)
        objectives.append(tuple(plans[0].objective))
    plans = _solve(tmp_path / "many", plans=3)
    objectives.append(tuple(plans[0].objective))
    assert len(set(objectives)) == 1, objectives
    assert objectives[0] == brute_force_tiny()


def test_larger_max_load_never_worsens_objective(tmp_path: Path) -> None:
    tight = _solve(tmp_path / "tight", min_load=4, max_load=7)[0]
    loose = _solve(tmp_path / "loose", min_load=4, max_load=9)[0]
    assert tuple(loose.objective) <= tuple(tight.objective)
    assert loose.last_semester <= tight.last_semester
    assert check_plan(tight, min_load=4, max_load=7) == []
    assert check_plan(loose, min_load=4, max_load=9) == []


def test_tuition_is_reported_from_semester_fees(tmp_path: Path) -> None:
    policy = tiny_policy()
    curriculum_path, policy_path = write_programs(tmp_path, policy)
    with policy_path.open("a", encoding="utf-8") as handle:
        handle.write("fee_rule(regular, per_credit, 0, 99, 10).\n")
        handle.write("fee_rule(summer, per_credit, 0, 99, 5).\n")
        handle.write("money_scale(1).\n")
    student_path = tmp_path / "student.lp"
    student_path.write_text("", encoding="utf-8")
    solutions = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(horizon=5, plans=1, min_load=6, max_load=9),
    )
    plan = plans_from_solutions(solutions, TINY_CURRICULUM, policy)[0]
    fees = [semester.fee for semester in plan.semesters if semester.fee is not None]
    assert fees
    assert plan.total_cost == sum(fees)
    assert plan.total_cost == 175

    too_cheap = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(horizon=5, plans=1, min_load=6, max_load=9, budget=174),
    )
    assert too_cheap
    assert all(solution.status == "UNSATISFIABLE" for solution in too_cheap)


def test_failed_course_never_shortens_plan(tmp_path: Path) -> None:
    # The failed transcript has a 0.00 GPA; the tiny policy's 2.00 minimum
    # would make the instance unsatisfiable before retakes are planned.
    policy = tiny_policy(min_cumulative_gpa=None)
    passed = _solve(
        tmp_path / "passed",
        student=attempts_to_facts(
            [{"course": "C1001", "semester": 1, "grade": "A"}]
        ),
        horizon=6,
        min_load=4,
        max_load=9,
        studied_terms=1,
        policy=policy,
    )[0]
    failed = _solve(
        tmp_path / "failed",
        student=attempts_to_facts(
            [{"course": "C1001", "semester": 1, "grade": "F"}]
        ),
        horizon=6,
        min_load=4,
        max_load=9,
        studied_terms=1,
        policy=policy,
    )[0]

    assert check_plan(passed, min_load=4, max_load=9, passed_history={"C1001"}) == []
    assert check_plan(failed, min_load=4, max_load=9) == []
    assert failed.last_semester >= passed.last_semester
    retake = [
        course
        for semester in failed.semesters
        for course in semester.courses
        if course.code == "C1001" and course.retake is not None
    ]
    assert retake, "failed compulsory course must be retaken"
