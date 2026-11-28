"""Academic-standing (attrition) rules used by the simulator.

The numbers come from ``policy/standing.json`` of the instance (instances/SCHEMA.md;
for HCMUT the sources are cited in that file). The rule shapes below are the model:

* warning at the end of a main term when any threshold is crossed (failed share,
  outstanding failed credits, term GPA, cumulative GPA by year level);
* withdrawal after more than N consecutive warnings or suspensions, or when the
  maximum number of main terms is reached;
* a main term registered below the minimum load triggers a suspension next term.

Simplifications (each is an assumption of the synthetic model, not a rule):

* Year level uses only accumulated credits (``credits_per_year``).
* "Outstanding failed credits" = credits of courses whose latest attempt failed and
  that were never passed.
* GPA counts failed attempts as 0 until the course is passed again; the best
  attempt of a course counts (retake rules not modelled).
* A main term below the minimum load is exempt when it contains everything the
  student still needs (final term exemption).
* Discipline, voluntary leave and deferrals are not modelled.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Rules:
    credits_per_year: int
    max_year: int
    max_main_terms: int
    min_main_load: int
    failed_share_above: float
    outstanding_above: int
    term_gpa_first: float
    term_gpa_later: float
    cpa_by_year: dict[int, float]
    cpa_later: float
    max_consecutive_warnings: int
    max_consecutive_suspensions: int

    @classmethod
    def from_json(cls, doc: dict[str, Any]) -> "Rules":
        w, wd = doc["warning"], doc["withdraw_after_consecutive"]
        by_year = dict(w["cumulative_gpa_below_by_year"])
        later = by_year.pop("later")
        return cls(
            credits_per_year=doc["credits_per_year"], max_year=doc["max_year"],
            max_main_terms=doc["max_main_terms"], min_main_load=doc["min_main_load"],
            failed_share_above=w["failed_share_above"], outstanding_above=w["outstanding_failed_credits_above"],
            term_gpa_first=w["term_gpa_below"]["first"], term_gpa_later=w["term_gpa_below"]["later"],
            cpa_by_year={int(k): v for k, v in by_year.items()}, cpa_later=later,
            max_consecutive_warnings=wd["warnings"], max_consecutive_suspensions=wd["suspensions"])

    def year_level(self, accumulated_credits: int) -> int:
        """Year N for M*(N-1) <= credits < M*N, capped at ``max_year`` (credits only)."""
        return min(self.max_year, accumulated_credits // self.credits_per_year + 1)

    def cpa_threshold(self, year: int) -> float:
        return self.cpa_by_year.get(year, self.cpa_later)


def load_rules(path: str | Path) -> Rules:
    return Rules.from_json(json.loads(Path(path).read_text(encoding="utf-8")))


def warning_reasons(
    rules: Rules,
    *,
    registered_credits: int,
    failed_credits: int,
    outstanding_credits: int,
    semester_gpa: float | None,
    first_semester: bool,
    cpa: float | None,
    accumulated_credits: int,
) -> list[str]:
    """Reasons for an academic warning at the end of a main semester.

    ``semester_gpa`` / ``cpa`` are None when no credit-bearing course was graded.
    """
    reasons = []
    if registered_credits > 0 and failed_credits > rules.failed_share_above * registered_credits:
        reasons.append(f"failed>{rules.failed_share_above:.0%}")
    if outstanding_credits > rules.outstanding_above:
        reasons.append(f"outstanding>{rules.outstanding_above}")
    limit = rules.term_gpa_first if first_semester else rules.term_gpa_later
    if semester_gpa is not None and semester_gpa < limit:
        reasons.append(f"semester_gpa<{limit}")
    if cpa is not None:
        threshold = rules.cpa_threshold(rules.year_level(accumulated_credits))
        if cpa < threshold:
            reasons.append(f"cpa<{threshold}")
    return reasons


@dataclass
class Standing:
    """Counters for suspension and withdrawal across main semesters."""

    rules: Rules
    main_semesters: int = 0            # main semesters elapsed (suspended ones included)
    consecutive_warnings: int = 0
    consecutive_suspensions: int = 0
    suspended_next: bool = False
    warnings: list[tuple[str, list[str]]] = field(default_factory=list)

    def close_main_semester(
        self, semester: str, reasons: list[str], under_min_load: bool
    ) -> str | None:
        """Apply the standing rules after a studied main semester. Returns a withdrawal reason or None."""
        self.main_semesters += 1
        self.consecutive_suspensions = 0
        if reasons:
            self.consecutive_warnings += 1
            self.warnings.append((semester, reasons))
        else:
            self.consecutive_warnings = 0
        if self.consecutive_warnings > self.rules.max_consecutive_warnings:
            return f"warned>{self.rules.max_consecutive_warnings}_consecutive"
        self.suspended_next = under_min_load
        return self._duration_check()

    def serve_suspension(self) -> str | None:
        """A main semester spent suspended. Counts toward the duration."""
        self.main_semesters += 1
        self.consecutive_suspensions += 1
        self.suspended_next = False
        if self.consecutive_suspensions > self.rules.max_consecutive_suspensions:
            return f"suspended>{self.rules.max_consecutive_suspensions}_consecutive"
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
        return "max_duration" if self.main_semesters >= self.rules.max_main_terms else None
