"""Step 6a: one Excel workbook per curriculum for the team's final decision -> review/<code>.xlsx

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.review --curriculum CS-2023-KHMT

Sheet "Tags", one row per candidate tag: the tag name, the courses the primary model assigned it to
(one per line, with names), how far the models agree (Krippendorff's alpha; rows below the reliable
bar are shaded) and evidence (best-scoring section of the top courses). Fill in Keep (Keep / Drop),
optionally Rename and Note, then run export. Rows are sorted doubtful first; tags with no scored course
come last. Sheet "Courses": each elective with its tags, to check course by course. Regenerating keeps
Keep / Rename / Note (matched by tag key); close the workbook in Excel first.

Every run also rebuilds review/shared.xlsx from all program workbooks: one row per tag name, so a tag
several programs share is decided once (a program row's own Keep / Rename wins). Its decisions are
kept on regeneration.

A Rename is either a display name (export it as is; export marks it as not re-scored) or a change of
meaning: then run classify again, which scores the new name, and this script lists its courses.
Layout: workbook.py.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from tag_classifier.common import (
    add_family_args, chosen_families, load_candidates, load_config, load_scores, resolve, stale_models,
    utf8_stdout,
)
from tag_classifier.evaluate import Evaluation
from tag_classifier.family import load_family
from tag_classifier.phrases import section_text
from tag_classifier.workbook import (
    SHARED_FILE, course_codes, describe, norm_name, program_workbooks, read_decisions, read_review_rows, read_shared,
    review_path, write_review, write_shared,
)


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


def tag_name(cand: dict[str, Any]) -> tuple[str, str]:
    """(name shown and exported unless renamed, where it comes from): the English label the models
    scored, else the Vietnamese name."""
    if cand.get("label_en"):
        return cand["label_en"], ""
    if cand.get("label_en_suggested"):
        sug = cand["label_en_suggested"]
        return sug["phrase"], f"suggested ({sug['similarity']:.2f}), check it"
    return cand.get("label_vi") or cand["key"], "Vietnamese only"


def sheets(code: str, cfg: dict[str, Any], scores_name: str, decisions: dict[str, dict[str, str]],
           shared: dict[str, dict[str, str]] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Rows of the Tags and Courses sheets."""
    scores = load_scores(cfg, scores_name)
    stale = stale_models(scores, {t: d["rename"] for t, d in decisions.items() if d["rename"]})
    if stale:
        print(f"Note: renames not re-scored by {', '.join(stale)}; course lists still come from the old names. "
              "Fine for a display rename (export marks it as not re-scored); if a rename changes what the tag "
              f"means, run: python -m tag_classifier.classify --curriculum {code}")
    ev = Evaluation(scores, cfg)
    model = next((m for m in cfg["review"]["primary_models"] if m in ev.models), None)
    if model is None:
        raise SystemExit(f"none of {cfg['review']['primary_models']} in {scores_name}")
    alphas = ev.agreement()["alpha_per_tag"]
    names = {c: (r.get("name_en") or r.get("name_vi") or "") for c, r in ev.records.items()}
    cohorts = load_family(cfg, code)["cohort_courses"]

    def course_line(c: str) -> str:
        """'CODE name', plus the cohorts having it when not all of the family's cohorts do."""
        having = [k for k, courses in cohorts.items() if c in courses]
        only = f" [{', '.join(having)} only]" if 0 < len(having) < len(cohorts) else ""
        return f"{c} {names.get(c, '')}".strip() + only
    reliable = cfg["evaluate"]["reliable_alpha"]
    tags, shown = [], {}
    for cand in load_candidates(cfg, code):
        tag = cand["key"]
        courses = sorted(c for c in ev.courses if tag in ev.assign[model].get(c, set()))
        alpha = alphas.get(tag, math.nan)
        label, source = tag_name(cand)
        decided = decisions.get(tag, {})
        shown[tag] = decided.get("rename") or label
        tags.append({
            **{k: decided.get(k, "") for k in ("keep", "rename", "note")},
            "shared": describe((shared or {}).get(norm_name(label), {})),
            "tag": tag, "label": label, "label_source": source, "label_vi": cand.get("label_vi") or "",
            "courses": "\n".join(course_line(c) for c in courses), "course_count": len(courses),
            "alpha": "" if math.isnan(alpha) else round(alpha, 2),
            "models": ", ".join(m for m in ev.models if any(tag in v for v in ev.assign[m].values())),
            "sources": ", ".join(cand["source_types"]),
            "evidence": "\n\n".join(evidence(ev, model, tag, courses, names)),
            "doubtful": math.isnan(alpha) or alpha < reliable, "_alpha": -1 if math.isnan(alpha) else alpha,
        })
    # Doubtful first; tags with no scored course last.
    tags.sort(key=lambda r: (r["course_count"] == 0, r["_alpha"], -r["course_count"]))
    courses = [{"code": c, "name": names.get(c, ""),
                "tags": ", ".join(sorted(shown[t] for t in ev.assign[model].get(c, set()) if t in shown))}
               for c in ev.courses]
    return tags, courses


def write(code: str, cfg: dict[str, Any], scores_name: str) -> Path:
    path = review_path(cfg, code)
    decisions = read_decisions(path)
    tags, courses = sheets(code, cfg, scores_name, decisions, read_shared(path.parent))
    write_review(path, tags, courses)
    print(f"{code}: {len(tags)} tags ({sum(1 for r in tags if r['keep'])} already decided), "
          f"{len(courses)} courses -> {path}")
    return path


def shared_rows(folder: Path) -> list[dict[str, Any]]:
    """One row per tag name across the program workbooks, with the shared decisions kept."""
    decided = read_shared(folder)
    groups: dict[str, dict[str, Any]] = {}
    for path in program_workbooks(folder):
        for row in read_review_rows(path):
            name = norm_name(row.get("label") or "")
            if not name:
                continue
            g = groups.setdefault(name, {"name": row["label"], "programs": {}, "courses": set(), "alphas": []})
            codes = course_codes(row.get("courses", ""))
            g["programs"][path.stem] = len(codes)
            g["courses"].update(codes)
            if row.get("alpha"):
                g["alphas"].append(float(row["alpha"]))
    rows = [{**decided.get(name, {}), "name": g["name"], "program_count": len(g["programs"]),
             "programs": "\n".join(f"{code}: {n}" for code, n in sorted(g["programs"].items())),
             "course_count": len(g["courses"]),
             "alpha": round(sum(g["alphas"]) / len(g["alphas"]), 2) if g["alphas"] else ""}
            for name, g in groups.items()]
    return sorted(rows, key=lambda r: (-r["program_count"], -r["course_count"], r["name"].lower()))


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    add_family_args(ap)
    ap.add_argument("--scores", help="scores file name in data/scores, one family only (default: <family>.json)")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    codes = chosen_families(cfg, args)
    if args.scores and len(codes) != 1:
        raise SystemExit("--scores needs exactly one --family")
    for code in codes:
        write(code, cfg, args.scores or f"{code}.json")
    folder = resolve(cfg["review"]["out_dir"])
    rows = shared_rows(folder)
    write_shared(folder / SHARED_FILE, rows)
    print(f"shared: {len(rows)} tag names, {sum(1 for r in rows if r['program_count'] > 1)} in several programs "
          f"-> {folder / SHARED_FILE}")


if __name__ == "__main__":
    main()
