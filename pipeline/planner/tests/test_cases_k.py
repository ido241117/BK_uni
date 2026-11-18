"""Ca K1-K7d cua ke hoach (docs/2026-11-18-ke-hoach-goi-y-hoc-phan.md, muc 7).

Dap an XEP TAY, nguoi duyet xac nhan ngay 18/11. Moi ca chay CA HAI bo giai, va
lo trinh nao cung phai qua validator.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from planner.facts import get_scenario, load_fixture  # noqa: E402
from planner.run_scenarios import DEFAULT_FIXTURE  # noqa: E402
from planner.solve import plan_map, solve  # noqa: E402
from planner.solve_cpsat import solve_cpsat  # noqa: E402
from planner.validate import validate_plan  # noqa: E402

SOLVERS = {"clingo": solve, "cpsat": solve_cpsat}


@pytest.fixture()
def toy():
    return copy.deepcopy(load_fixture(DEFAULT_FIXTURE))


def base(fixture):
    return copy.deepcopy(get_scenario(fixture, "base"))


def run(name, fixture, scenario):
    result = SOLVERS[name](fixture, scenario)
    if result["semesters"]:
        assert validate_plan(fixture, scenario, result["semesters"]) == [], "validator bao vi pham"
    return result


def total(result):
    return sum(s["credits"] for s in result["semesters"])


def recommend(fixture, course, before):
    """Them khuyen nghi: nen hoc ``before`` truoc ``course``."""
    fixture["course_relations"].append(
        {"course_code": course, "related_course_code": before, "type": "recommended"}
    )


def s6(result):
    return next(p for p in result["preferences_report"] if p["id"] == "S6")


def fail_cs202(fixture):
    for sc in fixture["student"]["student_courses"]:
        if sc["course_code"] == "CS202":
            sc["status"] = "failed"
    scenario = base(fixture)
    scenario["in_progress_results"] = {"CS201": "pass"}
    return scenario


# --- K1 ---------------------------------------------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_k1_base(name, toy):
    r = run(name, toy, base(toy))
    assert (r["status"], r["graduation_semester"], total(r)) == ("OPTIMAL", "271", 20)


# --- K2, K2b: song hanh voi mon da rot (QD 285 Dieu 2) ---------------------

def test_k2_validator_rejects_corequisite_with_failed_course(toy):
    scenario = fail_cs202(toy)
    plan = [
        {"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
        {"semester_code": "271", "courses": ["CS202", "CS401", "EL302", "EL304", "MA201"]},
    ]
    errors = validate_plan(toy, scenario, plan)
    assert any("CS301" in e and "CS202" in e for e in errors)


@pytest.mark.parametrize("name", SOLVERS)
def test_k2b_solver_retakes_corequisite_first_or_together(name, toy):
    r = run(name, toy, fail_cs202(toy))
    plan = plan_map(r)
    assert plan["CS202"] == "262"
    assert plan["CS202"] <= plan["CS301"]
    assert (r["graduation_semester"], total(r)) == ("271", 23)


# --- K3: ha muc toi da --------------------------------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_k3_max_nine_credits(name, toy):
    scenario = base(toy)
    scenario["max_credits"] = 9
    r = run(name, toy, scenario)
    assert r["graduation_semester"] == "272"
    assert all(s["credits"] <= 9 for s in r["semesters"])


# --- K4: muon hoc mot mon (S4) -----------------------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_k4_wanted_course(name, toy):
    scenario = base(toy)
    scenario["preferences"] = {"wanted_courses": ["EL303"]}
    r = run(name, toy, scenario)
    assert "EL303" in plan_map(r)
    assert r["graduation_semester"] == "271"
    assert all(p["satisfied"] for p in r["preferences_report"] if p["id"] == "S4")


# --- K5, K5b: cap do mon, nam hoc theo khoa -----------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_k5_course_level_blocks_year_two(name, toy):
    toy["rules"] = {"course_level": True}  # khoa 2025: ky 26x la nam 2
    r = run(name, toy, base(toy))
    assert r["semesters"][0] == {"semester_code": "262", "courses": ["MA102"], "credits": 3}
    assert (r["graduation_semester"], total(r)) == ("272", 20)


@pytest.mark.parametrize("name", SOLVERS)
def test_k5b_earlier_cohort_is_not_blocked(name, toy):
    toy["rules"] = {"course_level": True}
    toy["curriculum"]["cohort"] = 2024  # ky 26x la nam 3
    r = run(name, toy, base(toy))
    assert (r["graduation_semester"], total(r)) == ("271", 20)


# --- K7..K7d: khuyen nghi la mong muon mem (S6) -------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_k7_recommendation_kept_without_delay(name, toy):
    recommend(toy, "EL302", before="CS401")
    r = run(name, toy, base(toy))
    plan = plan_map(r)
    assert (r["graduation_semester"], total(r)) == ("271", 20)
    assert "EL302" not in plan or plan["EL302"] > plan["CS401"]
    assert s6(r)["satisfied"]


@pytest.mark.parametrize("name", SOLVERS)
def test_k7b_impossible_recommendation_is_broken_and_reported(name, toy):
    recommend(toy, "CS301", before="CS401")  # vong voi tien quyet CS401 <- CS301
    r = run(name, toy, base(toy))
    assert (r["graduation_semester"], total(r)) == ("271", 20)
    assert not s6(r)["satisfied"]
    assert {"before": "CS401", "course": "CS301"} in s6(r)["broken"]


@pytest.mark.parametrize("name", SOLVERS)
def test_k7c_default_graduation_first(name, toy):
    recommend(toy, "CS301", before="MA102")
    r = run(name, toy, base(toy))
    assert (r["graduation_semester"], total(r)) == ("271", 20)
    assert not s6(r)["satisfied"]
    assert {"before": "MA102", "course": "CS301"} in s6(r)["broken"]


@pytest.mark.parametrize("name", SOLVERS)
def test_k7d_recommendations_first_delays_graduation(name, toy):
    recommend(toy, "CS301", before="MA102")
    scenario = base(toy)
    scenario["preferences"] = {"recommendations_first": True}
    r = run(name, toy, scenario)
    assert (r["graduation_semester"], total(r)) == ("272", 20)
    assert s6(r)["satisfied"]


# --- Cac rang buoc cung moi khac -----------------------------------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_graduate_by_too_early_is_unsat(name, toy):
    scenario = base(toy)
    scenario["graduate_by"] = "262"  # CS401 can CS301 o ky truoc: khong the xong trong 262
    assert run(name, toy, scenario)["status"] == "UNSAT"


@pytest.mark.parametrize("name", SOLVERS)
def test_semester_limit_moves_load(name, toy):
    scenario = base(toy)
    scenario["semester_limits"] = {"262": {"max": 6}}
    r = run(name, toy, scenario)
    assert r["semesters"][0]["credits"] <= 6


@pytest.mark.parametrize("name", SOLVERS)
def test_last_semester_below_minimum_is_warned(name, toy):
    # Muc chung 12 (mem S11): ky 262 co the du 12 (CS301, CS302, MA102, EL303) ma khong hoc
    # thua, nen S11 chon 12; ky cuoi 271 con 8 TC -> canh bao.
    toy["curriculum"]["min_semester_credits"] = 12
    r = run(name, toy, base(toy))
    assert r["graduation_semester"] == "271"
    assert r["semesters"][-1]["credits"] == 8
    assert any(w.startswith("Kỳ cuối 271 chỉ 8 TC") for w in r["warnings"])


# --- K8: ky he do sinh vien tu bat (quyet dinh 19/11) ----------------------------
# Them ky he 263 vao toy, toi da 9 TC moi ky. Khong bat he: nhu K3, xong 272.
# Bat 263: 262 + 271 chi chua 18 < 20 TC nen phai dung he it nhat 2 TC. S9 dung tren
# (19/11): uu tien mon cap 1-2, nen chon MA201 hoac MA102 (3 TC) thay vi CS401 (2 TC,
# cap 4). MA102 va MA201 khong hoc cung ky duoc nen he chi 3 TC, duoi khoang dep 6-9
# (S7 khong dap ung). Dap an: xong 271, he la MA201 hoac MA102.

def with_summer(fixture):
    fixture["semesters"] = ["251", "252", "261", "262", "263", "271", "272"]
    return fixture


@pytest.mark.parametrize("name", SOLVERS)
def test_k8_summer_not_used_without_opt_in(name, toy):
    scenario = base(with_summer(toy))
    scenario["max_credits"] = 9
    r = run(name, toy, scenario)
    assert r["graduation_semester"] == "272"
    assert "263" not in plan_map(r).values()


@pytest.mark.parametrize("name", SOLVERS)
def test_k8_opt_in_summer_used_minimally(name, toy):
    scenario = base(with_summer(toy))
    scenario["max_credits"] = 9
    scenario["summer_opt_in"] = ["263"]
    r = run(name, toy, scenario)
    assert r["graduation_semester"] == "271"
    assert [c for c, s in plan_map(r).items() if s == "263"] in (["MA201"], ["MA102"])
    s7 = next(p for p in r["preferences_report"] if p["id"] == "S7")
    assert not s7["satisfied"] and "263: 3 TC" in s7["detail"]
    assert next(p for p in r["preferences_report"] if p["id"] == "S9")["satisfied"]


def test_k8_validator_rejects_course_in_summer_not_opted(toy):
    scenario = base(with_summer(toy))
    plan = [{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
            {"semester_code": "263", "courses": ["CS401"]},
            {"semester_code": "271", "courses": ["EL302", "EL304", "MA201"]}]
    errors = validate_plan(toy, scenario, plan)
    assert any("CS401: ky he 263 sinh vien chua bat" in e for e in errors)


@pytest.mark.parametrize("band", [(11, 12), (6, 8)])
def test_s8_both_solvers_agree(toy, band):
    from planner.report import objective

    scenario = base(toy)
    scenario["preferences"] = {"preferred_load": list(band)}
    results = [run(name, toy, scenario) for name in SOLVERS]
    values = [objective(toy, scenario, plan_map(r)) for r in results]
    assert values[0] == values[1]


# --- K8c: S9, ky he uu tien mon dai cuong / co so nganh (cap 1, 2) --------------
# Nhu K8b nhung CS401 doi thanh 3 TC: tong 21 TC, 262 + 271 chua 18 -> he can 3 TC.
# Mon 3 TC xep he duoc: MA201 hoac MA102 (cap 1-2), hoac EL3xx, CS401 (cap 3-4).
# S9 chon mon cap 1-2. Dap an: xong 271, mon he co cap <= 2, S9 dap ung.

@pytest.mark.parametrize("name", SOLVERS)
def test_k8c_summer_prefers_general_courses(name, toy):
    for c in toy["courses"]:
        if c["code"] == "CS401":
            c["credits"] = 3
    scenario = base(with_summer(toy))
    scenario["max_credits"] = 9
    scenario["summer_opt_in"] = ["263"]
    r = run(name, toy, scenario)
    assert r["graduation_semester"] == "271"
    summer = [c for c, s in plan_map(r).items() if s == "263"]
    assert summer in (["MA201"], ["MA102"])
    assert next(p for p in r["preferences_report"] if p["id"] == "S9")["satisfied"]


# --- K8d: do an khong hoc he (cung, 19/11) --------------------------------------
# Nhu K8b nhung danh dau MA201 la "do an" (summer_excluded). He chi con MA102 la mon
# cap 1-2 xep duoc. Dap an: xong 271, he la MA102.

@pytest.mark.parametrize("name", SOLVERS)
def test_k8d_projects_never_in_summer(name, toy):
    toy["summer_excluded"] = ["MA201"]
    scenario = base(with_summer(toy))
    scenario["max_credits"] = 9
    scenario["summer_opt_in"] = ["263"]
    r = run(name, toy, scenario)
    assert r["graduation_semester"] == "271"
    assert [c for c, s in plan_map(r).items() if s == "263"] == ["MA102"]


# --- S11 (19/11): 11 TC ky chinh la mem, khong hoc thua de du ----------------------

@pytest.mark.parametrize("name", SOLVERS)
def test_s11_no_extra_courses_to_reach_minimum(name, toy):
    # Muc chung 11 voi toy (con 20 TC): ky 262 dat duoc 12 khong can hoc thua -> S11 dap ung.
    # Bat cap do mon, khoa 2025: ky 262 (nam 2) chi hoc duoc MA102 (3 TC). Truoc 19/11 la UNSAT;
    # gio co lo trinh, tong van 20 TC (khong hoc thua), kem canh bao ky 262 duoi 11 TC.
    toy["curriculum"]["min_semester_credits"] = 11
    toy["rules"] = {"course_level": True}
    r = run(name, toy, base(toy))
    assert r["status"] == "OPTIMAL" and r["graduation_semester"] == "272"
    assert total(r) == 20
    assert any(w.startswith("Kỳ 262 chỉ 3 TC") for w in r["warnings"])
    assert not next(p for p in r["preferences_report"] if p["id"] == "S11")["satisfied"]


def test_validator_accepts_semester_below_default_minimum(toy):
    toy["curriculum"]["min_semester_credits"] = 11
    plan = [{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
            {"semester_code": "271", "courses": ["CS401", "EL302", "EL304", "MA201"]}]
    assert validate_plan(toy, base(toy), plan) == []


def test_student_own_minimum_is_hard(toy):
    scenario = base(toy)
    scenario["semester_limits"] = {"262": {"min": 12}}
    plan = [{"semester_code": "262", "courses": ["CS301", "CS302", "MA102"]},
            {"semester_code": "271", "courses": ["CS401", "EL302", "EL304", "MA201"]}]
    assert "ky 262: 9 TC duoi toi thieu 12" in validate_plan(toy, scenario, plan)
