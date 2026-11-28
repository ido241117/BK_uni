"""Solver parity (docs/PLANNER-PARITY.md): one input, one rule set, the same goals for every solver.

Each test states its expected answer and how it was computed.
"""

from __future__ import annotations

import copy
import json

import pytest

from evaluation.validate import validate_plan
from instances.loader import load_university
from planner.model.facts import FixtureError
from planner.model.input import INSTANCES, TOY, load_fixture, to_planner_fixture, university_policy
from planner.model.normalize import normalize
from planner.model.report import objective
from planner.model.result import plan_map
from planner.solvers.asp.adapter import solve_asp
from planner.solvers.asp.policy import compile_policy
from planner.solvers.cpsat import solve_cpsat

SOLVERS = {"asp": lambda fx, sc: solve_asp(fx, sc, None, 30.0, threads=1),
           "cpsat": lambda fx, sc: solve_cpsat(fx, sc, None, 30.0)}


def hcmut(name: str) -> dict:
    return json.loads((INSTANCES / "hcmut" / name).read_text(encoding="utf-8"))


# --- Policy compiler (D2, D11) ----------------------------------------------------------------
# Known answer: the facts of the former hand-maintained policy.lp (git history, 2026-11-28), which
# the compiler reproduced exactly apart from the load bounds (now from the input) and the external
# requirements (now policy/external.json).

def test_policy_compiler_reproduces_the_former_policy_lp():
    policy = {"grading": hcmut("policy/grading.json"), "tuition": hcmut("policy/tuition.json"),
              "graduation": hcmut("curricula/CS-2023-KHMT/graduation.json")}
    text, warnings = compile_policy(policy, "Computer Science", 2023)
    facts = set(text.split("\n"))
    assert warnings == []
    expected = {
        "scale(gpa_4, 0, 400).", "scale(score_10, 0, 1000).", "default_scale(gpa_4).",
        "grade_min_score(score_10, a_plus, 950).", "grade_min_score(score_10, d, 400).",
        "grade_min_score(score_10, f, 0).", "grade_points(gpa_4, b_plus, 350).",
        "grade_points(score_10, a, 900).",          # (8.5 + 9.49) / 2 = 8.995 -> 9.00 half-up
        "grade_points(score_10, a_plus, 975).", "grade_passing(d).", "grade_rank(f, 8).",
        "retake_grade_cap(b).", "gpa_attempt_selection(latest).", "min_gpa(gpa_4, 250).",
        "fee_rule(regular, 0, 6, 7563, 0, 0).",       # 13.75 * (1 - 0.45) = 7.5625 -> 7.563
        "fee_rule(regular, 19, 999, 13750, 805, 18).", "fee_rule(summer, 0, 999, 0, 1230, 0).",
        "term_part_type(3, summer).", "extra_semester_type(summer).",
    }
    assert expected <= facts
    assert not [f for f in facts if f.startswith(("#const", "load_bound", "external_"))]
    assert "grade_passing(f)." not in facts


def test_external_requirements_follow_the_cohort():
    ext = {"external": hcmut("policy/external.json")}
    old, _ = compile_policy(ext, None, 2019)
    new, _ = compile_policy(ext, None, 2023)
    assert 'external_requirement("mos", certificate, cumulative, blocking).' in new
    assert '"mos"' not in old and '"english_graduation"' not in old   # from 2021 and 2020 on
    assert 'external_milestone("physical_education", end_of_year, 2, 2).' in new


# --- Capabilities (D9) ------------------------------------------------------------------------

def test_unsupported_input_is_warned_or_rejected():
    toy = load_fixture(TOY)
    sc = dict(toy["scenarios"][0], interests=["AI"])
    r = solve_cpsat(toy, sc)
    assert any("cp-sat ignores the input field interests" in w for w in r["warnings"])
    with pytest.raises(FixtureError, match="cp-sat does not support: interests"):
        solve_cpsat(toy, sc, strict=True)
    sc = dict(toy["scenarios"][0], frozen_semesters=["262"])
    r = solve_asp(toy, sc, threads=1)
    assert any("asp ignores the input field frozen_semesters" in w for w in r["warnings"])
    with pytest.raises(FixtureError, match="asp does not support: frozen_semesters"):
        solve_asp(toy, sc, threads=1, strict=True)


def test_the_goals_used_are_stated():
    toy = load_fixture(TOY)
    r = solve_cpsat(toy, toy["scenarios"][0])
    note = next(a for a in r["assumptions"] if a.startswith("Goals used by cp-sat"))
    assert note.startswith("Goals used by cp-sat, highest priority first: S1, S6")
    assert "not implemented: RT, FEE, LO, TA" in note


# --- Same plans quality on the toy requests (D2-D7) -----------------------------------------
# Every toy request: same status, same graduation term, the same values of the shared goals
# (report.objective), and both plans pass the validator.

@pytest.mark.parametrize("scenario_id", ["base", "lock-electives", "fail-cs201", "cs302-not-offered",
                                         "lock-impossible"])
def test_both_solvers_agree_on_the_toy_requests(scenario_id):
    toy = load_fixture(TOY)
    sc = next(s for s in toy["scenarios"] if s["id"] == scenario_id)
    results = {name: run(toy, sc) for name, run in SOLVERS.items()}
    assert results["asp"]["status"] == results["cpsat"]["status"]
    assert results["asp"]["graduation_semester"] == results["cpsat"]["graduation_semester"]
    norm = normalize(toy)
    values = []
    for r in results.values():
        if r["semesters"]:  # an UNSAT request has no plan to check
            assert validate_plan(norm, sc, r["semesters"]) == []
        values.append(objective(norm, sc, plan_map(r)) if r["semesters"] else None)
    assert values[0] == values[1]


# --- Course level by accumulated credits (D6, rules.year_by_credits) -------------------------
# Four 7-credit courses, levels 1, 1, 2, 3; at most 14 TC a term; thresholds: year 2 from 14 TC,
# year 3 from 21 TC. RQ2003 needs 14 TC before its term -> not 261 -> 262 (after RQ1001 + RQ1002
# in 261). RQ3004 needs 21 TC before -> 271. Graduation 271 (262 without the rule).

def levels() -> dict:
    codes = {"RQ1001": 7, "RQ1002": 7, "RQ2003": 7, "RQ3004": 7}
    return {
        "curriculum": {"code": "LV", "name": "Levels", "cohort": 2025, "duration_years": 4,
                       "min_semester_credits": 0, "max_semester_credits": 14},
        "rules": {"course_level": True, "year_by_credits": [14, 21]},
        "semesters": ["251", "252", "261", "262", "271", "272"],
        "courses": [{"code": c, "name": c, "credits": k} for c, k in codes.items()],
        "curriculum_courses": [{"course_code": c} for c in codes],
        "course_relations": [],
        "course_groups": [{"name": "Required", "kind": "required", "required_count": None,
                           "required_credits": None, "members": list(codes)}],
        "offerings": {"unknown_policy": "assume-open", "records": []},
        "student": {"current_semester": "252", "student_courses": []},
    }


@pytest.mark.parametrize("name", list(SOLVERS))
def test_level_by_credits_is_the_same_rule_everywhere(name):
    fx, sc = levels(), {"id": "t", "in_progress_results": {}}
    r = SOLVERS[name](fx, sc)
    assert validate_plan(fx, sc, r["semesters"]) == []
    assert r["graduation_semester"] == "271"
    assert plan_map(r)["RQ2003"] == "262" and plan_map(r)["RQ3004"] == "271"
    free = levels()
    free["rules"] = {}
    assert SOLVERS[name](free, sc)["graduation_semester"] == "262"


def test_validator_checks_level_by_credits():
    fx, sc = levels(), {"id": "t", "in_progress_results": {}}
    early = [{"semester_code": "261", "courses": ["RQ1001", "RQ1002"]},
             {"semester_code": "262", "courses": ["RQ2003", "RQ3004"]}]
    assert validate_plan(fx, sc, early) == ["RQ3004: level 3 needs 21 accumulated credits before term 262, has 14"]


# --- GPA from the full record (D8): the oracle answers ----------------------------------------
# instances/hcmut/students/khmt2023-oracle.json holds hand-computed CGPAs (``expected``), formerly
# checked by data_tools. The engine computes the GPA from the record in the planner input.

def test_engine_gpa_matches_the_oracle():
    uni = load_university(INSTANCES / "hcmut")
    doc = uni.students["khmt2023-oracle"]
    for e in doc["expected"]:
        d = copy.deepcopy(doc)
        next(s for s in d["students"] if s["student_id"] == e["student_id"])["current_term"] = e["as_of_term"]
        fx = to_planner_fixture(uni.curricula["CS-2023-KHMT"]["curriculum"], d, e["student_id"],
                                [{"id": "gpa", "in_progress_results": {}}], university_policy(uni, "CS-2023-KHMT"))
        # GPA depends on the history only: keep just the attempted courses as one mandatory group,
        # so the plan (failed courses retaken) is found at once instead of planning the whole program.
        taken = sorted({a["course_code"] for a in fx["student"]["attempts"]})
        fx["course_groups"] = [{"name": "Attempted", "kind": "required", "required_count": None,
                                "required_credits": None, "members": taken}]
        fx["curriculum_courses"] = [cc for cc in fx["curriculum_courses"] if cc["course_code"] in taken]
        fx["course_relations"] = [r for r in fx["course_relations"]
                                  if r["course_code"] in taken and r["related_course_code"] in taken]
        fx["graduation_courses"] = {}
        r = solve_asp(fx, fx["scenarios"][0], None, 10.0, threads=1)
        assert r["engine_report"]["gpa"]["gpa_4"] == pytest.approx(float(e["cgpa"])), e["student_id"]


# --- A 0-credit course is an external requirement, never planned (2026-11-28) ---------------
# toy course MA101 set to 0 credits without being listed in ``conditions`` (web-style input):
# normalize makes it a condition, so neither solver plans it and the validator does not ask for it.

@pytest.mark.parametrize("name", list(SOLVERS))
def test_zero_credit_course_is_never_planned(name):
    toy = copy.deepcopy(load_fixture(TOY))
    code = next(c for c in toy["course_groups"][0]["members"])
    next(c for c in toy["courses"] if c["code"] == code)["credits"] = 0
    toy["student"]["student_courses"] = [sc for sc in toy["student"]["student_courses"] if sc["course_code"] != code]
    norm = normalize(toy)
    assert code in norm["conditions"] and code not in {cc["course_code"] for cc in norm["curriculum_courses"]}
    sc = toy["scenarios"][0]
    r = SOLVERS[name](toy, sc)
    assert code not in plan_map(r)
    assert validate_plan(toy, sc, r["semesters"]) == []


def test_loader_rejects_a_zero_credit_course_that_is_not_a_condition(tmp_path):
    import shutil
    from instances.loader import InstanceError
    dst = tmp_path / "toy"
    shutil.copytree(INSTANCES / "toy", dst)
    path = dst / "curricula" / "TOY-2025" / "curriculum.json"
    cur = json.loads(path.read_text(encoding="utf-8"))
    cur["courses"][0]["credits"] = 0
    path.write_text(json.dumps(cur), encoding="utf-8")
    with pytest.raises(InstanceError, match="0-credit course is an external requirement"):
        load_university(dst)


def test_pin_report_counts_the_threshold_like_the_solvers():
    # K6 setup (thesis CS401 needs 31 TC). Pinned in 271 with the other courses of 271, it meets the
    # threshold under D4 counting, so the request report must not flag the pin (it did with the
    # former "before the term" counting: at most 28 TC before 271).
    toy = copy.deepcopy(load_fixture(TOY))
    toy["graduation_courses"] = {"thesis": "CS401"}
    toy["rules"] = {"graduation_thresholds": {"thesis": 0.85}}
    sc = dict(next(s for s in toy["scenarios"] if s["id"] == "base"),
              locked=[{"course_code": "CS401", "semester_code": "271"}])
    r = solve_cpsat(toy, sc)
    assert r["requests"] == [{"kind": "pin", "item": "CS401 → 271", "status": "met", "detail": "giữ đúng chỗ ghim"}]


# --- "prior" is a prerequisite (decision of 28/11/2026) -----------------------------------
# levels() without the level rule plans RQ1001 + RQ1002 in 261 and RQ2003 + RQ3004 in 262. With
# "RQ1001 prior to RQ1002", RQ1002 must follow RQ1001: 261 RQ1001 + one more, 262 RQ1002 + one
# more: still 262, RQ1002 after RQ1001; the validator rejects RQ1002 next to RQ1001.

@pytest.mark.parametrize("name", list(SOLVERS))
def test_prior_relation_is_a_prerequisite(name):
    fx, sc = levels(), {"id": "t", "in_progress_results": {}}
    fx["rules"] = {}
    fx["course_relations"] = [{"course_code": "RQ1002", "related_course_code": "RQ1001", "type": "prior"}]
    r = SOLVERS[name](fx, sc)
    plan = plan_map(r)
    assert plan["RQ1001"] < plan["RQ1002"] and r["graduation_semester"] == "262"
    assert validate_plan(fx, sc, r["semesters"]) == []
    same = [{"semester_code": "261", "courses": ["RQ1001", "RQ1002"]},
            {"semester_code": "262", "courses": ["RQ2003", "RQ3004"]}]
    assert "RQ1002: chua dat tien quyet RQ1001" in validate_plan(fx, sc, same)
