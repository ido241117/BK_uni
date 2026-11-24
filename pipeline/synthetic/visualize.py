"""Figures and a markdown report for one pool and one solver (reads stored data only).

    .venv/Scripts/python -m synthetic.visualize --pool base [--solver asp]
    (also step "viz" of ``synthetic.run``)

Writes ``<pool>/solver-<label>/figures/*.png`` and ``report.md`` (the numbers behind every
figure, as tables). Metric definitions: ``EVALUATION.md``.

Figures:
    plans_overview.png       4.1 mean of each plan metric per plan, 95% bootstrap CI
    paired_differences.png   4.1 solver minus each other plan, per student, 95% CI
    graduation_semester.png  4.1 share of students by graduation semester per plan
    records.png              step 2 outcomes: by ability, withdrawal reasons, options
    replay.png               4.1 replay after a fail: graduated share, extra semesters
    cuts.png                 4.2 remaining semesters vs official by k and record type,
                             solver legality and solve time by k
    sensitivity.png          step 5 (when sensitivity.csv exists)

Colors: one fixed categorical slot per plan (validated palette, light surface);
plan names are always on the axis or in the legend, so color never carries identity alone.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

# Validated categorical slots 1-4 (adjacent CVD dE >= 9.1, normal-vision >= 22.9 on #fcfcfb).
PLAN_COLOR = {"solver": "#2a78d6", "official": "#eb6834", "baseline": "#1baf7a", "record": "#eda100"}
PLAN_ORDER = ["solver", "official", "baseline", "record"]
PLAN_LABEL = {"solver": "Solver", "official": "Official plan", "baseline": "Baseline",
              "record": "Agent record"}
SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
SINGLE = "#2a78d6"     # single-series charts

METRICS = [   # (column, title, unit)
    ("grad_k", "Graduation semester", "main semester"),
    ("cost", "Tuition", "M VND"),
    ("credits", "Credits planned", "credits"),
    ("summers", "Summers used", "terms"),
    ("load_dev", "Load deviation", "credits / main semester"),
    ("interest_match", "Interest match", "share of electives"),
    ("exp_failed_credits", "Expected failed credits", "credits (1st attempts)"),
    ("warned_semesters", "Semesters warned", "semesters (1st attempts)"),
]


def _style():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "font.family": ["Segoe UI", "DejaVu Sans", "sans-serif"], "font.size": 9,
        "text.color": INK, "axes.labelcolor": INK2, "axes.titlecolor": INK,
        "axes.titlesize": 10, "axes.titleweight": "bold", "axes.titlelocation": "left",
        "axes.edgecolor": AXIS, "axes.linewidth": 0.8, "axes.grid": True, "grid.color": GRID,
        "grid.linewidth": 0.6, "axes.axisbelow": True, "xtick.color": MUTED, "ytick.color": MUTED,
        "xtick.labelcolor": INK2, "ytick.labelcolor": INK2, "legend.frameon": False,
        "axes.spines.top": False, "axes.spines.right": False,
    })
    return plt


def mean_ci(x, n_boot: int = 2000, seed: int = 0) -> tuple[float, float, float, int]:
    x = pd.to_numeric(pd.Series(x), errors="coerce").dropna().to_numpy(float)
    if not len(x):
        return np.nan, np.nan, np.nan, 0
    boot = np.random.default_rng(seed).choice(x, (n_boot, len(x))).mean(axis=1)
    return float(x.mean()), float(np.quantile(boot, 0.025)), float(np.quantile(boot, 0.975)), len(x)


def _save(fig, path: Path) -> Path:
    fig.savefig(path, dpi=160, bbox_inches="tight")
    import matplotlib.pyplot as plt
    plt.close(fig)
    return path


def _dot_ci(ax, labels, stats, colors):
    """Horizontal dot + CI whisker per row (rows top to bottom in the given order)."""
    y = np.arange(len(labels))[::-1]
    for yi, (m, lo, hi, _), c in zip(y, stats, colors):
        if np.isnan(m):
            continue
        ax.plot([lo, hi], [yi, yi], color=c, lw=2, solid_capstyle="round")
        ax.plot(m, yi, "o", ms=8, color=c, mec=SURFACE, mew=2)
    ax.set_yticks(y, labels)
    ax.grid(axis="y", visible=False)
    ax.margins(y=0.25)


# --- figures ---------------------------------------------------------------------

def fig_plans_overview(plt, ev: pd.DataFrame, out: Path) -> tuple[Path, pd.DataFrame]:
    av = ev[ev["available"].astype(bool)]
    plans = [p for p in PLAN_ORDER if p in set(av["plan"])]
    fig, axes = plt.subplots(2, 4, figsize=(13, 5.2))
    rows = []
    for ax, (col, title, unit) in zip(axes.flat, METRICS):
        stats = [mean_ci(av.loc[av["plan"] == p, col]) for p in plans]
        _dot_ci(ax, [PLAN_LABEL[p] for p in plans], stats, [PLAN_COLOR[p] for p in plans])
        ax.set_title(title)
        ax.set_xlabel(unit)
        rows += [{"metric": col, "plan": p, "mean": s[0], "ci_low": s[1], "ci_high": s[2], "n": s[3]}
                 for p, s in zip(plans, stats)]
    for ax in axes[:, 1:].flat:
        ax.set_yticklabels([])
    fig.suptitle("Full plans per student: mean with 95% bootstrap CI", x=0.01, ha="left",
                 fontsize=11, fontweight="bold")
    fig.tight_layout()
    return _save(fig, out / "plans_overview.png"), pd.DataFrame(rows)


def fig_paired(plt, ev: pd.DataFrame, out: Path) -> tuple[Path | None, pd.DataFrame]:
    av = ev[ev["available"].astype(bool)]
    if "solver" not in set(av["plan"]):
        return None, pd.DataFrame()
    w = av.pivot(index="student", columns="plan")
    others = [p for p in ("official", "baseline", "record") if p in set(av["plan"])]
    cols = ["grad_k", "cost", "load_dev", "interest_match", "exp_failed_credits", "failed_credits"]
    titles = {c: t for c, t, _ in METRICS} | {"failed_credits": "Failed credits (drawn)"}
    fig, axes = plt.subplots(2, 3, figsize=(12, 5))
    rows = []
    for ax, col in zip(axes.flat, cols):
        stats = [mean_ci(pd.to_numeric(w[col]["solver"], errors="coerce")
                         - pd.to_numeric(w[col][o], errors="coerce")) for o in others]
        ax.axvline(0, color=AXIS, lw=1)
        _dot_ci(ax, [f"vs {PLAN_LABEL[o]}" for o in others], stats, [PLAN_COLOR[o] for o in others])
        ax.set_title(titles[col])
        rows += [{"metric": col, "solver_minus": o, "mean": s[0], "ci_low": s[1], "ci_high": s[2],
                  "n": s[3]} for o, s in zip(others, stats)]
    for ax in axes[:, 1:].flat:
        ax.set_yticklabels([])
    fig.suptitle("Solver minus other plan, same student (negative = solver lower), 95% CI",
                 x=0.01, ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    return _save(fig, out / "paired_differences.png"), pd.DataFrame(rows)


def fig_graduation(plt, ev: pd.DataFrame, outcomes: pd.DataFrame, out: Path) -> tuple[Path, pd.DataFrame]:
    av = ev[ev["available"].astype(bool) & (ev["plan"] != "record")]
    cats = list(range(6, 13)) + ["withdrawn"]
    shares = {}
    for p in [p for p in PLAN_ORDER if p in set(av["plan"])]:
        g = av[av["plan"] == p]
        k = g.loc[g["complete"].astype(bool), "grad_k"].astype(int)
        shares[p] = [float((k == c).sum()) / len(g) for c in cats[:-1]] + [0.0]
    o = outcomes
    k = o.loc[o["status"] == "graduated", "main_semesters"].astype(int)
    shares["record"] = [float((k == c).sum()) / len(o) for c in cats[:-1]] + \
        [float((o["status"] == "withdrawn").mean())]
    keep = [i for i, c in enumerate(cats) if any(v[i] > 0 for v in shares.values())]
    cats = [cats[i] for i in keep]
    fig, ax = plt.subplots(figsize=(9, 3.6))
    n = len(shares)
    width = 0.8 / n
    x = np.arange(len(cats))
    for j, (p, v) in enumerate(shares.items()):
        ax.bar(x + (j - (n - 1) / 2) * width, [v[i] for i in keep], width, color=PLAN_COLOR[p],
               edgecolor=SURFACE, linewidth=2, label=PLAN_LABEL[p] + (" (actual)" if p == "record" else ""))
    ax.set_xticks(x, [str(c) for c in cats])
    ax.set_xlabel("graduation main semester (record: actual outcome)")
    ax.set_ylabel("share of students")
    ax.grid(axis="x", visible=False)
    ax.legend(ncols=n, loc="upper right")
    ax.set_title("When each plan graduates")
    fig.tight_layout()
    table = pd.DataFrame({PLAN_LABEL[p]: [v[i] for i in keep] for p, v in shares.items()},
                         index=[str(c) for c in cats])
    return _save(fig, out / "graduation_semester.png"), table


def fig_records(plt, students: pd.DataFrame, outcomes: pd.DataFrame, semesters: pd.DataFrame,
                out: Path) -> tuple[Path, dict]:
    m = outcomes.merge(students, left_on="student", right_on="id")
    m["tercile"] = pd.qcut(m["theta"], 3, labels=["low", "middle", "high"])
    by_t = m.groupby("tercile", observed=True)["status"].apply(lambda s: (s == "graduated").mean())
    reasons = outcomes.loc[outcomes["status"] == "withdrawn", "reason"].value_counts()
    picks = semesters["source"].dropna().value_counts()
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.4), gridspec_kw={"width_ratios": [1, 1, 1.4]})
    for ax, s, title, xl in ((axes[0], by_t, "Graduated, by ability tercile", "ability (theta) tercile"),
                             (axes[1], reasons, "Withdrawal reasons", ""),
                             (axes[2], picks, "Options picked by the agent", "")):
        ax.bar(range(len(s)), s.to_numpy(float), 0.6, color=SINGLE, edgecolor=SURFACE, linewidth=2)
        ax.set_xticks(range(len(s)), [str(i).replace("_", " ") for i in s.index], rotation=0 if ax is axes[0] else 20,
                      ha="center" if ax is axes[0] else "right")
        ax.set_title(title)
        ax.set_xlabel(xl)
        ax.grid(axis="x", visible=False)
        for i, v in enumerate(s.to_numpy(float)):
            ax.annotate(f"{v:.2f}" if v <= 1 and ax is axes[0] else f"{int(v)}", (i, v),
                        xytext=(0, 3), textcoords="offset points", ha="center", color=INK2, fontsize=8)
    axes[0].set_ylabel("share")
    axes[1].set_ylabel("students")
    axes[2].set_ylabel("terms")
    fig.suptitle(f"Agent records (step 2): {int((outcomes['status'] == 'graduated').sum())} of "
                 f"{len(outcomes)} graduate", x=0.01, ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    return _save(fig, out / "records.png"), {"by_tercile": by_t, "reasons": reasons, "picks": picks}


def fig_replay(plt, ev: pd.DataFrame, out: Path) -> tuple[Path | None, pd.DataFrame]:
    if "replay_status" not in ev:
        return None, pd.DataFrame()
    av = ev[ev["available"].astype(bool)]
    plans = [p for p in PLAN_ORDER if p in set(av["plan"])]
    rows = []
    for p in plans:
        g = av[av["plan"] == p]
        gr = g[g["replay_status"] == "graduated"]
        rows.append({"plan": p, "graduated": mean_ci((g["replay_status"] == "graduated").astype(float)),
                     "extra_semesters": mean_ci(gr["replay_main_semesters"] - gr["grad_k"]),
                     "extra_cost": mean_ci(gr["replay_cost"] - gr["cost"])})
    fig, axes = plt.subplots(1, 3, figsize=(12, 2.8))
    for ax, key, title, unit in ((axes[0], "graduated", "Graduates when replayed", "share"),
                                 (axes[1], "extra_semesters", "Extra semesters (graduates)", "main semesters"),
                                 (axes[2], "extra_cost", "Extra tuition (graduates)", "M VND")):
        _dot_ci(ax, [PLAN_LABEL[r["plan"]] for r in rows], [r[key] for r in rows],
                [PLAN_COLOR[r["plan"]] for r in rows])
        ax.set_title(title)
        ax.set_xlabel(unit)
    for ax in axes[1:]:
        ax.set_yticklabels([])
    fig.suptitle("Replay after a fail: each plan followed with real grades, 95% CI", x=0.01,
                 ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    table = pd.DataFrame([{"plan": r["plan"], **{f"{k}_mean": r[k][0] for k in ("graduated", "extra_semesters", "extra_cost")},
                           "n_graduated": r["extra_semesters"][3]} for r in rows])
    return _save(fig, out / "replay.png"), table


def fig_cuts(plt, ec: pd.DataFrame, out: Path) -> tuple[Path | None, dict]:
    if not len(ec) or "remaining_minus_official" not in ec:
        return None, {}
    fig, axes = plt.subplots(1, 4, figsize=(14, 3.2))
    ks = sorted(ec["k"].unique())
    types = [t for t in ("clean", "one_fail", "several_fails", "warned") if t in set(ec["record_type"])]
    by_k = [mean_ci(ec.loc[ec["k"] == k, "remaining_minus_official"]) for k in ks]
    by_t = [mean_ci(ec.loc[ec["record_type"] == t, "remaining_minus_official"]) for t in types]
    for ax, labels, stats, title in ((axes[0], [f"k = {k}" for k in ks], by_k, "Remaining semesters vs official, by k"),
                                     (axes[1], [t.replace("_", " ") for t in types], by_t, "... by record type")):
        ax.axvline(0, color=AXIS, lw=1)
        _dot_ci(ax, labels, stats, [SINGLE] * len(labels))
        ax.set_title(title)
        ax.set_xlabel("solver minus official (main semesters)")
    legal = ec.groupby("k")["solver_legal"].apply(lambda s: s.astype(bool).mean())
    axes[2].bar(range(len(legal)), legal.to_numpy(float), 0.6, color=SINGLE, edgecolor=SURFACE, linewidth=2)
    axes[2].set_xticks(range(len(legal)), [str(k) for k in legal.index])
    axes[2].set_ylim(0, 1)
    axes[2].set_title("Solver plans legal, by k")
    axes[2].set_xlabel("k (semesters finished)")
    axes[2].set_ylabel("share")
    axes[2].grid(axis="x", visible=False)
    data = [ec.loc[ec["k"] == k, "seconds"].dropna().to_numpy(float) for k in ks]
    bp = axes[3].boxplot(data, widths=0.5, patch_artist=True, showfliers=False)
    for b in bp["boxes"]:
        b.set(facecolor="#cde2fb", edgecolor=SINGLE, linewidth=1)
    for part in ("whiskers", "caps", "medians"):
        for line in bp[part]:
            line.set(color=SINGLE, linewidth=1.2)
    axes[3].set_xticks(range(1, len(ks) + 1), [str(k) for k in ks])
    axes[3].set_title("Solve time, by k")
    axes[3].set_xlabel("k (semesters finished)")
    axes[3].set_ylabel("seconds")
    axes[3].grid(axis="x", visible=False)
    fig.suptitle(f"Solver on {len(ec)} cut records (step 4.2), 95% CI", x=0.01, ha="left",
                 fontsize=11, fontweight="bold")
    fig.tight_layout()
    return _save(fig, out / "cuts.png"), {"by_k": dict(zip(ks, by_k)), "by_type": dict(zip(types, by_t)),
                                          "legal": legal}


def fig_sensitivity(plt, sens: pd.DataFrame, out: Path) -> Path | None:
    if sens is None or not len(sens):
        return None
    value = "src" if "src" in sens else "delta"
    outputs = list(dict.fromkeys(sens["output"]))
    ncol = min(3, len(outputs))
    nrow = int(np.ceil(len(outputs) / ncol))
    fig, axes = plt.subplots(nrow, ncol, figsize=(4.3 * ncol, 2.9 * nrow), squeeze=False)
    for ax, o in zip(axes.flat, outputs):
        g = sens[sens["output"] == o].assign(a=lambda d: d[value].abs()).nlargest(8, "a")[::-1]
        ax.barh(range(len(g)), g[value], 0.6, color=SINGLE, edgecolor=SURFACE, linewidth=2)
        ax.set_yticks(range(len(g)), g["param"])
        ax.axvline(0, color=AXIS, lw=1)
        extra = f", R² {g['r2'].iloc[0]:.2f}" if "r2" in g else ""
        ax.set_title(f"{o.replace('_', ' ')}{extra}", fontsize=9)
        ax.grid(axis="y", visible=False)
    for ax in axes.flat[len(outputs):]:
        ax.set_visible(False)
    fig.suptitle(f"Sensitivity ({'standardized regression coefficient' if value == 'src' else 'delta index'}), "
                 f"top 8 parameters per output", x=0.01, ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    return _save(fig, out / "sensitivity.png")


# --- report ----------------------------------------------------------------------

def _md(df: pd.DataFrame, digits: int = 2) -> str:
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_float_dtype(df[c]):
            df[c] = df[c].map(lambda v: "" if pd.isna(v) else f"{v:.{digits}f}")
    head = "| " + " | ".join(map(str, df.columns)) + " |"
    sep = "|" + "---|" * len(df.columns)
    body = ["| " + " | ".join(map(str, r)) + " |" for r in df.itertuples(index=False)]
    return "\n".join([head, sep, *body])


def _ci_cell(m, lo, hi):
    return "" if np.isnan(m) else f"{m:.2f} [{lo:.2f}, {hi:.2f}]"


def build(path: Path, sdir: Path) -> list[Path]:
    plt = _style()
    out = sdir / "figures"
    out.mkdir(parents=True, exist_ok=True)
    students = pd.read_csv(path / "students.csv")
    outcomes = pd.read_csv(path / "outcomes.csv")
    semesters = pd.read_csv(path / "semesters.csv", dtype={"semester": str})
    ev = pd.read_csv(sdir / "eval_full.csv")
    ec = pd.read_csv(sdir / "eval_cuts.csv") if (sdir / "eval_cuts.csv").exists() else pd.DataFrame()
    sens = pd.read_csv(sdir / "sensitivity.csv") if (sdir / "sensitivity.csv").exists() else None
    summary = json.loads((sdir / "summary.json").read_text(encoding="utf-8")) \
        if (sdir / "summary.json").exists() else {}

    files, md = [], [f"# Results: pool `{path.name}`, solver `{sdir.name}`", "",
                     "Generated by `synthetic/visualize.py` from stored data. Metric definitions: "
                     "`synthetic/EVALUATION.md`. Intervals are 95% percentile bootstrap CIs over students "
                     "(cuts for 4.2).", ""]
    f, t = fig_plans_overview(plt, ev, out)
    files.append(f)
    piv = t.assign(cell=[_ci_cell(r.mean, r.ci_low, r.ci_high) for r in t.itertuples()]) \
        .pivot(index="metric", columns="plan", values="cell")
    piv = piv[[p for p in PLAN_ORDER if p in piv.columns]].reindex([m for m, _, _ in METRICS])
    md += ["## 4.1 Full plans", "", f"![plans](figures/{f.name})", "",
           _md(piv.reset_index().rename(columns=PLAN_LABEL)), ""]
    f, t = fig_paired(plt, ev, out)
    if f:
        files.append(f)
        t["cell"] = [_ci_cell(r.mean, r.ci_low, r.ci_high) for r in t.itertuples()]
        md += ["### Solver minus other plans (paired by student)", "", f"![paired](figures/{f.name})", "",
               _md(t.pivot(index="metric", columns="solver_minus", values="cell").reset_index()), ""]
    f, t = fig_graduation(plt, ev, outcomes, out)
    files.append(f)
    md += ["### Graduation semester", "", f"![graduation](figures/{f.name})", "",
           _md(t.reset_index().rename(columns={"index": "semester"})), ""]
    f, t = fig_records(plt, students, outcomes, semesters, out)
    files.append(f)
    md += ["## Step 2: agent records", "", f"![records](figures/{f.name})", "",
           _md(t["by_tercile"].rename("graduated share").reset_index()), "",
           _md(t["reasons"].rename("students").reset_index().rename(columns={"index": "reason"})), "",
           _md(t["picks"].rename("terms").reset_index().rename(columns={"index": "option"})), ""]
    f, t = fig_replay(plt, ev, out)
    if f:
        files.append(f)
        md += ["## Replay after a fail", "", f"![replay](figures/{f.name})", "", _md(t), ""]
    f, t = fig_cuts(plt, ec, out)
    if f:
        files.append(f)
        rows = [{"group": f"k = {k}", "remaining minus official": _ci_cell(*v[:3]), "n": v[3]}
                for k, v in t["by_k"].items()] + \
               [{"group": g, "remaining minus official": _ci_cell(*v[:3]), "n": v[3]}
                for g, v in t["by_type"].items()]
        md += ["## 4.2 Cut records", "", f"![cuts](figures/{f.name})", "", _md(pd.DataFrame(rows)), ""]
        if "cuts" in summary:
            a = summary["cuts"]["all"]
            md += [_md(pd.DataFrame([{k: v for k, v in a.items()}]).T.reset_index()
                       .rename(columns={"index": "metric", 0: "all cuts"})), ""]
    f = fig_sensitivity(plt, sens, out)
    if f:
        files.append(f)
        md += ["## Step 5: sensitivity", "", f"![sensitivity](figures/{f.name})", "", _md(sens, 3), ""]
    for name in ("solver_full.json", "solver_cuts.json"):
        if (sdir / name).exists():
            res = pd.DataFrame(json.loads((sdir / name).read_text(encoding="utf-8"))).T
            md += [f"## Solver status ({name})", "",
                   _md(res.groupby(["status", "stopped_by"]).size().rename("cases").reset_index()), ""]
    report = sdir / "report.md"
    report.write_text("\n".join(md), encoding="utf-8")
    return files + [report]


def main() -> None:
    import sys
    from synthetic.run import DATA, load_pool, solver_dir
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", required=True)
    ap.add_argument("--solver", default=None, help="solver label folder (default from config)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    path = DATA / args.pool
    cfg, _, _ = load_pool(path)
    if args.solver:
        cfg["solver"]["name"], cfg["solver"]["label"] = args.solver, ""
    for f in build(path, solver_dir(path, cfg)):
        print("wrote", f)


if __name__ == "__main__":
    main()
