"""Step 3: solve once per case with the configured solver, cached on disk by solver input.

3a: one full plan per student from enrollment.
3b: one remaining plan per cut record (a record truncated after k finished main
    semesters, DESIGN.md B3).

Solver-agnostic: the solver is ``[solver] name`` (``planner/solvers/registry.py``: ``asp``, ``cpsat`` or
a plugged-in ``module:factory``). What the solver sees from a student (DESIGN.md B2):
specialization, summer opt-in (every summer from the cut on), interests, the state
(passed, failed, current semester) and, for a cut whose next main semester is a
suspension in the record, that semester as ``skip_semesters``. The preferred load is
passed only with ``load_mapping = "max_credits"``.

Cache: ``evaluation/cache/<solver>/<sha256>.json``, the key hashing the fixture, the scenario,
the solver settings and the solver's fingerprint (its source files).
"""

from __future__ import annotations

import hashlib
import json
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from synthetic.curriculum import FREE_PREFIX, Curriculum
from planner.solvers.registry import common_result, get_solver, solver_name, solver_settings, upgrade

CACHE_ROOT = Path(__file__).resolve().parents[1] / "cache"
_STREAM_CUTS = 7


# --- solver input and cache ---------------------------------------------------------

def solver_input(cur: Curriculum, cfg, student, passed=(), failed=(), current=None,
                 skip=()) -> tuple[dict, dict]:
    current = current or cur.start
    opt_in = cur.summers_from(current) if student.summer_opt_in else None
    max_credits = student.preferred_load[1] if cfg["solver"]["load_mapping"] == "max_credits" else None
    if cfg["solver"]["load_mapping"] not in ("none", "max_credits"):
        raise ValueError(f"unknown load_mapping {cfg['solver']['load_mapping']!r}")
    fx = cur.state_fixture(student.specialization, passed, failed, current)
    return fx, cur.scenario(opt_in, student.interests, max_credits, skip)


def cache_key(fx: dict, sc: dict, settings: dict, engine: str) -> str:
    blob = json.dumps({"fixture": fx, "scenario": sc, "settings": settings, "engine": engine},
                      sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def solve_case(job) -> tuple[str, dict, bool]:
    """(key, common result, cache hit). Runs in a worker process."""
    name, key, fx, sc, settings, cache = job
    adapter = get_solver(name)
    path = Path(cache) / f"{key}.json"
    if path.exists():
        return key, upgrade(json.loads(path.read_text(encoding="utf-8")), adapter.name), True
    t = time.perf_counter()
    r = adapter.solve(fx, sc, settings)
    out = common_result(r, time.perf_counter() - t, adapter.stopped_by(r, settings), adapter.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)
    return key, out, False


def solve_all(cases: dict, cfg, workers: int = 1, log=print) -> dict:
    """``cases`` {case_id: (fixture, scenario)} -> {case_id: common result + key}."""
    name = solver_name(cfg)
    adapter = get_solver(name)
    settings, engine = solver_settings(cfg), adapter.fingerprint()
    cache = str(CACHE_ROOT / adapter.name)
    keys = {cid: cache_key(fx, sc, settings, engine) for cid, (fx, sc) in cases.items()}
    jobs, seen = [], set()
    for cid, (fx, sc) in cases.items():
        if keys[cid] not in seen:          # identical inputs are solved once
            seen.add(keys[cid])
            jobs.append((name, keys[cid], fx, sc, settings, cache))
    results, hits, t0 = {}, 0, time.perf_counter()
    if workers > 1:
        with ProcessPoolExecutor(workers) as ex:
            for i, (key, res, hit) in enumerate(ex.map(solve_case, jobs), start=1):
                results[key], hits = res, hits + hit
                _progress(log, i, len(jobs), hits, t0)
    else:
        for i, job in enumerate(jobs, start=1):
            key, res, hit = solve_case(job)
            results[key], hits = res, hits + hit
            _progress(log, i, len(jobs), hits, t0)
    return {cid: {**results[k], "key": k} for cid, k in keys.items()}


def _progress(log, i, n, hits, t0):
    if log and (i == n or i % 10 == 0):
        log(f"solved {i}/{n} ({hits} from cache, {time.perf_counter() - t0:.0f} s)")


# --- 3b: cut records ---------------------------------------------------------------

def main_rows(cur: Curriculum, sem_rows: pd.DataFrame) -> pd.DataFrame:
    return sem_rows[~sem_rows["semester"].map(cur.is_summer)].sort_values("semester")


def cut_state(cur: Curriculum, tx: pd.DataFrame, sem_rows: pd.DataFrame, current: str) -> dict:
    """State and record type of a record truncated after term ``current``."""
    t = tx[tx["semester"] <= current].sort_values(["semester", "course"])
    passed, failed = set(), set()
    for r in t.itertuples():
        if r.passed:
            passed.add(r.course)
            failed.discard(r.course)
        elif not r.course.startswith(FREE_PREFIX) and r.course not in passed:
            failed.add(r.course)
    s = sem_rows[sem_rows["semester"] <= current]
    warned = bool(s.get("warning", pd.Series(dtype=object)).fillna("").astype(bool).any())
    fails = int((~t["passed"]).sum())
    kind = "warned" if warned else "clean" if fails == 0 else "one_fail" if fails == 1 else "several_fails"
    return {"passed": "|".join(sorted(passed)), "failed": "|".join(sorted(failed)), "record_type": kind,
            "failed_attempts": fails}


def select_cuts(cur: Curriculum, cfg, students, outcomes: pd.DataFrame, semesters: pd.DataFrame,
                transcripts: pd.DataFrame, seed: int) -> pd.DataFrame:
    """Sample (student, k) pairs among students still enrolled after k main semesters,
    so the realized mix of k matches ``[cuts] shares`` (fewer if not enough eligible)."""
    shares = {int(k): v for k, v in cfg["cuts"]["shares"].items()}
    n = int(cfg["cuts"]["n"])
    by_student = {sid: g for sid, g in semesters.groupby("student")}
    tx_by = {sid: g for sid, g in transcripts.groupby("student")}
    rows = []
    for k, share in sorted(shares.items()):
        eligible = []
        for s in students:
            g = by_student.get(s.id)
            if g is None:
                continue
            mains = main_rows(cur, g)
            if len(mains) < k:
                continue
            current = mains["semester"].iloc[k - 1]
            if g["semester"].max() > current:            # still enrolled after semester k
                eligible.append((s.id, current, mains))
        want = int(round(share * n))
        rng = np.random.default_rng([seed, _STREAM_CUTS, k])
        pick = rng.choice(len(eligible), size=min(want, len(eligible)), replace=False)
        for i in sorted(pick):
            sid, current, mains = eligible[i]
            nxt = mains[mains["semester"] > current]
            skip = [nxt["semester"].iloc[0]] if len(nxt) and nxt["event"].iloc[0] == "suspended" else []
            st = cut_state(cur, tx_by.get(sid, transcripts.iloc[0:0]), by_student[sid], current)
            rows.append({"cut": f"{sid}-k{k}", "student": sid, "k": k, "current": current,
                         "wanted": want, "skip": "|".join(skip), **st})
    return pd.DataFrame(rows)


def split(cell) -> list[str]:
    """'a|b' cell (CSV) -> list; empty or NaN -> []."""
    return [x for x in cell.split("|") if x] if isinstance(cell, str) else []


def cut_cases(cur: Curriculum, cfg, students, cuts: pd.DataFrame) -> dict:
    by_id = {s.id: s for s in students}
    out = {}
    for r in cuts.itertuples():
        out[r.cut] = solver_input(cur, cfg, by_id[r.student], split(r.passed), split(r.failed),
                                  str(r.current), split(r.skip))
    return out
