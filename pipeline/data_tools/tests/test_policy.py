"""Policy, retake, GPA and major-determination tests."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from data_tools.model import Attempt, Expected
from data_tools.policy import audit_all, audit_student


def _audit(audits, student_id):
    return next(item for item in audits if item.student.student_id == student_id)


def test_every_expected_value_matches(bundle):
    audits = audit_all(bundle)
    assert len(audits) == 7
    failures = {
        audit.student.student_id: audit.expected_check.differences
        for audit in audits
        if not audit.expected_check.ok
    }
    assert failures == {}


def test_baseline_retakes(bundle):
    audit = _audit(audit_all(bundle), "S001")
    assert set(audit.counted_attempt_ids) == {
        "S001-01",
        "S001-03",
        "S001-05",
        "S001-06",
    }
    assert audit.effective_grades == {"S001-05": "B", "S001-06": "B"}
    assert audit.gpa_credits == 11
    assert audit.grade_points == Decimal("36.00")
    assert audit.cgpa == Decimal("3.27")
    assert audit.credits_earned == 12
    assert audit.external_totals == {"social_work_days": 7}
    assert audit.major_id is None
    assert audit.major_name == "Computer Science"


def test_pass_fail_result_earns_credit_without_gpa(bundle):
    base = bundle.students[0]
    attempts = (
        Attempt(
            attempt_id="S001-01",
            course="CO1005",
            term="2024-1",
            grade=None,
            result="passed",
            course_kind="regular",
            order=0,
        ),
    )
    expected = Expected(
        as_of_term="2024-1",
        counted_attempts=("S001-01",),
        effective_grades={},
        gpa_credits=0,
        grade_points=Decimal("0.00"),
        cgpa=Decimal("0.00"),
        credits_earned=3,
        external_totals={
            requirement.id: 0
            for requirement in bundle.graduation.external_requirements
        },
    )
    student = replace(
        base,
        attempts=attempts,
        external_progress=(),
        expected=expected,
    )

    audit = audit_student(bundle, student)
    assert audit.expected_check.ok
    assert audit.counted_attempt_ids == ("S001-01",)
    assert audit.credits_earned == 3
    assert audit.gpa_credits == 0
    assert audit.grade_points == Decimal("0.00")
    assert audit.effective_grades == {}


def test_rounding_boundary_uses_half_up(bundle):
    audit = _audit(audit_all(bundle), "S002")
    assert audit.grade_points == Decimal("25.00")
    assert audit.gpa_credits == 8
    assert audit.cgpa == Decimal("3.13")


def test_fourth_attempt_counts_and_is_capped(bundle):
    audit = _audit(audit_all(bundle), "S003")
    by_id = {item.attempt.attempt_id: item for item in audit.evaluations}
    assert by_id["S003-04"].selected is True
    assert by_id["S003-04"].cap_applied is True
    assert audit.counted_attempt_ids == ("S003-04",)
    assert audit.effective_grades == {"S003-04": "B"}
    assert audit.gpa_credits == 3
    assert audit.grade_points == Decimal("9.00")
    assert audit.cgpa == Decimal("3.00")
    assert audit.credits_earned == 3


def test_retake_grade_is_capped(bundle):
    audit = _audit(audit_all(bundle), "S004")
    by_id = {item.attempt.attempt_id: item for item in audit.evaluations}
    assert by_id["S004-02"].selected is True
    assert by_id["S004-02"].cap_applied is True
    assert set(audit.counted_attempt_ids) == {"S004-02", "S004-03"}
    assert audit.effective_grades == {"S004-02": "B"}
    assert audit.gpa_credits == 6
    assert audit.grade_points == Decimal("18.00")
    assert audit.cgpa == Decimal("3.00")


def test_best_selection_uses_highest_effective_grade(bundle):
    policy = replace(bundle.policy, gpa_attempt_selection="best")
    best_bundle = replace(bundle, policy=policy)
    audit = _audit(audit_all(best_bundle), "S004")
    by_id = {item.attempt.attempt_id: item for item in audit.evaluations}
    assert by_id["S004-01"].selected is True
    assert by_id["S004-02"].selected is False
    assert audit.effective_grades == {}
    assert set(audit.counted_attempt_ids) == {"S004-01", "S004-03"}
    assert audit.gpa_credits == 6
    assert audit.grade_points == Decimal("19.50")
    assert audit.cgpa == Decimal("3.25")


def test_external_milestone_is_missed(bundle):
    audit = _audit(audit_all(bundle), "S005")
    assert audit.external_totals == {"social_work_days": 1}
    status = audit.external_status[0]
    assert status.overall == "missed"
    year_one = status.milestones[0]
    assert year_one.deadline_type == "end_of_year"
    assert year_one.deadline_term == "2024-2"
    assert year_one.status == "missed"


def test_default_major_when_no_speciality_is_complete(bundle):
    audits = audit_all(bundle)
    s006 = _audit(audits, "S006")
    default = _audit(audits, "S007")
    assert (s006.major_id, s006.major_name) == (None, "Computer Science")
    assert (default.major_id, default.major_name) == (None, "Computer Science")
    assert {major.id for major in bundle.curriculum.majors} == {
        "DSE",
        "ASE",
        "CYB",
        "AI",
        "IPCV",
    }
