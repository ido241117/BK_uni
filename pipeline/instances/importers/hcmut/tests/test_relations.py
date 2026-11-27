"""Giai doan 3: do nhat quan quan he va tang du lieu tien quyet (relations.py)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PIPELINE))

from instances.importers.hcmut.relations import consistency, enrich, load  # noqa: E402

SNAPSHOT = PIPELINE / "instances" / "hcmut" / "raw" / "relations-snapshot.json"
KHMT = PIPELINE / "planner" / "fixtures" / "khmt2023.json"


def snap(*curricula):
    return {"taken_at": "2026-11-19", "curricula": [
        {"code": code, "cohort": 2023, "courses": courses, "relations": [
            {"course_code": c, "related_course_code": r, "type": t} for c, r, t in rels]}
        for code, courses, rels in curricula]}


def fixture(code, courses, rels):
    return {"curriculum": {"code": code}, "curriculum_courses": [{"course_code": c} for c in courses],
            "course_relations": [{"course_code": c, "related_course_code": r, "type": t} for c, r, t in rels]}


def test_infers_relation_seen_in_most_other_curricula():
    s = snap(("A", ["X1", "X2"], [("X2", "X1", "prerequisite")]),
             ("B", ["X1", "X2"], [("X2", "X1", "prerequisite")]),
             ("C", ["X1", "X2"], []))
    out = enrich(fixture("OWN", ["X1", "X2"], []), s)
    inferred = [r for r in out["course_relations"] if r["source"] == "inferred"]
    assert inferred == [{"course_code": "X2", "related_course_code": "X1", "type": "prerequisite",
                         "source": "inferred", "inferred_from": "2/3 chuong trinh khac"}]
    assert out["unverified_prerequisites"] == []


def test_does_not_infer_below_threshold_or_when_own_has_same_type():
    s = snap(("A", ["X1", "X2", "X3"], [("X2", "X1", "prerequisite"), ("X3", "X1", "prerequisite")]),
             ("B", ["X1", "X2", "X3"], []), ("C", ["X1", "X2", "X3"], []))
    own = fixture("OWN", ["X1", "X2", "X3"], [("X3", "X2", "prerequisite")])
    out = enrich(own, s)
    assert [r for r in out["course_relations"] if r["source"] == "inferred"] == []  # 1/3 < 50%
    assert out["unverified_prerequisites"] == ["X1"]  # X1 khong o trong quan he TQ/SH nao


def test_recommended_and_prior_are_never_inferred():
    s = snap(("A", ["X1", "X2"], [("X2", "X1", "recommended"), ("X2", "X1", "prior")]))
    out = enrich(fixture("OWN", ["X1", "X2"], []), s)
    assert all(r["source"] == "curriculum" for r in out["course_relations"])
    assert out["unverified_prerequisites"] == ["X1", "X2"]


def test_consistency_counts():
    s = snap(("A", ["X1", "X2"], [("X2", "X1", "prerequisite")]),
             ("B", ["X1", "X2"], []))
    rep = consistency(s)
    assert (rep["courses_in_2plus"], rep["same_everywhere"], rep["differ"]) == (2, 1, 1)
    assert "X2" in rep["differ_detail"]


def test_real_snapshot_shape_and_khmt_needs_no_inference():
    s = load(SNAPSHOT)
    assert s["curricula_count"] == 96 and s["relations_count"] == len(
        [r for c in s["curricula"] for r in c["relations"]])
    out = enrich(json.loads(KHMT.read_text(encoding="utf-8")), s)
    assert [r for r in out["course_relations"] if r["source"] == "inferred"] == []
