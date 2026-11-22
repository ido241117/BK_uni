"""Pure metric functions for the evaluation (no I/O)."""

from __future__ import annotations

import math
from collections import Counter
from itertools import combinations


def jaccard(a: set, b: set) -> float:
    """1.0 when both are empty (two scorers agreeing that a course has no tag)."""
    return len(a & b) / len(a | b) if a | b else 1.0


def cohen_kappa(x: list[int], y: list[int]) -> float:
    """Agreement of two binary raters beyond chance. NaN when chance agreement is 1 (a rater gives
    only one value)."""
    n = len(x)
    if n == 0:
        return math.nan
    po = sum(a == b for a, b in zip(x, y)) / n
    px, py = sum(x) / n, sum(y) / n
    pe = px * py + (1 - px) * (1 - py)
    return math.nan if pe == 1 else (po - pe) / (1 - pe)


def krippendorff_alpha(units: list[list[int]]) -> float:
    """Krippendorff's alpha for nominal data. units: one list of values per unit (the ratings the
    coders gave it; missing ratings omitted). Units with fewer than two ratings are ignored.
    NaN when all ratings are equal (no disagreement is possible to measure)."""
    o: Counter = Counter()
    for values in units:
        m = len(values)
        if m < 2:
            continue
        for i, j in ((i, j) for i in range(m) for j in range(m) if i != j):
            o[(values[i], values[j])] += 1 / (m - 1)
    n_c: Counter = Counter()
    for (c, _), w in o.items():
        n_c[c] += w
    n = sum(n_c.values())
    if n <= 1:
        return math.nan
    d_o = sum(w for (c, k), w in o.items() if c != k)
    d_e = sum(n_c[c] * n_c[k] for c in n_c for k in n_c if c != k) / (n - 1)
    return math.nan if d_e == 0 else 1 - d_o / d_e


def pairwise_kappa(assign: dict[str, dict[str, set[str]]], courses: list[str], tags: dict[str, set[str]]
                   ) -> dict[tuple[str, str], float]:
    """Cohen's kappa for every pair of models over the (course, tag) cells both models scored.
    assign[model][course] = assigned tags; tags[model] = tags the model could score."""
    out = {}
    for a, b in combinations(sorted(assign), 2):
        common = sorted(tags[a] & tags[b])
        x = [int(t in assign[a].get(c, set())) for c in courses for t in common]
        y = [int(t in assign[b].get(c, set())) for c in courses for t in common]
        out[(a, b)] = cohen_kappa(x, y)
    return out


def recall_precision(assigned: set[str], members: set[str]) -> tuple[float, float]:
    """Recall against a known course list, and precision as a lower bound (the list is incomplete:
    a course may deserve the tag without being listed). NaN when undefined."""
    hit = len(assigned & members)
    recall = hit / len(members) if members else math.nan
    precision = hit / len(assigned) if assigned else math.nan
    return recall, precision


def mean(values: list[float]) -> float:
    vals = [v for v in values if not math.isnan(v)]
    return sum(vals) / len(vals) if vals else math.nan
