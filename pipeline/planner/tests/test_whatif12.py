"""Giai doan 12 (23/11): what-if theo dac ta muc 12 cua docs/02-ke-hoach.md.

Chay tren ``fixtures/toy.json`` (cac ky con lai 262, 271, 272; CS401 can CS301 va CS302 truoc;
EL303 song hanh CS301). Chi CP-SAT.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.cli import run  # noqa: E402
from planner.facts import FixtureError, get_scenario, load_fixture, preference_order  # noqa: E402
from planner.report import warning_items  # noqa: E402
from planner.result import plan_map  # noqa: E402
from planner.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solve_cpsat import solve_cpsat  # noqa: E402

OK = ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")


@pytest.fixture()
def toy():
    fx = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    fx["rules"] = {**(fx.get("rules") or {}), "pins_absolute": True}
    return fx


def scen(fx, **extra):
    s = copy.deepcopy(get_scenario(fx, "base"))
    s.update(extra)
    return s


def at(code, sem):
    return {"course_code": code, "semester_code": sem}


def kinds(items):
    return [i["kind"] for i in items]


# --- T51: S2, S8 sinh vien xep duoc ------------------------------------------

def test_s2_s8_are_on_by_default_and_can_be_disabled(toy):
    toy["rules"]["preferred_load"] = [15, 18]
    on = preference_order(toy, scen(toy, preferences={"order": ["S1"]}))
    assert "S2" in on and "S8" in on
    off = preference_order(toy, scen(toy, preferences={"order": ["S1"], "disabled": ["S2", "S8"]}))
    assert "S2" not in off and "S8" not in off


def test_user_can_put_s8_before_s1(toy):
    toy["rules"]["preferred_load"] = [15, 18]
    order = preference_order(toy, scen(toy, preferences={"order": ["S8", "S1", "S2"]}))
    assert order.index("S8") < order.index("S1") < order.index("S2")
    r = solve_cpsat(toy, scen(toy, preferences={"order": ["S8", "S1", "S2"]}))
    assert r["status"] in OK


def test_unknown_priority_is_rejected(toy):
    with pytest.raises(FixtureError):
        solve_cpsat(toy, scen(toy, preferences={"order": ["S1"], "disabled": ["S99"]}))


# --- T54: gia dinh rot mon trong lo trinh tuong lai (W1) ---------------------

def test_assumed_fail_counts_credits_and_retakes_later(toy):
    base = plan_map(solve_cpsat(toy, scen(toy)))
    assert base["CS301"] == "262"
    r = solve_cpsat(toy, scen(toy, assumed_fail=[at("CS301", "262")]))
    assert r["status"] in OK
    plan = plan_map(r)
    assert plan["CS301"] in ("271", "272")  # hoc lai sau ky rot
    assert plan["CS401"] > plan["CS301"]  # mon can CS301 lui theo
    s262 = next(s for s in r["semesters"] if s["semester_code"] == "262")
    assert s262["failed_attempts"] == ["CS301"]
    assert s262["credits"] >= 3  # lan hoc rot van tinh TC cua ky
    row = next(x for x in r["requests"] if x["kind"] == "assumed_fail")
    assert row["status"] == "met" and plan["CS301"] in row["detail"]


def test_assumed_fail_on_pinned_semester_ignores_that_pin(toy):
    r = solve_cpsat(toy, scen(toy, locked=[at("CS301", "262")], assumed_fail=[at("CS301", "262")]))
    assert r["status"] in OK
    assert plan_map(r)["CS301"] != "262"


def test_assumed_fail_on_passed_course_is_rejected(toy):
    with pytest.raises(FixtureError):
        solve_cpsat(toy, scen(toy, assumed_fail=[at("MA101", "262")]))


def test_cli_shows_failed_attempt_on_the_board(toy):
    out = run({**toy, "scenario": scen(toy, assumed_fail=[at("CS301", "262")])}, "cpsat", 10)
    s262 = next(s for s in out["semesters"] if s["semester_code"] == "262")
    failed = [c for c in s262["courses"] if c.get("assumed_fail")]
    assert [c["code"] for c in failed] == ["CS301"]


# --- T55: "ky nay co mo" (W2) va canh bao lich su mo lop --------------------

def test_offering_history_warning_and_offered_removes_it(toy):
    toy["rules"]["offering_soft"] = True
    toy["offering_history"] = {"CS302": ["1"]}
    pinned = scen(toy, locked=[at("CS302", "262")])
    r = solve_cpsat(toy, pinned)
    plan = plan_map(r)
    items = warning_items(toy, pinned, plan)
    hist = [i for i in items if i["kind"] == "offering_history"]
    assert hist and hist[0]["course"] == "CS302" and hist[0]["confirm"] == "offered" and hist[0]["rule"]
    told = scen(toy, locked=[at("CS302", "262")], offered=[at("CS302", "262")])
    assert not [i for i in warning_items(toy, told, plan) if i["kind"] == "offering_history"]


def test_offered_lifts_the_soft_penalty(toy):
    toy["rules"]["offering_soft"] = True
    toy["offering_history"] = {"CS302": ["1"]}
    prefs = {"order": ["OH", "S1"]}  # lich su mo lop dung tren ra truong som
    free = plan_map(solve_cpsat(toy, scen(toy, preferences=prefs)))
    told = plan_map(solve_cpsat(toy, scen(toy, preferences=prefs, offered=[at("CS302", "262")])))
    assert free["CS302"] == "271"  # tranh ky 2 vi lich su chi mo ky 1
    assert told["CS302"] == "262"  # sinh vien bao ky 262 co mo: xep som nhu binh thuong


# --- T52: canh bao quy dinh moi ----------------------------------------------

def test_two_consecutive_skipped_main_semesters_warn(toy):
    s = scen(toy, skip_semesters=["262", "271"])
    item = next(i for i in warning_items(toy, s, {}) if i["kind"] == "skip_consecutive")
    assert "Phòng Đào tạo" in item["text"] and "32" in item["rule"]
    assert "skip_consecutive" not in kinds(warning_items(toy, scen(toy, skip_semesters=["262"]), {}))


def test_target_over_law_warns_but_is_kept(toy):
    s = scen(toy, semester_targets={"262": 30})
    item = next(i for i in warning_items(toy, s, {}) if i["kind"] == "target_over_law")
    assert item["semester"] == "262" and "30" in item["text"]


# --- M11: cach go co cau truc khi khong giai duoc ------------------------------

def test_unsat_returns_fixes_that_can_be_applied(toy):
    out = run({**toy, "scenario": scen(toy, skip_semesters=["262", "271"])}, "cpsat", 10)
    assert out["status"] == "UNSAT"
    fixes = out["infeasible_fixes"]
    assert {"kind": "unskip", "semester": "262", "label": "Không nghỉ kỳ 262"} in fixes
    assert all(f["label"] in out["infeasible_reason"] for f in fixes)


def test_feasible_result_has_no_fixes(toy):
    out = run({**toy, "scenario": scen(toy)}, "cpsat", 10)
    assert out["infeasible_fixes"] == [] and out["infeasible_reason"] is None


# --- T53: ly do that khi khong dat so TC muon -------------------------------

def test_target_reason_names_the_blocking_choice(toy):
    s = scen(toy, semester_targets={"262": 12}, not_offered=[at("CS301", "262"), at("CS302", "262")])
    out = run({**toy, "scenario": s}, "cpsat", 10)
    row = next(r for r in out["requests"] if r["kind"] == "target")
    assert row["status"] != "met"
    assert "không còn môn đủ điều kiện để thêm" not in row["detail"]
    assert "Cho CS301 mở lại kỳ 262" in row["detail"]


# --- M6: du lieu de trang tu to ky duoc / khong duoc ---------------------------

def test_course_facts_for_local_hints(toy):
    out = run({**toy, "scenario": scen(toy)}, "cpsat", 10)
    facts = out["course_facts"]
    assert facts["CS401"]["prerequisites"] == ["CS301", "CS302"]
    assert facts["EL303"]["corequisites"] == ["CS301"]
    assert "MA101" not in facts  # mon da dat khong can
    assert out["credit_rules"] == {"main_max": 12, "summer_max": 12}


# --- T62: go ma mon bat ky vao o tu chon tu do ---------------------------------

def test_free_choice_outside_curriculum_fills_the_free_slot(toy):
    toy["course_groups"].append({"name": "Tu do", "kind": "elective", "required_count": None, "required_credits": 3,
                                 "pool_scope": "any", "pool_course_credits": 3, "members": []})
    without = plan_map(solve_cpsat(toy, scen(toy)))
    assert any(c.startswith("FREE_") for c in without)
    toy["courses"].append({"code": "XX999", "name": "Mon ngoai chuong trinh", "credits": 3})
    toy["student"]["free_choices"] = ["XX999"]
    r = solve_cpsat(toy, scen(toy, locked=[at("XX999", "271")]))
    assert r["status"] in OK
    plan = plan_map(r)
    assert plan["XX999"] == "271"
    assert not any(c.startswith("FREE_") for c in plan)
