"""Tests for the JSON loaders and validators."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from data import DataError, load_bundle, parse_policy, validate_curriculum
from support import TINY_CURRICULUM, TINY_GRADING, TINY_GRADUATION

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_loads_ground_truth_policy_and_graduation() -> None:
    bundle = load_bundle(
        DATA_DIR / "curriculum.json",
        DATA_DIR / "grading_policy.json",
        DATA_DIR / "graduation_requirements.json",
    )
    policy = bundle.policy
    assert policy.policy_id == "policy_2020"
    assert policy.max_attempts == 3
    assert policy.retake_eligibility_max_grade == "C"
    assert policy.retake_grade_cap == "B"
    assert policy.min_total_credits == bundle.curriculum["total_credits"] == 128
    assert str(policy.min_cumulative_gpa) == "2.50"
    assert policy.grade("F").passing is False
    assert policy.grade("F").earns_credit is False
    assert policy.grade("W").earns_credit is False
    assert policy.grade("A").points_scaled == 400


def test_parse_policy_rejects_unknown_eligibility_grade() -> None:
    grading = copy.deepcopy(TINY_GRADING)
    grading["retake"]["eligibility"]["only_if_grade_at_most"] = "Z"
    with pytest.raises(DataError, match="unknown grade"):
        parse_policy(grading, TINY_GRADUATION)


def test_validate_curriculum_rejects_duplicate_course() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["courses"].append(copy.deepcopy(curriculum["courses"][0]))
    with pytest.raises(DataError, match="duplicate course id"):
        validate_curriculum(curriculum)


def test_validate_curriculum_rejects_unknown_group_member() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["groups"][0]["course_ids"].append("MISSING")
    with pytest.raises(DataError, match="unknown course"):
        validate_curriculum(curriculum)


def test_validate_curriculum_rejects_unknown_prerequisite() -> None:
    curriculum = copy.deepcopy(TINY_CURRICULUM)
    curriculum["courses"][0]["prerequisites"] = [["MISSING"]]
    with pytest.raises(DataError, match="unknown prerequisite"):
        validate_curriculum(curriculum)
