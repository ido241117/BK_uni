"""Tests for withdrawal retention and retake numbering."""

from __future__ import annotations

from translation import attempts_to_facts, prepare_attempts


def test_withdrawn_attempt_is_retained_before_asp() -> None:
    numbered = prepare_attempts(
        [
            {"course": "C1001", "semester": 1, "grade": "W"},
            {"course": "C1001", "semester": 2, "grade": "B"},
        ]
    )
    assert len(numbered) == 2
    assert numbered[0].attempt_atom == "c1001"
    assert numbered[0].retake is None
    assert numbered[0].semester == 1
    assert numbered[1].attempt_atom == "rt(c1001,1)"
    assert numbered[1].retake == 1
    assert numbered[1].semester == 2


def test_retakes_are_numbered_among_all_attempts() -> None:
    numbered = prepare_attempts(
        [
            {"course": "C1001", "semester": 1, "grade": "F"},
            {"course": "C1001", "semester": 2, "grade": "W"},
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
            {"course": "C1001", "semester": 2, "grade": "W"},
            {"course": "C1001", "semester": 3, "grade": "A"},
        ]
    )
    assert "taken(c1001, 1)." in facts
    assert "taken(rt(c1001,1), 2)." in facts
    assert "taken(rt(c1001,2), 3)." in facts
    assert "attempt_count(c1001, 3)." in facts
    assert "last_attempt(c1001, rt(c1001,2))." in facts


def test_course_with_only_withdrawals_keeps_attempt() -> None:
    facts = attempts_to_facts(
        [{"course": "C1001", "semester": 1, "grade": "W"}]
    )
    assert "taken(c1001, 1)." in facts
    assert "map(g, c1001, w)." in facts
    assert "attempt_count(c1001, 1)." in facts
    assert "last_attempt(c1001, c1001)." in facts
