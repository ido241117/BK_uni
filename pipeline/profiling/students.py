"""Summary of a student-history file (instances/SCHEMA.md, flat tables). Pure functions."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any


def attempt_outcome(attempt: dict[str, Any], passing: dict[str, bool]) -> str:
    """passed / failed / in_progress / unknown, from ``result`` or else the grade."""
    if attempt.get("result") in ("passed", "failed", "in_progress"):
        return attempt["result"]
    grade = attempt.get("grade")
    if grade in passing:
        return "passed" if passing[grade] else "failed"
    return "unknown"


def profile_students(doc: dict[str, Any], grading: dict[str, Any] | None = None) -> dict[str, Any]:
    passing = {g["grade"]: bool(g["passing"]) for g in (grading or {}).get("grade_scale", [])}
    attempts = doc.get("attempts", [])
    outcomes = [attempt_outcome(a, passing) for a in attempts]
    per_student = Counter(a["student_id"] for a in attempts)
    tries: dict[tuple[str, str], int] = Counter((a["student_id"], a["course"]) for a in attempts)
    by_course: dict[str, Counter] = defaultdict(Counter)
    for a, o in zip(attempts, outcomes):
        by_course[a["course"]][o] += 1
    fail_rate = {c: k["failed"] / (k["passed"] + k["failed"])
                 for c, k in by_course.items() if k["passed"] + k["failed"] >= 1}
    return {
        "students": len(doc.get("students", [])),
        "sources": dict(Counter(s.get("source") or "unknown" for s in doc.get("students", []))),
        "attempts": len(attempts),
        "attempts_per_student": dict(sorted(Counter(per_student.values()).items())),
        "outcomes": dict(Counter(outcomes)),
        "attempts_without_term": sum(a.get("term") is None for a in attempts),
        "attempts_with_grade": sum(a.get("grade") is not None for a in attempts),
        "retaken_courses": sum(k > 1 for k in tries.values()),
        "highest_fail_rate": sorted(({"course": c, "fail_rate": round(r, 3)} for c, r in fail_rate.items()
                                     if r > 0), key=lambda x: (-x["fail_rate"], x["course"]))[:5],
        "has_expected_answers": bool(doc.get("expected")),
    }
