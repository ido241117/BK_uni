"""Snapshot-style tests for the pure JSON -> ASP fact builders."""

from __future__ import annotations

import copy

from translation import build_curriculum, build_policy
from support import TINY_CURRICULUM, tiny_policy


def test_main_semester_frequency_mapping() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    offered = {
        "C1001": [1],          # fall only -> odd semesters
        "C1002": [2],          # spring only -> even semesters
        "C1003": [1, 2],       # both main semesters -> every semester
        "C2001": [3],          # summer only -> ignored in v1
        "C2002": [1, 2, 3],    # all terms -> every semester
    }
    for course in curriculum["courses"]:
        if course["id"] in offered:
            course["offered_terms"] = offered[course["id"]]

    program = build_curriculum(curriculum, tiny_policy())
    assert "freq((c1001), 2, 1)." in program
    assert "freq((c1002), 2, 0)." in program
    for skipped in ("c1003", "c2001", "c2002"):
        assert f"freq(({skipped})" not in program


def test_policy_facts_come_from_json_values() -> None:
    program = build_policy(tiny_policy())
    assert "#const maxtries = 3." in program
    assert "grade_points(a, 400)." in program
    assert "grade_points(c, 200)." in program
    assert "grade_earns_credit(f)." not in program
    assert "grade_earns_credit(w)." not in program
    assert "retake_eligibility(c)." in program
    assert "retake_grade_cap(b)." in program
    assert "map(l, total_degree, 22)." in program
    assert "graduation_requirement(min_cumulative_gpa, 200)." in program


def test_curriculum_facts_skip_missing_milestone_courses() -> None:
    program = build_curriculum(TINY_CURRICULUM, tiny_policy())
    assert "co3335" not in program
    assert "co4337" not in program
    assert "prereq(co4337, eng_gc)." not in program
