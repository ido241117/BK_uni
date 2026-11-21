"""Step 4: per-course tags from section scores (rule (a)) -> data/tags/<code>.json

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.aggregate --curriculum CS-2023-KHMT

Rule (a), per model and course: in each section, take the top `section_top_k` tags scoring at least
the model's `min_score`; a tag is kept for the course if it was picked in at least
`min_section_share` of the course's sections. Ties are ordered by mean score over the sections.
"""

from __future__ import annotations

import argparse
import math
from typing import Any

from tag_classifier.common import load_config, load_scores, resolve, utf8_stdout, write_json


def course_tags(sections: dict[str, dict[str, float]], top_k: int, min_score: float,
                min_share: float) -> list[dict[str, Any]]:
    """sections: {section: {tag: score}} -> kept tags with how many sections picked them."""
    picked: dict[str, int] = {}
    for scores in sections.values():
        for tag, s in sorted(scores.items(), key=lambda kv: -kv[1])[:top_k]:
            if s >= min_score:
                picked[tag] = picked.get(tag, 0) + 1
    need = max(1, math.ceil(min_share * len(sections)))
    mean = {t: sum(s.get(t, 0.0) for s in sections.values()) / len(sections) for t in picked}
    kept = [t for t, n in picked.items() if n >= need]
    return [{"tag": t, "sections": picked[t], "of": len(sections), "mean_score": round(mean[t], 4)}
            for t in sorted(kept, key=lambda t: (-picked[t], -mean[t]))]


def aggregate(scores: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    a = cfg["aggregate"]
    specs = {m["id"]: m for m in cfg["classify"]["models"]}
    out: dict[str, Any] = {"curriculum": scores["curriculum"], "rule": dict(a), "tags": {}}
    for model, table in scores["scores"].items():
        min_score = specs[model]["min_score"]
        out["tags"][model] = {course: course_tags(sections, a["section_top_k"], min_score, a["min_section_share"])
                              for course, sections in table.items()}
    return out


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", required=True)
    ap.add_argument("--scores", help="scores file name in data/scores (default: <curriculum>.json)")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    name = args.scores or f"{args.curriculum}.json"
    result = aggregate(load_scores(cfg, name), cfg)
    out = resolve(cfg["aggregate"]["out_dir"]) / name
    write_json(out, result)
    for model, courses in result["tags"].items():
        n = [len(v) for v in courses.values()]
        print(f"  {model}: {sum(n) / max(len(n), 1):.1f} tags per course (min {min(n, default=0)}, max {max(n, default=0)})")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
