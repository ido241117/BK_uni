"""Deterministic parts of steps 3-4: label choice, pair building, keyword scorer, score cache,
and the per-section majority rule."""

from __future__ import annotations

from tag_classifier.aggregate import course_tags
from tag_classifier.classify import ScoreCache, apply_renames, tag_label, units
from tag_classifier.scorers import KeywordScorer

CAND_EN = {"key": "TNT", "label_vi": "Trí tuệ nhân tạo ứng dụng", "label_en": "artificial intelligence",
           "phrases": ["neural networks"]}
CAND_SUGGESTED = {"key": "XLA", "label_vi": "Xử lý ảnh", "label_en": None,
                  "label_en_suggested": {"phrase": "computer vision", "similarity": 0.83}}
CAND_VI = {"key": "toan", "label_vi": "Toán", "label_en": None}


def test_tag_label_per_language():
    assert tag_label(CAND_EN, "en") == "artificial intelligence"
    assert tag_label(CAND_SUGGESTED, "en") == "computer vision"
    assert tag_label(CAND_VI, "en") is None              # English models skip Vietnamese-only tags
    assert tag_label(CAND_VI, "multi") == "Toán"
    assert tag_label(CAND_EN, "en", keyword=True) == "artificial intelligence | neural networks"


def test_renamed_tag_is_scored_under_its_new_name():
    renamed = apply_renames([CAND_EN, CAND_SUGGESTED, CAND_VI], {"XLA": "image processing", "toan": "mathematics"})
    assert [tag_label(c, "en") for c in renamed] == ["artificial intelligence", "image processing", "mathematics"]
    assert tag_label(renamed[2], "vi") == "Toán"                       # Vietnamese runs keep the Vietnamese name
    assert tag_label(renamed[1], "en", keyword=True) == "image processing"
    assert CAND_SUGGESTED["label_en"] is None                          # input candidates unchanged


def test_units_skip_empty_sections_and_fall_back_to_vietnamese_for_multilingual():
    rec = {"code": "C1", "sections": {"summary": {"en": "Deep learning."}, "objectives": {"vi": "Học sâu."},
                                      "learning_outcomes": {}, "sessions": {"en": ["Week 1", "Week 2"]}}}
    en = list(units([rec], [CAND_EN, CAND_VI], {"lang": "en", "kind": "nli"}))
    assert [(u[1], u[2]) for u in en] == [("summary", "TNT"), ("sessions", "TNT")]
    assert en[1][3] == "Week 1\nWeek 2"
    multi = list(units([rec], [CAND_VI], {"lang": "multi", "kind": "nli"}))
    assert [(u[1], u[3]) for u in multi] == [("summary", "Deep learning."), ("objectives", "Học sâu."),
                                            ("sessions", "Week 1\nWeek 2")]


def test_keyword_scorer_matches_whole_phrases():
    s = KeywordScorer().score(["Intro to Neural Networks.", "neural networking", "nothing"],
                              ["artificial intelligence | neural networks"] * 3)
    assert s.tolist() == [1.0, 0.0, 0.0]


def test_score_cache_round_trip(tmp_path):
    cache = ScoreCache(tmp_path / "s.sqlite")
    cache.put("bart", [("h1", "ai", 0.9)])
    assert cache.get("bart", [("h1", "ai"), ("h2", "ai")]) == {("h1", "ai"): 0.9}
    assert cache.get("modernbert", [("h1", "ai")]) == {}


def test_course_tags_majority_of_sections():
    sections = {
        "summary": {"ai": 0.9, "db": 0.8, "web": 0.2},
        "objectives": {"ai": 0.7, "db": 0.4, "web": 0.6},
        "learning_outcomes": {"ai": 0.95, "db": 0.3, "web": 0.1},
        "sessions": {"ai": 0.2, "db": 0.9, "web": 0.55},
    }
    # Top 2 per section with score >= 0.5: summary ai, db; objectives ai, web; learning_outcomes ai;
    # sessions db, web. So ai 3, db 2, web 2 of 4 sections; db before web by mean score.
    out = course_tags(sections, top_k=2, min_score=0.5, min_share=0.5)
    assert [(t["tag"], t["sections"]) for t in out] == [("ai", 3), ("db", 2), ("web", 2)]
    assert out[0]["of"] == 4 and out[0]["mean_score"] == round((0.9 + 0.7 + 0.95 + 0.2) / 4, 4)
    assert [t["tag"] for t in course_tags(sections, top_k=2, min_score=0.5, min_share=0.75)] == ["ai"]
    assert course_tags(sections, top_k=2, min_score=0.99, min_share=0.5) == []
    assert course_tags({}, 2, 0.5, 0.5) == []


def test_merge_cache_adds_new_scores_and_keeps_local_ones(tmp_path):
    from tag_classifier.merge_cache import merge
    local, other = ScoreCache(tmp_path / "local.sqlite"), ScoreCache(tmp_path / "other.sqlite")
    local.put("bart", [("h1", "ai", 0.9)])
    other.put("bart", [("h1", "ai", 0.1), ("h2", "ai", 0.7)])  # h1 also scored locally: local wins
    assert merge(tmp_path / "local.sqlite", tmp_path / "other.sqlite") == 1
    assert merge(tmp_path / "local.sqlite", tmp_path / "other.sqlite") == 0
    assert ScoreCache(tmp_path / "local.sqlite").get("bart", [("h1", "ai"), ("h2", "ai")]) == {
        ("h1", "ai"): 0.9, ("h2", "ai"): 0.7}
