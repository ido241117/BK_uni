"""Buoc chuan hoa du lieu (normalize.py) va canh bao song hanh cung ky."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.model.facts import get_scenario, load_fixture  # noqa: E402
from planner.model.normalize import normalize  # noqa: E402
from evaluation.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solvers.cpsat import solve_cpsat  # noqa: E402


def toy_with_free_elective(completed: list[str], outside: list[tuple[str, int]] = ()):
    fx = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    fx["course_groups"].append({"name": "Tu do", "kind": "elective", "required_count": None,
                                "required_credits": 6, "pool_scope": "any",
                                "pool_course_credits": 3, "members": []})
    for code, cr in outside:
        fx["courses"].append({"code": code, "name": code, "credits": cr})
    for code in completed + [c for c, _ in outside]:
        fx["student"]["student_courses"].append({"course_code": code, "status": "completed"})
    return fx


def slots(fx):
    return next(g["members"] for g in normalize(fx)["course_groups"] if g.get("_free_slots"))


def test_free_elective_needs_two_slots_when_nothing_counts():
    assert slots(toy_with_free_elective([])) == ["FREE_3_1", "FREE_3_2"]


def test_excess_elective_counts_before_outside_courses():
    # Nhom "Tu chon" can 6 TC; da dat EL301, EL302, EL303 = 9 TC -> du 3 TC sang tu chon tu do.
    fx = toy_with_free_elective(["EL301", "EL302", "EL303"], outside=[("XX101", 3)])
    norm = normalize(fx)
    assert slots(fx) == []                       # 3 TC du + 3 TC ngoai chuong trinh = 6
    assert norm["_free_outside_credits"] == 3


def test_outside_courses_fill_rest():
    fx = toy_with_free_elective([], outside=[("XX101", 3)])
    assert len(slots(fx)) == 1


def test_total_credits_includes_free_elective():
    assert normalize(toy_with_free_elective([]))["_total_credits"] == 30 + 6 + 6


def test_corequisite_in_same_semester_is_warned():
    # fail-cs202: CS202 hoc lai cung ky 262 voi CS301 (song hanh) -> phai canh bao.
    fx = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    for sc in fx["student"]["student_courses"]:
        if sc["course_code"] == "CS202":
            sc["status"] = "failed"
    scenario = copy.deepcopy(get_scenario(fx, "base"))
    scenario["in_progress_results"] = {"CS201": "pass"}
    r = solve_cpsat(fx, scenario)
    assert any(w.startswith("CS301 học cùng kỳ 262 với môn song hành CS202") for w in r["warnings"])


# --- T46 (22/11): mon dang hoc gia dinh dau, khoi sinh vien tu chon --------------------------

def test_in_progress_outside_course_assumed_pass_fills_free_slot():
    fx = toy_with_free_elective([])
    fx["courses"].append({"code": "XX101", "name": "XX101", "credits": 3})
    fx["student"]["student_courses"].append({"course_code": "XX101", "status": "in-progress"})
    assert len(slots(fx)) == 2                   # khong biet ket qua -> chua tru
    fx["student"]["_assumed_pass"] = ["XX101"]
    assert len(slots(fx)) == 1


def test_cli_marks_in_progress_pass_for_normalize():
    from planner.cli import run
    fx = toy_with_free_elective([])
    fx["courses"].append({"code": "XX101", "name": "XX101", "credits": 3})
    fx["student"]["student_courses"].append({"course_code": "XX101", "status": "in-progress"})
    scenario = copy.deepcopy(get_scenario(fx, "base"))
    scenario["in_progress_results"] = {"CS201": "pass", "CS202": "pass", "XX101": "pass"}
    payload = {k: v for k, v in fx.items() if k != "scenarios"}
    payload["scenario"] = scenario
    out = run(payload, "cpsat", 20)
    planned = [c["code"] for s in out["semesters"] for c in s["courses"]]
    assert sum(code.startswith("FREE_") for code in planned) == 1


def test_block_override_moves_outside_course_into_listed_group():
    fx = toy_with_free_elective([], outside=[("XX101", 3)])
    fx["student"]["block_overrides"] = {"XX101": "Tu chon"}
    norm = normalize(fx)
    elective = next(g for g in norm["course_groups"] if g["name"] == "Tu chon")
    assert "XX101" in elective["members"]
    assert "XX101" in {cc["course_code"] for cc in norm["curriculum_courses"]}
    assert len(slots(fx)) == 2                   # khong con tinh vao tu chon tu do


def test_block_override_moves_curriculum_course_to_free_elective():
    fx = toy_with_free_elective(["EL301"])
    fx["student"]["block_overrides"] = {"EL301": "Tu do"}
    norm = normalize(fx)
    elective = next(g for g in norm["course_groups"] if g["name"] == "Tu chon")
    assert "EL301" not in elective["members"]
    assert len(slots(fx)) == 1                   # EL301 (3 TC) tinh vao tu chon tu do


def test_block_override_unknown_group_is_ignored():
    fx = toy_with_free_elective([], outside=[("XX101", 3)])
    fx["student"]["block_overrides"] = {"XX101": "Khong co"}
    assert len(slots(fx)) == 1


def test_block_override_into_required_group_makes_course_required():
    fx = toy_with_free_elective([])
    fx["student"]["block_overrides"] = {"EL301": "Bat buoc"}
    norm = normalize(fx)
    required = next(g for g in norm["course_groups"] if g["name"] == "Bat buoc")
    elective = next(g for g in norm["course_groups"] if g["name"] == "Tu chon")
    assert "EL301" in required["members"] and "EL301" not in elective["members"]


# --- 22/11: validator va lich su mo lop he --------------------------------------------------

def _summer_plan_errors(fx, course):
    from evaluation.validate import validate_plan
    fx["summer_history"] = []
    if "263" not in fx["semesters"]:
        fx["semesters"] = sorted([*fx["semesters"], "263"])
    scenario = copy.deepcopy(get_scenario(fx, "base"))
    scenario["summer_opt_in"] = ["263"]
    plan = [{"semester_code": "263", "courses": [course]}]
    return [e for e in validate_plan(fx, scenario, plan) if "chua tung mo ky he" in e]


def test_validator_allows_free_slot_in_summer():
    fx = toy_with_free_elective([])
    assert _summer_plan_errors(fx, "FREE_3_1") == []


def test_validator_summer_history_is_soft_when_offering_soft():
    fx = toy_with_free_elective([])
    assert _summer_plan_errors(copy.deepcopy(fx), "EL304") != []      # luat cu: cung
    fx["rules"] = {**(fx.get("rules") or {}), "offering_soft": True}
    assert _summer_plan_errors(fx, "EL304") == []


def test_cli_returns_warning_items_with_course_and_semester():
    from planner.cli import run
    fx = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    for sc in fx["student"]["student_courses"]:
        if sc["course_code"] == "CS202":
            sc["status"] = "failed"
    scenario = copy.deepcopy(get_scenario(fx, "base"))
    scenario["in_progress_results"] = {"CS201": "pass"}
    payload = {k: v for k, v in fx.items() if k != "scenarios"}
    payload["scenario"] = scenario
    out = run(payload, "cpsat", 20)
    assert [i["text"] for i in out["warning_items"]] == [w for w in out["warnings"] if any(
        w == i["text"] for i in out["warning_items"])]
    co = [i for i in out["warning_items"] if i["kind"] == "corequisite"]
    assert co and co[0]["course"] == "CS301" and co[0]["semester"] == "262" and "CS202" in co[0]["message"]
