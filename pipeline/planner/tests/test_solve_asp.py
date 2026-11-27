"""Engine ASP qua adapter solve_asp.py. Dap an tinh tay, ghi ly do canh tung test.

Fixture nho ``small()`` hop voi policy.lp (14-21 TC/ky chinh): 7 mon 7 TC.
Bat buoc RQ1001, RQ1002, RQ2003, RQ2004 (28 TC) + tu chon 7 TC trong EL3001..EL3003.
Ky: 251 252 253 261 262 263 271 272, dang o 252 (chua hoc mon nao), ky he dong.
Con 35 TC; ky chinh toi da 21 -> it nhat 2 ky chinh: 261 (21 TC) + 262 (14 TC).
"""

from __future__ import annotations

import copy
import json
import time

import pytest

from planner.model.facts import FixtureError
from planner.model.input import KHMT, load_fixture
from planner.model.result import plan_map
from planner.solvers.asp.adapter import Calendar, build_program, solve_asp
from planner.model.normalize import normalize
from evaluation.validate import validate_plan

REQUIRED = ["RQ1001", "RQ1002", "RQ2003", "RQ2004"]
ELECTIVES = ["EL3001", "EL3002", "EL3003"]


def small() -> dict:
    codes = REQUIRED + ELECTIVES
    return {
        "curriculum": {"code": "SMALL", "name": "Small", "cohort": 2025, "duration_years": 4,
                       "min_semester_credits": 14, "max_semester_credits": 21},
        "semesters": ["251", "252", "253", "261", "262", "263", "271", "272"],
        "courses": [{"code": c, "name": c, "credits": 7} for c in codes],
        "curriculum_courses": [{"course_code": c} for c in codes],
        "course_relations": [],
        "course_groups": [
            {"name": "Bat buoc", "kind": "required", "required_count": None, "required_credits": None,
             "members": list(REQUIRED)},
            {"name": "Tu chon", "kind": "elective", "required_count": None, "required_credits": 7,
             "members": list(ELECTIVES)},
        ],
        "offerings": {"unknown_policy": "assume-open", "records": []},
        "student": {"current_semester": "252", "student_courses": []},
    }


def scenario(**extra) -> dict:
    return {"id": "t", "in_progress_results": {}, **extra}


def solve(fixture: dict, sc: dict | None = None) -> dict:
    sc = sc or scenario()
    r = solve_asp(fixture, sc, None, 30.0)
    if r["semesters"]:
        assert validate_plan(fixture, sc, r["semesters"]) == [], "validator bao vi pham"
    return r


# --- Lich ---------------------------------------------------------------------

def test_calendar_counts_summers_even_if_fixture_skips_them():
    cal = Calendar(["251", "252", "261"])  # toy.json khong liet ke ky he
    assert [cal.index(c) for c in ("251", "252", "253", "261", "263", "271")] == [1, 2, 3, 4, 6, 7]
    assert [cal.code(i) for i in (1, 3, 4, 9)] == ["251", "253", "261", "273"]
    assert Calendar(["262"]).enroll_part == 2


def test_non_school_semester_codes_are_rejected():
    fx = small()
    fx["semesters"] = ["S0", "S1"]
    fx["student"]["current_semester"] = "S0"
    with pytest.raises(FixtureError):
        solve_asp(fx, scenario())


# --- Facts ----------------------------------------------------------------------

def test_facts_are_deterministic_and_skip_prior_and_recommended():
    fx = small()
    fx["course_relations"] = [
        {"course_code": "RQ2003", "related_course_code": "RQ1001", "type": "prerequisite"},
        {"course_code": "RQ2004", "related_course_code": "RQ1002", "type": "prior"},
        {"course_code": "EL3001", "related_course_code": "RQ1001", "type": "recommended"},
    ]
    norm = normalize(fx)
    facts, _ = build_program(norm, scenario())
    assert facts == build_program(norm, scenario())[0]
    assert 'prereq("RQ2003", "RQ1001").' in facts
    assert '"RQ1002"' in facts and 'prereq("RQ2004"' not in facts and 'coreq("RQ2004"' not in facts
    assert 'prereq("EL3001"' not in facts
    # total_degree tu cac khoi: 28 bat buoc + 7 tu chon.
    assert "map(l, total_degree, 35)." in facts


# --- Lo trinh co ban -----------------------------------------------------------------

def test_small_base_plan():
    r = solve(small())
    assert r["status"] == "OPTIMAL"
    assert r["graduation_semester"] == "262"
    assert [s["credits"] for s in r["semesters"]] == [21, 14]
    assert r["solver"] == "clingo"
    levels = [o["level"] for o in r["engine_report"]["objective"]]
    assert levels[:2] == ["gaps", "last_semester"]


def test_prerequisite_order_is_respected():
    fx = small()
    fx["course_relations"] = [{"course_code": "RQ2003", "related_course_code": "RQ1001",
                               "type": "prerequisite"}]
    plan = plan_map(solve(fx))
    assert plan["RQ1001"] < plan["RQ2003"]


# --- Ky trong (gap) va nghi ky --------------------------------------------------------
# Khoa RQ2004 vao 271 va gia dinh khong mon nao mo o 262: 262 bat buoc trong (giua 261
# va 271, hoac 261 va 262 cung trong neu bat dau tu 271). Gio xep 261 + 271, xong 271 nhu
# CP-SAT, kem canh bao gap o 262; khong duoc lui ca lo trinh sang 271-272 de tranh gap.

def gap_scenario(**extra) -> dict:
    blocked = [{"course_code": c, "semester_code": "262"} for c in REQUIRED + ELECTIVES]
    return scenario(locked=[{"course_code": "RQ2004", "semester_code": "271"}], not_offered=blocked, **extra)


def test_forced_empty_term_is_a_warning_not_unsat():
    r = solve(small(), gap_scenario())
    assert r["status"] == "OPTIMAL"
    assert r["graduation_semester"] == "271"
    assert r["engine_report"]["gaps"] == ["262"]
    assert any(w.startswith("Kỳ 262 bị bỏ trống") for w in r["warnings"])
    assert "262" not in plan_map(r).values()


def test_skip_semester_removes_the_gap_warning():
    r = solve(small(), gap_scenario(skip_semesters=["262"]))
    assert r["status"] == "OPTIMAL"
    assert r["engine_report"]["gaps"] == []
    assert not any("bị bỏ trống" in w for w in r["warnings"])


def test_skip_semester_outside_plan_is_input_error():
    with pytest.raises(FixtureError):
        solve_asp(small(), scenario(skip_semesters=["241"]))


# --- Gioi han tin chi tung ky (sem_max / sem_min) ----------------------------------------
# 261 toi da 14 -> 261 hoc 14, con 21 TC: 262 hoc 21. Van xong 262.

def test_semester_limit_max_applies_to_one_term_only():
    r = solve(small(), scenario(semester_limits={"261": {"max": 14}}))
    assert [(s["semester_code"], s["credits"]) for s in r["semesters"]] == [("261", 14), ("262", 21)]


def test_max_credits_for_every_term():
    # Toi da 14 moi ky: 35 TC can 3 ky (14 + 14 + 7). Xong 271.
    r = solve(small(), scenario(max_credits=14))
    assert r["graduation_semester"] == "271"
    assert all(s["credits"] <= 14 for s in r["semesters"])


# --- Diem he 10 tu file myBK ---------------------------------------------------------------
# RQ1001 dat 8.0 (B+), RQ1002 rot 3.0 (F, trang thai failed), RQ2003 "chua hoc" trong DB nhung
# file co diem 2.5 (rot): ca hai mon rot phai hoc lai.
# GPA he 10 = (8.0*7 + 3.0*7 + 2.5*7) / 21 = 4.50; GPA he 4 = (3.5*7 + 0 + 0) / 21 = 1.1666 -> 1.17.

def scored() -> dict:
    fx = small()
    fx["student"]["student_courses"] = [
        {"course_code": "RQ1001", "status": "completed"},
        {"course_code": "RQ1002", "status": "failed"},
    ]
    fx["student"]["scores"] = [
        {"code": "RQ1001", "score": "8.0", "letter": "B+"},
        {"code": "RQ1002", "score": "3,0", "letter": "F"},
        {"code": "RQ2003", "score": "2.5", "letter": "F"},
    ]
    return fx


def test_scores_decide_retakes_and_gpa():
    r = solve(scored())
    plan = plan_map(r)
    assert "RQ1001" not in plan
    assert {"RQ1002", "RQ2003"} <= set(plan)
    gpa = r["engine_report"]["gpa"]
    assert gpa["score_10"] == pytest.approx(4.50)
    assert gpa["gpa_4"] == pytest.approx(1.17)


def test_unknown_letter_is_reported_and_skipped():
    fx = scored()
    fx["student"]["scores"][0]["letter"] = "MT"
    r = solve(fx)
    assert any("MT" in w and "policy.lp" in w for w in r["warnings"])


# Diem chu suy tu diem he 10 (grade_min_score trong policy.lp): file khong co diem chu, hoac
# diem chu mau thuan voi diem so, deu cho cung ket qua voi scored() (8.0 -> B+ -> 3.5).
@pytest.mark.parametrize("letter", [None, "F"])
def test_letter_is_derived_from_score(letter):
    fx = scored()
    fx["student"]["scores"][0]["letter"] = letter
    r = solve(fx)
    assert "RQ1001" not in plan_map(r)
    gpa = r["engine_report"]["gpa"]
    assert gpa["score_10"] == pytest.approx(4.50)
    assert gpa["gpa_4"] == pytest.approx(1.17)


# Bien dau/rot: 4.0 la D (dat, khong hoc lai), 3.99 la F (rot, hoc lai).
# Trang thai trong DB khop voi diem (validator doc trang thai DB).
@pytest.mark.parametrize("score, retake", [("4.0", False), ("3.99", True)])
def test_pass_boundary_follows_letter_bands(score, retake):
    fx = scored()
    fx["student"]["student_courses"][1]["status"] = "failed" if retake else "completed"
    fx["student"]["scores"][1] = {"code": "RQ1002", "score": score, "letter": None}
    r = solve(fx)
    assert ("RQ1002" in plan_map(r)) is retake


# Tran diem hoc lai retake_grade_cap(b) ap dung ca he 10. Adapter chi tao mot lan hoc moi mon,
# nen test them truc tiep: RQ1001 rot lan 1 (3.0) o ky 1, hoc lai ky 2 duoc 9.0 (A, bi ha xuong B).
# GPA he 10 = (7.5 [diem giua B] + 3.0 + 2.5) * 7 / 21 = 4.33 (khong co tran: 4.83);
# GPA he 4 = (3.0 + 0 + 0) / 3 = 1.00.
def test_retake_cap_applies_to_score_scale(monkeypatch):
    import planner.solvers.asp.adapter as sa
    original = sa.build_program

    def with_retake(fixture, sc):
        facts, ctx = original(fixture, sc)
        student = ('taken("RQ1001"', 'map(g, "RQ1001"', 'raw_score("RQ1001"')
        kept = [line for line in facts.splitlines() if not line.startswith(student)]
        kept.append('taken("RQ1001", 1). raw_score("RQ1001", 300). '
                    'taken(rt("RQ1001", 1), 2). raw_score(rt("RQ1001", 1), 900). '
                    'attempt_count("RQ1001", 2). last_attempt("RQ1001", rt("RQ1001", 1)).')
        return "\n".join(kept), ctx

    monkeypatch.setattr(sa, "build_program", with_retake)
    r = solve(scored())
    assert "RQ1001" not in plan_map(r)
    gpa = r["engine_report"]["gpa"]
    assert gpa["score_10"] == pytest.approx(4.33)
    assert gpa["gpa_4"] == pytest.approx(1.00)


# --- Lich su mo lop (muc tieu mem @5) ---------------------------------------------------
# Quan sat 2 ky 1 (241, 251) va 2 ky 2 (242, 252). EL3001 chi mo ky 2, EL3002 chi mo ky 1,
# EL3003 mo 1/2 ky 2. Tu chon nen la EL3002 o 261 hoac EL3001 o 262: khong lech lich nao.

def test_offering_history_places_elective_in_its_usual_part():
    fx = small()
    fx["opened_semesters"] = {"EL3001": ["242", "252"], "EL3002": ["241", "251"], "EL3003": ["242"],
                              "RQ1001": ["241", "242", "251", "252"]}
    r = solve(fx)
    plan = plan_map(r)
    chosen = [(c, s) for c, s in plan.items() if c in ELECTIVES]
    assert chosen in ([("EL3002", "261")], [("EL3001", "262")])
    assert r["engine_report"]["offering_misses"] == []


# --- Chuyen nganh ----------------------------------------------------------------------
# Khoi con "X" (EL3002, EL3003, can 1 mon). Sinh vien chon X: tu chon phai thuoc X.

def with_specialization(target: str | None) -> dict:
    fx = small()
    fx["course_groups"].append({"name": "Tu chon - X", "kind": "elective", "required_count": 1,
                                "required_credits": 7, "parent": "Tu chon", "specialization": "X",
                                "members": ["EL3002", "EL3003"]})
    fx["student"]["target_specialization"] = target
    return fx


def test_major_is_reported_and_enforced():
    r = solve(with_specialization("X"))
    assert set(plan_map(r)) & set(ELECTIVES) <= {"EL3002", "EL3003"}
    assert r["engine_report"]["majors"] == [{"code": "X", "count": 1, "earned": True}]


# --- Dieu kien tot nghiep (nhom E) -------------------------------------------------------
# ENG_GC dat theo file myBK (ma ENG_GC_600, qua bang alias); SA4001 chua dat.
# social_work_days la cua policy.lp, web chua co du lieu -> luon chua dat.

def test_graduation_conditions_become_external_requirements():
    fx = small()
    fx["conditions"] = ["ENG_GC", "SA4001"]
    fx["courses"] += [{"code": "ENG_GC", "name": "ENG", "credits": 0}, {"code": "SA4001", "name": "SA", "credits": 0}]
    fx["curriculum_courses"] += [{"course_code": "ENG_GC"}, {"course_code": "SA4001"}]
    fx["course_groups"][0]["members"] += ["ENG_GC", "SA4001"]
    fx["student"]["graduation_conditions"] = [{"code": "ENG_GC_600", "passed": True},
                                              {"code": "SA4001", "passed": False}]
    r = solve(fx)
    blocked = r["engine_report"]["graduation_blocked"]
    assert "SA4001" in blocked and "social_work_days" in blocked
    assert "ENG_GC" not in blocked
    assert "ENG_GC" not in plan_map(r) and "SA4001" not in plan_map(r)


def test_condition_under_mybk_code_matches_the_file():
    # Chuong trinh nhap tu myBK dung thang ma ENG_GC_600 (khong qua alias).
    fx = small()
    fx["conditions"] = ["ENG_GC_600"]
    fx["courses"].append({"code": "ENG_GC_600", "name": "ENG", "credits": 0})
    fx["curriculum_courses"].append({"course_code": "ENG_GC_600"})
    fx["course_groups"][0]["members"].append("ENG_GC_600")
    fx["student"]["graduation_conditions"] = [{"code": "ENG_GC_600", "passed": True}]
    r = solve(fx)
    assert "ENG_GC_600" not in r["engine_report"]["graduation_blocked"]
    assert "ENG_GC_600" not in plan_map(r)


# --- Tag ------------------------------------------------------------------------------------

def test_tags_are_read_from_json(monkeypatch, tmp_path):
    import planner.solvers.asp.adapter as adapter

    path = tmp_path / "tags.json"
    path.write_text(json.dumps({"tags": {"AI": ELECTIVES, "core": ["RQ1001"]}}), encoding="utf-8")
    monkeypatch.setattr(adapter, "TAGS_FILE", path)
    r = solve(small())
    tags = r["engine_report"]["course_tags"]
    assert tags["RQ1001"] == ["core"]
    assert [t for c, t in tags.items() if c in ELECTIVES] == [["AI"]]


def test_tags_come_from_the_students_program_family(monkeypatch, tmp_path):
    # SMALL belongs to family F1: its list is used, not another family's nor the merged fallback.
    import planner.solvers.asp.adapter as adapter

    path = tmp_path / "tags.json"
    path.write_text(json.dumps({
        "tags": {"merged": ELECTIVES},
        "by_family": {"F1": {"web": ["EL3001"]}, "F2": {"security": ELECTIVES}},
        "families": {"SMALL": "F1", "OTHER-2025": "F2"},
    }), encoding="utf-8")
    monkeypatch.setattr(adapter, "TAGS_FILE", path)
    fx = small()
    fx["curriculum"]["code"] = "NO-FAMILY"                      # no family list: merged fallback
    facts, _ = build_program(normalize(fx), scenario())
    assert 'tag("EL3001", "merged").' in facts and '"web"' not in facts
    facts, _ = build_program(normalize(small()), scenario())
    assert 'tag("EL3001", "web").' in facts and '"security"' not in facts and '"merged"' not in facts


@pytest.mark.parametrize("interest, chosen", [("web", "EL3003"), ("AI", "EL3002")])
def test_interest_picks_the_elective_with_that_tag(monkeypatch, tmp_path, interest, chosen):
    # One 7-credit elective out of three is needed and nothing else tells them apart, so the
    # interest objective (taste) decides which one is planned.
    import planner.solvers.asp.adapter as adapter

    path = tmp_path / "tags.json"
    path.write_text(json.dumps({"tags": {"AI": ["EL3002"], "web": ["EL3003"]}}), encoding="utf-8")
    monkeypatch.setattr(adapter, "TAGS_FILE", path)
    r = solve(small(), scenario(interests=[interest]))
    planned = [c for c in plan_map(r) if c in ELECTIVES]
    assert planned == [chosen]
    assert r["engine_report"]["interests"] == {interest: [chosen]}
    assert any(interest in a for a in r["assumptions"])


def test_interest_without_courses_in_the_program_is_warned(monkeypatch, tmp_path):
    import planner.solvers.asp.adapter as adapter

    path = tmp_path / "tags.json"
    path.write_text(json.dumps({"tags": {"AI": ["EL3002"], "robotics": ["XX9999"]}}), encoding="utf-8")
    monkeypatch.setattr(adapter, "TAGS_FILE", path)
    r = solve(small(), scenario(interests=["robotics", "AI"]))
    assert r["status"] == "OPTIMAL"
    assert r["engine_report"]["interests"] == {"AI": ["EL3002"], "robotics": []}
    assert any('"robotics"' in w for w in r["warnings"])


def test_malformed_interests_are_an_input_error():
    with pytest.raises(FixtureError):
        solve_asp(small(), scenario(interests="AI"))


# --- Hoc phi tuy chon --------------------------------------------------------------------------

def test_policy_without_fee_rules_still_plans(monkeypatch, tmp_path):
    import planner.solvers.asp.adapter as adapter

    text = (adapter.ASP_DIR / "policy.lp").read_text(encoding="utf-8")
    path = tmp_path / "policy-nofee.lp"
    path.write_text("\n".join(l for l in text.splitlines() if not l.startswith("fee_rule")), encoding="utf-8")
    core = adapter.ASP_DIR / "core"
    monkeypatch.setattr(adapter, "SOURCES_BEFORE", (core / "encoding.lp", core / "extension.lp", path))
    r = solve(small())
    assert r["status"] == "OPTIMAL" and r["graduation_semester"] == "262"
    assert r["engine_report"]["fees"] == {}
    assert "cost" not in [o["level"] for o in r["engine_report"]["objective"]]


# --- Doi chieu policy.lp voi du lieu chuong trinh -------------------------------------------

def test_load_mismatch_with_policy_is_warned():
    fx = small()
    assert not any("khác policy.lp" in w for w in solve(fx)["warnings"])
    fx["curriculum"]["max_semester_credits"] = 24
    assert any("14–24 TC, khác policy.lp (14–21 TC)" in w for w in solve(fx)["warnings"])


# --- Chuong trinh that (KHMT 2023, 96 mon) va gioi han thoi gian ---------------------------

@pytest.fixture(scope="module")
def khmt():
    return load_fixture(KHMT)


def test_khmt_real_size_is_optimal_and_valid(khmt, monkeypatch):
    # 1 luong cho tat dinh: kiem tra toi uu va dung. Che do nhieu luong cua san pham: test duoi.
    import planner.solvers.asp.adapter as adapter

    monkeypatch.setattr(adapter, "THREADS", 1)
    sc = copy.deepcopy(khmt["scenarios"][0])
    start = time.perf_counter()
    r = solve_asp(khmt, sc, None, 30.0)
    assert time.perf_counter() - start < 30
    assert r["status"] == "OPTIMAL"
    assert validate_plan(khmt, sc, r["semesters"]) == []
    assert r["graduation_semester"] == "271"  # cung ky voi CP-SAT (test_real_khmt)


def test_khmt_with_production_threads_is_valid_within_limit(khmt):
    # Nhieu luong khong tat dinh: hiem khi ket o buoc chung minh toi da gioi han (do 20/11: ~1/13 lan).
    # Chi kiem tra dieu luon dung: lo trinh hop le, dung han (cong vai giay grounding/vuot gioi han mem).
    sc = copy.deepcopy(khmt["scenarios"][0])
    start = time.perf_counter()
    r = solve_asp(khmt, sc, None, 10.0)
    assert time.perf_counter() - start < 20
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")
    assert validate_plan(khmt, sc, r["semesters"]) == []


def test_time_limit_is_respected(khmt):
    sc = copy.deepcopy(khmt["scenarios"][0])
    start = time.perf_counter()
    r = solve_asp(khmt, sc, None, 0.05)
    assert time.perf_counter() - start < 10  # grounding (~1 s) + gioi han mem
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL", "TIMEOUT")


def test_internship_fills_next_term_without_placement_ban(khmt):
    # CO3335 (rules.summer_courses): credits in the registration term, the next term kept
    # empty by the engine (fills_next). No ban: it may go in any term.
    facts, _ = build_program(normalize(khmt), copy.deepcopy(khmt["scenarios"][0]))
    lines = facts.splitlines()
    assert 'fills_next("CO3335").' in lines
    assert not [l for l in lines if l.startswith('ban("CO3335"')]


# Graduation-course threshold (23/11/2026): the other courses of the course's own term count.
# small() with RQ2004 as the internship, threshold 0.8 of 35 TC -> 28 TC. 261 holds at most
# 21 TC (3 courses). Counting 262 too (RQ2004 excluded): 21 + 7 = 28 -> RQ2004 fits in 262
# next to one more course, graduation 262. Strict rule ("before the term") would need 28 TC
# before RQ2004, i.e. RQ2004 alone in 271.
def internship_small() -> dict:
    fx = small()
    fx["rules"] = {"summer_courses": ["RQ2004"], "graduation_thresholds": {"internship": 0.8}}
    fx["graduation_courses"] = {"internship": "RQ2004"}
    return fx


def test_threshold_counts_its_own_term():
    facts, _ = build_program(normalize(internship_small()), scenario())
    assert 'milestone("RQ2004", 28).' in facts.splitlines()
    r = solve(internship_small())
    assert r["graduation_semester"] == "262"
    assert plan_map(r)["RQ2004"] == "262"


def test_validator_threshold_excludes_the_course_itself():
    fx = internship_small()
    ok = [{"semester_code": "261", "courses": ["RQ1001", "RQ1002", "RQ2003"]},
          {"semester_code": "262", "courses": ["RQ2004", "EL3001"]}]
    assert validate_plan(fx, scenario(), ok) == []
    short = [{"semester_code": "261", "courses": ["RQ1001", "RQ1002"]},
             {"semester_code": "262", "courses": ["RQ2004", "RQ2003"]},
             {"semester_code": "271", "courses": ["EL3001"]}]
    assert ("RQ2004: can 28 TC tich luy den het ky hoc (khong tinh mon nay), moi co 21"
            in validate_plan(fx, scenario(), short))
