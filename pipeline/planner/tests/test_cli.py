"""Lenh planner.cli: JSON stdin -> JSON stdout theo muc 4.3 cua ke hoach."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2]
TOY = PIPELINE / "planner" / "fixtures" / "toy.json"


def call(payload: str | dict, solver: str = "cpsat") -> dict:
    data = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    proc = subprocess.run(
        [sys.executable, "-m", "planner.cli", "--solver", solver],
        cwd=PIPELINE, input=data.encode("utf-8"), capture_output=True,
    )
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    return json.loads(proc.stdout.decode("utf-8"))


def request(**scenario) -> dict:
    fixture = json.loads(TOY.read_text(encoding="utf-8"))
    fixture.pop("scenarios")
    scenario.setdefault("in_progress_results", {"CS201": "pass", "CS202": "pass"})
    return {**fixture, "scenario": scenario}


@pytest.mark.parametrize("solver", ["cpsat", "clingo"])
def test_cli_base_matches_contract(solver):
    out = call(request(), solver)
    assert out["status"] == "OPTIMAL"
    assert out["graduation_semester"] == "271"
    assert out["violations"] == []
    first = out["semesters"][0]
    assert set(first) == {"semester_code", "credits", "courses"}
    assert set(first["courses"][0]) == {"code", "credits", "reason", "locked"}
    for key in ("solve_ms", "preferences_report", "assumptions", "warnings",
                "unverified_prerequisites", "diff_vs_previous", "infeasible_reason"):
        assert key in out
    reasons = {c["code"]: c["reason"] for s in out["semesters"] for c in s["courses"]}
    assert reasons["MA102"] == "retake"
    assert reasons["CS401"] == "required"


def test_cli_unknown_course_is_input_error():
    out = call(request(locked=[{"course_code": "XX999", "semester_code": "262"}]))
    assert out["status"] == "INPUT_ERROR"
    assert "XX999" in out["error"]


def test_cli_bad_json_is_input_error():
    out = call("{ khong phai json")
    assert out["status"] == "INPUT_ERROR"


def test_cli_missing_field_is_input_error():
    out = call({"scenario": {}})
    assert out["status"] == "INPUT_ERROR"


def test_cli_unsat_names_the_lock():
    out = call(request(locked=[{"course_code": "EL301", "semester_code": "262"}]))
    assert out["status"] == "UNSAT"
    assert "EL301" in out["infeasible_reason"]


def test_cli_diff_vs_previous():
    req = request(not_offered=[{"course_code": "CS302", "semester_code": "262"}])
    req["previous_plan"] = {"CS301": "262", "CS302": "262", "MA102": "262",
                            "CS401": "271", "EL302": "271", "EL304": "271", "MA201": "271"}
    out = call(req)
    assert "~ CS302 doi 262 -> 271" in out["diff_vs_previous"]


def test_cli_unsat_names_the_blocking_school_rule():
    # Cap do mon, khoa 2025, chi con ky 262 va 271: CS3xx som nhat 271 (nam 3) nen CS401 khong kip.
    req = request()
    req["rules"] = {"credits_min": 11, "credits_max": 25, "course_level": True}
    req["semesters"] = ["251", "252", "261", "262", "271"]
    out = call(req)
    assert out["status"] == "UNSAT"
    assert "cấp độ môn" in out["infeasible_reason"]
