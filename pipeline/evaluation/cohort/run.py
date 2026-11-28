"""Evaluate solvers on a synthetic cohort (DESIGN.md Part A, steps 3-5 and figures).

    cd pipeline
    .venv/Scripts/python -m synthetic.run --pool base --n 200 --seed 1          # steps 1-2
    .venv/Scripts/python -m evaluation.cohort.run --pool base --solver cpsat --workers 8
    .venv/Scripts/python -m evaluation.cohort.run --pool base --steps 4 --replay   # re-evaluate only
    .venv/Scripts/python -m evaluation.cohort.run --pool base --resolve 5          # solver reproducible?

Steps: 3a solve full plans, 3b select and solve cut records, 4 evaluate, 5 sensitivity
(pools made with --per-student-params), viz figures and report. Default:
3a,3b,4,viz (plus 5 when the pool has per-student parameters).

Reads the pool ``synthetic/data/<pool>/``; writes ``evaluation/results/<pool>/``:
cuts.csv (solver-independent) and, per solver, ``solver-<label>/``: solver_full.json,
solver_cuts.json, eval_full.csv, eval_cuts.csv, summary.json, sensitivity.csv,
figures/, report.md. Metric definitions: EVALUATION.md. Settings: config.toml next to
this file ([solver], [cuts], [evaluation], [sensitivity]); the pool keeps its own.
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path

import pandas as pd

from synthetic.curriculum import Curriculum
from synthetic.run import DATA, load_pool, make_students, read_records

CONFIG = Path(__file__).with_name("config.toml")
RESULTS = Path(__file__).resolve().parents[1] / "results"
STEPS = ("3a", "3b", "4", "5", "viz")


def load_eval_config(pool: Path, solver: str | None = None, label: str | None = None) -> tuple[dict, int, int]:
    """Pool config (steps 1-2) plus this module's evaluation sections."""
    cfg, n, seed = load_pool(pool)
    with open(CONFIG, "rb") as fh:
        cfg.update(tomllib.load(fh))
    if solver:
        cfg["solver"]["name"], cfg["solver"]["label"] = solver, ""
    if label:
        cfg["solver"]["label"] = label
    return cfg, n, seed


def results_dir(pool_name: str) -> Path:
    return RESULTS / pool_name


def solver_dir(pool_name: str, cfg) -> Path:
    from planner.solvers.registry import solver_label
    return results_dir(pool_name) / f"solver-{solver_label(cfg)}"


def _json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False, default=str), encoding="utf-8")


def resolve_check(cfg, cur, students, full: dict, m: int) -> str:
    """Solve the first ``m`` cases again without the cache; how many give the stored plan."""
    from evaluation.cohort.solve import solver_input
    from planner.solvers.registry import get_solver, solver_name, solver_settings
    adapter, st = get_solver(solver_name(cfg)), solver_settings(cfg)
    same = []
    for stu in students[:m]:
        fx, sc = solver_input(cur, cfg, stu)
        r = adapter.solve(fx, sc, st)
        plan = {x["semester_code"]: sorted(x["courses"]) for x in (r.get("semesters") or [])}
        same.append(plan == full[str(stu.id)]["plan"])
    return f"{sum(same)}/{len(same)}"


def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True, help="pool folder name under synthetic/data/")
    ap.add_argument("--steps", default=None, help="comma list of 3a,3b,4,5,viz")
    ap.add_argument("--solver", default=None,
                    help="solver name (asp, cpsat, module:factory); default [solver] name")
    ap.add_argument("--label", default=None, help="output label; default the solver name")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--replay", action="store_true", help="step 4: also replay after a fail")
    ap.add_argument("--resolve", type=int, default=0,
                    help="only re-solve this many stored cases and report how many match")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # paths with non-ASCII letters
    pool = DATA / args.pool
    cfg, n, seed = load_eval_config(pool, args.solver, args.label)
    out, sdir = results_dir(args.pool), solver_dir(args.pool, cfg)
    cur = Curriculum(cfg)
    students = make_students(cfg, n, seed, cur)
    log = lambda msg: print(msg, flush=True)   # noqa: E731

    if args.resolve:
        full = json.loads((sdir / "solver_full.json").read_text(encoding="utf-8"))
        log(json.dumps({"solver_reproducible": resolve_check(cfg, cur, students, full, args.resolve)}))
        return

    steps = (args.steps.split(",") if args.steps
             else ["3a", "3b", "4"] + (["5"] if cfg["population"]["per_student_params"] else []) + ["viz"])
    if bad := [s for s in steps if s not in STEPS]:
        raise SystemExit(f"unknown steps {bad}")
    sdir.mkdir(parents=True, exist_ok=True)

    if "3a" in steps:
        from evaluation.cohort.solve import solve_all, solver_input
        cases = {str(s.id): solver_input(cur, cfg, s) for s in students}
        _json(sdir / "solver_full.json", solve_all(cases, cfg, args.workers, log))
        log("step 3a: done")
    if "3b" in steps:
        from evaluation.cohort.solve import cut_cases, select_cuts, solve_all
        o, s, tx = read_records(pool)
        cuts = select_cuts(cur, cfg, students, o, s, tx, seed)
        cuts.to_csv(out / "cuts.csv", index=False)
        log(f"step 3b: {len(cuts)} cuts, by k {cuts['k'].value_counts().sort_index().to_dict()}")
        _json(sdir / "solver_cuts.json", solve_all(cut_cases(cur, cfg, students, cuts), cfg,
                                                   args.workers, log))
    if "4" in steps:
        from evaluation.cohort.evaluate import evaluate_cuts, evaluate_full, summarize_cuts, summarize_full
        from synthetic.plans import load_official
        from synthetic.simulate import Context
        ctx, official = Context(cfg, cur, seed), load_official(cfg)
        o, s, tx = read_records(pool)
        full = json.loads((sdir / "solver_full.json").read_text(encoding="utf-8")) \
            if (sdir / "solver_full.json").exists() else {}
        ev = evaluate_full(ctx, students, official, full, tx, o, args.replay)
        ev.to_csv(sdir / "eval_full.csv", index=False)
        e = cfg["evaluation"]
        summary = {"full": summarize_full(ev, e["bootstrap"], e["on_time_main_semesters"])}
        if (out / "cuts.csv").exists() and (sdir / "solver_cuts.json").exists():
            cuts = pd.read_csv(out / "cuts.csv", dtype={"current": str, "skip": str})
            sc = json.loads((sdir / "solver_cuts.json").read_text(encoding="utf-8"))
            ec = evaluate_cuts(ctx, students, official, cuts, sc)
            ec.to_csv(sdir / "eval_cuts.csv", index=False)
            summary["cuts"] = summarize_cuts(ec, e["bootstrap"])
        summary["solver"] = {"name": cfg["solver"]["name"], "label": sdir.name}
        _json(sdir / "summary.json", summary)
        log(json.dumps(summary, indent=1, default=str))
    if "5" in steps:
        from evaluation.cohort.sensitivity import analyze
        res = analyze(cfg, pool, sdir)
        res.to_csv(sdir / "sensitivity.csv", index=False)
        log(res.to_string(index=False))
    if "viz" in steps:
        from evaluation.cohort.visualize import build
        for f in build(pool, sdir):
            log(f"wrote {f}")
    log(f"results: {sdir}")


if __name__ == "__main__":
    main()
