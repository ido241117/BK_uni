"""Profiling metrics against hand-computed answers on a small invented curriculum."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE))

from profiling.__main__ import main, profile_university  # noqa: E402
from profiling.catalog import profile_catalog  # noqa: E402
from profiling.curriculum import dependents, longest_chain, prerequisite_graph, profile_curriculum  # noqa: E402
from profiling.remarks import curriculum_remarks  # noqa: E402
from profiling.students import profile_students  # noqa: E402


def rel(course, *alts, kind="prerequisite"):
    return {"course": course, "type": kind, "any_of": list(alts), "source": "curriculum"}


def course(cid, credits=3, year=None, part=None, **kw):
    return {"id": cid, "name": cid, "credits": credits, "typical_year": year, "typical_part": part, **kw}


@pytest.fixture()
def cur():
    # A -> B -> C -> D chain; E needs A or B (OR clause); F is a corequisite of D.
    # Typical terms put C (term 3) before its prerequisite B (term 4): one conflict.
    return {
        "schema_version": 3, "id": "T", "name": "Tiny",
        "planning": {"horizon": 8, "min_load": 6, "max_load": 9, "duration_years": 2},
        "courses": [course("A", year=1, part=1), course("B", year=2, part=2), course("C", year=2, part=1),
                    course("D", year=2, part=2), course("E"), course("F"), course("X", 0, kind="condition"),
                    course("G1"), course("G2"), course("G3")],
        "relations": [rel("B", "A"), rel("C", "B"), rel("D", "C"), rel("E", "A", "B"),
                      rel("D", "F", kind="corequisite"), rel("G1", "A", kind="recommended")],
        "groups": [{"id": "M", "name": "core", "type": "mandatory", "course_ids": ["A", "B", "C", "D", "E", "F"]},
                   {"id": "EL", "name": "pick one", "type": "elective", "course_ids": ["G1", "G2", "G3"],
                    "min_courses": 1, "min_credits": 3},
                   {"id": "FREE", "name": "free", "type": "elective", "course_ids": [], "scope": "any",
                    "slot_credits": 3, "min_credits": 3}],
        "majors": [{"id": "m1", "name": "m1", "rule": {"type": "required_courses", "min_courses": 1,
                                                        "course_ids": ["G1", "G2"]}},
                   {"id": "m2", "name": "m2", "rule": {"type": "required_courses", "min_courses": 1,
                                                        "course_ids": ["G2", "G3"]}}],
        "milestones": [{"course": "D", "min_credit_percent": 50}],
        "total_credits": 24,
    }


def test_chain_cycles_and_dependents(cur):
    g = prerequisite_graph(cur)
    length, chain, cycles = longest_chain(g)
    assert (length, chain, cycles) == (4, ["A", "B", "C", "D"], [])
    assert dependents(g) == {"A": 4, "B": 3, "C": 1}           # A: B, C, D, E; B: C, D, E; C: D
    g["A"].add("D")                                              # D -> A closes a cycle
    assert longest_chain(g)[2]


def test_curriculum_profile_known_answers(cur):
    p = profile_curriculum(cur)
    assert p["size"]["courses"] == 10 and p["size"]["condition_courses"] == 1
    assert p["size"]["degree_credits"] == 24
    assert p["choice"]["mandatory_credits"] == 18
    assert p["choice"]["free_elective_credits"] == 3
    assert p["choice"]["chosen_credit_share"] == 0.25            # (3 elective + 3 free) / 24
    assert p["choice"]["elective_groups"][0]["slack"] == 3.0       # 9 pool credits / 3 required
    r = p["relations"]
    assert r["hard"] == 5 and r["or_clauses"] == 1
    assert r["hard_per_course"] == round(5 / 9, 3)               # 9 regular courses
    assert r["share_of_courses_in_hard_relation"] == round(6 / 9, 3)   # A B C D E F
    assert r["longest_prerequisite_chain"] == 4
    fit = p["calendar_fit"]
    assert (fit["nominal_regular_terms"], fit["terms_needed_by_max_load"], fit["terms_needed_by_chain"]) == (4, 3, 4)
    assert fit["slack_terms"] == 0 and fit["mean_load_needed"] == 6.0
    assert p["quality"]["typical_term_contradicts_prerequisite"] == [["B", "C"]]
    assert p["quality"]["courses_in_no_group"] == []
    assert p["majors"]["mean_jaccard_overlap"] == round(1 / 3, 3)      # {G2} / {G1, G2, G3}


def test_remarks_cite_the_numbers(cur):
    remarks = curriculum_remarks(profile_curriculum(cur))
    text = "\n".join(remarks)
    assert "Calendar is tight" in text and "slack 0 term(s)" in text
    assert "Majors overlap" in text
    assert "B->C" in text
    assert "Sparse ordering" not in text                          # 0.556 per course is not sparse


def test_graduation_credits_win_over_total(cur):
    grad = {"requirements": [{"id": "credits", "type": "min_total_credits", "value": 30}]}
    assert profile_curriculum(cur, grad)["size"]["degree_credits"] == 30


def test_catalog_agreement():
    progs = [
        {"id": "P1", "course_ids": ["A", "B", "C"], "relations": [rel("B", "A")]},
        {"id": "P2", "course_ids": ["A", "B"], "relations": []},
        {"id": "P3", "course_ids": ["A", "B", "C"], "relations": [rel("B", "A"), rel("C", "B")]},
        {"id": "P4", "course_ids": ["X"], "relations": []},
    ]
    c = profile_catalog(progs)
    assert c["programs_without_hard_relations"] == 2
    # B<-A: programs with A and B: P1, P2, P3; stated by P1, P3 -> 2/3.
    # C<-B: programs with B and C: P1, P3; stated by P3 -> 1/2.
    assert c["hard_relations_seen_in_2plus_programs"] == 2
    assert c["mean_agreement"] == round((2 / 3 + 1 / 2) / 2, 3)
    assert c["relations_stated_by_under_half"] == 0


def test_students_outcomes_from_result_or_grade():
    doc = {"students": [{"student_id": "s"}],
           "attempts": [{"student_id": "s", "course": "A", "term": "2024-1", "grade": "F"},
                        {"student_id": "s", "course": "A", "term": "2024-2", "grade": "B"},
                        {"student_id": "s", "course": "B", "term": None, "grade": None, "result": "in_progress"}]}
    grading = {"grade_scale": [{"grade": "F", "passing": False}, {"grade": "B", "passing": True}]}
    s = profile_students(doc, grading)
    assert s["outcomes"] == {"failed": 1, "passed": 1, "in_progress": 1}
    assert s["retaken_courses"] == 1 and s["attempts_without_term"] == 1
    assert s["highest_fail_rate"] == [{"course": "A", "fail_rate": 0.5}]


def test_cli_on_committed_instances(tmp_path):
    prof = profile_university(PIPELINE / "instances" / "hcmut")
    k = prof["curricula"]["CS-2023-KHMT"]
    assert k["relations"]["by_type"] == {"prerequisite": 11, "recommended": 18, "prior": 2, "corequisite": 1}
    assert prof["catalog"]["programs"] == 96 and prof["catalog"]["programs_without_hard_relations"] == 36
    assert main([str(PIPELINE / "instances" / "toy"), "--out", str(tmp_path)]) == 0
    assert (tmp_path / "report.md").read_text(encoding="utf-8").startswith("# Input profile: toy")
