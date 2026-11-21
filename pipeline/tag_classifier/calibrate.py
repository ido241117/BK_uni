"""Measure the candidate thresholds from data -> reports/02-candidates/calibration/ (report.md, calibration.json, figures)

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.calibrate                         # curricula per [calibrate]
    tag_classifier/.venv/Scripts/python -m tag_classifier.calibrate --curriculum CS-2023-KHMT

No human labels; labels come from the data, over each curriculum's courses to tag (electives with
electives_only). Settings in config.toml, [calibrate].

    min_best_match, min_peak   topic vs vague phrase, chosen together (the candidate rule applies both).
                               Positives: phrases picked as a course's top topic phrases. Negatives:
                               generic phrases (in more than max_catalogue_df_ratio of all syllabi) that
                               occur in those courses, a stand-in for vague phrases.
    semantic_threshold         is a phrase about a course. Positive pairs: (top phrase, the course it was
                               picked for). Negative pairs: (top phrase, a course whose syllabus does not
                               contain it).
        Each: the most positives passed while letting through at most max_false_positive_rate of the
        negatives. (Maximising TPR - FPR instead was tried on KHMT 2023 on 2026-11-21: it let one generic
        phrase in three through and added mostly vague candidates.)
    cluster_threshold          builds the candidates of curricula with specializations for each value of
                               cluster_grid (with the thresholds above) and keeps the value with the
                               highest mean syllabus purity (clusters stay inside one specialization's
                               course list; candidates.quality). Silhouette was tried and dropped: it
                               favoured large clusters that merged distinct topics.

Caveat: positives are picked partly by their similarity to the course, so their pass rate is optimistic.
"""

from __future__ import annotations

import argparse
import copy
from typing import Any

import matplotlib.pyplot as plt
import numpy as np

from tag_classifier.candidates import Builder
from tag_classifier.charts import BLUE, ORANGE, TEXT_2, md_table, save, style
from tag_classifier.common import load_config, load_records, read_json, resolve, utf8_stdout, write_json
from tag_classifier.structure import courses_to_tag, specialization_members


def capped(pos: list[float], neg: list[float], cap: float) -> dict[str, float]:
    """Lowest threshold t (rule: value >= t) letting through at most `cap` of the negatives."""
    p, n = np.asarray(pos, float), np.asarray(neg, float)
    best = None
    for t in np.unique(np.concatenate([p, n])):
        fpr = float(np.mean(n >= t))
        if fpr <= cap:
            best = {"threshold": float(t), "tpr": float(np.mean(p >= t)), "fpr": fpr}
            break  # candidates ascend: the first one under the cap passes the most positives
    return best or {"threshold": float(max(p.max(), n.max())), "tpr": 0.0, "fpr": 0.0}


def capped_joint(pos: list[tuple[float, float]], neg: list[tuple[float, float]], cap: float) -> dict[str, float]:
    """(x, y) for the rule "value1 >= x and value2 >= y" passing the most positives with at most `cap`
    of the negatives, over percentiles of the observed values."""
    P, N = np.asarray(pos, float), np.asarray(neg, float)
    both = np.concatenate([P, N])
    grid = [np.unique(np.quantile(both[:, k], np.linspace(0, 1, 101))) for k in (0, 1)]
    best = {"x": float(grid[0][-1]), "y": float(grid[1][-1]), "tpr": 0.0, "fpr": 0.0}
    for x in grid[0]:
        for y in grid[1]:
            fpr = float(np.mean((N[:, 0] >= x) & (N[:, 1] >= y)))
            tpr = float(np.mean((P[:, 0] >= x) & (P[:, 1] >= y)))
            if fpr <= cap and tpr > best["tpr"]:
                best = {"x": float(x), "y": float(y), "tpr": tpr, "fpr": fpr}
    return best


def joint_rates(pos, neg, x: float, y: float) -> dict[str, float]:
    P, N = np.asarray(pos, float), np.asarray(neg, float)
    return {"tpr": float(np.mean((P[:, 0] >= x) & (P[:, 1] >= y))), "fpr": float(np.mean((N[:, 0] >= x) & (N[:, 1] >= y)))}


def rates(pos: list[float], neg: list[float], t: float) -> dict[str, float]:
    return {"tpr": float(np.mean(np.asarray(pos) >= t)), "fpr": float(np.mean(np.asarray(neg) >= t))}


def collect(builder: Builder, data: dict[str, Any]) -> dict[str, Any] | None:
    """Positive / negative values of one curriculum."""
    cur = builder.curriculum(data)
    top = {rec["code"]: {p for p, _ in builder.keyphrases(rec)} for rec in cur.courses}
    has = {rec["code"]: set(builder.index.course_phrases(rec, builder.templates)) for rec in cur.courses}
    topics = sorted(set().union(*top.values())) if top else []
    generic = sorted(set().union(*has.values()) & builder.generic) if has else []
    if len(topics) < 3 or not generic:
        return None
    sims = builder.embedder.encode(topics + generic) @ cur.doc_vecs.T
    best = sims.max(axis=1)
    peak = best - np.median(sims, axis=1)
    k = len(topics)
    return {"code": data["code"], "courses": len(cur.codes), "topics": k, "generic": len(generic),
            "best_pos": best[:k].tolist(), "best_neg": best[k:].tolist(),
            "peak_pos": peak[:k].tolist(), "peak_neg": peak[k:].tolist(),
            "pair_pos": [float(sims[i, j]) for i, p in enumerate(topics) for j, c in enumerate(cur.codes) if p in top[c]],
            "pair_neg": [float(sims[i, j]) for i, p in enumerate(topics) for j, c in enumerate(cur.codes) if p not in has[c]]}


def measure(parts: list[dict[str, Any]], cfg: dict[str, Any], cap: float) -> tuple[dict[str, Any], dict[str, Any]]:
    """Thresholds from the pooled values of all curricula measured."""
    pooled = {key: [v for p in parts for v in p[key]] for key in
              ("best_pos", "best_neg", "peak_pos", "peak_neg", "pair_pos", "pair_neg")}
    pos = list(zip(pooled["best_pos"], pooled["peak_pos"]))
    neg = list(zip(pooled["best_neg"], pooled["peak_neg"]))
    joint = capped_joint(pos, neg, cap)
    old = joint_rates(pos, neg, cfg["min_best_match"], cfg["min_peak"])
    out: dict[str, Any] = {"curricula": len(parts), "courses": sum(p["courses"] for p in parts),
                           "max_false_positive_rate": cap, "thresholds": {}}
    for name, value in (("min_best_match", joint["x"]), ("min_peak", joint["y"])):
        out["thresholds"][name] = {"threshold": value, "tpr": joint["tpr"], "fpr": joint["fpr"], "current": cfg[name],
                                   "at_current": old, "positives": len(pos), "negatives": len(neg)}
    sem = capped(pooled["pair_pos"], pooled["pair_neg"], cap)
    out["thresholds"]["semantic_threshold"] = {
        **sem, "current": cfg["semantic_threshold"], "positives": len(pooled["pair_pos"]),
        "negatives": len(pooled["pair_neg"]), "at_current": rates(pooled["pair_pos"], pooled["pair_neg"], cfg["semantic_threshold"])}
    return out, pooled


def cluster_quality(builder: Builder, curricula: list[dict[str, Any]], grid: list[float]) -> dict[float, dict[str, float]]:
    """Mean syllabus purity, overlapping pairs and candidates per curriculum for each cluster_threshold."""
    out = {}
    for t in grid:
        builder.cfg["cluster_threshold"] = t
        quality = [builder.build(data)["quality"] for data in curricula]
        purity = [q["syllabus_purity_mean"] for q in quality if q["syllabus_purity_mean"] is not None]
        out[t] = {"purity": float(np.mean(purity)) if purity else 0.0,
                  "overlap_pairs": float(np.mean([len(q["high_overlap_pairs"]) for q in quality])),
                  "candidates": float(np.mean([sum(q["by_origin"].values()) for q in quality])),
                  "curricula": len(purity)}
    return out


# --- charts and report ---------------------------------------------------------------------------

def chart_split(pos, neg, t: float, old: float, title: str, xlabel: str, folder, name) -> str:
    fig, ax = plt.subplots(figsize=(6.5, 3.0))
    bins = np.linspace(min(min(pos), min(neg)), max(max(pos), max(neg)), 40)
    ax.hist(neg, bins=bins, density=True, color=ORANGE, alpha=0.75, label="negatives")
    ax.hist(pos, bins=bins, density=True, color=BLUE, alpha=0.75, label="positives")
    ax.axvline(t, color=TEXT_2, linewidth=1.2, label=f"measured {t:.2f}")
    ax.axvline(old, color=TEXT_2, linewidth=1, linestyle="--", label=f"old {old:.2f}")
    ax.set_xlabel(xlabel)
    ax.set_yticks([])
    ax.grid(axis="y", visible=False)
    ax.legend(fontsize=7.5, loc="upper left", bbox_to_anchor=(1.0, 1.0))
    ax.set_title(title)
    return save(fig, folder, name)


def chart_cluster(by_t: dict[float, dict[str, float]], chosen: float, old: float, folder) -> str:
    xs = sorted(by_t)
    fig, ax = plt.subplots(figsize=(6.5, 2.8))
    ax.plot(xs, [by_t[x]["purity"] for x in xs], color=BLUE, linewidth=2, marker="o", markersize=5)
    ax.axvline(chosen, color=TEXT_2, linewidth=1.2)
    ax.axvline(old, color=TEXT_2, linewidth=1, linestyle="--")
    ax.set_xlabel("cluster_threshold")
    ax.set_ylabel("mean syllabus purity")
    ax.set_title(f"Cluster purity: best at {chosen:.2f} (dashed: old {old:.2f})")
    return save(fig, folder, "04-cluster-purity.png")


def report(m: dict[str, Any], figs: dict[str, str], parts: list[dict[str, Any]]) -> str:
    th = m["thresholds"]
    rows = [[f"`{k}`", f"{v['current']:.2f}", f"{v['threshold']:.3f}", f"{v['tpr']:.2f} / {v['fpr']:.2f}",
             f"{v['at_current']['tpr']:.2f} / {v['at_current']['fpr']:.2f}", f"{v['positives']} / {v['negatives']}"]
            for k, v in th.items() if k != "cluster_threshold"]
    c = th["cluster_threshold"]
    crow = [[f"{t:.2f}", f"{q['purity']:.3f}", f"{q['overlap_pairs']:.1f}", f"{q['candidates']:.1f}"]
            for t, q in sorted(c["by_threshold"].items())]
    return "\n".join([
        "# Calibration of the candidate thresholds", "",
        f"Thresholds: {m['curricula']} curricula, {m['courses']} courses to tag (electives only when "
        f"`electives_only`), pooled. Cluster threshold: {c['curricula']} curricula with specializations. "
        "Generated by `python -m tag_classifier.calibrate`; method in its docstring. No human labels: "
        "positives are phrases the pipeline picked as a course's top topic phrases; negatives are generic "
        "phrases (common across the catalogue) or courses whose syllabus does not contain the phrase. "
        f"Each threshold passes the most positives while letting through at most "
        f"{m['max_false_positive_rate']:.0%} of the negatives (`max_false_positive_rate`).", "",
        md_table(["Threshold", "Old", "Measured", "TPR / FPR measured", "TPR / FPR old", "Positives / negatives"], rows),
        "", "`min_best_match` and `min_peak` are chosen together for the combined rule, so they share one TPR / FPR.",
        "Positives are picked partly by their similarity to their course: treat TPR as optimistic.", "",
        f"![Best match]({figs['best']})", "", f"![Peak]({figs['peak']})", "", f"![Phrase about a course]({figs['pair']})", "",
        "## Cluster threshold", "",
        f"Old {c['current']:.2f}, measured **{c['threshold']:.2f}** (highest mean syllabus purity, with the "
        "measured thresholds above).", "",
        md_table(["cluster_threshold", "Mean purity", "Overlapping pairs", "Candidates"], crow), "",
        f"![Cluster purity]({figs['cluster']})", "",
        "## Curricula measured", "",
        md_table(["Curriculum", "Courses", "Topic phrases", "Generic phrases"],
                 [[p["code"], p["courses"], p["topics"], p["generic"]] for p in parts]), "",
    ])


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", action="append", help="curriculum code (repeatable); default: per [calibrate]")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    cal = cfg["calibrate"]
    records = load_records(cfg)
    curricula = read_json(resolve(cfg["paths"]["snapshot_dir"]) / "curricula.json")
    if args.curriculum:
        curricula = [x for x in curricula if x["code"] in set(args.curriculum)]
    else:
        curricula = [x for x in curricula if len(courses_to_tag(x, records, cfg["scope"]["electives_only"]))
                     >= cal["min_courses_to_tag"]]
    builder = Builder(cfg, records)
    parts = [p for p in (collect(builder, data) for data in curricula) if p]
    if not parts:
        raise SystemExit("no curriculum with enough courses to measure")
    print(f"  thresholds from {len(parts)} curricula")
    m, pooled = measure(parts, cfg["candidates"], cal["max_false_positive_rate"])
    th = m["thresholds"]
    builder.cfg = copy.deepcopy(builder.cfg) | {k: th[k]["threshold"] for k in ("min_best_match", "min_peak", "semantic_threshold")}
    with_specs = [x for x in curricula if sum(1 for v in specialization_members(x).values() if v) >= 2]
    print(f"  cluster threshold from {len(with_specs)} curricula with specializations")
    by_t = cluster_quality(builder, with_specs, cal["cluster_grid"])
    chosen = max(by_t, key=lambda t: (round(by_t[t]["purity"], 3), -abs(t - cfg["candidates"]["cluster_threshold"])))
    th["cluster_threshold"] = {"threshold": chosen, "current": cfg["candidates"]["cluster_threshold"],
                               "by_threshold": by_t, "curricula": by_t[chosen]["curricula"]}
    folder = resolve(cfg["candidates"]["report_dir"]) / "calibration"
    style()
    figs = {
        "best": chart_split(pooled["best_pos"], pooled["best_neg"], th["min_best_match"]["threshold"],
                            th["min_best_match"]["current"], "Best match with a course: topic vs generic phrases",
                            "cosine", folder, "01-best-match.png"),
        "peak": chart_split(pooled["peak_pos"], pooled["peak_neg"], th["min_peak"]["threshold"],
                            th["min_peak"]["current"], "Peak (best minus median): topic vs generic phrases",
                            "cosine difference", folder, "02-peak.png"),
        "pair": chart_split(pooled["pair_pos"], pooled["pair_neg"], th["semantic_threshold"]["threshold"],
                            th["semantic_threshold"]["current"], "Phrase vs a course: its own course vs courses without it",
                            "cosine", folder, "03-phrase-course.png"),
        "cluster": chart_cluster(by_t, chosen, th["cluster_threshold"]["current"], folder),
    }
    write_json(folder / "calibration.json", m)
    (folder / "report.md").write_text(report(m, figs, parts), encoding="utf-8", newline="\n")
    for name, v in th.items():
        print(f"  {name}: old {v['current']}, measured {v['threshold']:.3f}")
    print(f"-> {folder / 'report.md'}")


if __name__ == "__main__":
    main()
