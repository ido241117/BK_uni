"""Tests for student-history translation and retake numbering."""

from __future__ import annotations

import copy

import pytest

from translation import (
    attempts_to_facts,
    normalize_student_history,
    prepare_attempts,
    student_to_facts,
    term_to_index,
)
from support import TINY_CURRICULUM, tiny_policy


def _curriculum_with_major():
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["majors"] = [
        {
            "id": "AI",
            "name": "Applied Artificial Intelligence",
            "rule": {
                "type": "required_courses",
                "min_courses": 1,
                "course_ids": ["C1001"],
            },
        }
    ]
    return curriculum


def test_table_rows_are_folded_into_each_student() -> None:
    raw = {
        "schema_version": 2,
        "students": [
            {
                "student_id": "T001",
                "curriculum_id": "tiny",
                "grading_policy": "tiny_policy",
                "cohort": 2024,
                "enrollment_term": "2024-1",
            }
        ],
        "attempts": [
            {
                "student_id": "T001",
                "attempt_id": "T001-01",
                "course": "C1001",
                "term": "2024-1",
                "grade": "A",
                "course_kind": "regular",
            }
        ],
        "external_progress": [
            {
                "student_id": "T001",
                "requirement": "social_work_days",
                "term": "2024-1",
                "amount": 2,
            }
        ],
        "expected": [
            {"student_id": "T001", "as_of_term": "2024-1"},
        ],
    }

    normalized = normalize_student_history(raw)
    student = normalized["students"][0]
    assert [item["attempt_id"] for item in student["attempts"]] == ["T001-01"]
    assert student["external_progress"][0]["amount"] == 2
    assert student["expected"]["as_of_term"] == "2024-1"
    assert "student_id" not in student["attempts"][0]


def test_legacy_nested_student_history_is_still_accepted() -> None:
    raw = {
        "schema_version": 1,
        "students": [
            {"student_id": "T001", "attempts": [{"course": "C1001"}]}
        ],
    }
    assert normalize_student_history(raw) is raw


def test_table_rows_cannot_reference_an_unknown_student() -> None:
    raw = {
        "schema_version": 2,
        "students": [],
        "attempts": [{"student_id": "T999", "course": "C1001"}],
    }
    with pytest.raises(ValueError, match="no students"):
        normalize_student_history(raw)


def test_retakes_are_numbered_among_all_attempts() -> None:
    numbered = prepare_attempts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2, "grade": "C"},
            {"course": "C1001", "semester": 3, "grade": "F"},
            {"course": "C1001", "semester": 4, "grade": "A"},
        ]
    )
    assert [item.attempt_atom for item in numbered] == [
        "c1001",
        "rt(c1001,1)",
        "rt(c1001,2)",
        "rt(c1001,3)",
    ]


def test_facts_include_boundary_attempt_metadata() -> None:
    facts = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2, "grade": "C"},
            {"course": "C1001", "semester": 3, "grade": "A"},
        ]
    )
    assert "taken(c1001, 1)." in facts
    assert "taken(rt(c1001,1), 2)." in facts
    assert "taken(rt(c1001,2), 3)." in facts
    assert "attempt_count(c1001, 3)." in facts
    assert "last_attempt(c1001, rt(c1001,2))." in facts
    assert "gpa_last(c1001, rt(c1001,2))." in facts


def test_in_progress_attempt_is_last_attempt_but_not_gpa_last() -> None:
    facts = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2},
        ]
    )
    assert "last_attempt(c1001, rt(c1001,1))." in facts
    assert "gpa_last(c1001, c1001)." in facts


def test_course_with_only_in_progress_attempt_has_no_gpa_last() -> None:
    facts = attempts_to_facts([{"course": "C1001", "semester": 1}])
    assert "taken(c1001, 1)." in facts
    assert "attempt_count(c1001, 1)." in facts
    assert "last_attempt(c1001, c1001)." in facts
    assert "gpa_last(" not in facts


def test_latest_high_grade_replaces_earlier_attempt() -> None:
    """A retake above the old eligibility cap is kept (S004 semantics)."""
    facts = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "B"},
            {"course": "C1001", "semester": 2, "grade": "A"},
        ]
    )
    assert "taken(rt(c1001,1), 2)." in facts
    assert "map(g, rt(c1001,1), a)." in facts
    assert "void_attempt(" not in facts
    assert "attempt_count(c1001, 2)." in facts
    assert "last_attempt(c1001, rt(c1001,1))." in facts
    assert "gpa_last(c1001, rt(c1001,1))." in facts


def test_every_attempt_is_kept_without_attempt_limit() -> None:
    """A fourth attempt counts normally when there is no attempt limit."""
    facts = attempts_to_facts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2, "grade": "C"},
            {"course": "C1001", "semester": 3, "grade": "C"},
            {"course": "C1001", "semester": 4, "grade": "A"},
        ]
    )
    assert "map(g, rt(c1001,3), a)." in facts
    assert "void_attempt(" not in facts
    assert "attempt_count(c1001, 4)." in facts
    assert "last_attempt(c1001, rt(c1001,3))." in facts
    assert "gpa_last(c1001, rt(c1001,3))." in facts


def test_student_links_must_match_the_loaded_data() -> None:
    student = {
        "student_id": "T999",
        "curriculum_id": "another_curriculum",
        "enrollment_term": "2024-1",
        "as_of_term": "2024-1",
        "attempts": [],
    }
    with pytest.raises(ValueError, match="declares curriculum"):
        student_to_facts(student, curriculum=TINY_CURRICULUM)

    student["curriculum_id"] = "tiny"
    student["grading_policy"] = "another_policy"
    with pytest.raises(ValueError, match="declares grading policy"):
        student_to_facts(student, curriculum=TINY_CURRICULUM, policy=tiny_policy())


def test_student_history_emits_planning_facts() -> None:
    student = {
        "student_id": "T001",
        "enrollment_term": "2024-1",
        "as_of_term": "2025-1",
        "major": "AI",
        "attempts": [
            {"course": "C1001", "term": "2024-1", "grade": "F"},
            {"course": "C1001", "term": "2024-2", "grade": "A"},
        ],
        "external_progress": [
            {"requirement": "social_work_days", "term": "2024-2", "amount": 2}
        ],
        "request": ["C1002"],
        "offer": [{"course": "C3001", "term": "2024-3"}],
        "closed": [{"course": "C1002", "term": "2025-1"}],
        "budget": "3.5",
    }
    result = student_to_facts(
        student,
        curriculum=_curriculum_with_major(),
        policy=tiny_policy(),
        money_scale=1000,
    )

    assert result.studied_terms == 4
    assert result.enroll_part == 1
    assert result.budget == 3500
    assert result.major == "ai"

    facts = result.facts
    assert "enroll_part_in(1)." in facts
    assert "taken(c1001, 1)." in facts
    assert "taken(rt(c1001,1), 2)." in facts
    assert "attempt_count(c1001, 2)." in facts
    assert "last_attempt(c1001, rt(c1001,1))." in facts
    assert "gpa_last(c1001, rt(c1001,1))." in facts
    assert "external_progress(social_work_days, 2, 2)." in facts
    assert "student_major(ai)." in facts
    assert "request(c1002)." in facts
    assert "offer(c3001, 3)." in facts
    assert "closed(c1002, 4)." in facts
    assert "budget(3500)." in facts


def test_terms_map_onto_the_three_term_calendar() -> None:
    assert term_to_index("2024-1", "2024-1") == 1
    assert term_to_index("2024-2", "2024-1") == 2
    assert term_to_index("2024-3", "2024-1") == 3
    assert term_to_index("2025-1", "2024-1") == 4
    assert term_to_index("2025-1", "2024-2") == 3
    assert term_to_index("2025-2", "2024-2") == 4
