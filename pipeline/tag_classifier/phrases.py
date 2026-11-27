"""Phrase statistics over the whole catalogue: template lines, cached noun phrases per line,
how common each phrase is across syllabi, and MMR ranking."""

from __future__ import annotations

import gzip
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np

from tag_classifier.common import TOPIC_SECTIONS
from tag_classifier.models import NounPhraser


def section_text(rec: dict[str, Any], section: str, lang: str) -> str:
    """One section of a cleaned course in one language ("" if absent); list sections joined by lines."""
    value = rec.get("sections", {}).get(section, {}).get(lang)
    return "\n".join(value) if isinstance(value, list) else (value or "")


def course_lines(rec: dict[str, Any], lang: str = "en") -> list[str]:
    """Non-empty lines of a course's topic sections in one language."""
    return [x.strip() for key in TOPIC_SECTIONS for x in section_text(rec, key, lang).split("\n") if x.strip()]


def course_text(rec: dict[str, Any], lang: str = "en") -> str:
    return "\n".join(course_lines(rec, lang))


def template_lines(records: list[dict[str, Any]], min_courses: int, min_words: int) -> set[str]:
    """Sentences (>= min_words words) repeated verbatim, case-insensitive, in at least min_courses
    different courses, e.g. "an ability to identify, formulate, and solve complex engineering
    problems ...". Short repeated lines are topic headings ("mass moment of inertia") and stay.
    Template lines are kept for classification but skipped when extracting candidate phrases."""
    seen: Counter = Counter()
    for rec in records:
        seen.update({line.lower() for line in course_lines(rec) if len(line.split()) >= min_words})
    return {line for line, n in seen.items() if n >= min_courses}


class PhraseIndex:
    """Noun phrases per line, cached on disk. Keyed by line text, so template and threshold changes
    reuse the cache; the first row stores the phraser settings, and the cache is rebuilt when they
    change (stop words, spaCy model, max words)."""

    def __init__(self, path: Path, phraser: NounPhraser) -> None:
        self.path = path
        self.phraser = phraser
        self.settings = phraser.settings()
        self.cache: dict[str, list[str]] = {}
        if path.exists():
            with gzip.open(path, "rt", encoding="utf-8") as f:
                rows = map(json.loads, f)
                if next(rows, {}).get("settings") == self.settings:
                    self.cache = {row["line"]: row["phrases"] for row in rows}
                else:
                    print("  noun phrases: settings changed, rebuilding the cache")

    def ensure(self, lines: set[str]) -> None:
        todo = sorted(lines - self.cache.keys())
        if not todo:
            return
        print(f"  noun phrases: {len(todo)} new lines")
        self.cache.update(zip(todo, self.phraser.phrases(todo)))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(self.path, "wt", encoding="utf-8") as f:
            f.write(json.dumps({"settings": self.settings}) + "\n")
            for line in sorted(self.cache):
                f.write(json.dumps({"line": line, "phrases": self.cache[line]}, ensure_ascii=False) + "\n")

    def course_phrases(self, rec: dict[str, Any], templates: set[str]) -> list[str]:
        found: set[str] = set()
        for line in course_lines(rec):
            if line.lower() not in templates:
                found.update(self.cache.get(line, []))
        return sorted(found)


def catalogue_ratios(phrase_sets: list[list[str]]) -> dict[str, float]:
    """Share of syllabi (whole catalogue) that contain each phrase."""
    df: dict[str, int] = defaultdict(int)
    for phrases in phrase_sets:
        for p in phrases:
            df[p] += 1
    n = max(len(phrase_sets), 1)
    return {p: c / n for p, c in df.items()}


def specificity(ratio: float, n: int) -> float:
    """IDF weight scaled to 0..1: the rarer a phrase across the catalogue, the closer to 1."""
    return float(np.log(1 / max(ratio, 1 / n)) / np.log(n))


def mmr(relevance: np.ndarray, vecs: np.ndarray, top_n: int, diversity: float) -> list[int]:
    """Maximal marginal relevance: pick relevant items that are not near-duplicates of each other."""
    if len(relevance) == 0:
        return []
    chosen = [int(np.argmax(relevance))]
    rest = set(range(len(relevance))) - set(chosen)
    while rest and len(chosen) < top_n:
        idx = list(rest)
        score = (1 - diversity) * relevance[idx] - diversity * (vecs[idx] @ vecs[chosen].T).max(axis=1)
        best = idx[int(np.argmax(score))]
        chosen.append(best)
        rest.remove(best)
    return chosen
