"""Synthetic cohort driver (DESIGN.md Part A, steps 1-2). Every step writes a pool folder.

    cd pipeline
    .venv/Scripts/python -m synthetic.run --pool base --n 200 --seed 1 --workers 8

Steps: 1 population, 2 records (agent, no solver). Default: both.
Pool folder ``synthetic/data/<pool>/``: pool.json (n, seed, config used for steps 1-2),
students.csv, outcomes.csv, semesters.csv, transcripts.csv.
Solving and evaluating a pool (steps 3-5, figures) is ``evaluation.cohort.run``.
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
LATER = ("baseline",)   # taken from the current config.toml, not from pool.json
STEPS = ("1", "2")


# --- pool ------------------------------------------------------------------------

def param_ranges(cfg) -> dict[str, tuple[float, float]]:
    return {k: (lo, hi) for k, (sec, _, lo, hi) in ranges(cfg).items()
            if sec in ("grades", "population", "agent")}


def make_students(cfg, n: int, seed: int, cur: Curriculum | None = None):
    cur = cur or Curriculum(cfg)
    pr = param_ranges(cfg) if cfg["population"]["per_student_params"] else None
    return sample_students(n, base_values(cfg["population"]), seed, cur, pr)


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
    ap.add_argument("--steps", default="1,2", help="comma list of 1,2")
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--per-student-params", action="store_true",
                    help="step 1: draw ranged parameters per student (for sensitivity, step 5)")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # paths with non-ASCII letters
    path = DATA / args.pool
    steps = args.steps.split(",")
    if bad := [s for s in steps if s not in STEPS]:
        raise SystemExit(f"unknown steps {bad}")

    if "1" in steps:
        if (path / "pool.json").exists():
            raise SystemExit(f"{path} exists; pick another --pool or run step 2 only")
        cfg = load_config()
        cfg["population"]["per_student_params"] = bool(args.per_student_params)
        path.mkdir(parents=True)
        _json(path / "pool.json", {"n": args.n, "seed": args.seed, "config": cfg})
    cfg, n, seed = load_pool(path)
    students = make_students(cfg, n, seed, Curriculum(cfg))
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
    log(f"pool: {path}")


if __name__ == "__main__":
    main()
