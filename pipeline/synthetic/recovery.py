"""Parameter recovery: fit the score model to simulated transcripts and compare.

    .venv/Scripts/python -m synthetic.recovery --n 1000 --seed 1 --set noise_sd=0.9 --workers 8

Transcripts are step-2 agent records (``run.run_records``).

Fit: score = mu + u_student + v_course + retake*[attempt>1] + year*(year-1) + eps,
by alternating least squares (joint ML under Gaussian noise; clipping ignored).
Then, with n_i / n_j the observation counts,
    noise_sd^2      = RSS / (N - students - courses - 2)
    discrimination^2 = var(u) - noise_sd^2 * mean(1/n_i)          (theta ~ N(0,1))
    difficulty_sd^2 = (var(v) - noise_sd^2 * mean(1/n_j)) / discrimination^2
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd

from synthetic.curriculum import base_values, load_config


def fit(tx: pd.DataFrame, iters: int = 200, tol: float = 1e-8) -> dict:
    tx = tx[tx["credits"] > 0]
    si = tx["student"].astype("category").cat.codes.to_numpy()
    ci = tx["course"].astype("category").cat.codes.to_numpy()
    y = tx["score"].to_numpy(float)
    x = np.column_stack([(tx["attempt"] > 1).to_numpy(float), (tx["year"] - 1).to_numpy(float)])
    ns, nc = si.max() + 1, ci.max() + 1
    cnt_s, cnt_c = np.bincount(si, minlength=ns), np.bincount(ci, minlength=nc)
    mu, u, v, beta = y.mean(), np.zeros(ns), np.zeros(nc), np.zeros(2)
    prev = np.inf
    for _ in range(iters):
        r = y - mu - v[ci] - x @ beta
        u = np.bincount(si, r, ns) / cnt_s
        u -= u.mean()
        r = y - mu - u[si] - x @ beta
        v = np.bincount(ci, r, nc) / cnt_c
        v -= v.mean()
        r = y - u[si] - v[ci]
        design = np.column_stack([np.ones_like(y), x])
        coef = np.linalg.lstsq(design, r, rcond=None)[0]
        mu, beta = coef[0], coef[1:]
        rss = float(((y - mu - u[si] - v[ci] - x @ beta) ** 2).sum())
        if abs(prev - rss) < tol * max(1.0, rss):
            break
        prev = rss
    s2 = rss / (len(y) - ns - nc - 2)
    a2 = u.var() - s2 * np.mean(1 / cnt_s)
    b2 = (v.var() - s2 * np.mean(1 / cnt_c)) / a2
    return {"mu": float(mu), "discrimination": float(np.sqrt(max(a2, 0))),
            "difficulty_sd": float(np.sqrt(max(b2, 0))), "noise_sd": float(np.sqrt(s2)),
            "retake_effect": float(beta[0]), "year_effect": float(beta[1]),
            "n_obs": int(len(y)), "clipped_share": float(((y <= 0) | (y >= 10)).mean())}


def recover(cfg, n: int, seed: int, overrides: dict | None = None, workers: int = 1) -> dict:
    """Simulate step-2 records with the grade parameters set to ``overrides`` and fit them."""
    import copy
    from synthetic.curriculum import Curriculum
    from synthetic.run import make_students, run_records
    from synthetic.simulate import Context
    cfg = copy.deepcopy(cfg)
    cfg["population"]["per_student_params"] = False
    for k, v in (overrides or {}).items():
        cfg["grades"][k]["base"] = v
    cur = Curriculum(cfg)
    students = make_students(cfg, n, seed, cur)
    _, _, tx = run_records(cfg, students, seed, workers)
    true = {k: v for k, v in base_values(cfg["grades"]).items() if k != "round_to"}
    # Finite-sample values of the random effects actually drawn (what the fit can see).
    ctx = Context(cfg, cur, seed)
    seen = tx.loc[tx["credits"] > 0, "course"].unique()
    realized = {"theta_sd": float(np.std([s.theta for s in students])),
                "difficulty_sd": float(np.std([true["difficulty_sd"] * ctx.z_difficulty[c] for c in seen]))}
    return {"true": true, "realized": realized, "estimate": fit(tx)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--set", action="append", default=[], help="param=value override")
    ap.add_argument("--workers", type=int, default=1)
    args = ap.parse_args()
    over = {k: float(v) for k, v in (s.split("=") for s in args.set)}
    print(json.dumps(recover(load_config(), args.n, args.seed, over, args.workers), indent=2))


if __name__ == "__main__":
    main()
