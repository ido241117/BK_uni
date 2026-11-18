"""Optimization tests: golden optimum, independent checking, invariance."""

from __future__ import annotations

import copy
from decimal import Decimal
from pathlib import Path

from data import ExternalMilestone, ExternalRequirement
from engine import SolverOptions, plans_from_solutions, solve
from translation import attempts_to_facts
from support import (
    TINY_CURRICULUM,
    brute_force_tiny,
    check_plan,
    tiny_policy,
    write_programs,
)


def _run(
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
    curriculum=None,
    extra_policy: str = "",
    opt_mode: str = "optN",
    time_limit: float | None = None,
    progress: bool = False,
    extra_args: tuple[str, ...] = (),
):
    directory.mkdir(parents=True, exist_ok=True)
    policy = policy or tiny_policy()
    curriculum = curriculum or TINY_CURRICULUM
    curriculum_path, policy_path = write_programs(directory, policy, curriculum)
    if extra_policy:
        with policy_path.open("a", encoding="utf-8") as handle:
            handle.write(extra_policy)
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
            opt_mode=opt_mode,
            time_limit=time_limit,
            progress=progress,
            extra_args=extra_args,
        ),
    )
    return solutions, curriculum, policy


def _solve(*args, **kwargs):
    solutions, curriculum, policy = _run(*args, **kwargs)
    return plans_from_solutions(solutions, curriculum, policy)


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
    curriculum_path, policy_path = write_programs(tmp_path, policy, fees=False)
    with policy_path.open("a", encoding="utf-8") as handle:
        handle.write("fee_rule(regular, 0, 999, 0, 10, 0).\n")
        handle.write("fee_rule(summer, 0, 999, 0, 5, 0).\n")
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


def test_fourth_attempt_counts_and_is_capped(
    tmp_path: Path,
) -> None:
    """S003 semantics: the latest of four attempts counts, capped at B."""
    policy = tiny_policy()
    student = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2, "grade": "C"},
            {"course": "C1001", "semester": 3, "grade": "C"},
            {"course": "C1001", "semester": 4, "grade": "A"},
            {"course": "C1002", "semester": 1, "result": "passed"},
            {"course": "C1003", "semester": 1, "result": "passed"},
        ],
    )
    plan = _solve(
        tmp_path,
        student=student,
        horizon=8,
        min_load=6,
        max_load=9,
        studied_terms=4,
        opt_mode="ignore",
        policy=policy,
    )[0]

    assert plan.gpa == 300
    assert "C1001" in plan.credited
    assert plan.total_credit == 22


def test_latest_high_grade_is_capped_on_a_retake(tmp_path: Path) -> None:
    """S004 semantics: an improvement retake is capped at B."""
    policy = tiny_policy()
    student = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "B"},
            {"course": "C1001", "semester": 2, "grade": "A"},
            {"course": "C1002", "semester": 1, "grade": "B"},
        ],
    )
    plan = _solve(
        tmp_path,
        student=student,
        horizon=6,
        min_load=6,
        max_load=9,
        studied_terms=2,
        opt_mode="ignore",
        policy=policy,
    )[0]

    assert plan.gpa == 300
    assert "C1001" in plan.credited


def test_best_selection_keeps_the_highest_effective_grade(tmp_path: Path) -> None:
    """Best mode can keep a first-attempt A when the capped retake is lower."""
    student = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "A"},
            {"course": "C1001", "semester": 2, "grade": "A"},
            {"course": "C1002", "semester": 1, "grade": "B"},
        ],
    )
    latest = _solve(
        tmp_path / "latest",
        student=student,
        horizon=6,
        min_load=6,
        max_load=9,
        studied_terms=2,
        opt_mode="ignore",
        policy=tiny_policy(gpa_attempt_selection="latest"),
    )[0]
    best = _solve(
        tmp_path / "best",
        student=student,
        horizon=6,
        min_load=6,
        max_load=9,
        studied_terms=2,
        opt_mode="ignore",
        policy=tiny_policy(gpa_attempt_selection="best"),
    )[0]

    assert latest.gpa == 300
    assert best.gpa == 350


def test_low_gpa_is_reachable_when_retakes_are_planned(tmp_path: Path) -> None:
    # A 0.00 history GPA is not an immediate rejection: the planner reports
    # the target needed on the remaining/retaken credits instead of enforcing
    # a hard minimum.
    policy = tiny_policy()
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
    assert failed.gpa_required_avg is not None
    assert failed.gpa_required_avg > 0
    assert failed.gpa_already_satisfied is False
    assert failed.gpa_requirement_impossible is False


def test_gpa_target_already_satisfied(tmp_path: Path) -> None:
    student = attempts_to_facts(
        [
            {"course": course_id, "semester": 1, "grade": "A"}
            for course_id in (
                "C1001",
                "C1002",
                "C1003",
                "C2001",
                "C2002",
                "C3001",
                "C3002",
            )
        ]
    )
    plan = _solve(
        tmp_path,
        student=student,
        horizon=2,
        min_load=0,
        max_load=9,
        studied_terms=1,
        opt_mode="ignore",
    )[0]

    assert plan.gpa == 400
    assert plan.gpa_required_avg == 0
    assert plan.gpa_already_satisfied is True
    assert plan.gpa_requirement_impossible is False
    assert plan.ready_to_graduate is True


def test_gpa_target_can_be_impossible_under_the_grade_cap(tmp_path: Path) -> None:
    policy = tiny_policy(min_cumulative_gpa=Decimal("4.00"))
    student = attempts_to_facts(
        [
            {"course": course_id, "semester": 1, "grade": "F"}
            for course_id in (
                "C1001",
                "C1002",
                "C1003",
                "C2001",
                "C2002",
                "C3001",
                "C3002",
            )
        ]
    )
    plan = _solve(
        tmp_path,
        student=student,
        horizon=8,
        min_load=6,
        max_load=9,
        studied_terms=1,
        opt_mode="ignore",
        policy=policy,
    )[0]

    assert plan.gpa == 0
    assert plan.gpa_best_case == 300
    assert plan.gpa_required_avg == 400
    assert plan.gpa_already_satisfied is False
    assert plan.gpa_requirement_impossible is True
    assert plan.ready_to_graduate is False


def test_retake_of_a_passed_course_requires_an_explicit_request(
    tmp_path: Path,
) -> None:
    student = attempts_to_facts(
        [{"course": "C1001", "semester": 1, "grade": "A"}]
    )
    without_request = _solve(
        tmp_path / "without",
        student=student,
        horizon=6,
        min_load=4,
        max_load=9,
        studied_terms=1,
    )[0]
    with_request = _solve(
        tmp_path / "with",
        student=student + "request(c1001).\n",
        horizon=6,
        min_load=4,
        max_load=9,
        studied_terms=1,
    )[0]

    def retakes(plan):
        return [
            course
            for semester in plan.semesters
            for course in semester.courses
            if course.code == "C1001" and course.retake is not None
        ]

    assert retakes(without_request) == []
    assert retakes(with_request)
    assert "C1001" in with_request.must
    assert check_plan(
        without_request,
        min_load=4,
        max_load=9,
        passed_history={"C1001"},
    ) == []


def test_offering_slots_follow_the_enrollment_term(tmp_path: Path) -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["total_credits"] = 3
    curriculum["courses"] = [
        {
            "id": "C1001",
            "name": "Spring only",
            "credits": 3,
            "prerequisites": [[]],
            "corequisites": [[]],
            "offered_terms": [2],
        }
    ]
    curriculum["groups"] = [
        {"id": "ALL", "type": "mandatory", "course_ids": ["C1001"]}
    ]
    policy = tiny_policy(min_total_credits=3)

    no_fact, _, _ = _run(
        tmp_path / "fall",
        horizon=1,
        min_load=0,
        max_load=9,
        policy=policy,
        curriculum=curriculum,
    )
    spring, _, _ = _run(
        tmp_path / "spring",
        student="enroll_part_in(2).\n",
        horizon=1,
        min_load=0,
        max_load=9,
        policy=policy,
        curriculum=curriculum,
    )

    assert all(solution.status == "UNSATISFIABLE" for solution in no_fact)
    assert spring[0].status == "SATISFIABLE"
    atoms = {str(symbol) for symbol in spring[0].symbols}
    assert "plan(c1001,1)" in atoms
    assert "semester_type(1,regular)" in atoms


def test_blocking_external_requirement_gates_ready_to_graduate(
    tmp_path: Path,
) -> None:
    requirement = ExternalRequirement(
        id="social_work_days",
        unit="days",
        mode="cumulative",
        enforcement="blocking",
        milestones=(
            ExternalMilestone(deadline_type="graduation", year=None, minimum=1),
        ),
    )
    policy = tiny_policy(
        min_total_credits=3,
        external_requirements=(requirement,),
    )
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["total_credits"] = 3
    curriculum["courses"] = [
        {
            "id": "C1001",
            "name": "Intro A",
            "credits": 3,
            "prerequisites": [[]],
            "corequisites": [[]],
            "offered_terms": [1, 2, 3],
        }
    ]
    curriculum["groups"] = [
        {"id": "ALL", "type": "mandatory", "course_ids": ["C1001"]}
    ]
    history = (
        "taken(c1001, 1).\n"
        "map(g, c1001, a).\n"
        "attempt_count(c1001, 1).\n"
        "last_attempt(c1001, c1001).\n"
        "gpa_last(c1001, c1001).\n"
    )

    blocked, _, _ = _run(
        tmp_path / "blocked",
        student=history,
        horizon=1,
        min_load=0,
        max_load=9,
        studied_terms=1,
        policy=policy,
        curriculum=curriculum,
    )
    ready, _, _ = _run(
        tmp_path / "ready",
        student=history + "external_progress(social_work_days, 1, 1).\n",
        horizon=1,
        min_load=0,
        max_load=9,
        studied_terms=1,
        policy=policy,
        curriculum=curriculum,
    )

    blocked_atoms = {str(symbol) for symbol in blocked[0].symbols}
    ready_atoms = {str(symbol) for symbol in ready[0].symbols}
    assert "degree_complete" in blocked_atoms
    assert "graduation_blocked(social_work_days)" in blocked_atoms
    assert "ready_to_graduate" not in blocked_atoms
    assert "ready_to_graduate" in ready_atoms
    assert "graduation_blocked(social_work_days)" not in ready_atoms


def test_ignore_mode_returns_a_model_without_an_objective(
    tmp_path: Path,
) -> None:
    solutions, curriculum, policy = _run(
        tmp_path,
        plans=1,
        opt_mode="ignore",
    )
    assert solutions
    solution = solutions[0]
    assert solution.status == "SATISFIABLE"
    assert solution.optimal is False
    assert solution.objective == []

    plan = plans_from_solutions(solutions, curriculum, policy)[0]
    assert plan.optimal is False
    assert plan.objective == []


def test_ignore_mode_returns_k_plans(tmp_path: Path) -> None:
    solutions, _, _ = _run(tmp_path, plans=3, opt_mode="ignore")
    assert len(solutions) == 3
    assert all(solution.status == "SATISFIABLE" for solution in solutions)
    assert all(solution.optimal is False for solution in solutions)
    assert all(solution.objective == [] for solution in solutions)


def test_optimized_modes_return_k_plans(tmp_path: Path) -> None:
    for mode in ("optN", "opt"):
        solutions, _, _ = _run(
            tmp_path / mode,
            plans=3,
            opt_mode=mode,
        )
        assert len(solutions) == 3, mode
        assert solutions[0].optimal is True, mode
        assert solutions[0].objective, mode
        # The tiny instance has only one optimal schedule; the remaining
        # slots are filled with honestly-labelled unoptimized plans.
        assert any(solution.optimal is False for solution in solutions[1:]), mode


def test_solutions_report_runtime(tmp_path: Path) -> None:
    solutions, curriculum, policy = _run(tmp_path, plans=1)
    assert solutions[0].runtime > 0
    plan = plans_from_solutions(solutions, curriculum, policy)[0]
    assert plan.runtime > 0


def test_generous_time_limit_keeps_optimality_proof(tmp_path: Path) -> None:
    plans = _solve(tmp_path, time_limit=30)
    assert plans
    assert plans[0].optimal is True


def test_tiny_time_limit_does_not_hang(tmp_path: Path) -> None:
    solutions, _, _ = _run(
        tmp_path,
        plans=1,
        opt_mode="optN",
        time_limit=0.001,
    )
    assert solutions
    assert solutions[0].status in {"SATISFIABLE", "UNKNOWN"}


def test_progress_is_written_to_stderr(tmp_path: Path, capsys) -> None:
    solutions, _, _ = _run(tmp_path, time_limit=30, progress=True)
    assert solutions
    captured = capsys.readouterr()
    assert "[clingo] start" in captured.err
    assert "model" in captured.err
