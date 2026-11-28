"""Relation statistics across many programs of one university (``catalog.json``).

A catalog entry is ``{"id", "cohort", "course_ids", "relations"}`` with relations in the
canonical form (instances/SCHEMA.md). Pure functions, no I/O.
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from typing import Any

HARD = ("prerequisite", "corequisite")


def _quantiles(values: list[float]) -> dict[str, float] | None:
    if not values:
        return None
    v = sorted(values)
    pick = lambda q: v[min(len(v) - 1, int(q * (len(v) - 1) + 0.5))]   # noqa: E731
    return {"min": v[0], "p25": pick(0.25), "median": statistics.median(v), "p75": pick(0.75), "max": v[-1]}


def profile_catalog(programs: list[dict[str, Any]]) -> dict[str, Any]:
    per_program = []
    for p in programs:
        n = len(p["course_ids"])
        hard = [r for r in p["relations"] if r["type"] in HARD]
        per_program.append({"id": p["id"], "courses": n, "hard": len(hard),
                            "hard_per_course": len(hard) / n if n else 0.0})
    hpc = [x["hard_per_course"] for x in per_program]

    # Agreement: for each (course, type, required course) seen anywhere, among the programs
    # listing both courses, the share that state the relation.
    stated: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for p in programs:
        for r in p["relations"]:
            if r["type"] in HARD and len(r["any_of"]) == 1:
                stated[(r["course"], r["type"], r["any_of"][0])].add(p["id"])
    members = {p["id"]: set(p["course_ids"]) for p in programs}
    agreement = []
    for (course, _, other), ids in stated.items():
        both = [pid for pid, cs in members.items() if course in cs and other in cs]
        if len(both) >= 2:
            agreement.append(len(ids & set(both)) / len(both))

    return {
        "programs": len(programs),
        "courses_per_program": _quantiles([x["courses"] for x in per_program]),
        "relation_types": dict(Counter(r["type"] for p in programs for r in p["relations"])),
        "hard_per_course": _quantiles(hpc),
        "programs_without_hard_relations": sum(x["hard"] == 0 for x in per_program),
        "hard_relations_seen_in_2plus_programs": len(agreement),
        "mean_agreement": round(statistics.mean(agreement), 3) if agreement else None,
        "relations_stated_by_under_half": sum(a < 0.5 for a in agreement),
        "per_program": sorted(per_program, key=lambda x: x["id"]),
    }
