"""Keep the checked-in student samples consistent with the curriculum."""

from __future__ import annotations

import os
import re
from pathlib import Path

import clingo
import pytest

from data import load_bundle
from engine import SolverOptions, plans_from_solutions, solve
from cli import DEFAULT_CURRICULUM, DEFAULT_GRADING_POLICY, DEFAULT_GRADUATION

ASP_DIR = Path(__file__).resolve().parents[1]


def _atoms(text: str) -> list[clingo.Symbol]:
    """Ground a fact file and return the resulting symbols."""
    control = clingo.Control(["--warn=none"])
    control.add("base", [], text)
    control.ground([("base", [])])
    return [atom.symbol for atom in control.symbolic_atoms]


def _base_course(term: str) -> str:
    """Map ``rt(E,K)`` to ``E``; leave a plain course atom unchanged."""
    match = re.fullmatch(r"rt\(([^,]+),(\d+)\)", term)
    return match.group(1) if match else term


@pytest.mark.parametrize("filename", ["student.lp", "student_showcase.lp"])
def test_student_sample_only_uses_curriculum_courses(filename: str) -> None:
    curriculum = _atoms((ASP_DIR / "examples" / "cs-2023.lp").read_text(encoding="utf-8"))
    known: set[str] = set()
    for symbol in curriculum:
        args = symbol.arguments
        if symbol.name == "in" and len(args) == 2:
            known.add(str(args[0]))
        elif symbol.name == "map" and len(args) == 3 and str(args[0]) == "c":
            known.add(str(args[1]))
        elif symbol.name == "course_level" and len(args) == 2:
            known.add(str(args[0]))

    assert known, "cs-2023.lp did not define any courses"

    student = _atoms((ASP_DIR / "examples" / filename).read_text(encoding="utf-8"))
    used: set[str] = set()
    for symbol in student:
        args = symbol.arguments
        if (
            symbol.name in {"taken", "result", "attempt_count", "last_attempt"}
            and args
        ):
            used.add(_base_course(str(args[0])))
        elif (
            symbol.name == "map"
            and len(args) == 3
            and str(args[0]) in {"g", "c"}
        ):
            used.add(_base_course(str(args[1])))

    assert used, f"{filename} did not define any course attempts"
    # student.lp records the physical-education attempts (PE1003/PE1005) that
    # the academic curriculum does not model.  They have no in/2 membership
    # or map(c,...) credits, so translate.lp ignores them; keep them allowed
    # here instead of editing the sample.
    external_sample_courses = (
        {"pe1003", "pe1005"} if filename == "student.lp" else set()
    )
    assert used - external_sample_courses <= known, (
        f"{filename} references courses that are not in cs-2023.lp: "
        f"{sorted(used - known - external_sample_courses)}"
    )


def test_showcase_scenario_is_deterministic() -> None:
    text = (ASP_DIR / "examples" / "student_showcase.lp").read_text(encoding="utf-8")
    # The scenario rule closes the remaining elective slots to the two courses
    # used by the documented tight-budget plan.
    assert "E != co3057" in text
    assert "E != co3061" in text
    assert "student_major(ai)." in text
    assert "request(co3035)." in text
    assert "budget(20000)." in text


@pytest.mark.skipif(
    os.environ.get("ASP_SLOW_TESTS") != "1",
    reason="set ASP_SLOW_TESTS=1 to run the showcase optimality regression",
)
def test_showcase_tight_budget_is_optimal() -> None:
    bundle = load_bundle(
        DEFAULT_CURRICULUM,
        DEFAULT_GRADING_POLICY,
        DEFAULT_GRADUATION,
    )
    solutions = solve(
        ASP_DIR / "examples" / "cs-2023.lp",
        ASP_DIR / "policy.lp",
        ASP_DIR / "examples" / "student_showcase.lp",
        SolverOptions(
            horizon=12,
            studied_terms=8,
            plans=1,
            budget=14000,  # 14.000 million VND in money_scale(1000) units
            opt_mode="optN",
            time_limit=120.0,
            fill=False,
        ),
    )
    plans = plans_from_solutions(
        solutions, bundle.curriculum, bundle.policy
    )
    assert plans, "showcase did not produce a plan"
    plan = plans[0]
    assert plan.status == "SATISFIABLE"
    assert plan.optimal is True
    assert plan.objective == [10, 20, 13750, 10, 17, 0]
    assert plan.last_semester == 10
    assert plan.total_planned == 17
    assert plan.total_credit == 128
    assert plan.total_cost == 13750
    assert plan.gpa == 338
    assert plan.gpa_best_case == 357
    assert plan.gpa_required_avg is not None
    assert plan.gpa_required_avg <= 0
    assert plan.gpa_already_satisfied is True
    assert plan.gpa_requirement_impossible is False
    assert plan.degree_complete is True
    assert plan.ready_to_graduate is True
    assert "AI" in plan.major_earned
    assert sum(item["credits"] for item in plan.history) == 118
    assert set(plan.assumed_pass) == {"CO3005", "LA1009"}
    assert set(plan.must) <= {"CO3035", "MT2013"}
    assert {
        course.code for semester in plan.semesters for course in semester.courses
    } == {"CO3035", "CO3057", "CO3061", "CO4337", "MT2013"}
