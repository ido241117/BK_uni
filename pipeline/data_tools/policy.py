"""Apply the grading/retake policy and produce per-student audit results."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from data_tools.loader import term_key
from data_tools.model import (
    Attempt,
    AttemptEvaluation,
    DataBundle,
    Deadline,
    ExpectedCheck,
    ExternalStatus,
    MilestoneStatus,
    Student,
    StudentAudit,
)


def round_half_up(value: Decimal, decimals: int) -> Decimal:
    quantum = Decimal(1).scaleb(-decimals)
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def format_decimal(value: Decimal, decimals: int = 2) -> str:
    return f"{value.quantize(Decimal(1).scaleb(-decimals), rounding=ROUND_HALF_UP):.{decimals}f}"


def deadline_term(deadline: Deadline, student: Student) -> str | None:
    """Return the term in which an external deadline is due.

    ``end_of_year`` is relative to the admission cohort: year 1 ends in the
    second term of the cohort year, year 2 in the second term of the next year,
    and so on.  Graduation has no fixed term in the dataset, so it is pending.
    """

    if deadline.type == "graduation":
        return None
    if deadline.year is None:
        return None
    return f"{student.cohort + deadline.year - 1}-2"


def _milestone_status(
    requirement_id: str,
    milestone,
    student: Student,
    as_of_term: str,
    total: int,
) -> MilestoneStatus:
    deadline = deadline_term(milestone.deadline, student)
    if total >= milestone.min:
        status = "met"
    elif deadline is not None and term_key(as_of_term) >= term_key(deadline):
        status = "missed"
    else:
        status = "pending"
    return MilestoneStatus(
        requirement_id=requirement_id,
        deadline_type=milestone.deadline.type,
        deadline_year=milestone.deadline.year,
        deadline_term=deadline,
        minimum=milestone.min,
        total=total,
        status=status,
    )


def _external_statuses(
    bundle: DataBundle, student: Student, as_of_term: str, totals: dict[str, int]
) -> tuple[ExternalStatus, ...]:
    statuses: list[ExternalStatus] = []
    for requirement in bundle.graduation.external_requirements:
        total = totals.get(requirement.id, 0)
        milestones = tuple(
            _milestone_status(requirement.id, milestone, student, as_of_term, total)
            for milestone in requirement.milestones
        )
        if any(item.status == "missed" for item in milestones):
            overall = "missed"
        elif milestones and all(item.status == "met" for item in milestones):
            overall = "met"
        else:
            overall = "pending"
        statuses.append(
            ExternalStatus(
                requirement_id=requirement.id,
                unit=requirement.unit,
                enforcement=requirement.enforcement,
                total=total,
                milestones=milestones,
                overall=overall,
            )
        )
    return tuple(statuses)


def _evaluate_attempts(
    bundle: DataBundle, student: Student, as_of_term: str
) -> tuple[AttemptEvaluation, ...]:
    policy = bundle.policy
    curriculum = bundle.curriculum

    grouped: dict[str, list[Attempt]] = defaultdict(list)
    for attempt in student.attempts:
        if term_key(attempt.term) <= term_key(as_of_term):
            grouped[attempt.course].append(attempt)

    evaluations: dict[str, AttemptEvaluation] = {}
    for course_id, attempts in grouped.items():
        course = curriculum.course(course_id)
        ordered = sorted(attempts, key=lambda item: (term_key(item.term), item.order))
        valid_attempts: list[Attempt] = []
        valid_flags: list[bool] = []

        for attempt in ordered:
            if not valid_attempts:
                valid = True
            else:
                previous = valid_attempts[-1]
                previous_rule = policy.grade(previous.grade)
                eligible = (
                    policy.eligibility_max_points is None
                    or previous_rule.points is None
                    or previous_rule.points <= policy.eligibility_max_points
                )
                valid = len(valid_attempts) < policy.max_attempts and eligible

            valid_flags.append(valid)
            if valid:
                valid_attempts.append(attempt)

        selected_id = valid_attempts[-1].attempt_id if valid_attempts else None
        for index, attempt in enumerate(ordered):
            attempt_number = index + 1
            selected = attempt.attempt_id == selected_id
            is_retake = selected and attempt_number > 1
            rule = policy.grade(attempt.grade)
            effective_grade = attempt.grade
            effective_points = rule.points
            cap_applied = False

            if (
                is_retake
                and policy.grade_cap_max_points is not None
                and policy.grade_cap_max_grade is not None
                and rule.points is not None
                and rule.points > policy.grade_cap_max_points
            ):
                capped_rule = policy.grade(policy.grade_cap_max_grade)
                effective_grade = capped_rule.grade
                effective_points = capped_rule.points
                cap_applied = True

            counts_for_gpa = (
                selected
                and effective_points is not None
                and policy.grade(effective_grade).in_gpa
                and attempt.course_kind in policy.included_course_kinds
            )
            earns_credit = selected and policy.grade(effective_grade).earns_credit
            counted = counts_for_gpa or earns_credit

            evaluations[attempt.attempt_id] = AttemptEvaluation(
                attempt=attempt,
                course=course,
                attempt_number=attempt_number,
                valid=valid_flags[index],
                selected=selected,
                is_retake=is_retake,
                cap_applied=cap_applied,
                effective_grade=effective_grade,
                effective_points=effective_points,
                counts_for_gpa=counts_for_gpa,
                earns_credit=earns_credit,
                counted=counted,
            )

    # Keep the report in transcript order, not course-grouped order.
    return tuple(
        evaluations[attempt.attempt_id]
        for attempt in student.attempts
        if attempt.attempt_id in evaluations
    )


def _external_totals(bundle: DataBundle, student: Student, as_of_term: str) -> dict[str, int]:
    totals = {requirement.id: 0 for requirement in bundle.graduation.external_requirements}
    for progress in student.external_progress:
        if term_key(progress.term) <= term_key(as_of_term):
            totals[progress.requirement] = totals.get(progress.requirement, 0) + progress.amount
    return totals


def _determine_major(
    bundle: DataBundle, passed_courses: set[str]
) -> tuple[str | None, str]:
    for major in bundle.curriculum.majors:
        if major.rule.type == "required_courses" and all(
            course_id in passed_courses for course_id in major.rule.course_ids
        ):
            return major.id, major.name
    return None, bundle.curriculum.default_major


def _compare_expected(
    student: Student,
    as_of_term: str,
    counted_attempt_ids: tuple[str, ...],
    effective_grades: dict[str, str],
    gpa_credits: int,
    grade_points: Decimal,
    cgpa: Decimal,
    credits_earned: int,
    external_totals: dict[str, int],
) -> ExpectedCheck:
    expected = student.expected
    differences: list[str] = []

    if as_of_term != expected.as_of_term:
        differences.append(f"as_of_term: got {as_of_term!r}, expected {expected.as_of_term!r}")
    if set(counted_attempt_ids) != set(expected.counted_attempts):
        differences.append(
            "counted_attempts: got "
            f"{sorted(counted_attempt_ids)!r}, expected {sorted(expected.counted_attempts)!r}"
        )
    if effective_grades != expected.effective_grades:
        differences.append(
            f"effective_grades: got {effective_grades!r}, expected {expected.effective_grades!r}"
        )
    if gpa_credits != expected.gpa_credits:
        differences.append(f"gpa_credits: got {gpa_credits}, expected {expected.gpa_credits}")
    if grade_points != expected.grade_points:
        differences.append(
            f"grade_points: got {format_decimal(grade_points)}, expected {format_decimal(expected.grade_points)}"
        )
    if cgpa != expected.cgpa:
        differences.append(f"cgpa: got {format_decimal(cgpa)}, expected {format_decimal(expected.cgpa)}")
    if credits_earned != expected.credits_earned:
        differences.append(
            f"credits_earned: got {credits_earned}, expected {expected.credits_earned}"
        )
    if external_totals != expected.external_totals:
        differences.append(
            f"external_totals: got {external_totals!r}, expected {expected.external_totals!r}"
        )
    return ExpectedCheck(ok=not differences, differences=tuple(differences))


def audit_student(bundle: DataBundle, student: Student) -> StudentAudit:
    as_of_term = student.expected.as_of_term
    evaluations = _evaluate_attempts(bundle, student, as_of_term)

    counted = tuple(item.attempt.attempt_id for item in evaluations if item.counted)
    effective_grades = {
        item.attempt.attempt_id: item.effective_grade
        for item in evaluations
        if item.selected and item.is_retake
    }
    gpa_credits = sum(
        item.course.credits for item in evaluations if item.counts_for_gpa
    )
    grade_points = sum(
        (
            item.effective_points * item.course.credits
            for item in evaluations
            if item.counts_for_gpa and item.effective_points is not None
        ),
        Decimal("0"),
    )
    cgpa = (
        round_half_up(grade_points / Decimal(gpa_credits), bundle.policy.rounding_decimals)
        if gpa_credits
        else Decimal("0.00")
    )

    earned_courses = {
        item.attempt.course
        for item in evaluations
        if item.valid and policy_grade_earns_credit(bundle, item.effective_grade)
    }
    credits_earned = sum(bundle.curriculum.course(course_id).credits for course_id in earned_courses)

    external_totals = _external_totals(bundle, student, as_of_term)
    external_status = _external_statuses(bundle, student, as_of_term, external_totals)
    passed_courses = {
        item.attempt.course
        for item in evaluations
        if item.valid and policy_grade_earns_credit(bundle, item.effective_grade)
    }
    major_id, major_name = _determine_major(bundle, passed_courses)

    expected_check = _compare_expected(
        student,
        as_of_term,
        counted,
        effective_grades,
        gpa_credits,
        grade_points,
        cgpa,
        credits_earned,
        external_totals,
    )

    return StudentAudit(
        student=student,
        as_of_term=as_of_term,
        evaluations=evaluations,
        counted_attempt_ids=counted,
        effective_grades=effective_grades,
        gpa_credits=gpa_credits,
        grade_points=grade_points,
        cgpa=cgpa,
        credits_earned=credits_earned,
        external_totals=external_totals,
        external_status=external_status,
        major_id=major_id,
        major_name=major_name,
        expected_check=expected_check,
    )


def policy_grade_earns_credit(bundle: DataBundle, grade_symbol: str) -> bool:
    return bundle.policy.grade(grade_symbol).earns_credit


def audit_all(bundle: DataBundle) -> list[StudentAudit]:
    return [audit_student(bundle, student) for student in bundle.students]


def expected_summary(audits: Iterable[StudentAudit]) -> tuple[int, int]:
    audits = list(audits)
    return sum(1 for audit in audits if audit.expected_check.ok), len(audits)
