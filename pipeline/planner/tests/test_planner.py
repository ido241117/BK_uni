"""Dap an duoi day duoc XEP TAY tu fixture toy.json, khong lay tu output cua solver.

Dap an tinh theo luat cua planner (toi da 12 TC/ky cua toy.json), nen chay bang CP-SAT.
Engine ASP dung quy dinh cua policy.lp (14-21 TC): test rieng o test_solve_asp.py.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.model.facts import FixtureError, get_scenario, validate_input  # noqa: E402
from planner.model.input import load_fixture  # noqa: E402
from planner.model.normalize import normalize  # noqa: E402
from evaluation.run_scenarios import DEFAULT_FIXTURE, run_all  # noqa: E402
from evaluation.validate import validate_plan  # noqa: E402


@pytest.fixture(scope="module")
def fixture():
    return load_fixture(DEFAULT_FIXTURE)


@pytest.fixture(scope="module")
def results(fixture):
    return {r["scenario_id"]: r for r in run_all(fixture, "cpsat")}


# Ly do (xep tay):
# base: con 20 TC, toi da 12 TC/ky -> it nhat 2 ky; xep duoc trong 2 ky.
# lock-electives: 262 da co EL303+EL304+CS301 (song hanh) = 9 TC, chi con cho cho
#   MA102 hoac CS302; mon con lai keo chuoi cua no sang 272.
# fail-cs201: CS201 hoc lai 262 -> CS301/CS302 som nhat 271 -> CS401 som nhat 272.
# cs302-not-offered: CS302 som nhat 271 -> CS401 som nhat 272.
@pytest.mark.parametrize(
    "scenario_id, graduation",
    [
        ("base", "271"),
        ("lock-electives", "272"),
        ("fail-cs201", "272"),
        ("cs302-not-offered", "272"),
    ],
)
def test_graduation_semester(results, scenario_id, graduation):
    result = results[scenario_id]
    assert result["status"] == "OPTIMAL"
    assert result["graduation_semester"] == graduation
    assert result["violations"] == []


def test_no_extra_credits(results):
    # Con thieu 14 TC bat buoc + 6 TC tu chon = 20; khong duoc hoc thua.
    assert sum(s["credits"] for s in results["base"]["semesters"]) == 20


def test_impossible_lock_is_unsat(results):
    assert results["lock-impossible"]["status"] == "UNSAT"


def test_failed_course_is_retaken(results):
    assert "CS201" in results["fail-cs201"]["semesters"][0]["courses"]


def test_missing_in_progress_assumption_is_rejected(fixture):
    scenario = {"id": "x", "in_progress_results": {"CS201": "pass"}}
    with pytest.raises(FixtureError):
        validate_input(normalize(fixture), scenario)


def test_overlapping_groups_are_rejected(fixture):
    broken = copy.deepcopy(fixture)
    broken["course_groups"][1]["members"].append("CS401")
    with pytest.raises(FixtureError):
        validate_input(normalize(broken), get_scenario(broken, "base"))


# --- Validator phai bat duoc lo trinh sai (viet tay) ----------------------

GOOD = [
    {"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
    {"semester_code": "271", "courses": ["CS401", "EL302", "EL304", "MA201"]},
]


def check(fixture, plan, scenario_id="base"):
    return validate_plan(fixture, get_scenario(fixture, scenario_id), plan)


def test_validator_accepts_hand_plan(fixture):
    assert check(fixture, GOOD) == []


@pytest.mark.parametrize(
    "plan, expected",
    [
        # MA201 cung ky voi tien quyet MA102
        ([{"semester_code": "262", "courses": ["CS301", "CS302", "MA102", "MA201"]},
          {"semester_code": "271", "courses": ["CS401", "EL302", "EL304"]}],
         "MA201: chua dat tien quyet MA102"),
        # EL303 khong mo ky 271
        ([{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
          {"semester_code": "271", "courses": ["CS401", "EL303", "EL304", "MA201"]}],
         "EL303: khong mo ky 271"),
        # 262 co 15 TC > 12
        ([{"semester_code": "262", "courses": ["CS301", "CS302", "MA102", "EL303", "EL304"]},
          {"semester_code": "271", "courses": ["CS401", "MA201"]}],
         "ky 262: 15 TC vuot toi da 12"),
        # thieu CS401
        ([{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
          {"semester_code": "271", "courses": ["EL302", "EL304", "MA201"]}],
         "thieu mon bat buoc CS401"),
        # chi 3 TC tu chon
        ([{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
          {"semester_code": "271", "courses": ["CS401", "EL304", "MA201"]}],
         "khoi 'Tu chon': 3/6 TC"),
    ],
)
def test_validator_catches(fixture, plan, expected):
    assert expected in check(fixture, plan)


def test_validator_uses_scenario_assumptions(fixture):
    # Lo trinh co so khong con hop le neu CS201 rot.
    errors = check(fixture, GOOD, "fail-cs201")
    assert "CS301: chua dat tien quyet CS201" in errors
    assert "thieu mon bat buoc CS201" in errors


# --- Doi chieu hai bo giai (engine ASP va CP-SAT) ---------------------
# Hai bo giai dung luat khac nhau (policy.lp vs rules cua web) nen muc tieu co the LECH;
# o day chi kiem tra so sanh chay duoc va CP-SAT van hop le theo validator.

def test_compare_runs_both_solvers_on_toy(fixture):
    from evaluation.compare import agree, run_pair

    for scenario in fixture["scenarios"]:
        rows = run_pair(fixture, scenario, None, 30.0)
        assert [r["solver"] for r in rows] == ["asp", "cp-sat"]
        assert agree(rows) in ("KHOP", "LECH"), scenario["id"]
        assert rows[1]["valid"], scenario["id"]


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_compare_runs_both_solvers_on_synthetic(seed):
    from evaluation.compare import agree, run_pair, synthetic

    data = synthetic(20, 8, seed)
    rows = run_pair(data, data["scenarios"][0], None, 30.0)
    assert agree(rows) in ("KHOP", "LECH", "khong ket luan (co bo giai het gio)")
    assert rows[1]["valid"]
