"""Snapshot-style tests for the pure JSON -> ASP fact builders."""

from __future__ import annotations

import copy
import json

import pytest

from data import TuitionError
from translation import (
    build_curriculum,
    build_policy,
    build_tuition,
    curriculum_file_stem,
)
from support import TINY_CURRICULUM, tiny_policy
from cli import DEFAULT_TUITION_POLICY



def _slots(program: str, course: str) -> list[int]:
    result: list[int] = []
    for line in program.splitlines():
        if not line.startswith("offered_slot(("):
            continue
        members, slot = line[len("offered_slot(("):].split("), ")
        if course in members.split("; "):
            result.append(int(slot.rstrip(").")))
    return sorted(result)


def test_offered_terms_become_offered_slots() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    offered = {
        "C1001": [1],          # fall only
        "C1002": [2],          # spring only
        "C1003": [1, 2],       # both regular terms
        "C2001": [3],          # summer only
        "C2002": [1, 2, 3],    # every term
    }
    for course in curriculum["courses"]:
        if course["id"] in offered:
            course["offered_terms"] = offered[course["id"]]

    program = build_curriculum(curriculum, tiny_policy())
    assert _slots(program, "c1001") == [1]
    assert _slots(program, "c1002") == [2]
    assert _slots(program, "c1003") == [1, 2]
    assert _slots(program, "c2001") == [3]
    assert _slots(program, "c2002") == [1, 2, 3]
    assert _slots(program, "c3001") == [1, 2, 3]  # missing = every part
    assert "freq(" not in program


def test_policy_facts_come_from_json_values() -> None:
    program = build_policy(tiny_policy())
    assert "scale(gpa_4, 0, 400)." in program
    assert "default_scale(gpa_4)." in program
    assert "grade_points(a, 400)." in program
    assert "grade_points(c, 200)." in program
    assert "grade_earns_credit(f)." not in program
    assert "grade_earns_credit(w)." not in program
    assert "gpa_attempt_selection(latest)." in program
    assert "retake_grade_cap(b)." in program
    assert "grade_rank(a, 0)." in program
    assert "retake_eligibility(" not in program
    assert "map(l, total_degree, 22)." in program
    assert "min_gpa(gpa_4, 200)." in program
    assert "graduation_requirement(min_cumulative_gpa, 200)." in program


def test_best_selection_is_emitted() -> None:
    program = build_policy(tiny_policy(gpa_attempt_selection="best"))
    assert "gpa_attempt_selection(best)." in program
    assert "gpa_attempt_selection(latest)." not in program


def test_curriculum_header_uses_dataset_metadata() -> None:
    program = build_curriculum(TINY_CURRICULUM, tiny_policy())
    assert "Curriculum: Tiny Test Curriculum (tiny)" in program
    assert "Default file name: tiny.lp" in program
    assert "cs-2023.lp" not in program


def test_curriculum_file_stem_follows_the_dataset_id() -> None:
    assert curriculum_file_stem(TINY_CURRICULUM) == "tiny"

    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["id"] = "AI 2024"
    assert curriculum_file_stem(curriculum) == "ai-2024"

    curriculum["file_stem"] = "custom name"
    assert curriculum_file_stem(curriculum) == "custom-name"


def test_course_level_can_come_from_json() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["courses"][0]["level"] = 7
    program = build_curriculum(curriculum, tiny_policy())
    assert "course_level((c1001), 7)." in program


def test_curriculum_emits_milestones_from_json() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["milestones"] = [
        {"course": "C3001", "min_credit_percent": 50},
        {"course": "C3002", "min_credits": 12},
    ]
    program = build_curriculum(curriculum, tiny_policy())
    assert "milestone(c3001, 11)." in program
    assert "milestone(c3002, 12)." in program


def test_curriculum_emits_major_facts() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["majors"] = [
        {
            "id": "AI",
            "name": "Applied Artificial Intelligence",
            "rule": {
                "type": "required_courses",
                "min_courses": 2,
                "course_ids": ["C2001", "C3001"],
            },
        }
    ]
    program = build_curriculum(curriculum, tiny_policy())
    assert "major(ai)." in program
    assert "major_min(ai, 2)." in program
    assert "major_course(ai, (c2001; c3001))." in program


def test_curriculum_requires_min_courses_for_majors() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["majors"] = [
        {
            "id": "AI",
            "name": "Applied Artificial Intelligence",
            "rule": {"type": "required_courses", "course_ids": ["C2001"]},
        }
    ]
    with pytest.raises(ValueError, match="min_courses"):
        build_curriculum(curriculum, tiny_policy())


def test_tuition_facts_use_fixed_point_and_surcharge_tier() -> None:
    raw = json.loads((DEFAULT_TUITION_POLICY).read_text(encoding="utf-8"))
    program = build_tuition(raw, "Computer Science")
    assert "money_scale(1000)." in program
    assert "money_currency(vnd)." in program
    assert "money_unit(million)." in program
    assert "fee_rule(regular, 0, 6, 7563, 0, 0)." in program
    assert "fee_rule(regular, 7, 9, 9625, 0, 0)." in program
    assert "fee_rule(regular, 10, 12, 11688, 0, 0)." in program
    assert "fee_rule(regular, 13, 18, 13750, 0, 0)." in program
    assert "fee_rule(regular, 19, 999, 13750, 805, 18)." in program
    assert "fee_rule(summer, 0, 999, 0, 1230, 0)." in program


def test_tuition_selects_rules_by_program() -> None:
    raw = json.loads((DEFAULT_TUITION_POLICY).read_text(encoding="utf-8"))
    assert "fee_rule(regular, 13, 18, 13750, 0, 0)." in build_tuition(raw, "DSE")
    with pytest.raises(TuitionError, match="no rule for semester type 'regular'"):
        build_tuition(raw, "Unknown program")


def test_curriculum_facts_skip_missing_milestone_courses() -> None:
    program = build_curriculum(TINY_CURRICULUM, tiny_policy())
    assert "co3335" not in program
    assert "co4337" not in program
    assert "prereq(co4337, eng_gc)." not in program
