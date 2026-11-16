"""Tests for rendering and the CLI fact-generation path."""

from __future__ import annotations

import json
from pathlib import Path

from cli import main, render_solutions
from engine import SolverOptions, solve
from support import TINY_CURRICULUM, tiny_policy, write_programs

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_cli_writes_curriculum_and_policy_facts(tmp_path: Path) -> None:
    curriculum_output = tmp_path / "cs-2023.lp"
    policy_output = tmp_path / "policy.lp"
    code = main(
        [
            "--curriculum",
            str(DATA_DIR / "curriculum.json"),
            "--grading-policy",
            str(DATA_DIR / "grading_policy.json"),
            "--graduation",
            str(DATA_DIR / "graduation_requirements.json"),
            "--output",
            str(curriculum_output),
            "--policy-output",
            str(policy_output),
        ]
    )
    assert code == 0
    curriculum = curriculum_output.read_text(encoding="utf-8")
    policy = policy_output.read_text(encoding="utf-8")
    assert "in((co1005; co2001), a3)." in curriculum
    assert "\nfreq((" not in curriculum  # all example courses run in main semesters
    assert "#const maxtries = 3." in policy
    assert "#const min_load_summer = 0." in policy
    assert "grade_points(a, 400)." in policy
    assert "min_gpa(gpa_4, 250)." in policy
    assert "map(l, total_degree, 128)." in policy
    assert "fee_rule(regular, flat, 13, 18, 13750)." in policy


def test_render_labels_the_full_objective(tmp_path: Path) -> None:
    policy = tiny_policy()
    curriculum_path, policy_path = write_programs(tmp_path, policy)
    student_path = tmp_path / "student.lp"
    student_path.write_text("", encoding="utf-8")
    solutions = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(horizon=5, plans=1, min_load=6, max_load=9),
    )

    text = render_solutions(solutions, TINY_CURRICULUM, policy, "text")
    assert "last_semester=3" in text
    assert "retakes=0" in text
    assert "level_order=7" in text
    assert "balance=8" in text
    assert "taste=0" in text
    assert "proven optimal" in text

    payload = json.loads(
        render_solutions(solutions, TINY_CURRICULUM, policy, "json")
    )
    assert payload[0]["objective"] == {
        "last_semester": 3,
        "retakes": 0,
        "cost": 0,
        "level_order": 7,
        "balance": 8,
        "taste": 0,
    }
    assert payload[0]["optimal"] is True
