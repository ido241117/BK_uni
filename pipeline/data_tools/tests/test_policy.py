"""Policy, retake, GPA and major-determination tests."""

from __future__ import annotations

from decimal import Decimal

from data_tools.policy import audit_all


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


def test_baseline_retakes_cap_and_p_w_grades(bundle):
    audit = _audit(audit_all(bundle), "S001")
    assert set(audit.counted_attempt_ids) == {"S001-01", "S001-03", "S001-06", "S001-07"}
    assert audit.effective_grades == {"S001-06": "B", "S001-07": "B"}
    assert audit.gpa_credits == 11
    assert audit.grade_points == Decimal("36.00")
    assert audit.cgpa == Decimal("3.27")
    assert audit.credits_earned == 12
    assert audit.external_totals == {"social_work_days": 7}
    assert audit.major_id is None
    assert audit.major_name == "Computer Science"


def test_rounding_boundary_uses_half_up(bundle):
    audit = _audit(audit_all(bundle), "S002")
    assert audit.grade_points == Decimal("25.00")
    assert audit.gpa_credits == 8
    assert audit.cgpa == Decimal("3.13")


def test_fourth_attempt_is_ignored_by_max_attempts(bundle):
    audit = _audit(audit_all(bundle), "S003")
    by_id = {item.attempt.attempt_id: item for item in audit.evaluations}
    assert by_id["S003-04"].valid is False
    assert by_id["S003-04"].selected is False
    assert audit.counted_attempt_ids == ("S003-03",)
    assert audit.effective_grades == {"S003-03": "C"}
    assert audit.gpa_credits == 3
    assert audit.grade_points == Decimal("6.00")
    assert audit.cgpa == Decimal("2.00")
    assert audit.credits_earned == 3


def test_retake_above_c_is_ineligible(bundle):
    audit = _audit(audit_all(bundle), "S004")
    by_id = {item.attempt.attempt_id: item for item in audit.evaluations}
    assert by_id["S004-02"].valid is False
    assert by_id["S004-02"].selected is False
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


def test_major_rule_and_default_major(bundle):
    audits = audit_all(bundle)
    ai = _audit(audits, "S006")
    default = _audit(audits, "S007")
    assert (ai.major_id, ai.major_name) == ("AI", "Artificial Intelligence")
    assert (default.major_id, default.major_name) == (None, "Computer Science")
