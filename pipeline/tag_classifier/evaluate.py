"""Step 5: automatic evaluation (no human labels) -> reports/03-eval/<name>/report.md + metrics.json

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.evaluate --curriculum CS-2023-KHMT
    tag_classifier/.venv/Scripts/python -m tag_classifier.evaluate --curriculum CS-2023-KHMT --scores CS-2023-KHMT.limit4.json

Checks, per model, on the courses that were scored:
    specialization recall    the faculty's specialization course lists are a free, partial answer key:
                             recall, and precision as a lower bound (the lists are incomplete)
    agreement                Cohen's kappa between every pair of models; Krippendorff's alpha per tag
                             across models (>= 0.667 is the usual "tentatively reliable" bar)
    section consistency      tags from the summary alone vs from the other sections; courses whose
                             summary is copied from another course are reported separately
    language stability       same scorer on English vs Vietnamese text (config stability_pairs)
    tags per course, run time
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np

from tag_classifier.aggregate import aggregate, course_tags
from tag_classifier.charts import BLUE, ORANGE, SEQUENTIAL, SURFACE, TEXT_2, md_table, save, style
from tag_classifier.common import load_config, load_curriculum, load_records, load_scores, resolve, utf8_stdout, write_json
from tag_classifier.metrics import jaccard, krippendorff_alpha, mean, pairwise_kappa, recall_precision
from tag_classifier.structure import specialization_members


def fmt(x: float, digits: int = 2) -> str:
    return "–" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{digits}f}"


class Evaluation:
    def __init__(self, scores: dict[str, Any], cfg: dict[str, Any]) -> None:
        self.cfg = cfg
        self.scores = scores
        self.code = scores["curriculum"]
        self.courses = scores["courses"]
        self.tags = aggregate(scores, cfg)["tags"]
        self.models = sorted(self.tags)
        self.assign = {m: {c: {t["tag"] for t in v} for c, v in self.tags[m].items()} for m in self.models}
        self.scorable = {m: {t for secs in scores["scores"][m].values() for s in secs.values() for t in s}
                         for m in self.models}
        self.curriculum = load_curriculum(cfg, self.code)
        self.records = load_records(cfg)

    def specialization_recall(self) -> dict[str, Any]:
        members = {spec: mem & set(self.courses) for spec, mem in specialization_members(self.curriculum).items()}
        out = {}
        for m in self.models:
            per = {}
            for spec, mem in sorted(members.items()):
                if spec in self.scorable[m] and mem:
                    got = {c for c in self.courses if spec in self.assign[m].get(c, set())}
                    per[spec] = recall_precision(got, mem)
            out[m] = {"per_specialization": {k: {"recall": r, "precision_lb": p} for k, (r, p) in per.items()},
                      "recall": mean([r for r, _ in per.values()]),
                      "precision_lb": mean([p for _, p in per.values()])}
        return out

    def agreement(self) -> dict[str, Any]:
        kappa = pairwise_kappa(self.assign, self.courses, self.scorable)
        alphas = {}
        for tag in sorted(set().union(*self.scorable.values())):
            raters = [m for m in self.models if tag in self.scorable[m]]
            if len(raters) >= 2:
                alphas[tag] = krippendorff_alpha([[int(tag in self.assign[m].get(c, set())) for m in raters]
                                                  for c in self.courses])
        defined = [a for a in alphas.values() if not math.isnan(a)]
        return {"pairwise_kappa": {f"{a} vs {b}": k for (a, b), k in kappa.items()},
                "alpha_per_tag": alphas, "alpha_mean": mean(defined),
                "tags_reliable": sum(a >= self.cfg["evaluate"]["reliable_alpha"] for a in defined),
                "tags_with_alpha": len(defined)}

    def section_consistency(self) -> dict[str, Any]:
        a = self.cfg["aggregate"]
        specs = {s["id"]: s for s in self.cfg["classify"]["models"]}
        out = {}
        for m in self.models:
            normal, copied = [], []
            for course, sections in self.scores["scores"][m].items():
                if "summary" not in sections or len(sections) < 2:
                    continue
                rest = {k: v for k, v in sections.items() if k != "summary"}
                kw = dict(top_k=a["section_top_k"], min_score=specs[m]["min_score"])
                summary = {t["tag"] for t in course_tags({"summary": sections["summary"]}, min_share=1, **kw)}
                others = {t["tag"] for t in course_tags(rest, min_share=a["min_section_share"], **kw)}
                flags = self.records.get(course, {}).get("flags", [])
                (copied if "copied_summary" in flags else normal).append(jaccard(summary, others))
            out[m] = {"jaccard": mean(normal), "courses": len(normal),
                      "copied_summary_jaccard": mean(copied), "copied_summary_courses": len(copied)}
        return out

    def stability(self) -> dict[str, Any]:
        out = {}
        for a, b in self.cfg["evaluate"]["stability_pairs"]:
            if a in self.assign and b in self.assign:
                out[f"{a} vs {b}"] = mean([jaccard(self.assign[a].get(c, set()), self.assign[b].get(c, set()))
                                           for c in self.courses])
        return out

    def tags_per_course(self) -> dict[str, list[int]]:
        return {m: [len(self.assign[m].get(c, set())) for c in self.courses] for m in self.models}

    def run(self) -> dict[str, Any]:
        return {"curriculum": self.code, "courses": len(self.courses), "models": self.models,
                "specialization_recall": self.specialization_recall(), "agreement": self.agreement(),
                "section_consistency": self.section_consistency(), "stability": self.stability(),
                "tags_per_course": self.tags_per_course(), "runtime": self.scores.get("runtime", {})}


# --- charts --------------------------------------------------------------------------------------

def chart_recall(m: dict[str, Any], folder: Path) -> str:
    rec = m["specialization_recall"]
    models = list(rec)
    y = np.arange(len(models))
    fig, ax = plt.subplots(figsize=(6.5, 0.5 + 0.55 * len(models)))
    for off, key, color, label in ((-0.19, "recall", BLUE, "Recall"), (0.19, "precision_lb", ORANGE, "Precision (lower bound)")):
        vals = [rec[x][key] for x in models]
        ax.barh(y + off, [0 if math.isnan(v) else v for v in vals], height=0.34, color=color, label=label)
        for i, v in enumerate(vals):
            ax.text((0 if math.isnan(v) else v) + 0.01, y[i] + off, fmt(v), va="center", fontsize=7.5, color=TEXT_2)
    ax.set_yticks(y, models)
    ax.invert_yaxis()
    ax.set_xlim(0, 1.12)
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.02), ncol=2, fontsize=8)
    ax.set_title("Specialization lists as a partial answer key", pad=22)
    return save(fig, folder, "01-specialization-recall.png")


def chart_kappa(m: dict[str, Any], folder: Path) -> str | None:
    models = m["models"]
    if len(models) < 2:
        return None
    mat = np.full((len(models), len(models)), np.nan)
    for key, k in m["agreement"]["pairwise_kappa"].items():
        a, b = key.split(" vs ")
        i, j = models.index(a), models.index(b)
        mat[i, j] = mat[j, i] = k
    np.fill_diagonal(mat, 1.0)
    fig, ax = plt.subplots(figsize=(1.2 + 0.9 * len(models), 0.9 + 0.8 * len(models)))
    ax.imshow(np.nan_to_num(mat, nan=0), cmap=SEQUENTIAL, vmin=0, vmax=1)
    for i in range(len(models)):
        for j in range(len(models)):
            v = mat[i, j]
            ax.text(j, i, fmt(v), ha="center", va="center", fontsize=8, color=SURFACE if v > 0.6 else TEXT_2)
    ax.set_xticks(range(len(models)), models, rotation=30, ha="right")
    ax.set_yticks(range(len(models)), models)
    ax.grid(False)
    ax.set_title("Agreement between models (Cohen's kappa)")
    return save(fig, folder, "02-kappa.png")


def chart_tags_per_course(m: dict[str, Any], folder: Path) -> str:
    data = m["tags_per_course"]
    fig, ax = plt.subplots(figsize=(6.5, 0.5 + 0.55 * len(data)))
    ax.boxplot(list(data.values()), orientation="horizontal", tick_labels=list(data), widths=0.5,
               medianprops={"color": ORANGE, "linewidth": 2}, boxprops={"color": BLUE},
               whiskerprops={"color": BLUE}, capprops={"color": BLUE}, flierprops={"markeredgecolor": TEXT_2})
    ax.invert_yaxis()
    ax.set_xlabel("Tags per course (rule (a))")
    ax.grid(axis="y", visible=False)
    ax.set_title("Tags per course")
    return save(fig, folder, "03-tags-per-course.png")


def chart_runtime(m: dict[str, Any], folder: Path) -> str | None:
    rt = {k: v["seconds_per_pair"] for k, v in m["runtime"].items() if v.get("seconds_per_pair")}
    if not rt:
        return None
    items = sorted(rt.items(), key=lambda kv: kv[1])
    fig, ax = plt.subplots(figsize=(6.5, 0.5 + 0.5 * len(items)))
    ax.barh(range(len(items)), [v for _, v in items], height=0.55, color=BLUE)
    for i, (_, v) in enumerate(items):
        ax.text(v * 1.15, i, f"{v:.3g} s", va="center", fontsize=8, color=TEXT_2)
    ax.set_xscale("log")
    ax.set_yticks(range(len(items)), [k for k, _ in items])
    ax.set_xlabel("Seconds per (section, tag) pair, log scale")
    ax.grid(axis="y", visible=False)
    ax.set_title("Scoring time on the machine that ran it")
    return save(fig, folder, "04-runtime.png")


# --- report --------------------------------------------------------------------------------------

def report(m: dict[str, Any], figs: dict[str, str | None], cfg: dict[str, Any]) -> str:
    rec, agr, sec = m["specialization_recall"], m["agreement"], m["section_consistency"]
    lines = [f"# Evaluation: {m['curriculum']}", "",
             f"{m['courses']} courses scored, models: {', '.join(m['models'])}. No human labels: every number below "
             "comes from the faculty's own course lists or from comparing scorers with each other.", "",
             "## Specialization recall", "",
             "Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of "
             "listed courses that got the specialization tag. Precision is a lower bound: a course outside the list "
             "may still deserve the tag.", ""]
    if figs["recall"]:
        lines += [f"![Specialization recall]({figs['recall']})", ""]
    specs = sorted({s for v in rec.values() for s in v["per_specialization"]})
    lines += [md_table(["Model", "Recall", "Precision (lb)", *specs],
                       [[x, fmt(v["recall"]), fmt(v["precision_lb"]),
                         *[fmt(v["per_specialization"].get(s, {}).get("recall", math.nan)) for s in specs]]
                        for x, v in rec.items()]), "",
              "## Agreement between models", ""]
    if figs["kappa"]:
        lines += [f"![Agreement]({figs['kappa']})", ""]
    lines += [md_table(["Pair", "Cohen's kappa"], [[k, fmt(v)] for k, v in agr["pairwise_kappa"].items()]), "",
              f"Krippendorff's alpha per tag across models: mean {fmt(agr['alpha_mean'])}; "
              f"{agr['tags_reliable']} of {agr['tags_with_alpha']} tags reach {cfg['evaluate']['reliable_alpha']} "
              "(tags every model left out of every course have no defined alpha).", "",
              "## Section consistency", "",
              "Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement "
              "flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.", "",
              md_table(["Model", "Jaccard", "Courses", "Copied summaries: Jaccard", "Courses"],
                       [[x, fmt(v["jaccard"]), v["courses"], fmt(v["copied_summary_jaccard"]), v["copied_summary_courses"]]
                        for x, v in sec.items()]), "",
              "## Language stability", "",
              md_table(["Same scorer, English vs Vietnamese text", "Jaccard of course tags"],
                       [[k, fmt(v)] for k, v in m["stability"].items()]) if m["stability"] else "Not run.", "",
              "## Tags per course", ""]
    if figs["tags"]:
        lines += [f"![Tags per course]({figs['tags']})", ""]
    lines += [md_table(["Model", "Mean", "Median", "Courses with no tag", "Max"],
                       [[x, fmt(float(np.mean(v)), 1), int(np.median(v)), sum(n == 0 for n in v), max(v)]
                        for x, v in m["tags_per_course"].items()]), "",
              "## Run time", ""]
    if figs["runtime"]:
        lines += [f"![Run time]({figs['runtime']})", ""]
    lines += [md_table(["Model", "Pairs", "Scored this run", "Seconds", "Seconds per pair"],
                       [[k, v["pairs"], v["scored"], v["seconds"], fmt(v["seconds_per_pair"], 3)]
                        for k, v in m["runtime"].items()]),
              "", "Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in "
              "the cache cost nothing and are not timed.", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", required=True)
    ap.add_argument("--scores", help="scores file name in data/scores (default: <curriculum>.json)")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    name = args.scores or f"{args.curriculum}.json"
    metrics = Evaluation(load_scores(cfg, name), cfg).run()
    folder = resolve(cfg["evaluate"]["report_dir"]) / Path(name).stem
    style()
    figs = {"recall": chart_recall(metrics, folder), "kappa": chart_kappa(metrics, folder),
            "tags": chart_tags_per_course(metrics, folder), "runtime": chart_runtime(metrics, folder)}
    write_json(folder / "metrics.json", metrics)
    (folder / "report.md").write_text(report(metrics, figs, cfg), encoding="utf-8", newline="\n")
    print(f"-> {folder / 'report.md'}")


if __name__ == "__main__":
    main()
