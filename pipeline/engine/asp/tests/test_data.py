"""Tests for the JSON loaders and validators."""

from __future__ import annotations

import copy
import json
from decimal import Decimal
from pathlib import Path

import pytest

from data import (
    DataError,
    TuitionError,
    load_bundle,
    load_tuition,
    parse_policy,
    parse_tuition,
    validate_curriculum,
)
from support import TINY_CURRICULUM, TINY_GRADUATION

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def test_loads_ground_truth_policy_and_graduation() -> None:
    bundle = load_bundle(
        DATA_DIR / "curriculum.json",
        DATA_DIR / "grading_policy.json",
        DATA_DIR / "graduation_requirements.json",
    )
    policy = bundle.policy
    assert policy.policy_id == "policy_2020"
    assert policy.min_total_credits == bundle.curriculum["total_credits"] == 128
    assert str(policy.min_cumulative_gpa) == "2.50"
    assert policy.grade("F").passing is False
    assert policy.grade("F").earns_credit is False
    assert policy.grade("A+").points_scaled == 400
    assert policy.grade("A").points_scaled == 400
    assert policy.gpa_attempt_selection == "latest"
    assert policy.retake_grade_cap == "B"
    assert {grade.symbol for grade in policy.grades} == {
        "A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"
    }
    assert [scale.id for scale in policy.scales] == ["gpa_4", "score_10"]
    assert policy.scale("score_10").scaled(policy.grade("A").value_for(
        policy.scale("score_10"), policy.default_scale
    )) == 900


def test_score_band_midpoint_is_rounded_to_scale_precision() -> None:
    from decimal import Decimal

    from data import GradeRule, ScaleRule

    score = ScaleRule(
        id="score_10",
        minimum=Decimal("0"),
        maximum=Decimal("10"),
        precision=2,
        role="score",
    )
    grade = GradeRule(
        symbol="A",
        points=None,
        passing=True,
        in_gpa=False,
        earns_credit=True,
        min_score=Decimal("8.5"),
        max_score=Decimal("9.49"),
    )
    assert grade.value_for(score, "gpa_4") == Decimal("9.00")
    assert score.scaled(grade.value_for(score, "gpa_4")) == 900


def test_loads_ground_truth_tuition_policy() -> None:
    tuition = load_tuition(DATA_DIR / "tuition_policy.json")
    assert tuition.policy_id == "tuition_policy_2026"
    assert tuition.currency == "VND"
    assert tuition.money_unit == "million"
    assert tuition.precision == 3
    assert tuition.effective_from == 2023
    assert tuition.effective_to is None

    regular = next(rule for rule in tuition.rules if "regular" in rule.semester_types)
    summer = next(rule for rule in tuition.rules if "summer" in rule.semester_types)
    assert [tier.min_credits for tier in regular.tiers] == [0, 7, 10, 13, 19]
    assert [tier.max_credits for tier in regular.tiers] == [6, 9, 12, 18, 999]
    assert regular.tiers[0].amount == Decimal("7.5625")
    assert tuition.scaled(regular.tiers[0].amount) == 7563
    assert regular.tiers[2].amount == Decimal("11.6875")
    assert tuition.scaled(regular.tiers[2].amount) == 11688
    assert regular.tiers[3].amount == Decimal("13.75")
    assert regular.tiers[4].amount == Decimal("0.805")
    assert summer.tiers[0].amount == Decimal("1.23")
    assert tuition.scaled(summer.tiers[0].amount) == 1230


def test_parse_tuition_rejects_gaps_between_tiers() -> None:
    raw = {
        "schema_version": 1,
        "id": "tuition",
        "effective_for_cohorts": {"from": 2024, "to": None},
        "currency": "VND",
        "money_unit": "million",
        "precision": 3,
        "calculation_basis": "per_semester",
        "tuition_rules": [
            {
                "programs": ["*"],
                "semester_types": ["regular"],
                "fee_model": {
                    "type": "piecewise",
                    "tiers": [
                        {
                            "condition": {"min_credits": 0, "max_credits": 6},
                            "fee_type": "flat",
                            "flat_fee": 10,
                        },
                        {
                            "condition": {"min_credits": 8, "max_credits": 12},
                            "fee_type": "flat",
                            "flat_fee": 12,
                        },
                    ],
                },
            }
        ],
    }
    with pytest.raises(TuitionError, match="contiguous"):
        parse_tuition(raw)


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


def test_highest_selection_alias_is_normalized_to_best() -> None:
    grading = json.loads((DATA_DIR / "grading_policy.json").read_text(encoding="utf-8"))
    graduation = json.loads(
        (DATA_DIR / "graduation_requirements.json").read_text(encoding="utf-8")
    )
    grading["retake"]["gpa_attempt_selection"] = "highest"
    policy = parse_policy(grading, graduation)
    assert policy.gpa_attempt_selection == "best"
