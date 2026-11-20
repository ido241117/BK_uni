"""Buoc chuan hoa du lieu (normalize.py) va canh bao song hanh cung ky."""

from __future__ import annotations

import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.facts import get_scenario, load_fixture  # noqa: E402
from planner.normalize import normalize  # noqa: E402
from planner.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solve_cpsat import solve_cpsat  # noqa: E402


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
