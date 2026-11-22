"""Deterministic parts of step 2: structure names, keys, rarity, templates, MMR, phrase cache,
noun phrases, quality metrics."""

from __future__ import annotations

import gzip
import json

import numpy as np
import pytest

from tag_classifier.candidates import Builder, Curriculum, quality
from tag_classifier.common import load_config
from tag_classifier.models import NounPhraser
from tag_classifier.phrases import PhraseIndex, mmr, specificity, template_lines
from tag_classifier.structure import (
    clean_structure_name, courses_to_tag, slug, specialization_candidates, structure_candidates,
)

CFG = load_config()["candidates"]
PREFIXES = [p.lower() for p in CFG["name_prefixes"]]
GENERIC = {g.lower() for g in CFG["generic_names"]}


@pytest.mark.parametrize("name, expected", [
    ("Chuyên ngành - nhóm C (học kỳ 7 và 8) - Trí tuệ nhân tạo ứng dụng", "Trí tuệ nhân tạo ứng dụng"),
    ("Chuyên ngành Trí tuệ nhân tạo ứng dụng", "Trí tuệ nhân tạo ứng dụng"),
    ("Chuyên ngành - Quản trị kinh doanh - 2026 (bắt buộc)", "Quản trị kinh doanh"),
    ("Chuyên ngành (Nhóm A) - Địa kỹ thuật (bắt buộc)", "Địa kỹ thuật"),
    ("Quản lý - nhóm D (học kỳ 7)", "Quản lý"),
    ("Kinh tế - Chính trị - Xã hội - Luật", "Kinh tế - Chính trị - Xã hội - Luật"),  # hyphens are part of the name
    ("Chuyên ngành - nhóm A (học kỳ 5)", None),
    ("Tự chọn tự do", None),
    ("Tự chọn (khác)/Tự do - nhóm E", None),
    ("Cơ sở ngành (Nhóm B)", None),
])
def test_clean_structure_name(name, expected):
    assert clean_structure_name(name, PREFIXES, GENERIC) == expected


def test_slug():
    assert slug("Trí tuệ nhân tạo ứng dụng") == "tri-tue-nhan-tao-ung-dung"
    assert slug("Đồ họa") == "do-hoa"
    assert slug("C++") == "cplusplus" and slug("C#") == "csharp"


def test_specificity_is_monotonic_and_bounded():
    n = 1000
    assert specificity(1 / n, n) == pytest.approx(1.0)
    assert specificity(1.0, n) == pytest.approx(0.0)
    assert specificity(0.0, n) == pytest.approx(1.0)
    assert specificity(0.01, n) > specificity(0.04, n) > specificity(0.5, n)


CURR = {
    "specializations": [{"code": "TNT", "name": "Trí tuệ nhân tạo ứng dụng", "description": None}],
    "groups": [
        {"name": "Chuyên ngành - nhóm C - Trí tuệ nhân tạo ứng dụng", "specialization": "TNT",
         "members": ["CO3117", "CO3061", "CO2003"]},
        {"name": "Quản lý - nhóm D (học kỳ 7)", "specialization": None, "members": ["IM1013", "IM1023"]},
        {"name": "Toán", "specialization": None, "members": ["MT1003", "MT1005"]},     # compulsory block
        {"name": "Tự chọn tự do", "specialization": None, "members": []},
    ],
    "categories": [{"name": "Chuyên ngành Trí tuệ nhân tạo ứng dụng", "members": ["CO3061", "CO2003"]},
                   {"name": "Quản lý", "members": ["IM1025"]}],
}


def test_structure_candidates_leave_specializations_out():
    # The specialization block and the category named like it give no candidate (the planner handles
    # specializations); "Quản lý" joins its group and category.
    [c] = structure_candidates(CURR, CFG)[:1]
    assert [x["label_vi"] for x in structure_candidates(CURR, CFG)] == ["Quản lý", "Toán"]
    assert c["key"] == "quan-ly" and c["members"] == ["IM1013", "IM1023", "IM1025"]
    assert {s["type"] for s in c["sources"]} == {"group", "category"}


def test_structure_candidates_keep_only_allowed_courses():
    assert [x["label_vi"] for x in structure_candidates(CURR, CFG, allowed={"IM1013", "CO3061"})] == ["Quản lý"]


def test_specialization_lists_become_evaluation_only_candidates():
    [s] = specialization_candidates(CURR, allowed={"CO3117", "CO3061", "XX1"})
    assert s["key"] == "TNT" and s["evaluation_only"] and s["members"] == ["CO3061", "CO3117"]
    assert specialization_candidates(CURR, allowed={"IM1013"}) == []          # no listed elective: none


def test_courses_to_tag_are_the_usable_electives_of_the_program():
    curr = {"courses": ["E1", "E2", "R1", "E3"],
            "groups": [{"kind": "elective", "members": ["E1", "E2", "E3"]}, {"kind": "required", "members": ["R1"]}]}
    records = {"E1": {"code": "E1", "usable": True}, "E2": {"code": "E2", "usable": False},
               "R1": {"code": "R1", "usable": True}}            # E3 has no record (no syllabus)
    assert [r["code"] for r in courses_to_tag(curr, records, electives_only=True)] == ["E1"]
    assert [r["code"] for r in courses_to_tag(curr, records, electives_only=False)] == ["E1", "R1"]


def course(code, lines):
    return {"code": code, "sections": {"sessions": {"en": lines}}}


def test_template_lines_need_many_courses_and_words():
    sentence = "Students will work on joint or individual projects for an approved proposal"
    recs = [course("A", [sentence, "Chain drive"]), course("B", [sentence, "Chain drive"]),
            course("C", [sentence.upper(), "Chain drive"]), course("D", ["Gears"])]
    # Repeated 8+ word sentence (case-insensitive) is a template; a repeated short heading is a topic.
    assert template_lines(recs, 3, 8) == {sentence.lower()}
    assert template_lines(recs, 4, 8) == set()


def test_mmr_prefers_relevant_but_not_duplicate_items():
    vecs = np.array([[1, 0], [0.99, 0.141], [0, 1]], dtype=float)
    relevance = np.array([0.9, 0.89, 0.5])
    assert mmr(relevance, vecs, 2, diversity=0.5) == [0, 2]  # item 1 is a near-duplicate of item 0
    assert mmr(relevance, vecs, 2, diversity=0.0) == [0, 1]
    assert mmr(np.zeros(0), vecs[:0], 3, 0.5) == []


class FakePhraser:
    def __init__(self, stop):
        self.stop = stop
        self.calls = 0

    def settings(self):
        return {"stop": self.stop}

    def phrases(self, lines):
        self.calls += 1
        return [[line.lower()] for line in lines]


def test_phrase_cache_reused_and_rebuilt_when_settings_change(tmp_path):
    path = tmp_path / "cache.jsonl.gz"
    first = FakePhraser(["a"])
    PhraseIndex(path, first).ensure({"Gears"})
    again = FakePhraser(["a"])
    idx = PhraseIndex(path, again)
    idx.ensure({"Gears"})
    assert again.calls == 0 and idx.cache == {"Gears": ["gears"]}
    changed = FakePhraser(["a", "b"])
    PhraseIndex(path, changed).ensure({"Gears"})
    assert changed.calls == 1
    with gzip.open(path, "rt", encoding="utf-8") as f:
        assert json.loads(f.readline()) == {"settings": {"stop": ["a", "b"]}}


def test_quality_purity_and_overlap():
    data = {"groups": [{"specialization": "S1", "members": ["A", "B", "C"]},
                       {"specialization": "S2", "members": ["D", "E"]}]}
    cands = [
        {"key": "x", "origin": "syllabus", "coverage": ["A", "B", "D", "Z"], "evidence": [1], "label_en": "x"},
        {"key": "y", "origin": "syllabus", "coverage": ["A", "B", "D"], "evidence": [], "label_en": None},
    ]
    q = quality(cands, data)
    assert q["syllabus_purity"] == {"x": 0.67, "y": 0.67}  # 2 of 3 specialization courses in S1
    assert q["high_overlap_pairs"] == [{"a": "x", "b": "y", "jaccard": 0.75}]
    assert q["with_evidence"] == 1 and q["without_english_label"] == 1


@pytest.fixture(scope="module")
def phraser():
    pytest.importorskip("spacy")
    return NounPhraser(CFG["spacy_model"], CFG["ngram_max"], CFG["stop_words"], CFG["excluded_entity_types"])


def phrases_of(phraser, text):
    return set(phraser.phrases([text])[0])


def test_noun_phrases_never_join_across_removed_words(phraser):
    found = phrases_of(phraser, "Principles of machine learning and decision trees.")
    assert {"machine learning", "decision trees"} <= found
    assert "principles machine learning" not in found and "learning decision" not in found


def test_noun_phrases_drop_verbs_fillers_and_keep_fields_tagged_org(phraser):
    found = phrases_of(phraser, "Getting project requirement, identifying appropriate AI algorithm. "
                                "Select appropriate deep learning models. "
                                "Software projects involving Artificial Intelligence, IoT, and Big Data applications.")
    assert not any(p.startswith(("getting", "identifying", "appropriate")) for p in found)
    assert "deep learning" in found
    assert {"artificial intelligence", "iot", "big data applications"} <= found  # small model tags these ORG


class StubEmbedder:
    """Unit vectors chosen by hand, so the cosines in the test are known."""

    def __init__(self, vectors):
        self.vectors = vectors

    def encode(self, texts):
        return np.array([self.vectors[t] for t in texts], dtype=float)


def test_judge_counts_a_clusters_own_courses_as_near():
    # "build web" is a top phrase of A and B, but only A's whole syllabus is close to it (cosine 0.8 vs
    # 0.3 < semantic_threshold 0.40): with its own courses counted, it covers 2 courses and passes.
    builder = Builder.__new__(Builder)
    builder.cfg = dict(CFG, semantic_threshold=0.40, min_best_match=0.50, min_peak=0.23, min_courses=2)
    builder.embedder = StubEmbedder({"build web": [1.0, 0.0]})
    docs = np.array([[0.8, 0.6], [0.3, np.sqrt(1 - 0.09)], [0.0, 1.0]])   # courses A, B, C
    cur = Curriculum({}, [], ["A", "B", "C"], {}, {}, docs)
    [plain] = builder.judge(["build web"], cur)
    assert plain["near_courses"] == ["A"] and not plain["ok"]          # whole-syllabus similarity only
    [own] = builder.judge(["build web"], cur, own=[{"A", "B"}])
    assert own["near_courses"] == ["A", "B"] and own["ok"]
    assert own["best_match"] == 0.8 and own["peak"] == 0.5            # 0.8 - median(0.8, 0.3, 0.0)



def test_merge_keeps_seeded_candidates_and_their_names():
    # A seeded (earlier, reviewed) candidate keeps its key and names when a candidate of this run with
    # the same meaning joins it; a new topic becomes a new candidate.
    builder = Builder.__new__(Builder)
    builder.cfg = dict(CFG, merge_threshold=0.85)
    builder.embedder = StubEmbedder({"quản lý": [1.0, 0.0], "management": [0.99, np.sqrt(1 - 0.99 ** 2)],
                                     "web programming": [0.0, 1.0]})
    seed = [{"key": "quan-ly", "label_vi": "quản lý", "label_en": None, "origin": "structure",
             "phrases": [], "members": [], "sources": [{"type": "earlier run"}]}]
    raw = [{"key": "management", "label_vi": None, "label_en": "management", "origin": "profile",
            "members": [], "semantic": ["IM1013"], "sources": [{"type": "profile"}]},
           {"key": "web-programming", "label_vi": None, "label_en": "web programming", "origin": "syllabus",
            "members": [], "syllabus_courses": ["CO3049"], "phrases": ["web programming"], "sources": [{"type": "syllabus"}]}]
    out = builder.merge(raw, seed)
    assert [c["key"] for c in out] == ["quan-ly", "web-programming"]
    assert out[0]["label_en"] is None and out[0]["semantic"] == ["IM1013"]     # joined, names unchanged
    assert {s["type"] for s in out[0]["sources"]} == {"earlier run", "profile"}


def test_seeded_structure_name_with_a_suggestion_still_absorbs_the_same_block():
    # Regression (2026-11-22): the seed was compared by its suggested English name, so this run's
    # identical "Quản lý" block did not join it and became a duplicate "quan-ly-2".
    builder = Builder.__new__(Builder)
    builder.cfg = dict(CFG, merge_threshold=0.85)
    builder.embedder = StubEmbedder({"Quản lý": [1.0, 0.0], "management tools": [0.0, 1.0]})
    seed = [{"key": "quan-ly", "label_vi": "Quản lý", "label_en": None, "origin": "structure",
             "label_en_suggested": {"phrase": "management tools", "similarity": 0.78},
             "phrases": [], "members": [], "sources": [{"type": "earlier run"}]}]
    raw = [{"key": "quan-ly", "label_vi": "Quản lý", "label_en": None, "origin": "structure",
            "members": ["IM1013"], "sources": [{"type": "group"}]}]
    out = builder.merge(raw, seed)
    assert len(out) == 1 and out[0]["members"] == ["IM1013"] and out[0]["label_en_suggested"]["phrase"] == "management tools"



def test_suggested_names_never_repeat_another_candidates_name():
    builder = Builder.__new__(Builder)
    builder.cfg = dict(CFG, suggest_threshold=0.65)
    builder.embedder = StubEmbedder({"Quản lý chung": [1.0, 0.0], "Kiến thức quản lý": [1.0, 0.0],
                                     "management tools": [1.0, 0.0], "business management": [0.8, 0.6]})
    seeded = {"label_en": None, "label_vi": "Quản lý chung", "label_en_suggested": {"phrase": "management tools"}}
    new = {"label_en": None, "label_vi": "Kiến thức quản lý"}
    builder.suggest_labels([seeded, new], ["management tools", "business management"])
    assert new["label_en_suggested"]["phrase"] == "business management"       # the closer one is taken
    assert seeded["label_en_suggested"] == {"phrase": "management tools"}      # seeded keeps its own
