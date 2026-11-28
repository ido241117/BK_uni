"""Evaluation of synthetic cohorts: plan metrics, solver step (cache, plug-ins), sensitivity."""

from __future__ import annotations

import copy
import sys
import tomllib
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from evaluation.cohort.evaluate import first_attempt_grades, plan_metrics, record_plan  # noqa: E402
from evaluation.cohort.run import CONFIG  # noqa: E402
from evaluation.cohort.sensitivity import src  # noqa: E402
from synthetic.curriculum import Curriculum, load_config  # noqa: E402
from synthetic.plans import (allpass_plan, baseline_spec, elective_order, load_official,  # noqa: E402
                             official_spec, spec_plan)
from synthetic.run import make_students, run_records  # noqa: E402
from synthetic.simulate import Context  # noqa: E402


@pytest.fixture(scope="module")
def cfg():
    c = load_config()
    with open(CONFIG, "rb") as fh:
        c.update(tomllib.load(fh))
    return c


@pytest.fixture(scope="module")
def cur(cfg):
    return Curriculum(cfg)


@pytest.fixture(scope="module")
def students(cfg, cur):
    return make_students(cfg, 15, 3, cur)


@pytest.fixture(scope="module")
def records(cfg, students):
    return run_records(cfg, students, 3)


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



# --- step 3: solver and cuts ---------------------------------------------------------

def test_cut_selection_matches_the_shares(cfg, cur, students, records):
    from evaluation.cohort.solve import select_cuts
    o, s, tx = records
    c = copy.deepcopy(cfg)
    c["cuts"].update(n=20, shares={"1": 0.5, "2": 0.25, "3": 0.25})
    cuts = select_cuts(cur, c, students, o, s, tx, 3)
    assert cuts["k"].value_counts().to_dict() == {1: 10, 2: 5, 3: 5}
    assert not cuts.duplicated(["student", "k"]).any()
    for r in cuts.itertuples():     # still enrolled after semester k
        assert s.loc[s["student"] == r.student, "semester"].max() > r.current


def test_solver_is_cached_and_reproducible(cfg, cur, students, tmp_path, monkeypatch):
    import evaluation.cohort.solve as S
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
    import evaluation.cohort.solve as S
    from evaluation.cohort.evaluate import evaluate_full
    from planner.solvers.registry import get_solver, solver_label
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
    from planner.solvers.registry import STATUS, upgrade
    assert {STATUS[k] for k in ("SAT_NOT_PROVEN_OPTIMAL", "UNSAT", "TIMEOUT", "OPTIMAL")} ==         {"FEASIBLE", "INFEASIBLE", "NO_PLAN", "OPTIMAL"}
    old = {"status": "SAT_NOT_PROVEN_OPTIMAL", "plan": {}}
    assert upgrade(old, "asp") == {"status": "FEASIBLE", "raw_status": "SAT_NOT_PROVEN_OPTIMAL",
                                   "solver": "asp", "plan": {}}


def test_cache_key_depends_on_the_scenario(cfg, cur, students):
    from evaluation.cohort.solve import cache_key, solver_input
    from planner.solvers.registry import solver_settings
    fx, sc = solver_input(cur, cfg, students[0])
    st = solver_settings(cfg)
    assert cache_key(fx, sc, st, "e") == cache_key(copy.deepcopy(fx), dict(sc), st, "e")
    assert cache_key(fx, {**sc, "interests": ["x"]}, st, "e") != cache_key(fx, sc, st, "e")



def test_src_recovers_a_linear_effect():
    rng = np.random.default_rng(0)
    X = rng.uniform(size=(2000, 3))
    y = 2 * X[:, 0] + 0.0 * X[:, 1] + rng.normal(0, 0.01, 2000)
    coef, r2 = src(X, y)
    assert coef[0] == pytest.approx(1.0, abs=0.01) and abs(coef[1]) < 0.02 and r2 > 0.99
