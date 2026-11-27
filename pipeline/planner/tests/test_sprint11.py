"""Sprint 11 (22/11): yeu cau cua sinh vien duoc tuan theo, khong dap ung thi phai noi ro.

Chay tren ``fixtures/toy.json`` (cac ky con lai 262, 271, 272; CS401 can CS301 va CS302 truoc).
Chi CP-SAT: engine ASP tam tat tren giao dien (Q13).
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.cli import run  # noqa: E402
from planner.facts import get_scenario, load_fixture  # noqa: E402
from planner.result import plan_map  # noqa: E402
from planner.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solve_cpsat import solve_cpsat  # noqa: E402


@pytest.fixture()
def toy():
    fx = copy.deepcopy(load_fixture(DEFAULT_FIXTURE))
    fx["rules"] = {**(fx.get("rules") or {}), "pins_absolute": True}
    return fx


def scen(fx, **extra):
    s = copy.deepcopy(get_scenario(fx, "base"))
    s.update(extra)
    return s


def req(result, kind):
    return [r for r in result["requests"] if r["kind"] == kind]


def lock(code, sem):
    return {"course_code": code, "semester_code": sem}


def test_pin_breaking_prerequisite_is_kept_and_explained(toy):
    r = solve_cpsat(toy, scen(toy, locked=[lock("CS401", "262")]))
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")
    assert plan_map(r)["CS401"] == "262"
    row = req(r, "pin")[0]
    assert row["status"] == "warning" and "CS301" in row["detail"]


def test_without_flag_old_behaviour_is_unsat(toy):
    toy["rules"]["pins_absolute"] = False
    assert solve_cpsat(toy, scen(toy, locked=[lock("CS401", "262")]))["status"] == "UNSAT"


def test_pin_on_passed_course_is_a_retake(toy):
    # Nguoi duyet 22/11: "no muon hoc cu cho no hoc" -> hoc cai thien o dung ky ghim.
    base_r = solve_cpsat(toy, scen(toy))
    r = solve_cpsat(toy, scen(toy, locked=[lock("MA101", "262")]))
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")
    assert plan_map(r)["MA101"] == "262"
    row = req(r, "pin")[0]
    assert row["status"] == "met" and "cải thiện" in row["detail"]
    # Khong cong TC tich luy: cac mon khac van phai hoc du nhu khi khong ghim.
    others = lambda res: sorted(c for c in plan_map(res) if c != "MA101")  # noqa: E731
    assert others(r) == others(base_r)


def test_planned_elective_excess_counts_as_free_elective(toy):
    # Toy: khoi tu chon can 6 TC; them khoi tu do 3 TC. Ghim 3 mon tu chon (9 TC) thi du 3 TC bu o tu do.
    toy["course_groups"].append({"name": "Tu do", "kind": "elective", "required_count": None,
                                 "required_credits": 3, "pool_scope": "any", "pool_course_credits": 3, "members": []})
    r = solve_cpsat(toy, scen(toy, locked=[lock("EL302", "272"), lock("EL303", "272"), lock("EL304", "262")]))
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")
    assert not any(c.startswith("FREE_") for c in plan_map(r))


def test_skip_semester_gets_no_course(toy):
    r = solve_cpsat(toy, scen(toy, skip_semesters=["271"]))
    assert "271" not in {s["semester_code"] for s in r["semesters"]}
    assert req(r, "skip")[0]["status"] == "met"


def test_pin_inside_skipped_semester_wins_and_is_flagged(toy):
    r = solve_cpsat(toy, scen(toy, skip_semesters=["262"], locked=[lock("MA102", "262")]))
    assert plan_map(r)["MA102"] == "262"
    courses_262 = [c for s in r["semesters"] if s["semester_code"] == "262" for c in s["courses"]]
    assert courses_262 == ["MA102"]
    assert req(r, "skip")[0]["status"] == "warning"


def test_frozen_semester_keeps_only_pins(toy):
    r = solve_cpsat(toy, scen(toy, frozen_semesters=["262"], locked=[lock("MA102", "262")]))
    courses_262 = [c for s in r["semesters"] if s["semester_code"] == "262" for c in s["courses"]]
    assert courses_262 == ["MA102"]


def test_semester_target_is_reported_honestly(toy):
    r = solve_cpsat(toy, scen(toy, semester_targets={"262": 9}))
    got = next((s["credits"] for s in r["semesters"] if s["semester_code"] == "262"), 0)
    row = req(r, "target")[0]
    assert (row["status"] == "met") == (got == 9)
    assert str(got) in row["detail"]


def test_semester_target_beats_max_credits(toy):
    # Loi 23/11: o TC dau ky (muon 9) phai thang "Toi da moi ky" (6); truoc day bien max_load
    # lay can tren tu muc toi da cu nen ky 262 bi chan o 6 ma khong bao gi.
    r = solve_cpsat(toy, scen(toy, max_credits=6, semester_targets={"262": 9}))
    got = next((s["credits"] for s in r["semesters"] if s["semester_code"] == "262"), 0)
    assert got == 9
    assert req(r, "target")[0]["status"] == "met"


def test_user_priority_order_is_accepted(toy):
    r = solve_cpsat(toy, scen(toy, preferences={"order": ["S5", "S1"]}))
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")


def test_unsat_explanation_never_suggests_dropping_a_pin(toy):
    # Han tot nghiep 262 voi 1 ky khong the hoc het: giai thich chi ra han, khong de xuat bo ghim.
    payload = {**toy, "scenario": scen(toy, graduate_by="262", locked=[lock("CS401", "262")])}
    out = run(payload, "cpsat", 10)
    assert out["status"] == "UNSAT"
    assert "khóa CS401" not in (out["infeasible_reason"] or "")
    assert "hạn tốt nghiệp" in out["infeasible_reason"]
    assert out["requests"][0]["status"] == "unmet"


def test_cli_moves_pinned_violations_to_warnings(toy):
    payload = {**toy, "scenario": scen(toy, locked=[lock("CS401", "262")])}
    out = run(payload, "cpsat", 10)
    assert not any("CS401" in v for v in out["violations"])
    assert any(r["kind"] == "pin" and r["status"] == "warning" for r in out["requests"])


def test_cli_marks_unchosen_electives_as_block_slots(toy):
    out = run({**toy, "scenario": scen(toy, locked=[lock("EL304", "262")])}, "cpsat", 10)
    rows = {c["code"]: c for sem in out["semesters"] for c in sem["courses"]}
    assert rows["EL304"]["slot"] is False and rows["EL304"]["block"] == "Tu chon"
    assert any(c["slot"] for c in rows.values() if c["code"].startswith("EL") and c["code"] != "EL304")
    assert all(not c["slot"] for c in rows.values() if c["code"].startswith(("CS", "MA")))


def test_cli_labels_excess_elective_by_the_requirement_it_fills(toy):
    # 24/11 (cach A): khoi tu chon can 6 TC; ghim 3 mon (9 TC) thi 1 mon du lap khoi tu do, nhan phai la "Tu do"
    # chu khong phai khoi goc "Tu chon" (truoc day tai khoan thu B thay 2 o "Quan ly" ma that ra lap tu do).
    toy["course_groups"].append({"name": "Tu do", "kind": "elective", "required_count": None,
                                 "required_credits": 3, "pool_scope": "any", "pool_course_credits": 3, "members": []})
    pins = [lock("EL302", "272"), lock("EL303", "272"), lock("EL304", "262")]
    out = run({**toy, "scenario": scen(toy, locked=pins)}, "cpsat", 10)
    rows = {c["code"]: c for sem in out["semesters"] for c in sem["courses"]}
    labels = sorted(rows[c]["block"] for c in ("EL302", "EL303", "EL304"))
    assert labels == ["Tu chon", "Tu chon", "Tu do"]
    assert not any(code.startswith("FREE_") for code in rows)
