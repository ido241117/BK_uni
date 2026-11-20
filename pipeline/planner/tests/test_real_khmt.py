"""Bo giai tren chuong trinh that KHMT 2023 (fixtures/khmt2023.json, lay qua API doc
cong khai ngay 18/11/2026). Sinh vien trong fixture la BIA.

Chi chay CP-SAT o day: Clingo khong chung minh xong toi uu trong 30 giay o co nay
(xem docs/luu-tru/2026-11-15-planner-3-so-sanh.md). Doi chieu cheo hai bo giai van chay
tren toy.json va du lieu sinh ngau nhien trong test_planner.py.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.facts import FixtureError, get_scenario, is_summer, load_fixture  # noqa: E402
from planner.normalize import normalize  # noqa: E402
from planner.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solve import plan_map, solve  # noqa: E402
from planner.solve_cpsat import solve_cpsat  # noqa: E402
from planner.validate import validate_plan  # noqa: E402

KHMT = Path(__file__).resolve().parents[1] / "fixtures" / "khmt2023.json"


@pytest.fixture()
def khmt():
    return copy.deepcopy(load_fixture(KHMT))


def solve_ok(fixture, scenario=None):
    scenario = scenario or get_scenario(fixture, "base")
    r = solve_cpsat(fixture, scenario)
    assert r["status"] == "OPTIMAL"
    assert validate_plan(fixture, scenario, r["semesters"]) == []
    return r


def test_normalize_total_is_128_like_pdf(khmt):
    fx = normalize(khmt)
    assert fx["_total_credits"] == 128
    assert not any(c["course_code"] in ("ENG_GC", "SA4001") for c in fx["curriculum_courses"])
    free = [g for g in fx["course_groups"] if g.get("_free_slots")]
    assert len(free) == 1 and len(free[0]["members"]) == 3  # 9 TC / 3 TC moi o


def test_real_plan_is_valid_and_respects_summer(khmt):
    r = solve_ok(khmt)
    allowed = set(khmt["rules"]["summer_courses"])
    for s in r["semesters"]:
        if is_summer(s["semester_code"]):
            assert set(s["courses"]) <= allowed


def test_specialization_restricts_group_c(khmt):
    khmt["student"]["target_specialization"] = "CNPM"
    child = next(g for g in khmt["course_groups"] if g.get("specialization") == "CNPM")
    parent = next(g for g in khmt["course_groups"] if g["name"] == child["parent"])
    r = solve_ok(khmt)
    chosen = set(plan_map(r)) & set(parent["members"])
    passed = {sc["course_code"] for sc in khmt["student"]["student_courses"] if sc["status"] == "completed"}
    assert chosen | (passed & set(parent["members"])) <= set(child["members"]) | passed


def test_unknown_specialization_is_rejected(khmt):
    khmt["student"]["target_specialization"] = "KHONG_CO"
    with pytest.raises(FixtureError):
        solve_cpsat(khmt, get_scenario(khmt, "base"))


def test_validator_rejects_regular_course_in_summer(khmt):
    r = solve_ok(khmt)
    plan = copy.deepcopy(r["semesters"])
    regular = next(c for s in plan if not is_summer(s["semester_code"]) for c in s["courses"]
                   if not c.startswith("FREE_"))
    for s in plan:
        if regular in s["courses"]:
            s["courses"].remove(regular)
    plan.insert(0, {"semester_code": "253", "courses": [regular]})
    errors = validate_plan(khmt, get_scenario(khmt, "base"), plan)
    assert any("ky he 253" in e for e in errors)


# --- K6: nguong tin chi mon tot nghiep (QD 285 Dieu 15.5), tren toy.json ------
# Tong TC chuong trinh toy = 30 bat buoc + 6 tu chon = 36. Gan CS401 la khoa luan
# (85%): can ceil(30.6) = 31 TC truoc ky hoc. Truoc 262 co 16 TC; ky 262 toi da 12
# -> truoc 271 toi da 28 < 31, nen CS401 som nhat 272. Dap an: xong 272, 20 TC.

@pytest.mark.parametrize("name", ["cpsat", "clingo"])
def test_k6_thesis_threshold(name):
    toy = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    toy["graduation_courses"] = {"thesis": "CS401"}
    toy["rules"] = {"graduation_thresholds": {"thesis": 0.85}}
    scenario = get_scenario(toy, "base")
    r = (solve_cpsat if name == "cpsat" else solve)(toy, scenario)
    assert validate_plan(toy, scenario, r["semesters"]) == []
    assert r["graduation_semester"] == "272"
    assert sum(s["credits"] for s in r["semesters"]) == 20
    assert plan_map(r)["CS401"] == "272"


def test_k6_validator_rejects_thesis_too_early():
    toy = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    toy["graduation_courses"] = {"thesis": "CS401"}
    toy["rules"] = {"graduation_thresholds": {"thesis": 0.85}}
    plan = [  # lo trinh base: CS401 o 271 khi moi co 25 TC
        {"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
        {"semester_code": "271", "courses": ["CS401", "EL302", "EL304", "MA201"]},
    ]
    errors = validate_plan(toy, get_scenario(toy, "base"), plan)
    assert "CS401: can 31 TC tich luy truoc ky hoc, moi co 25" in errors
