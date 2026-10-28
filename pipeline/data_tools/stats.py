"""Aggregate audit results into pandas tables used by every exporter."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

import pandas as pd

from data_tools.model import DataBundle, Report, StudentAudit
from data_tools.policy import (
    audit_all,
    expected_summary,
    format_decimal,
    policy_grade_earns_credit,
    round_half_up,
)

GPA_BUCKETS = (
    ("0.00-1.99", Decimal("0"), Decimal("2.00")),
    ("2.00-2.49", Decimal("2.00"), Decimal("2.50")),
    ("2.50-2.99", Decimal("2.50"), Decimal("3.00")),
    ("3.00-3.49", Decimal("3.00"), Decimal("3.50")),
    ("3.50-4.00", Decimal("3.50"), Decimal("4.01")),
)


def _frame(records: list[dict[str, Any]], columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame.from_records(records, columns=columns)


def _student_rows(audits: list[StudentAudit]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for audit in audits:
        rows.append(
            {
                "student_id": audit.student.student_id,
                "cohort": audit.student.cohort,
                "enrollment_term": audit.student.enrollment_term,
                "as_of_term": audit.as_of_term,
                "major_id": audit.major_id or "",
                "major": audit.major_name,
                "attempts": len(audit.evaluations),
                "counted_attempts": len(audit.counted_attempt_ids),
                "gpa_credits": audit.gpa_credits,
                "grade_points": format_decimal(audit.grade_points),
                "cgpa": format_decimal(audit.cgpa),
                "credits_earned": audit.credits_earned,
                "external_totals": ", ".join(
                    f"{key}={value}" for key, value in sorted(audit.external_totals.items())
                ),
                "expected_ok": audit.expected_check.ok,
                "expected_differences": " | ".join(audit.expected_check.differences),
                "note": audit.student.note or "",
            }
        )
    return _frame(
        rows,
        [
            "student_id",
            "cohort",
            "enrollment_term",
            "as_of_term",
            "major_id",
            "major",
            "attempts",
            "counted_attempts",
            "gpa_credits",
            "grade_points",
            "cgpa",
            "credits_earned",
            "external_totals",
            "expected_ok",
            "expected_differences",
            "note",
        ],
    )


def _attempt_rows(bundle: DataBundle, audits: list[StudentAudit]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for audit in audits:
        for evaluation in audit.evaluations:
            rows.append(
                {
                    "student_id": audit.student.student_id,
                    "attempt_id": evaluation.attempt.attempt_id,
                    "course_id": evaluation.course.id,
                    "course_name": evaluation.course.name,
                    "credits": evaluation.course.credits,
                    "term": evaluation.attempt.term,
                    "course_kind": evaluation.attempt.course_kind,
                    "raw_grade": evaluation.attempt.grade,
                    "attempt_number": evaluation.attempt_number,
                    "valid": evaluation.valid,
                    "selected": evaluation.selected,
                    "retake": evaluation.is_retake,
                    "cap_applied": evaluation.cap_applied,
                    "effective_grade": evaluation.effective_grade,
                    "effective_points": (
                        format_decimal(evaluation.effective_points)
                        if evaluation.effective_points is not None
                        else ""
                    ),
                    "counts_for_gpa": evaluation.counts_for_gpa,
                    "earns_credit": evaluation.earns_credit,
                    "counted": evaluation.counted,
                }
            )
    return _frame(
        rows,
        [
            "student_id",
            "attempt_id",
            "course_id",
            "course_name",
            "credits",
            "term",
            "course_kind",
            "raw_grade",
            "attempt_number",
            "valid",
            "selected",
            "retake",
            "cap_applied",
            "effective_grade",
            "effective_points",
            "counts_for_gpa",
            "earns_credit",
            "counted",
        ],
    )


def _course_rows(bundle: DataBundle, audits: list[StudentAudit]) -> pd.DataFrame:
    groups_by_course: dict[str, list[str]] = defaultdict(list)
    for group in bundle.curriculum.groups:
        for course_id in group.course_ids:
            groups_by_course[course_id].append(group.id)

    stats: dict[str, dict[str, Any]] = {}
    for audit in audits:
        for evaluation in audit.evaluations:
            item = stats.setdefault(
                evaluation.course.id,
                {
                    "course_id": evaluation.course.id,
                    "course_name": evaluation.course.name,
                    "credits": evaluation.course.credits,
                    "groups": ", ".join(groups_by_course.get(evaluation.course.id, [])),
                    "attempts": 0,
                    "retakes": 0,
                    "selected_attempts": 0,
                    "gpa_attempts": 0,
                    "students": set(),
                    "passed_students": set(),
                    "selected_points": [],
                },
            )
            item["attempts"] += 1
            if evaluation.attempt_number > 1:
                item["retakes"] += 1
            if evaluation.selected:
                item["selected_attempts"] += 1
                if evaluation.effective_points is not None:
                    item["selected_points"].append(evaluation.effective_points)
            if evaluation.counts_for_gpa:
                item["gpa_attempts"] += 1
            item["students"].add(audit.student.student_id)
            if evaluation.valid and policy_grade_earns_credit(bundle, evaluation.effective_grade):
                item["passed_students"].add(audit.student.student_id)

    rows: list[dict[str, Any]] = []
    for course_id in sorted(stats):
        item = stats[course_id]
        selected_points = item.pop("selected_points")
        average_points = (
            format_decimal(sum(selected_points, Decimal("0")) / Decimal(len(selected_points)))
            if selected_points
            else ""
        )
        passed = len(item["passed_students"])
        students = len(item["students"])
        rows.append(
            {
                "course_id": item["course_id"],
                "course_name": item["course_name"],
                "credits": item["credits"],
                "groups": item["groups"],
                "attempts": item["attempts"],
                "retakes": item["retakes"],
                "selected_attempts": item["selected_attempts"],
                "gpa_attempts": item["gpa_attempts"],
                "unique_students": students,
                "passed_students": passed,
                "pass_rate": f"{passed / students:.2%}" if students else "",
                "average_grade_points": average_points,
            }
        )
    return _frame(
        rows,
        [
            "course_id",
            "course_name",
            "credits",
            "groups",
            "attempts",
            "retakes",
            "selected_attempts",
            "gpa_attempts",
            "unique_students",
            "passed_students",
            "pass_rate",
            "average_grade_points",
        ],
    )


def _grade_rows(bundle: DataBundle, audits: list[StudentAudit]) -> pd.DataFrame:
    raw_counts: dict[str, int] = defaultdict(int)
    selected_counts: dict[str, int] = defaultdict(int)
    for audit in audits:
        for evaluation in audit.evaluations:
            raw_counts[evaluation.attempt.grade] += 1
            if evaluation.selected:
                selected_counts[evaluation.effective_grade] += 1

    raw_total = sum(raw_counts.values())
    selected_total = sum(selected_counts.values())
    rows: list[dict[str, Any]] = []
    for symbol, rule in bundle.policy.grade_scale.items():
        raw = raw_counts.get(symbol, 0)
        selected = selected_counts.get(symbol, 0)
        rows.append(
            {
                "grade": symbol,
                "points": format_decimal(rule.points) if rule.points is not None else "",
                "passing": rule.passing,
                "in_gpa": rule.in_gpa,
                "earns_credit": rule.earns_credit,
                "raw_count": raw,
                "raw_percent": f"{raw / raw_total:.2%}" if raw_total else "0.00%",
                "selected_count": selected,
                "selected_percent": (
                    f"{selected / selected_total:.2%}" if selected_total else "0.00%"
                ),
            }
        )
    return _frame(
        rows,
        [
            "grade",
            "points",
            "passing",
            "in_gpa",
            "earns_credit",
            "raw_count",
            "raw_percent",
            "selected_count",
            "selected_percent",
        ],
    )


def _gpa_distribution(audits: list[StudentAudit]) -> pd.DataFrame:
    counts = {label: 0 for label, _, _ in GPA_BUCKETS}
    for audit in audits:
        for label, lower, upper in GPA_BUCKETS:
            if lower <= audit.cgpa < upper:
                counts[label] += 1
                break
    total = len(audits)
    return _frame(
        [
            {
                "cgpa_range": label,
                "students": counts[label],
                "percent": f"{counts[label] / total:.2%}" if total else "0.00%",
            }
            for label, _, _ in GPA_BUCKETS
        ],
        ["cgpa_range", "students", "percent"],
    )


def _external_tables(audits: list[StudentAudit]) -> tuple[pd.DataFrame, pd.DataFrame]:
    summary_rows: list[dict[str, Any]] = []
    milestone_rows: list[dict[str, Any]] = []
    for audit in audits:
        for status in audit.external_status:
            met = sum(1 for item in status.milestones if item.status == "met")
            missed = sum(1 for item in status.milestones if item.status == "missed")
            pending = sum(1 for item in status.milestones if item.status == "pending")
            next_items = [item for item in status.milestones if item.status != "met"]
            next_item = next_items[0] if next_items else None
            summary_rows.append(
                {
                    "student_id": audit.student.student_id,
                    "requirement": status.requirement_id,
                    "unit": status.unit,
                    "enforcement": status.enforcement,
                    "total": status.total,
                    "overall": status.overall,
                    "milestones_met": met,
                    "milestones_missed": missed,
                    "milestones_pending": pending,
                    "next_deadline": (
                        next_item.deadline_term
                        if next_item and next_item.deadline_term
                        else (next_item.deadline_type if next_item else "")
                    ),
                    "next_min": next_item.minimum if next_item else "",
                }
            )
            for item in status.milestones:
                milestone_rows.append(
                    {
                        "student_id": audit.student.student_id,
                        "requirement": status.requirement_id,
                        "deadline_type": item.deadline_type,
                        "deadline_year": item.deadline_year if item.deadline_year is not None else "",
                        "deadline_term": item.deadline_term or "",
                        "min": item.minimum,
                        "total": item.total,
                        "status": item.status,
                    }
                )
    return (
        _frame(
            summary_rows,
            [
                "student_id",
                "requirement",
                "unit",
                "enforcement",
                "total",
                "overall",
                "milestones_met",
                "milestones_missed",
                "milestones_pending",
                "next_deadline",
                "next_min",
            ],
        ),
        _frame(
            milestone_rows,
            [
                "student_id",
                "requirement",
                "deadline_type",
                "deadline_year",
                "deadline_term",
                "min",
                "total",
                "status",
            ],
        ),
    )


def _expected_mismatches(audits: list[StudentAudit]) -> pd.DataFrame:
    rows = [
        {
            "student_id": audit.student.student_id,
            "differences": " | ".join(audit.expected_check.differences),
        }
        for audit in audits
        if not audit.expected_check.ok
    ]
    return _frame(rows, ["student_id", "differences"])


def _overview(bundle: DataBundle, audits: list[StudentAudit]) -> dict[str, Any]:
    matches, total = expected_summary(audits)
    average_cgpa = (
        round_half_up(
            sum((audit.cgpa for audit in audits), Decimal("0")) / Decimal(len(audits)),
            bundle.policy.rounding_decimals,
        )
        if audits
        else Decimal("0.00")
    )
    external_missed = sum(
        1
        for audit in audits
        for status in audit.external_status
        if status.overall == "missed"
    )
    return {
        "curriculum_id": bundle.curriculum.id,
        "curriculum_name": bundle.curriculum.name,
        "policy_id": bundle.policy.id,
        "students": len(audits),
        "courses": len(bundle.curriculum.courses),
        "groups": len(bundle.curriculum.groups),
        "majors": len(bundle.curriculum.majors),
        "external_requirements": len(bundle.graduation.external_requirements),
        "attempts": sum(len(audit.evaluations) for audit in audits),
        "counted_attempts": sum(len(audit.counted_attempt_ids) for audit in audits),
        "total_credits_in_curriculum": bundle.curriculum.total_credits,
        "total_credits_earned": sum(audit.credits_earned for audit in audits),
        "average_cgpa": format_decimal(average_cgpa),
        "expected_matches": matches,
        "expected_total": total,
        "expected_all_ok": matches == total,
        "external_missed": external_missed,
        "data_dir": str(bundle.data_dir),
    }


def build_report(bundle: DataBundle) -> Report:
    audits = audit_all(bundle)
    external_progress, external_milestones = _external_tables(audits)
    return Report(
        bundle=bundle,
        audits=audits,
        overview=_overview(bundle, audits),
        students=_student_rows(audits),
        attempts=_attempt_rows(bundle, audits),
        courses=_course_rows(bundle, audits),
        grades=_grade_rows(bundle, audits),
        gpa_distribution=_gpa_distribution(audits),
        external_progress=external_progress,
        external_milestones=external_milestones,
        expected_mismatches=_expected_mismatches(audits),
    )
