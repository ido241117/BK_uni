"""Threshold choice of calibrate.py, against hand-computed answers."""

from __future__ import annotations

import pytest

from tag_classifier.calibrate import capped, capped_joint, joint_rates, measure, rates


def test_capped_passes_the_most_positives_within_the_false_positive_cap():
    neg = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]          # 10 negatives
    pos = [0.5, 0.75, 0.85, 0.99]
    # Candidate thresholds are all observed values. cap 0.2: at most 2 negatives at or above t; the
    # lowest such t is 0.85 (negatives 0.9, 0.95), which passes positives 0.85 and 0.99.
    assert capped(pos, neg, 0.2) == pytest.approx({"threshold": 0.85, "tpr": 0.5, "fpr": 0.2})
    # cap 0.4: t = 0.7 lets 4 negatives through (0.7, 0.8, 0.9, 0.95); 0.6 would let 5.
    assert capped(pos, neg, 0.4) == pytest.approx({"threshold": 0.7, "tpr": 0.75, "fpr": 0.4})


def test_capped_joint_chooses_both_thresholds_for_the_combined_rule():
    # Each negative fails one condition, so the pair separates them perfectly: TPR 1, FPR 0.
    pos, neg = [(0.6, 0.3), (0.7, 0.4)], [(0.65, 0.1), (0.3, 0.35)]
    r = capped_joint(pos, neg, 0.0)
    assert r["tpr"] == 1.0 and r["fpr"] == 0.0
    assert joint_rates(pos, neg, r["x"], r["y"]) == {"tpr": 1.0, "fpr": 0.0}
    assert capped([0.6, 0.7], [0.65, 0.3], 0.0)["tpr"] < 1.0           # one value alone cannot do it


def test_rates_at_a_given_threshold():
    assert rates([0.6, 0.7, 0.8], [0.1, 0.65], 0.65) == pytest.approx({"tpr": 2 / 3, "fpr": 0.5})


def test_measure_pools_curricula():
    part = {"courses": 2, "best_pos": [0.6, 0.7], "best_neg": [0.2], "peak_pos": [0.3, 0.3], "peak_neg": [0.1],
            "pair_pos": [0.5], "pair_neg": [0.1, 0.2]}
    cfg = {"min_best_match": 0.5, "min_peak": 0.2, "semantic_threshold": 0.4, "cluster_threshold": 0.7}
    m, pooled = measure([part, dict(part)], cfg, 0.0)
    th = m["thresholds"]
    assert m["courses"] == 4 and len(pooled["best_pos"]) == 4
    assert th["min_best_match"]["tpr"] == 1.0 and th["min_best_match"]["fpr"] == 0.0
    assert th["min_best_match"]["at_current"] == {"tpr": 1.0, "fpr": 0.0}
    assert th["semantic_threshold"]["threshold"] == 0.5               # lowest value above every negative
