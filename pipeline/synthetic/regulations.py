"""Academic-standing (attrition) rules of HCMUT used by the simulator.

Sources (both PDFs are in the repo root):

* [QD285] "Quy dinh ve hoc vu va dao tao bac dai hoc - Phien ban hop nhat",
  so 285/DHBK-DT, 28/7/2022 (scanned; read page images).
  - Dieu 37.1 (p.24): academic warning (canh bao hoc tap).
  - Dieu 37.2 (p.24): forced suspension (buoc tam dung hoc).
  - Dieu 37.3 (p.24): forced withdrawal (buoc thoi hoc).
  - Dieu 24 (p.17): year level (trinh do nam hoc) from accumulated credits.
* [QD1260] "1260 QD dieu chinh_HVu Dai hoc_2933_2026.signed.pdf" (2026, text PDF),
  amends Quy dinh 2933/QD-DHBK (= "HVu_DH" in QD285's margin notes; QD285
  Dieu 37 is HVu_DH Dieu 14).
  - Dieu 1.1 (p.2): max duration of regular programs = 12 main semesters.
  - Dieu 1.7 (p.5): new text of HVu_DH 14.3 (forced withdrawal). It replaces
    "skipping all exams of a main semester" by "not registering in a main
    semester". We use the QD1260 version because it is the newer one.

Simplifications (each is an assumption of the synthetic model, not a rule):

* Year level ignores the foreign-language and GDQP/GDTC conditions of Dieu 24;
  it uses only accumulated credits with M = 33 (the "Ke hoach" column; 28 is for
  course registration only).
* "Outstanding failed credits" (tin chi no dong) = credits of courses whose
  latest attempt failed and that were never passed.
* GPA counts failed attempts as 0 until the course is passed again; the best
  attempt of a course counts (retake rule of Dieu 22 not modelled).
* A main semester registered below 11 credits triggers suspension unless it
  contains everything the student still needs (final semester exemption).
* Discipline, voluntary leave and the rector's deferral are not modelled.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Dieu 24 (p.17): M for a regular program, "Ke hoach" column.
CREDITS_PER_YEAR = 33
# QD1260 Dieu 1.1 (p.2): regular program, max 12 main semesters.
MAX_MAIN_SEMESTERS = 12
# QD1260 Dieu 1.2b (p.3): min credits of a main semester for regular students.
MIN_MAIN_CREDITS = 11
# Dieu 37.1 (p.24): warning thresholds.
FAILED_SHARE_LIMIT = 0.5          # failed credits > 50% of registered
OUTSTANDING_LIMIT = 24            # outstanding failed credits > 24
SEM_GPA_FIRST, SEM_GPA_LATER = 0.8, 1.0
CPA_MIN_BY_YEAR = {1: 1.2, 2: 1.4, 3: 1.6}
CPA_MIN_LATER = 1.8
# Dieu 37.3 (p.24) / QD1260 Dieu 1.7 (p.5): withdrawal after warnings in more
# than 2 consecutive main semesters, or suspension over more than 2.
MAX_CONSECUTIVE_WARNINGS = 2
MAX_CONSECUTIVE_SUSPENSIONS = 2


def year_level(accumulated_credits: int) -> int:
    """Dieu 24: year N for M*(N-1) <= credits < M*N, capped at 5 (credits only)."""
    return min(5, accumulated_credits // CREDITS_PER_YEAR + 1)


def cpa_threshold(year: int) -> float:
    return CPA_MIN_BY_YEAR.get(year, CPA_MIN_LATER)


def warning_reasons(
    *,
    registered_credits: int,
    failed_credits: int,
    outstanding_credits: int,
    semester_gpa: float | None,
    first_semester: bool,
    cpa: float | None,
    accumulated_credits: int,
) -> list[str]:
    """Dieu 37.1: reasons for an academic warning at the end of a main semester.

    ``semester_gpa`` / ``cpa`` are None when no credit-bearing course was graded.
    """
    reasons = []
    if registered_credits > 0 and failed_credits > FAILED_SHARE_LIMIT * registered_credits:
        reasons.append("failed>50%")
    if outstanding_credits > OUTSTANDING_LIMIT:
        reasons.append("outstanding>24")
    limit = SEM_GPA_FIRST if first_semester else SEM_GPA_LATER
    if semester_gpa is not None and semester_gpa < limit:
        reasons.append(f"semester_gpa<{limit}")
    if cpa is not None:
        year = year_level(accumulated_credits)
        if cpa < cpa_threshold(year):
            reasons.append(f"cpa<{cpa_threshold(year)}")
    return reasons


@dataclass
class Standing:
    """Counters needed by Dieu 37.2/37.3 across main semesters."""

    main_semesters: int = 0            # main semesters elapsed (suspended ones included)
    consecutive_warnings: int = 0
    consecutive_suspensions: int = 0
    suspended_next: bool = False
    warnings: list[tuple[str, list[str]]] = field(default_factory=list)

    def close_main_semester(
        self, semester: str, reasons: list[str], under_min_load: bool
    ) -> str | None:
        """Apply Dieu 37 after a studied main semester. Returns a withdrawal reason or None."""
        self.main_semesters += 1
        self.consecutive_suspensions = 0
        if reasons:
            self.consecutive_warnings += 1
            self.warnings.append((semester, reasons))
        else:
            self.consecutive_warnings = 0
        if self.consecutive_warnings > MAX_CONSECUTIVE_WARNINGS:
            return "warned>2_consecutive"
        self.suspended_next = under_min_load
        return self._duration_check()

    def serve_suspension(self) -> str | None:
        """A main semester spent suspended (Dieu 37.2). Counts toward the duration."""
        self.main_semesters += 1
        self.consecutive_suspensions += 1
        self.suspended_next = False
        if self.consecutive_suspensions > MAX_CONSECUTIVE_SUSPENSIONS:
            return "suspended>2_consecutive"
        return self._duration_check()

    def internship_semester(self) -> str | None:
        """A main semester kept empty by the internship (fills_next, DESIGN.md B1).

        Not "no registration" (the student is on the internship) and not a suspension.
        Assumption: it counts toward the duration and leaves the warning streak unchanged.
        """
        self.main_semesters += 1
        self.consecutive_suspensions = 0
        return self._duration_check()

    def _duration_check(self) -> str | None:
        return "max_duration" if self.main_semesters >= MAX_MAIN_SEMESTERS else None
