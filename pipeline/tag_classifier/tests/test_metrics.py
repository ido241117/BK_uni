"""Metric functions against published worked examples."""

from __future__ import annotations

import math

import pytest

from tag_classifier.metrics import cohen_kappa, jaccard, krippendorff_alpha, pairwise_kappa, recall_precision


def test_krippendorff_alpha_published_example():
    # Krippendorff (2011), "Computing Krippendorff's Alpha-Reliability": 4 coders, 12 units,
    # missing values omitted; nominal alpha = 0.743.
    units = [[1, 1, 1], [2, 2, 3, 2], [3, 3, 3, 3], [3, 3, 3, 3], [2, 2, 2, 2], [1, 2, 3, 4],
             [4, 4, 4, 4], [1, 1, 2, 1], [2, 2, 2, 2], [5, 5, 5], [1, 1], [3]]
    assert krippendorff_alpha(units) == pytest.approx(0.743, abs=0.001)


def test_krippendorff_alpha_edge_cases():
    assert krippendorff_alpha([[1, 1], [0, 0], [1, 1]]) == pytest.approx(1.0)
    assert math.isnan(krippendorff_alpha([[1, 1], [1, 1]]))   # no variation: undefined
    assert math.isnan(krippendorff_alpha([[1], [0]]))         # no unit with two ratings
    assert krippendorff_alpha([[1, 0], [0, 1], [1, 0], [0, 1]]) < 0  # systematic disagreement


def test_cohen_kappa_textbook_example():
    # 50 items: yes/yes 20, yes/no 5, no/yes 10, no/no 15 -> kappa 0.4 (Wikipedia, Cohen's kappa).
    x = [1] * 25 + [0] * 25
    y = [1] * 20 + [0] * 5 + [1] * 10 + [0] * 15
    assert cohen_kappa(x, y) == pytest.approx(0.4)
    assert math.isnan(cohen_kappa([1, 1], [1, 1]))


def test_pairwise_kappa_uses_only_tags_both_models_scored():
    assign = {"a": {"c1": {"t1"}, "c2": set()}, "b": {"c1": {"t1", "t2"}, "c2": set()}}
    tags = {"a": {"t1"}, "b": {"t1", "t2"}}
    assert pairwise_kappa(assign, ["c1", "c2"], tags) == {("a", "b"): pytest.approx(1.0)}


def test_jaccard_and_recall_precision():
    assert jaccard(set(), set()) == 1.0 and jaccard({1, 2}, {2, 3}) == pytest.approx(1 / 3)
    r, p = recall_precision({"A", "B", "X"}, {"A", "B", "C", "D"})
    assert (r, p) == (0.5, pytest.approx(2 / 3))
    r, p = recall_precision(set(), {"A"})
    assert r == 0 and math.isnan(p)
