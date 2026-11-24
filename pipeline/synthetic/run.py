"""Open-loop pipeline driver (DESIGN.md Part A). Every step reads and writes a pool folder.

    cd pipeline
    .venv/Scripts/python -m synthetic.run --pool base --n 200 --seed 1 --workers 8
    .venv/Scripts/python -m synthetic.run --pool base --steps 4 --replay      # re-evaluate only

Steps: 1 population, 2 records (agent, no solver), 3a solve full plans, 3b select and
solve cut records, 4 evaluate, 5 sensitivity (pools with per-student parameters),
viz figures and report (``visualize.py``). Default: 1,2,3a,3b,4,viz (plus 5 with
--per-student-params).

Pool folder ``synthetic/data/<pool>/`` (solver-independent): pool.json (n, seed, config
used for steps 1-2), students.csv, outcomes.csv, semesters.csv, transcripts.csv, cuts.csv.
Per solver, ``<pool>/solver-<label>/``: solver_full.json, solver_cuts.json,
eval_full.csv, eval_cuts.csv, summary.json, sensitivity.csv, figures/, report.md.
``--solver`` picks the solver (default ``[solver] name``; see ``solvers.py``).
Steps 1-2 use the config stored in pool.json; later steps take [baseline], [solver],
[cuts], [evaluation] and [sensitivity] from the current config.toml.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pandas as pd

from synthetic.curriculum import Curriculum, base_values, load_config, ranges
from synthetic.population import sample_students

DATA = Path(__file__).resolve().parent / "data"
LATER = ("baseline", "solver", "cuts", "evaluation", "sensitivity")
STEPS = ("1", "2", "3a", "3b", "4", "5", "viz")


# --- pool ------------------------------------------------------------------------

def param_ranges(cfg) -> dict[str, tuple[float, float]]:
    return {k: (lo, hi) for k, (sec, _, lo, hi) in ranges(cfg).items()
            if sec in ("grades", "population", "agent")}


def make_students(cfg, n: int, seed: int, cur: Curriculum | None = None):
    cur = cur or Curriculum(cfg)
    pr = param_ranges(cfg) if cfg["population"]["per_student_params"] else None
    return sample_students(n, base_values(cfg["population"]), seed, cur, pr)


def solver_dir(path: Path, cfg) -> Path:
    from synthetic.solvers import solver_label
    return path / f"solver-{solver_label(cfg)}"


def load_pool(path: Path) -> tuple[dict, int, int]:
    meta = json.loads((path / "pool.json").read_text(encoding="utf-8"))
    cfg = copy.deepcopy(meta["config"])
    now = load_config()
    for sec in LATER:
        cfg[sec] = now[sec]
    return cfg, meta["n"], meta["seed"]


# --- step 2 ----------------------------------------------------------------------

_W: dict = {}


def _init(cfg, seed):
    from synthetic.plans import load_official
    from synthetic.simulate import Context
    cur = Curriculum(cfg)
    _W.update(ctx=Context(cfg, cur, seed), official=load_official(cfg))


def _record(student):
    from synthetic.agent import record
    return student.id, record(_W["ctx"], student, _W["official"])


def run_records(cfg, students, seed: int, workers: int = 1):
    if workers > 1:
        with ProcessPoolExecutor(workers, initializer=_init, initargs=(cfg, seed)) as ex:
            results = list(ex.map(_record, students, chunksize=max(1, len(students) // (workers * 4))))
    else:
        _init(cfg, seed)
        results = [_record(s) for s in students]
    outs, sems, txs = [], [], []
    for sid, (o, srows, trows) in results:
        outs.append({"student": sid, **o})
        sems += [{"student": sid, **r} for r in srows]
        txs += [{"student": sid, **r} for r in trows]
    return pd.DataFrame(outs), pd.DataFrame(sems), pd.DataFrame(txs)


def read_records(path: Path):
    kw = {"dtype": {"semester": str}}
    return (pd.read_csv(path / "outcomes.csv", dtype={"last_semester": str}),
            pd.read_csv(path / "semesters.csv", **kw), pd.read_csv(path / "transcripts.csv", **kw))


def _json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False, default=str), encoding="utf-8")


# --- driver ----------------------------------------------------------------------

def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True, help="folder name under synthetic/data/")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--steps", default=None, help="comma list of 1,2,3a,3b,4,5,viz")
    ap.add_argument("--solver", default=None,
                    help="solver name (asp, cpsat, module:factory); default [solver] name")
    ap.add_argument("--label", default=None, help="output label; default the solver name")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--replay", action="store_true", help="step 4: also replay after a fail")
    ap.add_argument("--per-student-params", action="store_true",
                    help="step 1: draw ranged parameters per student (for step 5)")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # paths with non-ASCII letters
    path = DATA / args.pool
    steps = (args.steps.split(",") if args.steps
             else ["1", "2", "3a", "3b", "4"] + (["5"] if args.per_student_params else []) + ["viz"])
    if bad := [s for s in steps if s not in STEPS]:
        raise SystemExit(f"unknown steps {bad}")

    if "1" in steps:
        if (path / "pool.json").exists():
            raise SystemExit(f"{path} exists; pick another --pool or run later steps only")
        cfg = load_config()
        cfg["population"]["per_student_params"] = bool(args.per_student_params)
        path.mkdir(parents=True)
        _json(path / "pool.json", {"n": args.n, "seed": args.seed, "config": cfg})
    cfg, n, seed = load_pool(path)
    if args.solver:
        cfg["solver"]["name"], cfg["solver"]["label"] = args.solver, ""
    if args.label:
        cfg["solver"]["label"] = args.label
    sdir = solver_dir(path, cfg)
    if any(s in steps for s in ("3a", "3b", "4", "5", "viz")):
        sdir.mkdir(exist_ok=True)
    cur = Curriculum(cfg)
    students = make_students(cfg, n, seed, cur)
    log = lambda msg: print(msg, flush=True)   # noqa: E731

    if "1" in steps:
        pd.DataFrame([s.row() for s in students]).to_csv(path / "students.csv", index=False)
        log(f"step 1: {n} students")
    if "2" in steps:
        t = time.perf_counter()
        o, s, tx = run_records(cfg, students, seed, args.workers)
        o.to_csv(path / "outcomes.csv", index=False)
        s.to_csv(path / "semesters.csv", index=False)
        tx.to_csv(path / "transcripts.csv", index=False)
        log(f"step 2: records in {time.perf_counter() - t:.0f} s; "
            f"{o['status'].value_counts().to_dict()}")
    if "3a" in steps:
        from synthetic.solve import solve_all, solver_input
        cases = {str(s.id): solver_input(cur, cfg, s) for s in students}
        _json(sdir / "solver_full.json", solve_all(cases, cfg, args.workers, log))
        log("step 3a: done")
    if "3b" in steps:
        from synthetic.solve import cut_cases, select_cuts, solve_all
        o, s, tx = read_records(path)
        cuts = select_cuts(cur, cfg, students, o, s, tx, seed)
        cuts.to_csv(path / "cuts.csv", index=False)
        log(f"step 3b: {len(cuts)} cuts, by k {cuts['k'].value_counts().sort_index().to_dict()}")
        _json(sdir / "solver_cuts.json", solve_all(cut_cases(cur, cfg, students, cuts), cfg,
                                                   args.workers, log))
    if "4" in steps:
        from synthetic.evaluate import evaluate_cuts, evaluate_full, summarize_cuts, summarize_full
        from synthetic.plans import load_official
        from synthetic.simulate import Context
        ctx, official = Context(cfg, cur, seed), load_official(cfg)
        o, s, tx = read_records(path)
        full = json.loads((sdir / "solver_full.json").read_text(encoding="utf-8")) \
            if (sdir / "solver_full.json").exists() else {}
        ev = evaluate_full(ctx, students, official, full, tx, o, args.replay)
        ev.to_csv(sdir / "eval_full.csv", index=False)
        e = cfg["evaluation"]
        summary = {"full": summarize_full(ev, e["bootstrap"], e["on_time_main_semesters"])}
        if (path / "cuts.csv").exists() and (sdir / "solver_cuts.json").exists():
            cuts = pd.read_csv(path / "cuts.csv", dtype={"current": str, "skip": str})
            sc = json.loads((sdir / "solver_cuts.json").read_text(encoding="utf-8"))
            ec = evaluate_cuts(ctx, students, official, cuts, sc)
            ec.to_csv(sdir / "eval_cuts.csv", index=False)
            summary["cuts"] = summarize_cuts(ec, e["bootstrap"])
        summary["solver"] = {"name": cfg["solver"]["name"], "label": sdir.name}
        _json(sdir / "summary.json", summary)
        log(json.dumps(summary, indent=1, default=str))
    if "5" in steps:
        from synthetic.sensitivity import analyze
        res = analyze(cfg, path, sdir)
        res.to_csv(sdir / "sensitivity.csv", index=False)
        log(res.to_string(index=False))
    if "viz" in steps:
        from synthetic.visualize import build
        for f in build(path, sdir):
            log(f"wrote {f}")
    log(f"pool: {path}  (solver outputs: {sdir.name})")


if __name__ == "__main__":
    main()
