"""Step 3: score every (course, section, candidate tag) with each model -> data/scores/<code>.json

    cd pipeline
    set HF_HOME=D:/hf-cache          (optional: where models are downloaded)
    tag_classifier/.venv/Scripts/python -m tag_classifier.classify --curriculum CS-2023-KHMT
    tag_classifier/.venv/Scripts/python -m tag_classifier.classify --curriculum CS-2023-KHMT --limit 3 --model bart

Each topic section (summary, objectives, learning_outcomes, sessions) is scored on its own, so step 4
can apply the per-section majority rule. English-only models read the English text and need an
English label (the label, else the suggested one); tags with only a Vietnamese label are skipped for
them. Multilingual models fall back to Vietnamese text and labels; a "vi" run reads Vietnamese only.
With electives_only (config), only courses in elective groups are scored. Scores are cached in
cache/scores.sqlite by (model, text hash, label), so re-runs only score new pairs.

A name in the `rename` column of review/<code>.csv replaces the tag's English label here, so the
models score the name the team chose (only the renamed tags are new pairs). The scores file records,
per model, which renames were scored (`renamed`); review.py warns when they are out of date.
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
import time
from pathlib import Path
from typing import Any

from tag_classifier.common import (
    TOPIC_SECTIONS, load_candidates, load_config, load_curriculum, load_records, read_json, read_renames, resolve,
    utf8_stdout, write_json,
)
from tag_classifier.phrases import section_text
from tag_classifier.scorers import make_scorer
from tag_classifier.structure import elective_codes


def tag_label(cand: dict[str, Any], lang: str, keyword: bool = False) -> str | None:
    """Label a model reads for this tag. Keyword matching also gets the cluster's phrases."""
    english = cand.get("label_en") or (cand.get("label_en_suggested") or {}).get("phrase")
    if keyword:
        phrases = [english, *cand.get("phrases", [])] if english else []
        return " | ".join(p for p in phrases if p) or None
    if lang == "en":
        return english
    if lang == "vi":
        return cand.get("label_vi") or english
    return english or cand.get("label_vi")


def apply_renames(cands: list[dict[str, Any]], renames: dict[str, str]) -> list[dict[str, Any]]:
    """Candidates with the team's new English name as their label."""
    return [dict(c, label_en=renames[c["key"]]) if c["key"] in renames else c for c in cands]


def course_section_text(rec: dict[str, Any], section: str, lang: str) -> str:
    if lang == "vi":
        return section_text(rec, section, "vi")
    return section_text(rec, section, "en") or (section_text(rec, section, "vi") if lang == "multi" else "")


def scored_courses(curr: dict[str, Any], records: dict[str, dict[str, Any]], electives_only: bool) -> list[dict[str, Any]]:
    """Usable courses of the curriculum; with electives_only, only members of elective groups."""
    codes = curr["courses"]
    if electives_only:
        electives = elective_codes(curr)
        codes = [x for x in codes if x in electives]
    return [records[x] for x in codes if x in records and records[x]["usable"]]


class ScoreCache:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("create table if not exists scores (model text, text_hash text, label text, score real, "
                        "primary key (model, text_hash, label))")

    def get(self, model: str, keys: list[tuple[str, str]]) -> dict[tuple[str, str], float]:
        out = {}
        for h, label in keys:
            row = self.db.execute("select score from scores where model=? and text_hash=? and label=?",
                                  (model, h, label)).fetchone()
            if row:
                out[(h, label)] = row[0]
        return out

    def put(self, model: str, rows: list[tuple[str, str, float]]) -> None:
        self.db.executemany("insert or replace into scores values (?, ?, ?, ?)", [(model, *r) for r in rows])
        self.db.commit()


def digest(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def units(courses: list[dict[str, Any]], cands: list[dict[str, Any]], spec: dict[str, Any]):
    """(course, section, tag, text, label) for one model."""
    lang = spec["lang"]
    for rec in courses:
        for section in TOPIC_SECTIONS:
            text = course_section_text(rec, section, lang)
            if not text:
                continue
            for cand in cands:
                label = tag_label(cand, lang, keyword=spec["kind"] == "keyword")
                if label:
                    yield rec["code"], section, cand["key"], text, label


def classify(code: str, cfg: dict[str, Any], model_ids: list[str] | None, limit: int | None,
             batch_size: int | None = None) -> dict[str, Any]:
    c = cfg["classify"]
    courses = scored_courses(load_curriculum(cfg, code), load_records(cfg), c["electives_only"])[:limit]
    renames = read_renames(cfg, code)
    cands = apply_renames(load_candidates(cfg, code), renames)
    if renames:
        print(f"  {len(renames)} renamed tag(s) from the review CSV: {renames}")
    cache = ScoreCache(resolve(c["cache"]))
    result: dict[str, Any] = {"curriculum": code, "courses": [r["code"] for r in courses],
                              "tags": [x["key"] for x in cands], "scores": {}, "runtime": {}, "renamed": {}}
    for spec in c["models"]:
        if model_ids and spec["id"] not in model_ids:
            continue
        rows = list(units(courses, cands, spec))
        keys = [(digest(text), label) for _, _, _, text, label in rows]
        known = cache.get(spec["id"], keys)
        todo = sorted({k: (rows[i][3], k[1]) for i, k in enumerate(keys) if k not in known}.items())
        started = time.perf_counter()
        if todo:
            scorer = make_scorer({**spec, "batch_size": batch_size or spec.get("batch_size")})
            print(f"  {spec['id']}: scoring {len(todo)} new pairs ({len(set(keys)) - len(todo)} distinct pairs cached)")
            for i in range(0, len(todo), c["checkpoint_every"]):
                chunk = todo[i:i + c["checkpoint_every"]]
                scores = scorer.score([t for _, (t, _) in chunk], [lab for _, (_, lab) in chunk])
                cache.put(spec["id"], [(k[0], k[1], float(s)) for (k, _), s in zip(chunk, scores)])
                known.update({k: float(s) for (k, _), s in zip(chunk, scores)})
                done = min(i + c["checkpoint_every"], len(todo))
                rate = (time.perf_counter() - started) / done
                print(f"    {done}/{len(todo)} pairs, {rate:.3f} s/pair, ~{rate * (len(todo) - done) / 60:.0f} min left")
        seconds = time.perf_counter() - started
        table: dict[str, dict[str, dict[str, float]]] = {}
        for (course, section, tag, _, _), k in zip(rows, keys):
            table.setdefault(course, {}).setdefault(section, {})[tag] = round(known[k], 4)
        result["scores"][spec["id"]] = table
        result["renamed"][spec["id"]] = renames
        result["runtime"][spec["id"]] = {"pairs": len(keys), "scored": len(todo), "seconds": round(seconds, 1),
                                         "seconds_per_pair": round(seconds / len(todo), 4) if todo else None}
        print(f"  {spec['id']}: {len(keys)} pairs, {len(todo)} scored in {seconds:.0f} s")
    return result


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", required=True)
    ap.add_argument("--model", action="append", help="model id from config (repeatable); default: all")
    ap.add_argument("--limit", type=int, help="only the first N courses (pilot)")
    ap.add_argument("--batch-size", type=int, help="override the NLI batch size (e.g. 64 on a GPU)")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    result = classify(args.curriculum, cfg, args.model, args.limit, args.batch_size)
    suffix = f".limit{args.limit}" if args.limit else ""
    out = resolve(cfg["classify"]["out_dir"]) / f"{args.curriculum}{suffix}.json"
    if out.exists():  # keep scores of models not run this time
        old = read_json(out)
        for key in ("scores", "runtime", "renamed"):
            result[key] = {**old.get(key, {}), **result[key]}
    write_json(out, result)
    print(f"-> {out}")


if __name__ == "__main__":
    main()
