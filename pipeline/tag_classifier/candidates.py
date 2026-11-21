"""Step 2: candidate tags per curriculum -> data/candidates/<code>.json + reports/02-candidates/<code>.md

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.candidates --curriculum CS-2023-KHMT
    tag_classifier/.venv/Scripts/python -m tag_classifier.candidates          # all curricula

Three sources, all within one curriculum and, with electives_only (config [scope]), only its elective
courses (catalogue-wide statistics such as phrase rarity still use every syllabus). Thresholds in
config.toml, [candidates]:
    structure  specializations, block and category names, with the faculty's course lists
    profile    noun phrases of the program profile (overview + career opportunities)
    syllabus   each course's top noun phrases, clustered by meaning across the curriculum's courses

A profile or syllabus phrase is kept only if it is clearly about some course: its best match with a
course is high (min_best_match), it covers at least min_courses courses (close by semantic_threshold,
or, for a syllabus cluster, a course where its phrases are top phrases), and its match is peaked rather
than vaguely similar to everything (min_peak). Thresholds are measured by calibrate.py. Candidates with the
same meaning are merged; structure names without an English label get a suggested one from the
curriculum's own English phrases (no machine translation).
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np

from tag_classifier.candidates_report import render
from tag_classifier.common import load_config, load_records, read_json, resolve, utf8_stdout, write_json
from tag_classifier.models import Embedder, NounPhraser
from tag_classifier.phrases import (
    PhraseIndex, catalogue_ratios, course_lines, course_text, mmr, specificity, template_lines,
)
from tag_classifier.structure import (
    courses_to_tag, elective_codes, slug, specialization_members, structure_candidates,
)
from tag_classifier.text import phrase_pattern

ORIGIN_ORDER = {"structure": 0, "profile": 1, "syllabus": 2}


@dataclass
class Curriculum:
    """One curriculum's courses to tag (usable syllabi; electives only per config) with their text and
    document vectors."""
    data: dict[str, Any]
    courses: list[dict[str, Any]]
    codes: list[str]
    texts_en: dict[str, str]
    texts_vi: dict[str, str]
    doc_vecs: np.ndarray


class Builder:
    def __init__(self, cfg: dict[str, Any], records: dict[str, dict[str, Any]]) -> None:
        self.cfg = cfg["candidates"]
        self.electives_only = cfg["scope"]["electives_only"]
        c = self.cfg
        self.records = records
        self.embedder = Embedder(c["embed_model"])
        phraser = NounPhraser(c["spacy_model"], c["ngram_max"], c["stop_words"], c["excluded_entity_types"])
        usable = [r for r in records.values() if r["usable"]]
        self.templates = template_lines(usable, c["template_min_courses"], c["template_min_words"])
        self.index = PhraseIndex(resolve(c["phrase_cache"]), phraser)
        self.index.ensure({line for r in usable for line in course_lines(r)})
        self.ratios = catalogue_ratios([self.index.course_phrases(r, self.templates) for r in usable])
        self.n_catalogue = len(usable)
        self.generic = {p for p, r in self.ratios.items() if r > c["max_catalogue_df_ratio"]}
        self.keyphrase_cache: dict[str, list[tuple[str, float]]] = {}

    # --- shared helpers ---------------------------------------------------------------------------

    def curriculum(self, data: dict[str, Any]) -> Curriculum:
        courses = courses_to_tag(data, self.records, self.electives_only)
        texts_en = {r["code"]: course_text(r, "en") for r in courses}
        texts_vi = {r["code"]: course_text(r, "vi") for r in courses}
        docs = [(texts_en[r["code"]] or texts_vi[r["code"]])[:4000] for r in courses]
        return Curriculum(data, courses, [r["code"] for r in courses], texts_en, texts_vi, self.embedder.encode(docs))

    def judge(self, phrases: list[str], cur: Curriculum, own: list[set[str]] | None = None) -> list[dict[str, Any]]:
        """How clearly each phrase is about some course of the curriculum. Near courses: syllabi with
        cosine >= semantic_threshold, plus `own` (a syllabus cluster's source courses, where its phrases
        are top phrases): a niche topic is rarely close to a whole syllabus, even the one teaching it."""
        if not phrases or not cur.codes:
            return []
        c = self.cfg
        sims = self.embedder.encode(phrases) @ cur.doc_vecs.T
        out = []
        for k, (phrase, row) in enumerate(zip(phrases, sims)):
            best = float(row.max())
            peak = best - float(np.median(row))
            near = {cur.codes[i] for i in np.where(row >= c["semantic_threshold"])[0]} | (own[k] if own else set())
            out.append({"phrase": phrase, "best_match": round(best, 3), "best_course": cur.codes[int(row.argmax())],
                        "peak": round(peak, 3), "near_courses": sorted(near),
                        "ok": best >= c["min_best_match"] and peak >= c["min_peak"] and len(near) >= c["min_courses"]})
        return out

    def keyphrases(self, rec: dict[str, Any]) -> list[tuple[str, float]]:
        """A course's top noun phrases: relevance = cosine with the syllabus x catalogue rarity, MMR."""
        key = rec["content_key"]
        if key not in self.keyphrase_cache:
            c = self.cfg
            cands = [p for p in self.index.course_phrases(rec, self.templates) if p not in self.generic]
            vecs = self.embedder.encode(cands)
            doc = self.embedder.encode([course_text(rec)[:4000]])
            rarity = np.array([specificity(self.ratios.get(p, 0), self.n_catalogue) for p in cands])
            rel = (vecs @ doc[0]) * rarity if cands else np.zeros(0)
            picked = mmr(rel, vecs, c["course_top_n"], c["mmr_diversity"])
            self.keyphrase_cache[key] = [(cands[i], float(rel[i])) for i in picked]
        return self.keyphrase_cache[key]

    # --- sources ----------------------------------------------------------------------------------

    def profile(self, cur: Curriculum) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
        prof = (cur.data.get("profile") or {}).get("en") or {}
        lines = [x.strip() for t in (prof.get("overview"), prof.get("career_opportunities")) if t
                 for x in re.split(r"(?<=[.!?])\s+|\n+", t) if x.strip()]
        phrases = sorted({p for found in self.index.phraser.phrases(lines) for p in found} - self.generic)
        verdicts = self.judge(phrases, cur)
        kept = sorted((v for v in verdicts if v["ok"]), key=lambda v: -v["best_match"])[:self.cfg["profile_top_n"]]
        cands = [{"key": slug(v["phrase"]), "label_vi": None, "label_en": v["phrase"], "origin": "profile",
                  "members": [], "semantic": v["near_courses"],
                  "sources": [{"type": "profile", **_brief(v),
                               "evidence": next((x for x in lines if v["phrase"] in x.lower()), None)}]}
                 for v in kept]
        return cands, [_brief(v) for v in verdicts if not v["ok"]], phrases

    def syllabus(self, cur: Curriculum) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
        """Pool every course's top phrases, cluster them by meaning, keep clusters that span at least
        min_courses courses and whose label passes judge()."""
        from sklearn.cluster import AgglomerativeClustering
        c = self.cfg
        pool: dict[str, dict[str, Any]] = defaultdict(lambda: {"courses": set(), "score": 0.0})
        for rec in cur.courses:
            for phrase, score in self.keyphrases(rec):
                pool[phrase]["courses"].add(rec["code"])
                pool[phrase]["score"] += score
        phrases = sorted(pool)
        if len(phrases) < 2:
            return [], [], phrases
        vecs = self.embedder.encode(phrases)
        labels = AgglomerativeClustering(n_clusters=None, metric="cosine", linkage="average",
                                         distance_threshold=1 - c["cluster_threshold"]).fit_predict(vecs)
        clusters: dict[int, list[int]] = defaultdict(list)
        for i, lab in enumerate(labels):
            clusters[lab].append(i)
        groups = []
        for idx in clusters.values():
            # Label = the most central phrase (highest mean cosine to the cluster), not the highest
            # scoring one, which tends to be an odd variant ("advanced predicate logic").
            centrality = (vecs[idx] @ vecs[idx].T).mean(axis=1)
            members = [phrases[i] for i in sorted(idx, key=lambda i: -centrality[idx.index(i)])]
            courses = set().union(*(pool[p]["courses"] for p in members))
            if len(courses) >= c["min_courses"]:
                groups.append((members, courses, sum(pool[p]["score"] for p in members)))
        verdicts = {v["phrase"]: v for v in self.judge([g[0][0] for g in groups], cur, own=[g[1] for g in groups])}
        cands, rejected = [], []
        for members, courses, score in sorted(groups, key=lambda g: -g[2]):
            v = verdicts[members[0]]
            if not v["ok"]:
                rejected.append(dict(_brief(v), courses=len(courses)))
                continue
            cands.append({"key": slug(members[0]), "label_vi": None, "label_en": members[0], "origin": "syllabus",
                          "members": [], "syllabus_courses": sorted(courses), "phrases": members,
                          "sources": [{"type": "syllabus", "phrases": members, "score": round(score, 3), **_brief(v)}]})
        return cands[:c["max_syllabus_candidates"]], rejected, phrases

    # --- merge, labels, coverage ------------------------------------------------------------------

    def merge(self, cands: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Greedy: in source order, each candidate joins the first head whose label has cosine >=
        merge_threshold. A head without an English label takes the joining English phrase."""
        cands = sorted(cands, key=lambda x: (ORIGIN_ORDER[x["origin"]], -len(x["members"])))
        vecs = self.embedder.encode([x["label_en"] or x["label_vi"] for x in cands])
        heads: list[int] = []
        out: list[dict[str, Any]] = []
        for i, cand in enumerate(cands):
            j = next((k for k, h in enumerate(heads) if float(vecs[i] @ vecs[h]) >= self.cfg["merge_threshold"]), None)
            if j is None:
                heads.append(i)
                out.append(dict(cand, merged_from=[]))
                continue
            head = out[j]
            head["merged_from"].append(cand["label_en"] or cand["label_vi"])
            head["sources"] = head["sources"] + cand["sources"]
            for field in ("members", "semantic", "syllabus_courses", "phrases"):
                if cand.get(field):
                    head[field] = sorted(set(head.get(field, [])) | set(cand[field]))
            if head["label_en"] is None and cand["label_en"]:
                head["label_en"], head["label_en_from"] = cand["label_en"], cand["origin"]
        return out

    def suggest_labels(self, cands: list[dict[str, Any]], english_pool: list[str]) -> None:
        """Structure names still without an English label get the closest English phrase of the
        curriculum's own profile and syllabi, if close enough. Marked as a suggestion to confirm."""
        # Single-word names are skipped: the model is unreliable on them ("Toán" -> "iot", 0.85).
        todo = [x for x in cands if x["label_en"] is None and x["label_vi"] and len(x["label_vi"].split()) > 1]
        if not todo or not english_pool:
            return
        sims = self.embedder.encode([x["label_vi"] for x in todo]) @ self.embedder.encode(english_pool).T
        for cand, row in zip(todo, sims):
            i = int(row.argmax())
            if row[i] >= self.cfg["suggest_threshold"]:
                cand["label_en_suggested"] = {"phrase": english_pool[i], "similarity": round(float(row[i]), 3)}

    def finalize(self, cands: list[dict[str, Any]], cur: Curriculum) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Coverage = faculty members (structure) + courses close in meaning (profile) + courses where
        the cluster's phrases are top phrases or appear verbatim (syllabus). Exact matches of short
        Vietnamese names are reported but not counted ("Toán" also matches "tính toán")."""
        kept, dropped = [], []
        seen: dict[str, int] = defaultdict(int)
        for cand in cands:
            english = [cand["label_en"]] if cand.get("label_en") else []
            lex_en, ev_en = _lexical(english + cand.get("phrases", []), cur.texts_en)
            lex_vi, ev_vi = _lexical([cand["label_vi"]] if cand.get("label_vi") else [], cur.texts_vi)
            coverage = set(cand["members"]) | set(cand.get("semantic", []))
            if cand.get("syllabus_courses"):
                coverage |= set(cand["syllabus_courses"]) | set(lex_en)
            seen[cand["key"]] += 1
            if seen[cand["key"]] > 1:
                cand["key"] = f"{cand['key']}-{seen[cand['key']]}"
            cand.update(lexical_courses=sorted(set(lex_en) | set(lex_vi)), coverage=sorted(coverage),
                        coverage_count=len(coverage), evidence=(ev_en + ev_vi)[:3],
                        source_types=sorted({s["type"] for s in cand["sources"]}))
            if len(coverage) < self.cfg["min_courses"]:
                dropped.append(dict(cand, drop_reason=f"covers {len(coverage)} course(s) < {self.cfg['min_courses']}"))
            else:
                kept.append(cand)
        kept.sort(key=lambda x: (ORIGIN_ORDER[x["origin"]], -x["coverage_count"], x["key"]))
        return kept, dropped

    # --- one curriculum ---------------------------------------------------------------------------

    def build(self, data: dict[str, Any]) -> dict[str, Any]:
        cur = self.curriculum(data)
        prof, prof_rejected, prof_phrases = self.profile(cur)
        syl, syl_rejected, syl_phrases = self.syllabus(cur)
        allowed = elective_codes(data) if self.electives_only else None
        raw = structure_candidates(data, self.cfg, allowed) + prof + syl
        merged = self.merge(raw)
        self.suggest_labels(merged, sorted(set(prof_phrases) | set(syl_phrases)))
        kept, dropped = self.finalize(merged, cur)
        return {
            "curriculum": data["code"], "name": data["name"], "faculty": data["faculty"],
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "models": {"embed": self.cfg["embed_model"], "spacy": self.cfg["spacy_model"]},
            "courses_total": len(data["courses"]), "courses_usable": len(cur.courses),
            "electives_only": self.electives_only,
            "raw_counts": {o: sum(x["origin"] == o for x in raw) for o in ORIGIN_ORDER},
            "candidates": kept, "dropped": dropped,
            "profile_rejected": sorted(prof_rejected, key=lambda v: -v["best_match"]),
            "syllabus_rejected": sorted(syl_rejected, key=lambda v: -v["best_match"]),
            "quality": quality(kept, data),
        }


def _brief(v: dict[str, Any]) -> dict[str, Any]:
    keys = ("phrase", "best_match", "best_course", "peak", "near_courses")
    return {k: (len(v[k]) if k == "near_courses" else v[k]) for k in keys}


def _lexical(labels: list[str], texts: dict[str, str], limit: int = 3) -> tuple[list[str], list[dict[str, str]]]:
    """Courses whose text contains any of the labels verbatim, plus a few evidence sentences."""
    pats = [phrase_pattern(x) for x in labels if x]
    courses, evidence = [], []
    for code, text in texts.items():
        hit = next((s for s in re.split(r"(?<=[.!?;])\s+|\n+", text) if any(p.search(s.lower()) for p in pats)), None)
        if hit:
            courses.append(code)
            if len(evidence) < limit:
                evidence.append({"course": code, "text": hit[:240]})
    return sorted(courses), evidence


def quality(cands: list[dict[str, Any]], data: dict[str, Any]) -> dict[str, Any]:
    """Numbers to judge a shortlist without human labels.
    purity: for syllabus candidates, the share of their specialization courses that fall in the
    single best-matching specialization (1.0 = the cluster stays inside one faculty grouping)."""
    specs = specialization_members(data)
    in_any = set().union(*specs.values()) if specs else set()
    purity = {}
    for cand in cands:
        inside = set(cand["coverage"]) & in_any
        if cand["origin"] == "syllabus" and len(inside) >= 2:
            purity[cand["key"]] = round(max(len(inside & s) for s in specs.values()) / len(inside), 2)
    overlaps = []
    for i, a in enumerate(cands):
        for b in cands[i + 1:]:
            union = set(a["coverage"]) | set(b["coverage"])
            jac = len(set(a["coverage"]) & set(b["coverage"])) / len(union) if union else 0
            if jac >= 0.6:
                overlaps.append({"a": a["key"], "b": b["key"], "jaccard": round(jac, 2)})
    return {
        "by_origin": {o: sum(x["origin"] == o for x in cands) for o in ORIGIN_ORDER},
        "with_evidence": sum(bool(x["evidence"]) for x in cands),
        "without_english_label": sum(not x["label_en"] for x in cands),
        "with_suggested_label": sum("label_en_suggested" in x for x in cands),
        "syllabus_purity": purity,
        "syllabus_purity_mean": round(float(np.mean(list(purity.values()))), 2) if purity else None,
        "high_overlap_pairs": sorted(overlaps, key=lambda x: -x["jaccard"]),
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--curriculum", action="append", help="curriculum code (repeatable); default: all")
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    curricula = read_json(resolve(cfg["paths"]["snapshot_dir"]) / "curricula.json")
    if args.curriculum:
        curricula = [x for x in curricula if x["code"] in set(args.curriculum)]
        if not curricula:
            raise SystemExit(f"no curriculum {args.curriculum}")
    records = load_records(cfg)
    builder = Builder(cfg, records)
    print(f"  {len(builder.templates)} template lines, {len(builder.generic)} generic phrases "
          f"(> {builder.cfg['max_catalogue_df_ratio']:.0%} of {builder.n_catalogue} syllabi)")
    out_dir, rep_dir = resolve(builder.cfg["out_dir"]), resolve(builder.cfg["report_dir"])
    rep_dir.mkdir(parents=True, exist_ok=True)
    for data in curricula:
        result = builder.build(data)
        write_json(out_dir / f"{data['code']}.json", result)
        (rep_dir / f"{data['code']}.md").write_text(render(result), encoding="utf-8", newline="\n")
        q = result["quality"]
        print(f"{data['code']}: {len(result['candidates'])} candidates {q['by_origin']}, dropped "
              f"{len(result['dropped'])}, purity {q['syllabus_purity_mean']}")


if __name__ == "__main__":
    main()
