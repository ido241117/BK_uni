"""Step 6a: one CSV per curriculum for the team's final decision -> review/<code>.csv

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.review --curriculum CS-2023-KHMT

One row per candidate tag: its labels and sources, the courses the primary model assigned it to,
how far the models agree (Krippendorff's alpha), and evidence (best-scoring section of the top
courses). Fill in `keep` (y / n), optionally `rename` and `note`, then run export. Regenerating keeps
what was already filled in (matched by tag key). Rows are sorted doubtful first, so the review
starts where judgment is needed; tags with no scored course come last. UTF-8 with BOM so Excel shows Vietnamese correctly.

After filling in `rename`, run classify again: it scores the new names, and this script then
lists the courses for them. Until then it warns that the renames are not scored yet.
"""

from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path
from typing import Any

from tag_classifier.common import (
    load_candidates, load_config, load_scores, read_decisions, read_renames, review_path, utf8_stdout,
)
from tag_classifier.evaluate import Evaluation
from tag_classifier.phrases import section_text

COLUMNS = ["tag", "label_vi", "label_en", "label_en_suggested", "sources", "courses", "course_count",
           "alpha", "reliable", "models_assigning", "evidence_1", "evidence_2", "evidence_3", "keep", "rename", "note"]


def stale_models(scores: dict[str, Any], renames: dict[str, str]) -> list[str]:
    """Models whose scores were computed with other renames than the CSV's current ones."""
    return sorted(m for m in scores["scores"] if scores.get("renamed", {}).get(m, {}) != renames)


def evidence(ev: Evaluation, model: str, tag: str, courses: list[str], names: dict[str, str], n: int = 3) -> list[str]:
    """For the courses scoring the tag highest: 'CODE name [section]: text of the best section'."""
    table = ev.scores["scores"][model]
    best = sorted(((max(table[c].items(), key=lambda kv: kv[1].get(tag, 0))[0],
                    max(s.get(tag, 0) for s in table[c].values()), c) for c in courses if c in table),
                  key=lambda x: -x[1])[:n]
    out = []
    for section, _, code in best:
        text = " ".join(section_text(ev.records[code], section, "en").split())[:160]
        out.append(f"{code} {names.get(code, '')} [{section}]: {text}")
    return out


def rows(code: str, cfg: dict[str, Any], scores_name: str) -> list[dict[str, Any]]:
    scores = load_scores(cfg, scores_name)
    stale = stale_models(scores, read_renames(cfg, code))
    if stale:
        print(f"WARNING: the rename column changed since classify ran for {', '.join(stale)}; their course "
              f"lists still come from the old names. Run: python -m tag_classifier.classify --curriculum {code}")
    ev = Evaluation(scores, cfg)
    model = next((m for m in cfg["review"]["primary_models"] if m in ev.models), None)
    if model is None:
        raise SystemExit(f"none of {cfg['review']['primary_models']} in {scores_name}")
    alphas = ev.agreement()["alpha_per_tag"]
    names = {c: (r.get("name_en") or r.get("name_vi") or "") for c, r in ev.records.items()}
    reliable = cfg["evaluate"]["reliable_alpha"]
    out = []
    for cand in load_candidates(cfg, code):
        tag = cand["key"]
        courses = sorted(c for c in ev.courses if tag in ev.assign[model].get(c, set()))
        alpha = alphas.get(tag, math.nan)
        sug = cand.get("label_en_suggested")
        ev_rows = evidence(ev, model, tag, courses, names)
        out.append({
            "tag": tag, "label_vi": cand.get("label_vi") or "", "label_en": cand.get("label_en") or "",
            "label_en_suggested": f"{sug['phrase']} ({sug['similarity']:.2f})" if sug else "",
            "sources": ", ".join(cand["source_types"]), "courses": " ".join(courses), "course_count": len(courses),
            "alpha": "" if math.isnan(alpha) else f"{alpha:.2f}",
            "reliable": "" if math.isnan(alpha) else ("yes" if alpha >= reliable else "no"),
            "models_assigning": ", ".join(m for m in ev.models if any(tag in v for v in ev.assign[m].values())),
            **{f"evidence_{i + 1}": (ev_rows[i] if i < len(ev_rows) else "") for i in range(3)},
            "keep": "", "rename": "", "note": "", "_alpha": -1 if math.isnan(alpha) else alpha,
        })
    # Doubtful first; tags with no scored course (e.g. only required courses, when electives_only) last.
    out.sort(key=lambda r: (r["course_count"] == 0, r["_alpha"], -r["course_count"]))
    return out


def write(code: str, cfg: dict[str, Any], scores_name: str) -> Path:
    path = review_path(cfg, code)
    kept = read_decisions(path)
    table = rows(code, cfg, scores_name)
    for row in table:
        row.update(kept.get(row["tag"], {}))
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(table)
    print(f"{code}: {len(table)} rows ({sum(1 for r in table if r['keep'])} already decided) -> {path}")
    return path


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", required=True)
    ap.add_argument("--scores", help="scores file name in data/scores (default: <curriculum>.json)")
    args = ap.parse_args(argv)
    utf8_stdout()
    write(args.curriculum, load_config(), args.scores or f"{args.curriculum}.json")


if __name__ == "__main__":
    main()
