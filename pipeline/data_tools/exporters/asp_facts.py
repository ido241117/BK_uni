"""Planned ASP-facts exporter.

This module is intentionally a design stub for the next stage.  The Python
statistics engine and the future ASP translator share the loader in
``engine.loader``; only the final output adapter differs.

Design rules for the future implementation
------------------------------------------
* Emit raw input facts by default (curriculum, policy, groups, attempts,
  external progress, expected results).  The ASP engine should perform its own
  retake/GPA reasoning instead of receiving precomputed answers.
* Keep predicate names and argument order stable so the ASP rules can rely on
  them.
* Use one fact per input record and sort facts by id for reproducible output.
* Add a ``--derived-facts`` option later only for debugging, never as the
  default comparison input.

Planned predicates (illustrative, not final)
--------------------------------------------
curriculum(CurriculumId, Name, TotalCredits).
course(CurriculumId, CourseId, Name, Credits).
course_prerequisite(CourseId, CourseId).
course_corequisite(CourseId, CourseId).
group(GroupId, Type, MinCredits).
group_course(GroupId, CourseId).
student(StudentId, CurriculumId, PolicyId, Cohort, EnrollmentTerm).
attempt(StudentId, AttemptId, CourseId, Term, Grade, CourseKind).
external_progress(StudentId, RequirementId, Term, Amount).
expected_attempt(StudentId, AttemptId).
expected_grade(StudentId, AttemptId, Grade).
expected_total(StudentId, RequirementId, Amount).
"""

from __future__ import annotations

from pathlib import Path

from data_tools.model import DataBundle

PLANNED_PREDICATES = (
    "curriculum/3",
    "course/4",
    "course_prerequisite/2",
    "course_corequisite/2",
    "group/3",
    "group_course/2",
    "student/5",
    "attempt/6",
    "external_progress/4",
    "expected_attempt/2",
    "expected_grade/3",
    "expected_total/3",
)


def export_asp_facts(bundle: DataBundle, out_dir: str | Path) -> Path:
    """Write ASP facts for ``bundle``.

    Not implemented yet.  Keeping the signature here fixes the adapter boundary
    while the statistics/reporting pipeline is built out.
    """

    raise NotImplementedError(
        "ASP fact generation is planned for a later step; "
        f"planned predicates: {', '.join(PLANNED_PREDICATES)}"
    )
