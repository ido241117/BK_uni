"""Metrics of one canonical curriculum (instances/SCHEMA.md). Pure functions, no I/O.

Every metric is computed from the curriculum file (and its graduation requirements when
given), so the same code profiles any university's instance.
"""

from __future__ import annotations

import math
import statistics
from collections import Counter, defaultdict
from itertools import combinations
from typing import Any

HARD = ("prerequisite", "corequisite")


def _summary(values: list[float]) -> dict[str, float] | None:
    if not values:
        return None
    return {"min": min(values), "median": statistics.median(values), "max": max(values)}


def required_credits(cur: dict[str, Any], graduation: dict[str, Any] | None = None) -> int | None:
    """Degree credits: graduation ``min_total_credits``, else ``total_credits``, else the groups' sum."""
    for req in (graduation or {}).get("requirements", []):
        if req.get("type") == "min_total_credits":
            return int(req["value"])
    if cur.get("total_credits"):
        return int(cur["total_credits"])
    credits = {c["id"]: c["credits"] for c in cur["courses"]}
    total = 0
    for g in cur["groups"]:
        if g["type"] == "mandatory":
            total += sum(credits[c] for c in g["course_ids"])
        else:
            total += g.get("min_credits") or 0
    return total or None


def prerequisite_graph(cur: dict[str, Any]) -> dict[str, set[str]]:
    """course -> courses it needs (every alternative of every prerequisite clause)."""
    graph: dict[str, set[str]] = defaultdict(set)
    for r in cur["relations"]:
        if r["type"] == "prerequisite":
            graph[r["course"]].update(r["any_of"])
    return graph


def longest_chain(graph: dict[str, set[str]]) -> tuple[int, list[str], list[list[str]]]:
    """(length in courses, one longest chain, cycles found). OR-alternatives count as edges,
    so the length is an upper bound when a clause has several alternatives."""
    memo: dict[str, list[str]] = {}
    state: dict[str, int] = {}
    cycles: list[list[str]] = []

    def visit(node: str, path: list[str]) -> list[str]:
        if state.get(node) == 2:
            return memo[node]
        if state.get(node) == 1:
            cycles.append(path[path.index(node):] + [node])
            return []
        state[node] = 1
        best: list[str] = []
        for pre in sorted(graph.get(node, ())):
            chain = visit(pre, path + [node])
            if len(chain) > len(best):
                best = chain
        state[node] = 2
        memo[node] = best + [node]
        return memo[node]

    best: list[str] = []
    for node in sorted(set(graph) | {p for ps in graph.values() for p in ps}):
        chain = visit(node, [])
        if len(chain) > len(best):
            best = chain
    return len(best), best, cycles


def dependents(graph: dict[str, set[str]]) -> dict[str, int]:
    """course -> number of courses that need it directly or transitively."""
    reverse: dict[str, set[str]] = defaultdict(set)
    for course, pres in graph.items():
        for p in pres:
            reverse[p].add(course)
    out = {}
    for start in reverse:
        seen, stack = set(), [start]
        while stack:
            for nxt in reverse.get(stack.pop(), ()):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        out[start] = len(seen - {start})
    return out


def regular_index(course: dict[str, Any]) -> float | None:
    """Typical term as a position on the regular-term axis (summer = half step)."""
    y, p = course.get("typical_year"), course.get("typical_part")
    if y is None or p is None:
        return None
    return (y - 1) * 2 + (p if p in (1, 2) else 2.5)


def profile_curriculum(cur: dict[str, Any], graduation: dict[str, Any] | None = None) -> dict[str, Any]:
    courses = {c["id"]: c for c in cur["courses"]}
    regular = [c for c in cur["courses"] if c.get("kind", "regular") == "regular"]
    credits = {c["id"]: c["credits"] for c in cur["courses"]}
    plan = cur["planning"]
    degree = required_credits(cur, graduation)

    # --- groups and choice ---------------------------------------------------------
    listed = [g for g in cur["groups"] if g.get("scope", "listed") == "listed"]
    mandatory = [c for g in listed if g["type"] == "mandatory" for c in g["course_ids"]]
    electives = []
    for g in listed:
        if g["type"] != "elective":
            continue
        pool = sum(credits[c] for c in g["course_ids"])
        need = g.get("min_credits") or (g.get("min_courses") or 0) * (
            statistics.mean(credits[c] for c in g["course_ids"]) if g["course_ids"] else 0)
        electives.append({"id": g["id"], "name": g.get("name"), "pool_courses": len(g["course_ids"]),
                          "pool_credits": pool, "required_credits": need,
                          "slack": round(pool / need, 2) if need else None})
    free = sum(g.get("min_credits") or 0 for g in cur["groups"] if g.get("scope") == "any")
    mandatory_credits = sum(credits[c] for c in set(mandatory))
    chosen_credits = sum(e["required_credits"] for e in electives) + free

    # --- relations -----------------------------------------------------------------
    by_type = Counter(r["type"] for r in cur["relations"])
    by_source = Counter(r.get("source") or "unknown" for r in cur["relations"])
    hard = [r for r in cur["relations"] if r["type"] in HARD]
    touched = {r["course"] for r in hard} | {c for r in hard for c in r["any_of"]}
    graph = prerequisite_graph(cur)
    chain_len, chain, cycles = longest_chain(graph)
    deps = dependents(graph)
    bottlenecks = sorted(deps.items(), key=lambda kv: (-kv[1], kv[0]))[:5]

    # Typical terms that contradict a prerequisite (the prerequisite is planned later or same term).
    order_conflicts = []
    for r in cur["relations"]:
        if r["type"] != "prerequisite" or len(r["any_of"]) != 1:
            continue
        a, b = regular_index(courses[r["course"]]), regular_index(courses[r["any_of"][0]])
        if a is not None and b is not None and b >= a:
            order_conflicts.append([r["any_of"][0], r["course"]])

    # --- calendar fit (lower bounds on regular terms) --------------------------------
    nominal = (plan.get("duration_years") or 0) * 2 or None
    by_load = math.ceil(degree / plan["max_load"]) if degree else None
    bounds = [b for b in (by_load, chain_len or None) if b]
    fit = {"nominal_regular_terms": nominal, "terms_needed_by_max_load": by_load,
           "terms_needed_by_chain": chain_len or None,
           "slack_terms": (nominal - max(bounds)) if nominal and bounds else None,
           "mean_load_needed": round(degree / nominal, 1) if degree and nominal else None,
           "min_load": plan["min_load"], "max_load": plan["max_load"]}

    # --- offering ------------------------------------------------------------------
    n = len(regular)
    offering = {
        "offered_terms_known": sum(c.get("offered_terms") is not None for c in regular) / n if n else None,
        "summer_history_known": sum("offered_in_summer" in c for c in regular) / n if n else None,
        "summer_ever_offered": (sum(bool(c.get("offered_in_summer")) or 3 in (c.get("offered_terms") or [])
                                    for c in regular) / n) if n else None,
        "summer_forbidden_by_rule": sum(c.get("allowed_terms") is not None and 3 not in c["allowed_terms"]
                                        for c in regular),
        "typical_term_known": sum(regular_index(c) is not None for c in regular) / n if n else None,
    }

    # --- majors --------------------------------------------------------------------
    major_sets = {m["id"]: set(m["rule"].get("course_ids", [])) for m in cur["majors"]}
    overlaps = [len(a & b) / len(a | b) for a, b in combinations(major_sets.values(), 2) if a | b]

    # --- data quality --------------------------------------------------------------
    membership = Counter(c for g in listed for c in g["course_ids"])
    in_major = {c for s in major_sets.values() for c in s}
    quality = {
        "courses_in_no_group": sorted(c["id"] for c in regular
                                      if not membership[c["id"]] and c["id"] not in in_major),
        "courses_in_several_groups": sorted(c for c, k in membership.items() if k > 1),
        "groups_needing_more_than_their_pool": [e["id"] for e in electives
                                                if e["required_credits"] > e["pool_credits"]],
        "prerequisite_cycles": cycles,
        "typical_term_contradicts_prerequisite": order_conflicts,
        "milestones_without_threshold": sorted(m["course"] for m in cur["milestones"]
                                               if m.get("min_credit_percent") is None),
    }

    return {
        "id": cur["id"],
        "name": cur.get("name"),
        "size": {
            "courses": len(cur["courses"]),
            "condition_courses": len(cur["courses"]) - n,
            "listed_credits": sum(c["credits"] for c in regular),
            "degree_credits": degree,
            "course_credits": _summary([c["credits"] for c in regular]),
            "levels": dict(sorted(Counter(c["level"] for c in regular if "level" in c).items())),
        },
        "choice": {
            "mandatory_credits": mandatory_credits,
            "elective_groups": electives,
            "free_elective_credits": free,
            "chosen_credit_share": round(chosen_credits / degree, 3) if degree else None,
        },
        "relations": {
            "by_type": dict(by_type),
            "by_source": dict(by_source),
            "hard": len(hard),
            "hard_per_course": round(len(hard) / n, 3) if n else None,
            "share_of_courses_in_hard_relation": round(len(touched & set(courses)) / n, 3) if n else None,
            "or_clauses": sum(len(r["any_of"]) > 1 for r in cur["relations"]),
            "longest_prerequisite_chain": chain_len,
            "longest_chain_example": chain,
            "top_dependents": [{"course": c, "dependents": k} for c, k in bottlenecks],
        },
        "calendar_fit": fit,
        "offering": offering,
        "majors": {
            "count": len(cur["majors"]),
            "sizes": {k: len(v) for k, v in major_sets.items()},
            "mean_jaccard_overlap": round(statistics.mean(overlaps), 3) if overlaps else None,
            "max_jaccard_overlap": round(max(overlaps), 3) if overlaps else None,
        },
        "milestones": [{"course": m["course"], "min_credit_percent": m.get("min_credit_percent"),
                        "kind": m.get("kind")} for m in cur["milestones"]],
        "quality": quality,
    }
