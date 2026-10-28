"""Typed data structures shared by the loader, policy engine and exporters."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Curriculum
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Course:
    id: str
    name: str
    credits: int
    prerequisites: tuple[tuple[str, ...], ...]
    corequisites: tuple[tuple[str, ...], ...]
    offered_terms: tuple[int, ...]


@dataclass(frozen=True)
class Group:
    id: str
    type: str
    course_ids: tuple[str, ...]
    min_credits: int | None = None
    min_courses: int | None = None
    max_courses: int | None = None


@dataclass(frozen=True)
class MajorRule:
    type: str
    course_ids: tuple[str, ...]


@dataclass(frozen=True)
class Major:
    id: str
    name: str
    rule: MajorRule


@dataclass(frozen=True)
class Curriculum:
    schema_version: int
    id: str
    name: str
    total_credits: int
    courses: dict[str, Course]
    groups: tuple[Group, ...]
    majors: tuple[Major, ...]
    default_major: str

    def course(self, course_id: str) -> Course:
        return self.courses[course_id]


# ---------------------------------------------------------------------------
# Grading policy
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GradeRule:
    grade: str
    points: Decimal | None
    passing: bool
    in_gpa: bool
    earns_credit: bool
    provisional: bool = False


@dataclass(frozen=True)
class GradingPolicy:
    schema_version: int
    id: str
    effective_from: int
    effective_to: int | None
    grade_scale: dict[str, GradeRule]
    gpa_formula: str
    included_course_kinds: tuple[str, ...]
    scale_max: Decimal
    rounding_mode: str
    rounding_decimals: int
    rounding_applied_to: str
    gpa_attempt_selection: str
    credit_counting: str
    eligibility_max_grade: str | None
    eligibility_max_points: Decimal | None
    max_attempts: int
    grade_cap_applies_to: str
    grade_cap_max_grade: str | None
    grade_cap_max_points: Decimal | None
    keep_old_attempts: bool
    equivalence: str
    pipeline_order: tuple[str, ...]

    def grade(self, symbol: str) -> GradeRule:
        return self.grade_scale[symbol]


# ---------------------------------------------------------------------------
# Graduation requirements
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Deadline:
    type: str
    year: int | None = None


@dataclass(frozen=True)
class Milestone:
    deadline: Deadline
    min: int


@dataclass(frozen=True)
class ExternalRequirement:
    id: str
    unit: str
    mode: str
    enforcement: str
    milestones: tuple[Milestone, ...]


@dataclass(frozen=True)
class Requirement:
    id: str
    type: str
    value: Any = None


@dataclass(frozen=True)
class GraduationRequirements:
    schema_version: int
    curriculum_id: str
    grading_policy: str
    requirements: tuple[Requirement, ...]
    external_requirements: tuple[ExternalRequirement, ...]


# ---------------------------------------------------------------------------
# Student history
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Attempt:
    attempt_id: str
    course: str
    term: str
    grade: str
    course_kind: str
    order: int


@dataclass(frozen=True)
class ExternalProgress:
    requirement: str
    term: str
    amount: int
    order: int


@dataclass(frozen=True)
class Expected:
    as_of_term: str
    counted_attempts: tuple[str, ...]
    effective_grades: dict[str, str]
    gpa_credits: int
    grade_points: Decimal
    cgpa: Decimal
    credits_earned: int
    external_totals: dict[str, int]


@dataclass(frozen=True)
class Student:
    student_id: str
    curriculum_id: str
    grading_policy: str
    cohort: int
    enrollment_term: str
    attempts: tuple[Attempt, ...]
    external_progress: tuple[ExternalProgress, ...]
    expected: Expected
    note: str | None = None


@dataclass(frozen=True)
class DataBundle:
    data_dir: Path
    curriculum: Curriculum
    policy: GradingPolicy
    graduation: GraduationRequirements
    students: tuple[Student, ...]


# ---------------------------------------------------------------------------
# Computed audit results
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AttemptEvaluation:
    attempt: Attempt
    course: Course
    attempt_number: int
    valid: bool
    selected: bool
    is_retake: bool
    cap_applied: bool
    effective_grade: str
    effective_points: Decimal | None
    counts_for_gpa: bool
    earns_credit: bool
    counted: bool


@dataclass(frozen=True)
class MilestoneStatus:
    requirement_id: str
    deadline_type: str
    deadline_year: int | None
    deadline_term: str | None
    minimum: int
    total: int
    status: str


@dataclass(frozen=True)
class ExternalStatus:
    requirement_id: str
    unit: str
    enforcement: str
    total: int
    milestones: tuple[MilestoneStatus, ...]
    overall: str


@dataclass(frozen=True)
class ExpectedCheck:
    ok: bool
    differences: tuple[str, ...]


@dataclass(frozen=True)
class StudentAudit:
    student: Student
    as_of_term: str
    evaluations: tuple[AttemptEvaluation, ...]
    counted_attempt_ids: tuple[str, ...]
    effective_grades: dict[str, str]
    gpa_credits: int
    grade_points: Decimal
    cgpa: Decimal
    credits_earned: int
    external_totals: dict[str, int]
    external_status: tuple[ExternalStatus, ...]
    major_id: str | None
    major_name: str
    expected_check: ExpectedCheck


# ---------------------------------------------------------------------------
# Report container
# ---------------------------------------------------------------------------


@dataclass
class Report:
    bundle: DataBundle
    audits: list[StudentAudit]
    overview: dict[str, Any] = field(default_factory=dict)
    students: Any = None
    attempts: Any = None
    courses: Any = None
    grades: Any = None
    gpa_distribution: Any = None
    external_progress: Any = None
    external_milestones: Any = None
    expected_mismatches: Any = None
