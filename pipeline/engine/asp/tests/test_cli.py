"""Tests for rendering and the CLI fact-generation path."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cli import (
    _diagnostic_rows,
    _format_plan_text,
    _hard_timeout_grace,
    _supervise_solve,
    build_parser,
    infer_studied_terms,
    main,
    render_solutions,
)
from engine import Plan, PlannedSemester, Solution, SolverOptions, solve
from support import TINY_CURRICULUM, tiny_policy, write_programs

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
ASP_DIR = Path(__file__).resolve().parents[1]


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
    assert "offered_slot((ch1003; co1005; co1007; co1023; co1027; co2001; co2003; co2007), 1)." in curriculum
    assert "freq(" not in curriculum
    assert "major(ai)." in curriculum
    assert "major_min(ipcv, 5)." in curriculum
    assert "milestone(co4337, 109)." in curriculum
    assert "maxtries" not in policy
    assert "retake_eligibility(" not in policy
    assert "retake_grade_cap(b)." in policy
    assert "gpa_attempt_selection(latest)." in policy
    assert "grade_rank(a_plus, 0)." in policy
    assert "#const min_load_summer = 0." in policy
    assert "#const max_load_summer = 12." in policy
    assert "term_parts(3)." in policy
    assert "term_part_type(1, regular)." in policy
    assert "term_part_type(3, summer)." in policy
    assert "extra_semester_type(summer)." in policy
    assert "load_bound(regular, min_load, max_load)." in policy
    assert "load_bound(summer, min_load_summer, max_load_summer)." in policy
    assert "#const shift" not in policy
    assert "grade_points(a, 400)." in policy
    assert "grade_points(score_10, a, 900)." in policy
    assert "min_gpa(gpa_4, 250)." in policy
    assert "map(l, total_degree, 128)." in policy
    assert "money_scale(1000)." in policy
    assert "fee_rule(regular, 0, 6, 7563, 0, 0)." in policy
    assert "fee_rule(regular, 7, 9, 9625, 0, 0)." in policy
    assert "fee_rule(regular, 10, 12, 11688, 0, 0)." in policy
    assert "fee_rule(regular, 13, 18, 13750, 0, 0)." in policy
    assert "fee_rule(regular, 19, 999, 13750, 805, 18)." in policy
    assert "fee_rule(summer, 0, 999, 0, 1230, 0)." in policy


def test_checked_in_generated_files_match_cli_output(tmp_path: Path) -> None:
    """The checked-in .lp files must come from this CLI, not a stand-in."""
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
            "--tuition-policy",
            str(DATA_DIR / "tuition_policy.json"),
            "--output",
            str(curriculum_output),
            "--policy-output",
            str(policy_output),
        ]
    )
    assert code == 0
    assert curriculum_output.read_text(encoding="utf-8") == (
        ASP_DIR / "cs-2023.lp"
    ).read_text(encoding="utf-8")
    assert policy_output.read_text(encoding="utf-8") == (
        ASP_DIR / "policy.lp"
    ).read_text(encoding="utf-8")


def test_render_labels_the_full_objective(tmp_path: Path) -> None:
    policy = tiny_policy()
    curriculum_path, policy_path = write_programs(tmp_path, policy)
    student_path = tmp_path / "student.lp"
    student_path.write_text("", encoding="utf-8")
    solutions = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(
            horizon=5, plans=1, min_load=6, max_load=9, allow_summer=True
        ),
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
        "typical_term": 0,
        "level_order": 7,
        "balance": 8,
        "taste": 0,
        "popularity": 0,
    }
    assert payload[0]["optimal"] is True
    assert payload[0]["optimization"] == "proven_optimal"
    assert payload[0]["runtime_seconds"] >= 0


def test_cli_exposes_solver_controls() -> None:
    args = build_parser().parse_args(
        [
            "--solve",
            "student.lp",
            "--opt-mode",
            "ignore",
            "--time-limit",
            "5",
            "--progress",
        ]
    )
    assert args.opt_mode == "ignore"
    assert args.time_limit == 5.0
    assert args.progress is True


def test_ignore_mode_renders_objective_as_unavailable(tmp_path: Path) -> None:
    policy = tiny_policy()
    curriculum_path, policy_path = write_programs(tmp_path, policy)
    student_path = tmp_path / "student.lp"
    student_path.write_text("", encoding="utf-8")
    solutions = solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(
            horizon=5,
            plans=1,
            min_load=6,
            max_load=9,
            opt_mode="ignore",
        ),
    )

    text = render_solutions(solutions, TINY_CURRICULUM, policy, "text")
    assert "objective: n/a (unoptimized)" in text
    assert "Solve time" in text
    assert "proven optimal" not in text

    raw = render_solutions(solutions, TINY_CURRICULUM, policy, "raw")
    assert "% objective: n/a (unoptimized)" in raw
    assert "% solve time:" in raw

    payload = json.loads(
        render_solutions(solutions, TINY_CURRICULUM, policy, "json")
    )
    assert payload[0]["optimization"] == "unoptimized"
    assert payload[0]["objective"] == {}
    assert payload[0]["runtime_seconds"] >= 0


def test_negative_gpa_requirement_is_reported_as_already_met() -> None:
    plan = Plan(
        history=[],
        semesters=[],
        total_planned=0,
        total_credit=128,
        total_degree=128,
        degree_complete=True,
        gpa=338,
        must=[],
        gpa_required_avg=-230,
    )
    rows = dict(_diagnostic_rows(plan, None, "", ""))
    assert rows["GPA needed"] == "already met (no extra GPA needed)"
    assert "-2.30" not in rows["GPA needed"]


def test_text_labels_distinguish_scheduled_attempted_and_earned() -> None:
    plan = Plan(
        history=[{"semester": 1, "credits": 20}],
        semesters=[
            PlannedSemester(
                semester=10,
                credits=17,
                cumulative=137,
                semester_type="regular",
            )
        ],
        total_planned=17,
        total_credit=128,
        total_degree=128,
        degree_complete=True,
        gpa=338,
        must=[],
        gpa_required_avg=-230,
    )
    text = _format_plan_text(plan, 1, 1)
    assert "scheduled total 137" in text
    assert "cumulative" not in text
    assert "Planned credits : 17 (attempted)" in text
    assert "Total credits   : 128 / 128 (earned)" in text
    assert "GPA needed      : already met (no extra GPA needed)" in text


def test_hard_timeout_only_wraps_real_cli_runs(monkeypatch) -> None:
    assert _hard_timeout_grace(1.0) == 5.0
    assert _hard_timeout_grace(30.0) == 5.0
    assert _hard_timeout_grace(120.0) == 12.0
    assert _hard_timeout_grace(300.0) == 30.0
    # Tests and callers with an explicit argv stay in-process.
    assert _supervise_solve(["..."], 5.0, True) is None
    assert _supervise_solve(None, None, True) is None
    monkeypatch.setenv("ASP_HARD_TIMEOUT_CHILD", "1")
    assert _supervise_solve(None, 5.0, True) is None


def test_infer_studied_terms_uses_last_recorded_attempt() -> None:
    text = (
        "% taken(nope, 99).\n"
        "taken(co1005, 1).\n"
        "taken(rt(co1027, 2), 4).\n"
        "taken(co2001,3).  % trailing comment\n"
    )
    assert infer_studied_terms(text) == 4


def test_infer_studied_terms_without_attempts() -> None:
    assert infer_studied_terms("% no history yet\nbudget(20000).\n") is None


def _student_with_attempts(tmp_path: Path) -> Path:
    path = tmp_path / "student.lp"
    path.write_text(
        "taken(co1005, 1).\nmap(g, co1005, a).\n"
        "taken(co1027, 4).\nmap(g, co1027, b).\n",
        encoding="utf-8",
    )
    return path


def test_cli_infers_studied_terms_from_student_file(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    student = _student_with_attempts(tmp_path)
    captured: dict[str, int | None] = {}

    def fake_solve(curriculum_path, policy_path, student_path, options):
        captured["t"] = options.studied_terms
        captured["horizon"] = options.horizon
        return [Solution(status="SATISFIABLE", runtime=0.01)]

    monkeypatch.setattr("cli.solve", fake_solve)
    monkeypatch.setattr("cli.render_solutions", lambda *args, **kwargs: "plan")

    code = main(
        ["--solve", str(student), "--future-terms", "3", "--no-report"]
    )

    assert code == 0
    assert captured["t"] == 4
    assert captured["horizon"] == 7
    assert "t=4" in capsys.readouterr().err


def test_cli_accepts_t_after_the_last_recorded_attempt(
    tmp_path: Path, monkeypatch
) -> None:
    student = _student_with_attempts(tmp_path)
    captured: dict[str, int | None] = {}

    def fake_solve(curriculum_path, policy_path, student_path, options):
        captured["t"] = options.studied_terms
        return [Solution(status="SATISFIABLE", runtime=0.01)]

    monkeypatch.setattr("cli.solve", fake_solve)
    monkeypatch.setattr("cli.render_solutions", lambda *args, **kwargs: "plan")

    # A student between terms may have studied more terms than the last
    # recorded attempt.
    code = main(
        ["--solve", str(student), "--t", "6", "--future-terms", "3", "--no-report"]
    )

    assert code == 0
    assert captured["t"] == 6


def test_cli_rejects_t_before_the_last_recorded_attempt(
    tmp_path: Path, capsys
) -> None:
    student = _student_with_attempts(tmp_path)

    with pytest.raises(SystemExit) as excinfo:
        main(
            [
                "--solve",
                str(student),
                "--t",
                "2",
                "--semesters",
                "9",
                "--no-report",
            ]
        )

    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "--t 2" in err
    assert "term 4" in err
    assert "omit --t" in err


def test_cli_summer_terms_are_opt_in(
    tmp_path: Path, monkeypatch
) -> None:
    student = _student_with_attempts(tmp_path)
    seen: dict[str, bool] = {}

    def fake_solve(curriculum_path, policy_path, student_path, options):
        seen["allow_summer"] = options.allow_summer
        return [Solution(status="SATISFIABLE", runtime=0.01)]

    monkeypatch.setattr("cli.solve", fake_solve)
    monkeypatch.setattr("cli.render_solutions", lambda *args, **kwargs: "plan")

    code = main(
        ["--solve", str(student), "--future-terms", "3", "--no-report"]
    )
    assert code == 0
    assert seen["allow_summer"] is False

    code = main(
        [
            "--solve",
            str(student),
            "--future-terms",
            "3",
            "--summer",
            "--no-report",
        ]
    )
    assert code == 0
    assert seen["allow_summer"] is True


def test_cli_max_terms_caps_the_horizon(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    student = _student_with_attempts(tmp_path)
    seen: dict[str, int | None] = {}

    def fake_solve(curriculum_path, policy_path, student_path, options):
        seen["horizon"] = options.horizon
        return [Solution(status="SATISFIABLE", runtime=0.01)]

    monkeypatch.setattr("cli.solve", fake_solve)
    monkeypatch.setattr("cli.render_solutions", lambda *args, **kwargs: "plan")

    code = main(
        [
            "--solve",
            str(student),
            "--future-terms",
            "10",
            "--max-terms",
            "8",
            "--no-report",
        ]
    )

    assert code == 0
    assert seen["horizon"] == 8
    assert "horizon capped at 8" in capsys.readouterr().err


def test_cli_rejects_max_terms_before_the_last_studied_term(
    tmp_path: Path, capsys
) -> None:
    student = _student_with_attempts(tmp_path)

    with pytest.raises(SystemExit) as excinfo:
        main(
            [
                "--solve",
                str(student),
                "--max-terms",
                "3",
                "--no-report",
            ]
        )

    assert excinfo.value.code == 2
    assert "last studied term" in capsys.readouterr().err


def test_cli_rejects_conflicting_summer_flags(
    tmp_path: Path, capsys
) -> None:
    student = _student_with_attempts(tmp_path)

    with pytest.raises(SystemExit) as excinfo:
        main(
            [
                "--solve",
                str(student),
                "--summer",
                "--no-summer",
                "--no-report",
            ]
        )

    assert excinfo.value.code == 2
    assert "mutually exclusive" in capsys.readouterr().err
