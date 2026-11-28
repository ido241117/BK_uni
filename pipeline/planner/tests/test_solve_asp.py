"""Engine ASP qua adapter solve_asp.py. Dap an tinh tay, ghi ly do canh tung test.

Fixture nho ``small()``: 14-21 TC/ky chinh (its own curriculum bounds), 7 mon 7 TC.
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
from planner.model.input import INSTANCES, KHMT, load_fixture
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


def hcmut_policy(*names: str) -> dict:
    """Policy documents of instances/hcmut, as ``to_planner_fixture`` puts them in ``fixture["policy"]``."""
    files = {"grading": "policy/grading.json", "tuition": "policy/tuition.json",
             "external": "policy/external.json", "graduation": "curricula/CS-2023-KHMT/graduation.json"}
    return {n: json.loads((INSTANCES / "hcmut" / files[n]).read_text(encoding="utf-8")) for n in names}


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

def test_facts_are_deterministic_prior_is_a_prerequisite_recommended_soft():
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
    assert 'prereq("RQ2004", "RQ1002").' in facts  # "prior" is a prerequisite (28/11)
    assert 'prereq("EL3001"' not in facts
    assert 'recommended("EL3001", "RQ1001").' in facts  # soft prerequisite, goal S6 (D1)
    # total_degree tu cac khoi: 28 bat buoc + 7 tu chon.
    assert "map(l, total_degree, 35)." in facts
    # Loads from the input (D2): no hard school minimum, the soft one per regular term (D3).
    assert "load_bound(regular, 0, 21)." in facts and "soft_min(4, 14)." in facts
    assert "fills_next" not in facts and "gap" not in facts  # removed (D6)


def test_recommended_relation_is_kept_when_possible_and_reported_when_broken():
    # EL3001 recommended after RQ1001. EL3001 locked into 262: RQ1001 goes to 261, kept.
    # EL3001 locked into 261 and RQ1001 into 262: it must break, and it is reported.
    fx = small()
    fx["course_relations"] = [{"course_code": "EL3001", "related_course_code": "RQ1001", "type": "recommended"}]
    kept = solve(fx, scenario(locked=[{"course_code": "EL3001", "semester_code": "262"}]))
    assert plan_map(kept)["RQ1001"] == "261" and kept["engine_report"]["recommendations_broken"] == []
    broken = solve(fx, scenario(locked=[{"course_code": "EL3001", "semester_code": "261"},
                                        {"course_code": "RQ1001", "semester_code": "262"}]))
    assert broken["status"] == "OPTIMAL"
    assert broken["engine_report"]["recommendations_broken"] == [{"course": "EL3001", "before": "RQ1001"}]


# --- Lo trinh co ban -----------------------------------------------------------------

def test_small_base_plan():
    r = solve(small())
    assert r["status"] == "OPTIMAL"
    assert r["graduation_semester"] == "262"
    assert [s["credits"] for s in r["semesters"]] == [21, 14]
    assert r["solver"] == "clingo"
    levels = [o["level"] for o in r["engine_report"]["objective"]]
    assert levels[0] == "S1"  # earliest graduation first, as in CP-SAT (facts.preference_order)


def test_prerequisite_order_is_respected():
    fx = small()
    fx["course_relations"] = [{"course_code": "RQ2003", "related_course_code": "RQ1001",
                               "type": "prerequisite"}]
    plan = plan_map(solve(fx))
    assert plan["RQ1001"] < plan["RQ2003"]


# --- Empty term and skipped term ------------------------------------------------------
# Lock RQ2004 into 271 and close every course in 262: 262 must stay empty, between 261 and
# 271. Plan 261 + 271, graduation 271. There is no gap goal any more (D6); the empty regular
# term before the last used one only counts in the soft minimum S11 (deficit 14), as in CP-SAT.

def gap_scenario(**extra) -> dict:
    blocked = [{"course_code": c, "semester_code": "262"} for c in REQUIRED + ELECTIVES]
    return scenario(locked=[{"course_code": "RQ2004", "semester_code": "271"}], not_offered=blocked, **extra)


def test_forced_empty_term_is_allowed():
    r = solve(small(), gap_scenario())
    assert r["status"] == "OPTIMAL"
    assert r["graduation_semester"] == "271"
    assert "262" not in plan_map(r).values()
    assert r["engine_report"]["load_deficits"] == {"262": 14}


def test_skip_semester_keeps_the_term_empty():
    r = solve(small(), scenario(skip_semesters=["261"]))
    assert r["status"] == "OPTIMAL"
    assert "261" not in plan_map(r).values()
    assert r["graduation_semester"] == "271"  # 35 TC in 262 + 271 (21 + 14)


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
    fx["policy"] = hcmut_policy("grading", "graduation")
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
    assert any("MT" in w and "grading policy" in w for w in r["warnings"])


def test_without_grading_policy_scores_are_not_used():
    # Web input has no policy: statuses decide (RQ1001 passed, RQ1002 failed; RQ2003 not started
    # in the database, so its failing file score is not read either) and no GPA is computed.
    fx = scored()
    del fx["policy"]
    r = solve(fx)
    assert "RQ1002" in plan_map(r) and "RQ1001" not in plan_map(r)
    assert r["engine_report"]["gpa"] == {}
    assert any("No grading policy" in w for w in r["warnings"])


# Diem chu suy tu diem he 10 (grade_min_score, compiled from grading.json): file khong co diem chu, hoac
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

    def with_retake(fixture, sc, previous_plan=None):
        facts, ctx = original(fixture, sc, previous_plan)
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


# Full student record (D8): grades per attempt, retakes, GPA.
# RQ1001: F in 251, retaken in 252 with A, capped to B (retake_grade_cap). RQ1002: B+ in 252.
# Latest attempts: B (3.0) and B+ (3.5), 7 TC each -> GPA 4 = 3.25. Score scale (band
# midpoints, half-up to 2 decimals): B = 7.50, B+ = 8.25 -> (750*7 + 825*7) / 14 = 787.5 ->
# rounded half-up 788 -> 7.88. Both courses passed, so neither is planned.

def test_attempts_give_retakes_and_gpa():
    fx = small()
    fx["policy"] = hcmut_policy("grading", "graduation")
    fx["student"]["student_courses"] = [{"course_code": "RQ1001", "status": "completed"},
                                        {"course_code": "RQ1002", "status": "completed"}]
    fx["student"]["attempts"] = [
        {"attempt_id": "a1", "course_code": "RQ1001", "semester_code": "251", "grade": "F", "course_kind": "regular"},
        {"attempt_id": "a2", "course_code": "RQ1001", "semester_code": "252", "grade": "A", "course_kind": "regular"},
        {"attempt_id": "a3", "course_code": "RQ1002", "semester_code": "252", "grade": "B+", "course_kind": "regular"},
    ]
    facts, _ = build_program(normalize(fx), scenario())
    assert 'taken(rt("RQ1001", 1), 2).' in facts and 'attempt_count("RQ1001", 2).' in facts
    r = solve(fx)
    assert not {"RQ1001", "RQ1002"} & set(plan_map(r))
    assert r["engine_report"]["gpa"]["gpa_4"] == pytest.approx(3.25)
    assert r["engine_report"]["gpa"]["score_10"] == pytest.approx(7.88)


# --- Offering history (goal OH, D10) --------------------------------------------------------
# Term parts where each elective has run: EL3001 and EL3003 only part 2, EL3002 only part 1.
# The plan uses 261 (part 1) and 262 (part 2); one elective is needed, so a plan with no miss
# exists: EL3002 in 261, or EL3001/EL3003 in 262. OH is active only with rules.offering_soft.

def test_offering_history_places_elective_in_its_usual_part():
    fx = small()
    fx["rules"] = {"offering_soft": True}
    fx["offering_history"] = {"EL3001": ["2"], "EL3002": ["1"], "EL3003": ["2"]}
    r = solve(fx)
    chosen = [(c, s) for c, s in plan_map(r).items() if c in ELECTIVES]
    assert chosen in ([("EL3002", "261")], [("EL3001", "262")], [("EL3003", "262")])
    assert r["engine_report"]["offering_misses"] == []
    facts, _ = build_program(normalize(fx), scenario())
    assert 'oh_pair("EL3002", 5).' in facts and 'oh_pair("EL3001", 4).' in facts


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

def conditions_small() -> dict:
    fx = small()
    fx["conditions"] = ["ENG_GC", "SA4001"]
    fx["courses"] += [{"code": "ENG_GC", "name": "ENG", "credits": 0}, {"code": "SA4001", "name": "SA", "credits": 0}]
    fx["curriculum_courses"] += [{"course_code": "ENG_GC"}, {"course_code": "SA4001"}]
    fx["course_groups"][0]["members"] += ["ENG_GC", "SA4001"]
    fx["student"]["graduation_conditions"] = [{"code": "ENG_GC_600", "passed": True},
                                              {"code": "SA4001", "passed": False}]
    return fx


def test_graduation_conditions_become_external_requirements():
    # Without an external policy (web input) each condition course is its own requirement.
    r = solve(conditions_small())
    assert r["engine_report"]["graduation_blocked"] == ["SA4001"]
    assert "ENG_GC" not in plan_map(r) and "SA4001" not in plan_map(r)


def test_external_policy_covers_conditions_and_reads_progress():
    # policy/external.json (cohort 2025: every requirement applies). ENG_GC passed -> english_graduation
    # met; SA4001 not -> student_activities blocked; social work: 15 days at graduation, 9 recorded.
    fx = conditions_small()
    fx["policy"] = hcmut_policy("external")
    fx["student"]["external_progress"] = [{"requirement": "social_work_days", "semester_code": "251", "amount": 5},
                                          {"requirement": "social_work_days", "semester_code": "252", "amount": 4}]
    facts, _ = build_program(normalize(fx), scenario())
    assert 'external_progress("social_work_days", 1, 5).' in facts
    assert 'external_progress("english_graduation", 2, 1).' in facts
    r = solve(fx)
    blocked = r["engine_report"]["graduation_blocked"]
    assert "student_activities" in blocked and "social_work_days" in blocked
    assert "english_graduation" not in blocked and "SA4001" not in blocked


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


# --- Tuition (goal FEE) ---------------------------------------------------------------------
# hcmut tuition.json, program "Computer Science": a regular term of 13-18 TC costs 13.750
# million; 19+ TC cost 13.750 + 0.805 per credit above 18. Plan 261 = 21 TC, 262 = 14 TC:
# 13750 + 805 * 3 = 16165 and 13750 (thousandths of a million).

def test_tuition_is_computed_from_the_policy():
    fx = small()
    fx["curriculum"]["program"] = "Computer Science"
    fx["policy"] = hcmut_policy("tuition")
    r = solve(fx)
    assert r["engine_report"]["fees"] == {"261": 16165, "262": 13750}
    assert "FEE" in [o["level"] for o in r["engine_report"]["objective"]]


def test_without_tuition_policy_still_plans():
    r = solve(small())
    assert r["status"] == "OPTIMAL" and r["graduation_semester"] == "262"
    assert r["engine_report"]["fees"] == {}
    assert "FEE" not in [o["level"] for o in r["engine_report"]["objective"]]


# --- Loads come from the input (D2) ---------------------------------------------------------

def test_load_bounds_come_from_the_input():
    # Max 35 TC per term: every course fits in 261.
    fx = small()
    fx["curriculum"]["max_semester_credits"] = 35
    r = solve(fx)
    assert r["graduation_semester"] == "261"
    assert [s["credits"] for s in r["semesters"]] == [35]


# --- Chuong trinh that (KHMT 2023, 96 mon) va gioi han thoi gian ---------------------------

@pytest.fixture(scope="module")
def khmt():
    return load_fixture(KHMT)


def test_khmt_real_size_is_valid_and_graduates_with_cpsat(khmt, monkeypatch):
    # 1 thread, 30 s. Since the engine plans under the input's 11-25 TC with a soft minimum and the
    # shared goals (docs/PLANNER-PARITY.md), it no longer proves optimality on KHMT in
    # 30 s (measured 2026-11-28: not proven after 180 s, the shared goal values equal CP-SAT's
    # optimum). Checked here: a valid plan, the same graduation term as CP-SAT (262; the thesis
    # threshold counts its own term, D4).
    import planner.solvers.asp.adapter as adapter

    monkeypatch.setattr(adapter, "THREADS", 1)
    sc = copy.deepcopy(khmt["scenarios"][0])
    start = time.perf_counter()
    r = solve_asp(khmt, sc, None, 30.0)
    assert time.perf_counter() - start < 45  # grounding + the soft time limit
    assert r["status"] in ("OPTIMAL", "SAT_NOT_PROVEN_OPTIMAL")
    assert validate_plan(khmt, sc, r["semesters"]) == []
    assert r["graduation_semester"] == "262"


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
