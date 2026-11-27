"""Step 6 checks.

    .venv/Scripts/python -m synthetic.checks predictive --n 2000 --seed 1
    .venv/Scripts/python -m synthetic.checks pool --pool base [--resolve 5]

``predictive``: prior predictive check of the score model against ``[targets]``. Draws
first-attempt scores for every (student, course) pair, with the year taken from the
course's recommended semester. No policy is involved.

``pool``: on a stored pool,
* every registration of every record is legal (``evaluation.validate``, replayed from the
  record's own states) and the term after an internship holds no course (fills_next);
* graduation status agrees with the validator's completeness check;
* first-attempt scores in step 4 equal the record's scores (common random numbers);
* rerunning step 2 for the first students gives identical records;
* with ``--resolve m``: m solver cases solved again without the cache give the same plan
  (expected only for a reproducible solver setting, e.g. ASP in "conflicts" mode).
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from synthetic.curriculum import FREE_PREFIX, Curriculum, base_values, load_config
from synthetic.grades import PASS_SCORE, course_difficulties


def predictive_summary(cfg, n: int, seed: int, overrides: dict | None = None) -> dict:
    cur = Curriculum(cfg)
    p = base_values(cfg["grades"], overrides)
    spec = cur.specializations[0]
    rec = cur.recommended(spec)
    codes = [c for c in cur.all_codes() if cur.credits(spec).get(c, 0) > 0]
    diff = course_difficulties(cur.all_codes(), p["difficulty_sd"], seed)
    b = np.array([diff[c] for c in codes])
    year = np.array([(rec.get(c, 7) + 1) // 2 for c in codes])
    rng = np.random.default_rng([seed, 99])
    theta = rng.standard_normal(n)[:, None]
    raw = (p["mu"] + p["discrimination"] * (theta - b) + p["year_effect"] * (year - 1)
           + p["noise_sd"] * rng.standard_normal((n, len(codes))))
    clipped = np.clip(raw, 0, 10)
    course_means = clipped.mean(axis=0)
    return {
        "score_mean": float(clipped.mean()),
        "score_sd": float(clipped.std()),
        "fail_rate": float((clipped < PASS_SCORE).mean()),
        "clip_mass": float(((raw <= 0) | (raw >= 10)).mean()),
        "course_mean_min": float(course_means.min()),
        "course_mean_max": float(course_means.max()),
        "course_mean_p10": float(np.quantile(course_means, 0.1)),
        "course_mean_p90": float(np.quantile(course_means, 0.9)),
        "course_fail_rate_max": float((clipped < PASS_SCORE).mean(axis=0).max()),
    }


def compare(summary: dict, targets: dict) -> dict:
    lo, hi = targets["course_mean"]
    return {
        "course_means_in_range": lo <= summary["course_mean_p10"] and summary["course_mean_p90"] <= hi,
        "score_sd_in_range": targets["score_sd"][0] <= summary["score_sd"] <= targets["score_sd"][1],
        "fail_rate_in_range": targets["fail_rate"][0] <= summary["fail_rate"] <= targets["fail_rate"][1],
        "clip_mass_ok": summary["clip_mass"] <= targets["clip_mass_max"],
    }


def record_problems(cur: Curriculum, students, outcomes, transcripts) -> list[str]:
    """Replay every registration through the validator with the record's own state."""
    from synthetic.plans import to_slots
    problems = []
    by_id = {s.id: s for s in students}
    status = outcomes.set_index("student")["status"]
    for sid, g in transcripts.groupby("student"):
        st = by_id[sid]
        spec, passed, failed, current = st.specialization, set(), set(), cur.start
        terms = sorted(g["semester"].unique())
        for sem, rows in g.groupby("semester", sort=True):
            opt_in = cur.summers_from(cur.start) if st.summer_opt_in else []
            reg = list(to_slots(cur, spec, {sem: list(rows["course"])}, passed)[sem])
            errs = cur.registration_errors(spec, passed, failed, current, sem, reg, opt_in)
            problems += [f"student {sid} {sem}: {e}" for e in errs]
            if set(rows["course"]) & cur.internships and cur.next_term(sem) in terms:
                problems.append(f"student {sid}: courses in {cur.next_term(sem)} after the internship")
            for r in rows.itertuples():
                if r.passed:
                    passed.add(r.course)
                    failed.discard(r.course)
                elif not r.course.startswith(FREE_PREFIX):
                    failed.add(r.course)
            current = sem
        if cur.graduated(spec, passed) != (status[sid] == "graduated"):
            problems.append(f"student {sid}: graduation status disagrees with the validator")
    return problems


def crn_problems(ctx, students, transcripts) -> list[str]:
    """Step 4 first-attempt scores must equal the record's first attempts."""
    problems = []
    by_id = {s.id: s for s in students}
    for sid, g in transcripts.groupby("student"):
        for r in g[g["attempt"] == 1].itertuples():
            if ctx.score(by_id[sid], r.course, r.semester, 1) != r.score:
                problems.append(f"student {sid} {r.course}: score differs")
    return problems


def _roundtrip(df):
    """Through CSV, as the pool files are read (``run.read_records``)."""
    import io
    import pandas as pd
    return pd.read_csv(io.StringIO(df.to_csv(index=False)),
                       dtype={"semester": str, "last_semester": str})


def pool_checks(pool: str, n_rerun: int = 10, n_resolve: int = 0) -> dict:
    from synthetic.run import DATA, load_pool, make_students, read_records, run_records
    from synthetic.simulate import Context
    path = DATA / pool
    cfg, n, seed = load_pool(path)
    cur = Curriculum(cfg)
    students = make_students(cfg, n, seed, cur)
    o, s, tx = read_records(path)
    res = {"record_problems": record_problems(cur, students, o, tx)[:20],
           "crn_problems": crn_problems(Context(cfg, cur, seed), students, tx)[:20]}
    o2, _, tx2 = run_records(cfg, students[:n_rerun], seed)
    res["records_reproducible"] = bool(
        _roundtrip(o2).equals(o[o["student"] < n_rerun].reset_index(drop=True))
        and _roundtrip(tx2).equals(tx[tx["student"] < n_rerun].reset_index(drop=True)))
    if n_resolve:
        import json
        from synthetic.run import solver_dir
        from synthetic.solve import solver_input
        from synthetic.solvers import get_solver, solver_name, solver_settings
        full = json.loads((solver_dir(path, cfg) / "solver_full.json").read_text(encoding="utf-8"))
        adapter, st = get_solver(solver_name(cfg)), solver_settings(cfg)
        same = []
        for stu in students[:n_resolve]:
            fx, sc = solver_input(cur, cfg, stu)
            r = adapter.solve(fx, sc, st)
            plan = {x["semester_code"]: sorted(x["courses"]) for x in (r.get("semesters") or [])}
            same.append(plan == full[str(stu.id)]["plan"])
        res["solver_reproducible"] = f"{sum(same)}/{len(same)}"
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["predictive", "pool"])
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--pool", default=None)
    ap.add_argument("--rerun", type=int, default=10)
    ap.add_argument("--resolve", type=int, default=0)
    args = ap.parse_args()
    if args.what == "predictive":
        cfg = load_config()
        s = predictive_summary(cfg, args.n, args.seed)
        print(json.dumps({"summary": s, "checks": compare(s, cfg["targets"])}, indent=2))
    else:
        print(json.dumps(pool_checks(args.pool, args.rerun, args.resolve), indent=2))


if __name__ == "__main__":
    main()
