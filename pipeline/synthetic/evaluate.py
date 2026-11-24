"""Step 4: evaluate from stored data (no solver calls).

4.1 Full plans, per student: solver (3a) vs agent record (step 2) vs official (PDF, the
    student's electives) vs baseline ("follow the curriculum", all passed).
    * Plan metrics: legality, completeness, graduation semester, credits, cost, summer
      use, load fit, interest match.
    * Grade comparison, first attempts only (DESIGN.md B4): every course of a plan is
      scored once at its planned term with the keyed draw of attempt 1, so the same
      course gets the same noise in every plan (common random numbers).
    * Replay after a fail (separate option): the plan is followed with a fixed repair
      rule (retakes, overdue, this term's courses) and real grades; reports extra
      semesters, extra cost and attrition.
4.2 Solver on cut records, per cut: legality, status, solve time, remaining semesters
    and cost against the official plan and the baseline from the same state.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from synthetic import grades as G
from synthetic import regulations as R
from synthetic.curriculum import FREE_PREFIX, Curriculum
from synthetic.plans import (MAX_MAIN_CREDITS, MAX_SUMMER_CREDITS, allpass_plan, baseline_spec,
                             canonical, elective_order, fit, internship_allowed, last_free_index,
                             official_spec,
                             plan_completes, plan_errors, slot_credits, spec_plan)
from synthetic.solve import split

PLANS = ("solver", "record", "official", "baseline")


# --- plans of one student -------------------------------------------------------------

def record_plan(tx: pd.DataFrame) -> dict[str, list[str]]:
    """First attempts of the agent record, by term."""
    first = tx[tx["attempt"] == 1]
    return {s: sorted(g["course"]) for s, g in first.groupby("semester")}


def student_plans(ctx, student, official: dict, solver_result: dict | None,
                  tx: pd.DataFrame) -> dict[str, dict[str, list[str]]]:
    cur = ctx.cur
    order = elective_order(cur, student, ctx.seed)
    plans = {
        "record": record_plan(tx),
        "official": spec_plan(cur, official_spec(cur, official, order)),
        "baseline": allpass_plan(cur, student, baseline_spec(cur, student.specialization, order)),
    }
    if solver_result and solver_result.get("plan"):
        plans["solver"] = canonical(solver_result["plan"])
    return plans


# --- 4.1 metrics -----------------------------------------------------------------------

def main_index(cur: Curriculum, term: str) -> int:
    """Main semesters from enrollment up to ``term`` (a summer counts as the one before)."""
    return sum(1 for s in cur.semesters[1:] if not cur.is_summer(s) and s <= term)


def plan_metrics(ctx, student, plan: dict[str, list[str]]) -> dict:
    cur = ctx.cur
    spec = student.specialization
    terms = sorted(s for s, cs in plan.items() if cs)
    credits = {s: sum(slot_credits(cur, spec, plan[s]).values()) for s in terms}
    mains = [s for s in terms if not cur.is_summer(s)]
    lo, hi = student.preferred_load
    mid = (lo + hi) / 2
    tags = cur.course_tags()
    electives = {c for g in cur.groups(spec) if g["kind"] == "elective" and cur.elective_group_key(g)
                 for c in g["members"]}
    planned_el = [c for s in terms for c in plan[s] if c in electives]
    liked = [c for c in planned_el if tags.get(c, frozenset()) & set(student.interests)]
    last = terms[-1] if terms else None
    errs = plan_errors(cur, student, plan) if terms else ["empty plan"]
    return {
        "legal": not errs,
        "n_errors": len(errs),
        "errors": "; ".join(errs),
        "complete": plan_completes(cur, student, plan),
        "grad_term": last,
        "grad_k": main_index(cur, last) if last else None,
        "credits": sum(credits.values()),
        "cost": round(sum(cur.fee(credits[s], cur.is_summer(s)) for s in terms), 3),
        "summers": sum(cur.is_summer(s) for s in terms),
        "load_dev": float(np.mean([abs(credits[s] - mid) for s in mains])) if mains else None,
        "in_band": float(np.mean([lo <= credits[s] <= hi for s in mains])) if mains else None,
        "electives": len(planned_el),
        "interest_match": len(liked) / len(planned_el) if planned_el else None,
    }


def first_attempt_grades(ctx, student, plan: dict[str, list[str]]) -> dict:
    """Score every course of the plan once at its planned term (attempt 1)."""
    cur = ctx.cur
    p, _, diff = ctx.params(student)
    spec = student.specialization
    exp_failed = drawn_failed = pts = w = 0.0
    passed_cr, outstanding, warned = 0, 0, 0
    best: dict[str, tuple[float, int]] = {}
    by_k: dict[int, int] = {}
    first = True
    for sem in sorted(plan):
        cr = slot_credits(cur, spec, plan[sem])
        year = ctx.year(sem)
        reg = failed = 0
        s_pts = s_w = 0.0
        for c in plan[sem]:
            ps = ctx.pass_score(c)
            s = ctx.score(student, c, sem, 1, p, diff)
            exp_failed += cr[c] * G.fail_probability(p, student.theta, diff[c], year, 1, ps)
            ok = s >= ps
            reg += cr[c]
            if not ok:
                failed += cr[c]
                if not c.startswith(FREE_PREFIX):
                    outstanding += cr[c]
            else:
                passed_cr += cr[c]
            if cr[c] > 0:
                gp = cur.scale.points(s)
                s_pts += gp * cr[c]
                s_w += cr[c]
                best[c] = (gp, cr[c])
        drawn_failed += failed
        pts += s_pts
        w += s_w
        if not cur.is_summer(sem):
            cw = sum(x[1] for x in best.values())
            reasons = R.warning_reasons(
                registered_credits=reg, failed_credits=failed, outstanding_credits=outstanding,
                semester_gpa=s_pts / s_w if s_w else None, first_semester=first,
                cpa=sum(g * x for g, x in best.values()) / cw if cw else None,
                accumulated_credits=passed_cr)
            warned += bool(reasons)
            first = False
        by_k[main_index(cur, sem)] = passed_cr
    return {"exp_failed_credits": round(exp_failed, 3), "failed_credits": drawn_failed,
            "gpa_first": round(pts / w, 3) if w else None, "warned_semesters": warned,
            "passed_by_k4": max([v for k, v in by_k.items() if k <= 4], default=0),
            "passed_by_k8": max([v for k, v in by_k.items() if k <= 8], default=0)}


# --- replay after a fail (separate option) ----------------------------------------

def replay_policy(ctx, student, plan: dict[str, list[str]]):
    """Follow ``plan`` with real grades: retakes first, then the plan's overdue and this
    term's courses whose prerequisites are met; the rest is pushed later."""
    cur = ctx.cur
    spec = student.specialization
    opt_in = cur.summers_from(cur.start) if student.summer_opt_in else None
    free_terms = sorted(s for s, cs in plan.items() for c in cs if c.startswith(FREE_PREFIX))
    when = {c: s for s, cs in plan.items() for c in cs if not c.startswith(FREE_PREFIX)}

    def policy(state, k, semester, sem_index):
        summer = cur.is_summer(semester)
        planned_now = plan.get(semester, [])
        if summer and not planned_now and not (student.summer_opt_in and state.failed_open):
            return [], "replay"
        retake = sorted(state.failed_open)
        overdue = sorted((c for c, s in when.items() if s < semester and c not in state.passed
                          and c not in state.failed_open), key=lambda c: (when[c], c))
        this = sorted(c for c, s in when.items() if s == semester and c not in state.passed
                      and c not in state.failed_open)
        owed = max(0, sum(s <= semester for s in free_terms)
                   - sum(c.startswith(FREE_PREFIX) for c in state.passed))
        slots = cur.free_slots(spec, state.passed)[:owed]
        ranked = retake + overdue + this + slots
        if summer:
            ranked = [c for c in ranked if c in planned_now or c in retake]
        if not internship_allowed(cur, semester, ranked, k) and not summer:
            ranked = [c for c in ranked if c not in cur.internships] or ranked
        planned_cr = sum(slot_credits(cur, spec, planned_now).values())
        cap = (min(MAX_SUMMER_CREDITS, max(planned_cr, 12)) if summer
               else min(MAX_MAIN_CREDITS, max(planned_cr, student.preferred_load[1])))
        return fit(cur, state, student, semester, ranked, cap, opt_in), "replay"

    return policy


def replay(ctx, student, plan: dict[str, list[str]]) -> dict:
    from synthetic.simulate import run_student
    o, _, _ = run_student(ctx, student, replay_policy(ctx, student, plan))
    return {"replay_status": o["status"], "replay_reason": o["reason"],
            "replay_main_semesters": o["main_semesters"], "replay_cost": o["cost"]}


def evaluate_full(ctx, students, official: dict, solver_full: dict, transcripts: pd.DataFrame,
                  outcomes: pd.DataFrame, with_replay: bool = False) -> pd.DataFrame:
    tx_by = {sid: g for sid, g in transcripts.groupby("student")}
    out_by = outcomes.set_index("student")
    rows = []
    for s in students:
        tx = tx_by.get(s.id, transcripts.iloc[0:0])
        plans = student_plans(ctx, s, official, solver_full.get(str(s.id)), tx)
        for name in PLANS:
            plan = plans.get(name)
            row = {"student": s.id, "plan": name, "available": plan is not None}
            if plan is not None:
                row.update(plan_metrics(ctx, s, plan))
                row.update(first_attempt_grades(ctx, s, plan))
                if with_replay:
                    row.update(replay(ctx, s, plan))
            if name == "record":
                o = out_by.loc[s.id]
                row.update(record_status=o["status"], record_main_semesters=o["main_semesters"],
                           record_cost=o["cost"])
            if name == "solver" and str(s.id) in solver_full:
                r = solver_full[str(s.id)]
                row.update(status=r["status"], stopped_by=r["stopped_by"], seconds=r["seconds"],
                           solver_violations=len(r["violations"]))
            rows.append(row)
    return pd.DataFrame(rows)


def required_of(cur: Curriculum, spec: str) -> set[str]:
    return {c for g in cur.groups(spec) if g["kind"] == "required" and not g.get("_free_slots")
            for c in g["members"]}


# --- 4.2 cuts --------------------------------------------------------------------

def evaluate_cuts(ctx, students, official: dict, cuts: pd.DataFrame, solver_cuts: dict) -> pd.DataFrame:
    cur = ctx.cur
    by_id = {s.id: s for s in students}
    on_time_limit = R.MAX_MAIN_SEMESTERS
    rows = []
    for c in cuts.itertuples():
        s = by_id[c.student]
        passed, failed, current = split(c.passed), split(c.failed), str(c.current)
        order = elective_order(cur, s, ctx.seed)
        refs = {"official": official_spec(cur, official, order),
                "baseline": baseline_spec(cur, s.specialization, order)}
        row = {"cut": c.cut, "student": c.student, "k": c.k, "record_type": c.record_type,
               "n_failed_open": len(failed)}
        res = solver_cuts.get(c.cut)
        plans = {}
        if res is not None:
            row.update(status=res["status"], stopped_by=res["stopped_by"], seconds=res["seconds"],
                       solver_violations=len(res["violations"]))
            if res["plan"]:
                plans["solver"] = canonical(res["plan"], last_free_index(passed))
        for name, ps in refs.items():
            plans[name] = allpass_plan(cur, s, ps, passed, failed, current, int(c.k))
        for name, plan in plans.items():
            terms = sorted(t for t, cs in plan.items() if cs)
            last = terms[-1] if terms else None
            spec = s.specialization
            row[f"{name}_complete"] = plan_completes(cur, s, plan, passed)
            row[f"{name}_remaining"] = (main_index(cur, last) - main_index(cur, current)) if last else 0
            row[f"{name}_grad_k"] = main_index(cur, last) if last else int(c.k)
            row[f"{name}_cost"] = round(sum(cur.fee(sum(slot_credits(cur, spec, plan[t]).values()),
                                                    cur.is_summer(t)) for t in terms), 3)
            row[f"{name}_summers"] = sum(cur.is_summer(t) for t in terms)
        if "solver" in plans:
            plan = plans["solver"]
            errs = plan_errors(cur, s, plan, passed, failed, current)
            row["solver_legal"] = not errs
            row["solver_errors"] = "; ".join(errs)
            # Retakes: failed required courses (a failed elective may be swapped for another).
            when = {x: t for t, cs in plan.items() for x in cs}
            req_failed = [f for f in failed if f in required_of(cur, s.specialization)]
            retakes = [when[f] for f in req_failed if f in when]
            row["n_failed_required"] = len(req_failed)
            row["retakes_scheduled"] = len(retakes)
            row["retakes_all"] = len(retakes) == len(req_failed)
            row["first_retake_in"] = (main_index(cur, min(retakes)) - main_index(cur, current)
                                      if retakes else None)
            row["solver_within_12"] = bool(row["solver_complete"]) and row["solver_grad_k"] <= on_time_limit
            for ref in refs:
                row[f"remaining_minus_{ref}"] = row["solver_remaining"] - row[f"{ref}_remaining"]
                row[f"cost_minus_{ref}"] = round(row["solver_cost"] - row[f"{ref}_cost"], 3)
        rows.append(row)
    return pd.DataFrame(rows)


# --- summaries ---------------------------------------------------------------------

def bootstrap_mean(x: np.ndarray, n_boot: int, seed: int = 0) -> dict:
    x = x[~np.isnan(x)]
    if not len(x):
        return {"mean": None, "ci95": [None, None], "n": 0}
    boot = np.random.default_rng(seed).choice(x, (n_boot, len(x))).mean(axis=1)
    return {"mean": float(x.mean()), "ci95": [float(np.quantile(boot, 0.025)),
                                              float(np.quantile(boot, 0.975))], "n": int(len(x))}


FULL_METRICS = ("legal", "complete", "grad_k", "credits", "cost", "summers", "load_dev", "in_band",
                "interest_match", "exp_failed_credits", "failed_credits", "gpa_first",
                "warned_semesters", "passed_by_k4", "passed_by_k8")


def summarize_full(df: pd.DataFrame, n_boot: int, on_time: int) -> dict:
    out: dict = {"by_plan": {}, "paired": {}}
    av = df[df["available"]]
    for name, g in av.groupby("plan"):
        m = {k: float(pd.to_numeric(g[k], errors="coerce").mean()) for k in FULL_METRICS if k in g}
        m["n"] = int(len(g))
        m["on_time_share"] = float(((g["grad_k"] <= on_time) & g["complete"].astype(bool)).mean())
        if "replay_status" in g:
            # Extra semesters and cost among replays that graduate; attrition separately.
            gr = g[g["replay_status"] == "graduated"]
            m["replay_graduated"] = float((g["replay_status"] == "graduated").mean())
            m["replay_withdrawn"] = float((g["replay_status"] == "withdrawn").mean())
            m["replay_extra_semesters_graduates"] = float((gr["replay_main_semesters"] - gr["grad_k"]).mean())
            m["replay_extra_cost_graduates"] = float((gr["replay_cost"] - gr["cost"]).mean())
        out["by_plan"][name] = m
    rec = df[df["plan"] == "record"]
    if len(rec):
        out["records"] = {"graduated": float((rec["record_status"] == "graduated").mean()),
                          "withdrawn": float((rec["record_status"] == "withdrawn").mean()),
                          "main_semesters_graduates": float(rec.loc[rec["record_status"] == "graduated",
                                                                    "record_main_semesters"].mean())}
    w = av.pivot(index="student", columns="plan")
    for other in ("official", "baseline", "record"):
        if "solver" not in w["grad_k"] or other not in w["grad_k"]:
            continue
        out["paired"][f"solver_minus_{other}"] = {
            k: bootstrap_mean((pd.to_numeric(w[k]["solver"], errors="coerce")
                               - pd.to_numeric(w[k][other], errors="coerce")).to_numpy(float), n_boot)
            for k in ("grad_k", "cost", "exp_failed_credits", "failed_credits", "gpa_first",
                      "load_dev", "interest_match")}
    return out


def summarize_cuts(df: pd.DataFrame, n_boot: int) -> dict:
    if not len(df):
        return {}
    cols = [c for c in ("solver_legal", "solver_complete", "solver_within_12", "seconds",
                        "solver_remaining", "official_remaining", "baseline_remaining",
                        "remaining_minus_official", "remaining_minus_baseline",
                        "cost_minus_official", "cost_minus_baseline", "retakes_all",
                        "first_retake_in") if c in df]

    def agg(g):
        m = {c: float(pd.to_numeric(g[c], errors="coerce").mean()) for c in cols}
        m["n"] = int(len(g))
        if "status" in g:
            m["optimal_share"] = float((g["status"] == "OPTIMAL").mean())
        return m
    out = {"all": agg(df),
           "by_k": {int(k): agg(g) for k, g in df.groupby("k")},
           "by_record_type": {t: agg(g) for t, g in df.groupby("record_type")}}
    for c in ("remaining_minus_official", "remaining_minus_baseline"):
        if c in df:
            out[f"ci_{c}"] = bootstrap_mean(pd.to_numeric(df[c], errors="coerce").to_numpy(float), n_boot)
    return out
