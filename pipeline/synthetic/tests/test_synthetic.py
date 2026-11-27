"""Tests for the open-loop synthetic pipeline (the solver tests call the ASP engine)."""

from __future__ import annotations

import copy

import numpy as np
import pandas as pd
import pytest

from synthetic import grades as G
from synthetic import regulations as R
from synthetic.agent import options, utility
from synthetic.checks import crn_problems, predictive_summary, record_problems
from synthetic.curriculum import Curriculum, base_values, load_config
from synthetic.evaluate import first_attempt_grades, plan_metrics, record_plan
from synthetic.plans import (allpass_plan, baseline_spec, canonical, elective_order,
                             internship_allowed, last_free_index, load_official, official_spec,
                             plan_completes, plan_errors, spec_plan)
from synthetic.population import Student, interest_weights, latin_hypercube, sample_students
from synthetic.recovery import fit
from synthetic.run import make_students, param_ranges, run_records
from synthetic.sensitivity import src
from synthetic.simulate import Context, State


@pytest.fixture(scope="module")
def cfg():
    return load_config()


@pytest.fixture(scope="module")
def cur(cfg):
    return Curriculum(cfg)


@pytest.fixture(scope="module")
def students(cfg, cur):
    return make_students(cfg, 15, 3, cur)


@pytest.fixture(scope="module")
def records(cfg, students):
    return run_records(cfg, students, 3)


def reasons(**kw):
    base = dict(registered_credits=16, failed_credits=0, outstanding_credits=0,
                semester_gpa=3.0, first_semester=False, cpa=3.0, accumulated_credits=40)
    base.update(kw)
    return R.warning_reasons(**base)


# --- Dieu 37.1 thresholds ----------------------------------------------------

def test_failed_share_is_strictly_above_half():
    assert reasons(registered_credits=16, failed_credits=8) == []
    assert reasons(registered_credits=16, failed_credits=9) == ["failed>50%"]


def test_outstanding_strictly_above_24():
    assert reasons(outstanding_credits=24) == []
    assert reasons(outstanding_credits=25) == ["outstanding>24"]


def test_semester_gpa_first_vs_later():
    assert reasons(semester_gpa=0.9, first_semester=True) == []
    assert reasons(semester_gpa=0.9) == ["semester_gpa<1.0"]
    assert reasons(semester_gpa=0.79, first_semester=True) == ["semester_gpa<0.8"]


@pytest.mark.parametrize("credits,limit", [(0, 1.2), (32, 1.2), (33, 1.4), (66, 1.6), (99, 1.8), (200, 1.8)])
def test_cpa_threshold_by_year_level(credits, limit):
    assert reasons(cpa=limit, accumulated_credits=credits) == []
    assert reasons(cpa=limit - 0.01, accumulated_credits=credits) == [f"cpa<{limit}"]


# --- Dieu 37.2 / 37.3 / QD1260 -----------------------------------------------

def test_withdrawal_after_third_consecutive_warning():
    s = R.Standing()
    assert s.close_main_semester("231", ["x"], False) is None
    assert s.close_main_semester("232", ["x"], False) is None
    assert s.close_main_semester("241", ["x"], False) == "warned>2_consecutive"


def test_clean_semester_resets_warning_streak():
    s = R.Standing()
    for sem, w in [("231", ["x"]), ("232", ["x"]), ("241", []), ("242", ["x"]), ("251", ["x"])]:
        assert s.close_main_semester(sem, w, False) is None


def test_max_duration_counts_suspensions_and_internship_semesters():
    s = R.Standing()
    for i in range(9):
        assert s.close_main_semester(str(i), [], False) is None
    assert s.internship_semester() is None
    assert s.close_main_semester("x", [], True) is None
    assert s.suspended_next
    assert s.serve_suspension() == "max_duration"


def test_internship_semester_keeps_warning_streak():
    s = R.Standing()
    s.close_main_semester("231", ["x"], False)
    s.close_main_semester("232", ["x"], False)
    s.internship_semester()
    assert s.close_main_semester("241", ["x"], False) == "warned>2_consecutive"


# --- grades -------------------------------------------------------------------

def test_noise_is_keyed_and_reproducible():
    assert G.noise(1, 2, 3, 1) == G.noise(1, 2, 3, 1)
    assert G.noise(1, 2, 3, 1) != G.noise(1, 2, 3, 2)


def test_scores_are_clipped_and_rounded(cfg):
    p = base_values(cfg["grades"])
    assert G.draw_score(p, 5.0, -3.0, 1, 1, 3.0) == 10.0
    assert G.draw_score(p, -5.0, 3.0, 1, 1, -3.0) == 0.0
    s = G.draw_score(p, 0.1, 0.2, 1, 1, 0.37)
    assert abs(s * 10 - round(s * 10)) < 1e-9


def test_fail_probability_matches_simulation(cfg):
    p = base_values(cfg["grades"])
    z = np.random.default_rng(0).standard_normal(200_000)
    exp = G.expected_score(p, -0.5, 0.3, 1, 1)
    emp = float(((exp + p["noise_sd"] * z) < G.PASS_SCORE).mean())
    assert abs(emp - G.fail_probability(p, -0.5, 0.3, 1, 1)) < 0.005


def test_predictive_summary_matches_analytic(cfg):
    s = predictive_summary(cfg, 3000, 1)
    p = base_values(cfg["grades"])
    sd = np.sqrt(p["discrimination"] ** 2 * (1 + p["difficulty_sd"] ** 2) + p["noise_sd"] ** 2)
    assert abs(s["score_mean"] - p["mu"]) < 0.15
    assert abs(s["score_sd"] - sd) < 0.15   # clipping shrinks it slightly


def test_fees_follow_policy(cur):
    assert cur.fee(0, False) == 0.0
    assert cur.fee(16, False) == pytest.approx(13.75)
    assert cur.fee(20, False) == pytest.approx(13.75 + 2 * 0.805)
    assert cur.fee(4, True) == pytest.approx(4 * 1.23)


# --- step 0: official plan ------------------------------------------------------

def test_official_plan_matches_fixture_and_is_legal():
    from synthetic.official_plan import check
    assert check() == []


def test_official_plan_check_catches_a_misplaced_course(monkeypatch):
    import synthetic.plans as P
    from synthetic.official_plan import check
    orig = P.load_official

    def moved(cfg):
        o = copy.deepcopy(orig(cfg))
        o["semesters"][5]["required"].remove("CO3005")
        o["semesters"][4]["required"].append("CO3005")
        return o
    monkeypatch.setattr(P, "load_official", moved)
    problems = check()
    assert "CO3005: semester 5 in the PDF, 6 in the fixture" in problems
    assert "semester 5: 20 credits, PDF 16" in problems


def test_internship_threshold_counts_its_own_term(cfg, cur):
    # Official plan: 82 credits before semester 6, 82 + 13 with semester 6 (CO3335 excluded).
    stu = Student(0, 0.0, "TTNT", (15, 18), 0.0, 0.0, False)
    order = {cur.elective_group_key(g): list(g["members"]) for g in cur.groups("TTNT")
             if cur.elective_group_key(g)}
    plan = spec_plan(cur, official_spec(cur, load_official(cfg), order))
    assert plan_errors(cur, stu, plan) == []
    plan["252"] = ["CO3335"]          # semester 6 holds only the internship: 82 < 84
    assert any(e.startswith("CO3335: can 84") for e in plan_errors(cur, stu, plan))


# --- step 1: population ---------------------------------------------------------

def test_interests_follow_the_specialization(cfg, cur, students):
    for s in students:
        w = interest_weights(cur, s.specialization)
        assert 1 <= len(s.interests) <= 3
        assert all(w.get(t, 0) > 0 for t in s.interests)


def test_latin_hypercube_has_one_draw_per_stratum():
    x = latin_hypercube(50, [(0.0, 1.0), (2.0, 4.0)], seed=1)
    assert sorted(np.floor(x[:, 0] * 50).astype(int)) == list(range(50))
    assert sorted(np.floor((x[:, 1] - 2) / 2 * 50).astype(int)) == list(range(50))


def test_per_student_params_leave_the_draws_unchanged(cfg, cur):
    pop = base_values(cfg["population"])
    a = sample_students(30, pop, 5, cur)
    b = sample_students(30, pop, 5, cur, param_ranges(cfg))
    assert [s.theta for s in a] == [s.theta for s in b]
    assert [s.early_pref for s in a] == [s.early_pref for s in b]
    assert [s.interests for s in a] == [s.interests for s in b]
    for s in b:
        assert s.summer_opt_in == (s.early_pref > s.params["summer_threshold"])
        for k, (lo, hi) in param_ranges(cfg).items():
            assert lo <= s.params[k] <= hi


# --- step 2: agent and records ---------------------------------------------------

def test_utility_known_answer(cfg, cur):
    ctx = Context(cfg, cur, 1)
    stu = Student(0, 0.0, "TTNT", (15, 18), 0.6, 0.4, False)
    a = {**ctx.agent, "w_risk": 0.0}
    bundle = ["CO1005", "CO1023", "LA1003", "MT1003", "PH1003"]     # 16 credits, main semester
    u = utility(ctx, stu, a, ctx.grades, {}, State(current="223"), "231", bundle)
    # -0.5*|16-16.5|/3 - 0.5*0.4*13.75/13.75 + 0.5*0.6*16/3
    assert u == pytest.approx(-0.5 * 0.5 / 3 - 0.2 + 1.6)


def test_main_semester_options_are_never_empty(cfg, cur, students):
    ctx = Context(cfg, cur, 3)
    off = load_official(cfg)
    for s in students[:5]:
        ps = official_spec(cur, off, elective_order(cur, s, 3))
        opts = options(ctx, ps, State(current="223"), s, "231", 1, ctx.params(s)[2])
        assert opts and all(b for _, b in opts)
        assert opts[0][0] == "plan"
        assert len({tuple(sorted(b)) for _, b in opts}) == len(opts)


def test_internship_only_before_a_summer_within_the_plan(cur):
    assert internship_allowed(cur, "252", ["CO3335", "CO4029"], 6)        # next is summer 253
    assert not internship_allowed(cur, "261", ["CO3335", "CO4029"], 7)    # next is 262
    assert internship_allowed(cur, "271", ["CO3335", "CO4029"], 9)        # past semester 8
    assert internship_allowed(cur, "261", ["CO3335"], 7)                  # last course left


def test_records_are_deterministic(cfg, students, records):
    again = run_records(cfg, students, 3)
    assert records[0].equals(again[0])
    assert records[2].equals(again[2])


def test_every_registration_is_legal(cur, students, records):
    o, _, tx = records
    assert record_problems(cur, students, o, tx) == []


def test_legality_check_catches_an_illegal_registration(cur, students, records):
    o, _, tx = records
    sid = int(tx["student"].iloc[0])
    bad = pd.concat([tx, pd.DataFrame([{"student": sid, "semester": "231", "course": "CO4337",
                                        "credits": 4, "attempt": 1, "score": 9.0, "passed": True,
                                        "year": 1}])], ignore_index=True)
    assert any(p.startswith(f"student {sid} 231: CO4337") for p in record_problems(cur, students, o, bad))


def test_term_after_internship_is_empty(cur, records):
    _, sems, tx = records
    for sid, g in tx.groupby("student"):
        for sem in g.loc[g["course"].isin(cur.internships), "semester"]:
            assert cur.next_term(sem) not in set(g["semester"]), (sid, sem)


def test_withdrawals_have_a_rule_reason(records):
    o = records[0]
    w = o[o["status"] == "withdrawn"]
    assert set(w["reason"]) <= {"warned>2_consecutive", "suspended>2_consecutive",
                                "max_duration", "no_registration"}
    assert (o.loc[o["status"] == "graduated", "credits_passed"] >= 128).all()


def test_first_attempt_scores_reuse_the_record_draws(cfg, cur, students, records):
    ctx = Context(cfg, cur, 3)
    _, _, tx = records
    assert crn_problems(ctx, students, tx) == []
    bad = tx.copy()
    bad.loc[bad.index[0], "score"] += 0.1
    assert crn_problems(ctx, students, bad)


# --- plans and evaluation ---------------------------------------------------------

def test_canonical_names_free_electives_in_term_order():
    plan = {"242": ["FREE_6_2", "CO1"], "231": ["FREE_6_1"], "243": []}
    assert canonical(plan) == {"231": ["ELECTIVE_1"], "242": ["CO1", "ELECTIVE_2"]}
    assert canonical(plan, last_free_index({"ELECTIVE_2", "X"})) == \
        {"231": ["ELECTIVE_3"], "242": ["CO1", "ELECTIVE_4"]}


def test_official_and_baseline_plans_graduate_in_8(cfg, cur, students):
    ctx = Context(cfg, cur, 3)
    off = load_official(cfg)
    for s in students[:4]:
        order = elective_order(cur, s, 3)
        for plan in (spec_plan(cur, official_spec(cur, off, order)),
                     allpass_plan(cur, s, baseline_spec(cur, s.specialization, order))):
            m = plan_metrics(ctx, s, plan)
            assert m["legal"] and m["complete"], m["errors"]
            assert m["grad_k"] == 8 and m["credits"] == 128 and m["summers"] == 0


def test_first_attempt_grades_of_the_record_plan(cfg, cur, students, records):
    ctx = Context(cfg, cur, 3)
    _, _, tx = records
    s = students[0]
    g = tx[tx["student"] == s.id]
    first = g[g["attempt"] == 1]
    m = first_attempt_grades(ctx, s, record_plan(g))
    assert m["failed_credits"] == first.loc[~first["passed"], "credits"].sum()


def test_allpass_plan_from_a_cut_state_completes(cfg, cur, students, records):
    _, _, tx = records
    s = students[1]
    g = tx[(tx["student"] == s.id) & (tx["semester"] <= "241")]
    passed = set(g.loc[g["passed"], "course"])
    failed = set(g.loc[~g["passed"] & ~g["course"].str.startswith("ELECTIVE_"), "course"]) - passed
    order = elective_order(cur, s, 3)
    plan = allpass_plan(cur, s, official_spec(cur, load_official(cfg), order), passed, failed, "241", 3)
    assert plan_completes(cur, s, plan, passed)
    assert plan_errors(cur, s, plan, passed, failed, "241") == []


# --- step 3: solver and cuts ---------------------------------------------------------

def test_cut_selection_matches_the_shares(cfg, cur, students, records):
    from synthetic.solve import select_cuts
    o, s, tx = records
    c = copy.deepcopy(cfg)
    c["cuts"].update(n=20, shares={"1": 0.5, "2": 0.25, "3": 0.25})
    cuts = select_cuts(cur, c, students, o, s, tx, 3)
    assert cuts["k"].value_counts().to_dict() == {1: 10, 2: 5, 3: 5}
    assert not cuts.duplicated(["student", "k"]).any()
    for r in cuts.itertuples():     # still enrolled after semester k
        assert s.loc[s["student"] == r.student, "semester"].max() > r.current


def test_solver_is_cached_and_reproducible(cfg, cur, students, tmp_path, monkeypatch):
    import synthetic.solve as S
    monkeypatch.setattr(S, "CACHE_ROOT", tmp_path)
    c = copy.deepcopy(cfg)
    c["solver"]["name"] = "asp"
    c["solver"]["asp"].update(mode="conflicts", solve_limit=2000, time_limit=120.0)
    cases = {"a": S.solver_input(cur, c, students[0])}
    first = S.solve_all(cases, c, log=None)["a"]
    assert first["plan"] and first["stopped_by"] in ("proven", "solve_limit")
    assert first["solver"] == "asp" and first["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(list((tmp_path / "asp").glob("*.json"))) == 1
    again = S.solve_all(cases, c, log=None)["a"]
    assert again == first
    for f in (tmp_path / "asp").glob("*.json"):
        f.unlink()
    assert S.solve_all(cases, c, log=None)["a"]["plan"] == first["plan"]   # 1 thread + conflict limit


class OfficialPlanSolver:
    """A plugged-in solver for the test: returns the official plan, whatever the input."""

    name = "official-stub"

    def settings(self, s):
        return {}

    def fingerprint(self):
        return "stub-v1"

    def solve(self, fx, sc, st):
        cfg = load_config()
        cur = Curriculum(cfg)
        spec = fx["student"]["target_specialization"]
        order = {cur.elective_group_key(g): list(g["members"]) for g in cur.groups(spec)
                 if cur.elective_group_key(g)}
        from synthetic.plans import to_slots
        plan = to_slots(cur, spec, spec_plan(cur, official_spec(cur, load_official(cfg), order)))
        return {"status": "OPTIMAL", "semesters": [{"semester_code": k, "courses": v} for k, v in plan.items()],
                "graduation_semester": max(plan), "violations": [], "warnings": []}

    def stopped_by(self, r, st):
        return "proven"


def make_stub():
    return OfficialPlanSolver()


def test_a_plugged_in_solver_runs_through_steps_3_and_4(cfg, cur, students, records, tmp_path, monkeypatch):
    import synthetic.solve as S
    from synthetic.evaluate import evaluate_full
    from synthetic.solvers import get_solver, solver_label
    monkeypatch.setattr(S, "CACHE_ROOT", tmp_path)
    c = copy.deepcopy(cfg)
    c["solver"].update(name=f"{__name__}:make_stub", label="")
    assert get_solver(c["solver"]["name"]).name == "official-stub"
    assert solver_label(c) == f"{__name__}-make_stub"
    res = S.solve_all({str(s.id): S.solver_input(cur, c, s) for s in students[:3]}, c, log=None)
    assert all(r["status"] == "OPTIMAL" and r["solver"] == "official-stub" for r in res.values())
    assert len(list((tmp_path / "official-stub").glob("*.json"))) == 3
    o, _, tx = records
    ev = evaluate_full(Context(cfg, cur, 3), students[:3], load_official(cfg), res, tx, o)
    s, off = ev[ev["plan"] == "solver"], ev[ev["plan"] == "official"]
    # The stub returns the official plan (default elective order), so legality and timing match.
    assert s["legal"].all() and s["complete"].all()
    assert list(s["grad_k"]) == list(off["grad_k"]) == [8, 8, 8]
    assert list(s["credits"]) == [128, 128, 128]


def test_statuses_are_mapped_to_the_common_set():
    from synthetic.solvers import STATUS, upgrade
    assert {STATUS[k] for k in ("SAT_NOT_PROVEN_OPTIMAL", "UNSAT", "TIMEOUT", "OPTIMAL")} ==         {"FEASIBLE", "INFEASIBLE", "NO_PLAN", "OPTIMAL"}
    old = {"status": "SAT_NOT_PROVEN_OPTIMAL", "plan": {}}
    assert upgrade(old, "asp") == {"status": "FEASIBLE", "raw_status": "SAT_NOT_PROVEN_OPTIMAL",
                                   "solver": "asp", "plan": {}}


def test_cache_key_depends_on_the_scenario(cfg, cur, students):
    from synthetic.solve import cache_key, solver_input
    from synthetic.solvers import solver_settings
    fx, sc = solver_input(cur, cfg, students[0])
    st = solver_settings(cfg)
    assert cache_key(fx, sc, st, "e") == cache_key(copy.deepcopy(fx), dict(sc), st, "e")
    assert cache_key(fx, {**sc, "interests": ["x"]}, st, "e") != cache_key(fx, sc, st, "e")


# --- step 5 and recovery --------------------------------------------------------------

def test_src_recovers_a_linear_effect():
    rng = np.random.default_rng(0)
    X = rng.uniform(size=(2000, 3))
    y = 2 * X[:, 0] + 0.0 * X[:, 1] + rng.normal(0, 0.01, 2000)
    coef, r2 = src(X, y)
    assert coef[0] == pytest.approx(1.0, abs=0.01) and abs(coef[1]) < 0.02 and r2 > 0.99


def test_recovery_on_noise_free_structure():
    rng = np.random.default_rng(0)
    rows = []
    u, v = rng.normal(0, 1.2, 400), rng.normal(0, 0.6, 40)
    for s in range(400):
        for c in range(40):
            rows.append((s, f"C{c}", 3, 1, 1, 6.0 + u[s] - v[c] + rng.normal(0, 1.0)))
    tx = pd.DataFrame(rows, columns=["student", "course", "credits", "attempt", "year", "score"])
    est = fit(tx)
    assert abs(est["noise_sd"] - 1.0) < 0.03
    assert abs(est["discrimination"] - u.std()) < 0.05
    assert abs(est["difficulty_sd"] - v.std() / est["discrimination"]) < 0.05

