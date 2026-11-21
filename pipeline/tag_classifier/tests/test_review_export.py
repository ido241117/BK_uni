"""Review CSV round trip (human columns survive regeneration) and export validation."""

from __future__ import annotations

import csv

import pytest

from tag_classifier.export import build, read_reviews
from tag_classifier.common import read_decisions
from tag_classifier.review import COLUMNS, stale_models


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLUMNS})


def test_read_decisions_keeps_only_human_columns(tmp_path):
    path = tmp_path / "C1.csv"
    write_csv(path, [{"tag": "TNT", "keep": "y", "rename": " AI ", "note": "ok", "alpha": "0.9"}])
    assert read_decisions(path) == {"TNT": {"keep": "y", "rename": "AI", "note": "ok"}}
    assert read_decisions(tmp_path / "missing.csv") == {}


def test_stale_models_compares_scored_renames_with_the_csv():
    scores = {"scores": {"a": {}, "b": {}, "c": {}}, "renamed": {"a": {"CND": "data"}, "b": {}}}
    assert stale_models(scores, {"CND": "data"}) == ["b", "c"]      # c: scored before renames existed
    assert stale_models(scores, {}) == ["a"]
    assert stale_models({"scores": {"a": {}}}, {}) == []             # old scores file, no renames: fine


def test_read_reviews_exports_kept_rows_with_rename(tmp_path):
    write_csv(tmp_path / "C1.csv", [
        {"tag": "TNT", "label_vi": "Trí tuệ nhân tạo ứng dụng", "label_en": "artificial intelligence",
         "courses": "CO3117 CO3061", "keep": "Y", "rename": "AI"},
        {"tag": "toan", "label_vi": "Toán", "courses": "MT1003", "keep": "n"},
        {"tag": "big-data", "label_en": "big data", "courses": "CO3137, CO4033", "keep": "y"},
        {"tag": "web", "label_en": "web programming", "courses": "CO3049", "keep": ""},
    ])
    write_csv(tmp_path / "C2.csv", [{"tag": "x", "label_vi": "Toán ứng dụng", "courses": "MT2013", "keep": "y"}])
    by_curr, errors = read_reviews(tmp_path)
    assert errors == []
    assert by_curr == {"C1": {"AI": ["CO3061", "CO3117"], "big data": ["CO3137", "CO4033"]},
                       "C2": {"Toán ứng dụng": ["MT2013"]}}
    data = build(by_curr)
    assert data["tags"] == {"AI": ["CO3061", "CO3117"], "Toán ứng dụng": ["MT2013"], "big data": ["CO3137", "CO4033"]}


def test_read_reviews_reports_typos_and_empty_course_lists(tmp_path):
    write_csv(tmp_path / "C1.csv", [{"tag": "a", "label_en": "a", "courses": "X1", "keep": "yes"},
                                    {"tag": "b", "label_en": "b", "courses": "", "keep": "y"}])
    _, errors = read_reviews(tmp_path)
    assert len(errors) == 2
    assert "keep must be y, n or empty" in errors[0] and "'yes'" in errors[0]
    assert "no courses" in errors[1]


def test_build_merges_same_label_across_curricula():
    data = build({"C1": {"logic": ["A"]}, "C2": {"logic": ["B", "A"]}})
    assert data["tags"] == {"logic": ["A", "B"]}
    assert data["by_curriculum"]["C2"] == {"logic": ["B", "A"]}


@pytest.mark.parametrize("value", ["y", "n", "", " Y ", "N"])
def test_valid_keep_values(tmp_path, value):
    write_csv(tmp_path / "C1.csv", [{"tag": "a", "label_en": "a", "courses": "X1", "keep": value}])
    assert read_reviews(tmp_path)[1] == []
