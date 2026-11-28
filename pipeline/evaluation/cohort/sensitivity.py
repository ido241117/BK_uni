"""Step 5: sensitivity from a stored pool, with no new simulation or solve.

The pool must be made with per-student parameter draws (``run.py --per-student-params``:
every ranged parameter of [grades], [population] and [agent] drawn per student by Latin
hypercube). Each student is one sample of (parameters -> outputs). Methods
(``[sensitivity] method``):

* ``src``: standardized regression coefficients of each output on all parameters
  (linear, additive; R^2 says how much of the variance that explains).
* ``delta``: SALib's moment-independent delta index, which works on a given sample.

The solver plans (3a) depend on a student's parameters only through the summer opt-in
(``summer_threshold``) and, with ``load_mapping = "max_credits"``, the preferred maximum.
Outputs are read from the solver's folder ``<pool>/solver-<label>/``.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

OUTPUTS = {
    "record_graduated": "record graduated (0/1)",
    "record_main_semesters": "record main semesters (all students)",
    "record_cost": "record cost (M VND)",
    "solver_grad_k": "solver plan: graduation main semester",
    "solver_minus_official_grad_k": "solver minus official: graduation semester",
    "solver_minus_record_grad_k": "solver minus record first attempts: last semester",
    "solver_minus_official_exp_failed": "solver minus official: expected failed credits",
}


def outputs(path: Path, sdir: Path) -> pd.DataFrame:
    ev = pd.read_csv(sdir / "eval_full.csv")
    o = pd.read_csv(path / "outcomes.csv").set_index("student")
    w = ev[ev["available"]].pivot(index="student", columns="plan")
    df = pd.DataFrame(index=o.index)
    df["record_graduated"] = (o["status"] == "graduated").astype(float)
    df["record_main_semesters"] = o["main_semesters"].astype(float)
    df["record_cost"] = o["cost"].astype(float)
    if "solver" in w["grad_k"]:
        df["solver_grad_k"] = w["grad_k"]["solver"]
        df["solver_minus_official_grad_k"] = w["grad_k"]["solver"] - w["grad_k"]["official"]
        df["solver_minus_record_grad_k"] = w["grad_k"]["solver"] - w["grad_k"]["record"]
        df["solver_minus_official_exp_failed"] = (w["exp_failed_credits"]["solver"]
                                                  - w["exp_failed_credits"]["official"])
    return df


def src(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """Standardized regression coefficients and R^2 (ordinary least squares)."""
    Xs = (X - X.mean(0)) / X.std(0)
    ys = (y - y.mean()) / y.std()
    A = np.column_stack([np.ones(len(ys)), Xs])
    coef, *_ = np.linalg.lstsq(A, ys, rcond=None)
    resid = ys - A @ coef
    return coef[1:], float(1 - resid.var() / ys.var())


def analyze(cfg, path: Path, sdir: Path) -> pd.DataFrame:
    """``path``: pool folder (students, records); ``sdir``: the solver's output folder."""
    students = pd.read_csv(path / "students.csv").set_index("id")
    pcols = sorted(c for c in students.columns if c.startswith("p_"))
    if not pcols:
        raise SystemExit("pool has no per-student parameters; make it with --per-student-params")
    names = [c[2:] for c in pcols]
    out = outputs(path, sdir)
    method = cfg["sensitivity"]["method"]
    rows = []
    for col in out.columns:
        d = out[[col]].join(students[pcols]).dropna()
        y = d[col].to_numpy(float)
        if len(d) < len(pcols) + 2 or y.std() == 0:
            continue
        X = d[pcols].to_numpy(float)
        if method == "src":
            coef, r2 = src(X, y)
            rows += [{"output": col, "param": k, "src": float(b), "r2": r2, "n": len(d)}
                     for k, b in zip(names, coef)]
        elif method == "delta":
            from SALib.analyze import delta
            problem = {"num_vars": len(names), "names": names,
                       "bounds": [[float(X[:, j].min()), float(X[:, j].max())] for j in range(len(names))]}
            si = delta.analyze(problem, X, y, seed=1)
            key = "delta" if "delta" in si else "delta_raw"     # newer SALib: delta_raw
            rows += [{"output": col, "param": k, "delta": float(dv), "delta_conf": float(dc),
                      "S1": float(s1), "n": len(d)}
                     for k, dv, dc, s1 in zip(names, si[key], si[f"{key}_conf"], si["S1"])]
        else:
            raise ValueError(f"unknown sensitivity method {method!r}")
    return pd.DataFrame(rows)
