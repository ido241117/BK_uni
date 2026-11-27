"""Planner input: build the solvers' internal input dict from the canonical instances.

The solvers (planner/solvers) and the validator work on one dict per case, shaped like
the former web fixtures (``curriculum``, ``rules``, ``semesters``, ``courses``,
``course_relations``, ``course_groups``, ``student``, ``scenarios``). This module is the
only place that builds it; the input on disk is always ``instances/`` (SCHEMA.md).

    from planner.model.input import load_fixture, TOY
    fixture = load_fixture(TOY)        # every request of instances/toy/requests/toy-demo.json
"""

from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Any

PIPELINE = Path(__file__).resolve().parents[2]
INSTANCES = PIPELINE / "instances"
TOY = INSTANCES / "toy" / "requests" / "toy-demo.json"
KHMT = INSTANCES / "hcmut" / "requests" / "khmt2023-demo.json"


class ConversionError(ValueError):
    pass


# Planner student statuses <-> canonical attempt results.
STATUS_TO_RESULT = {"completed": "passed", "failed": "failed", "in-progress": "in_progress"}
RESULT_TO_STATUS = {v: k for k, v in STATUS_TO_RESULT.items()}

# Scenario fields that carry terms (planner semester codes).
_TERM_ITEM_LISTS = ("locked", "not_offered", "offered", "assumed_fail")
_TERM_KEYED_DICTS = ("semester_limits", "semester_targets")


# ---------------------------------------------------------------------------
# Terms
# ---------------------------------------------------------------------------


def hcmut_to_term(code: str) -> str:
    """HCMUT semester code ``YYP`` (e.g. ``233``) -> canonical ``YYYY-P`` (``2023-3``)."""
    if not re.fullmatch(r"\d{2}[123]", code):
        raise ConversionError(f"not an HCMUT semester code: {code!r}")
    return f"20{code[:2]}-{code[2]}"


def term_to_hcmut(term: str) -> str:
    year, part = term.split("-")
    return f"{year[2:]}{part}"


def term_sequence(first_term: str, horizon: int, summer_terms: bool) -> list[str]:
    """``horizon`` consecutive terms from ``first_term``; part 3 is the summer term."""
    year, part = (int(x) for x in first_term.split("-"))
    parts = (1, 2, 3) if summer_terms else (1, 2)
    if part not in parts:
        raise ConversionError(f"first_term {first_term!r} is not a term of this calendar")
    out: list[str] = []
    while len(out) < horizon:
        out.append(f"{year}-{part}")
        i = parts.index(part) + 1
        if i == len(parts):
            year, part = year + 1, parts[0]
        else:
            part = parts[i]
    return out


def _map_request_terms(scenario: dict[str, Any], fn) -> dict[str, Any]:
    out = copy.deepcopy(scenario)
    for key in _TERM_ITEM_LISTS:
        if key in out:
            items = []
            for item in out[key]:
                item = dict(item)
                src = "semester_code" if "semester_code" in item else "term"
                dst = "term" if src == "semester_code" else "semester_code"
                item[dst] = fn(item.pop(src))
                items.append(item)
            out[key] = items
    if out.get("graduate_by") is not None:
        out["graduate_by"] = fn(out["graduate_by"])
    if "summer_opt_in" in out:
        out["summer_opt_in"] = [fn(t) for t in out["summer_opt_in"]]
    for key in _TERM_KEYED_DICTS:
        if key in out:
            out[key] = {fn(t): v for t, v in out[key].items()}
    return out


def to_planner_fixture(curriculum: dict[str, Any], students: dict[str, Any], student_id: str,
                       requests: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Canonical -> planner fixture (the input CP-SAT, the validator and synthetic/ read)."""
    student = next(s for s in students["students"] if s["student_id"] == student_id)
    attempts = [a for a in students["attempts"] if a["student_id"] == student_id]
    p = curriculum["planning"]
    semesters = [term_to_hcmut(t) for t in term_sequence(p["first_term"], p["horizon"], p["summer_terms"])]
    courses = curriculum["courses"]

    rules: dict[str, Any] = {}  # load bounds go to curriculum.min/max_semester_credits
    if p.get("level_min_year"):
        rules["course_level"] = True
    for src, dst in (("summer_max_load", "summer_credits_max"), ("preferred_load", "preferred_load"),
                     ("summer_preferred_load", "summer_preferred_load")):
        if p.get(src) is not None:
            rules[dst] = p[src]
    if p.get("summer_always_allowed"):
        rules["summer_courses"] = list(p["summer_always_allowed"])
    thresholds = {m["kind"]: m["min_credit_percent"] / 100 for m in curriculum["milestones"]
                  if m.get("kind") and m.get("min_credit_percent") is not None}
    if thresholds:
        rules["graduation_thresholds"] = thresholds

    names = {g["id"]: g["name"] for g in curriculum["groups"]}
    groups = []
    for g in curriculum["groups"]:
        groups.append({
            "name": g["name"],
            "kind": "required" if g["type"] == "mandatory" else g["type"],
            "required_count": g.get("min_courses"),
            "required_credits": g.get("min_credits"),
            "pool_scope": g.get("scope", "listed"),
            "members": list(g["course_ids"]),
            **({"pool_course_credits": g.get("slot_credits")} if g.get("scope") == "any" else {}),
        })
    for m in curriculum["majors"]:
        if "refines_group" not in m:
            continue
        groups.append({
            "name": m["name"], "kind": "elective", "required_count": m["rule"]["min_courses"],
            "required_credits": m["rule"].get("min_credits"), "pool_scope": "listed",
            "members": list(m["rule"]["course_ids"]), "parent": names[m["refines_group"]],
            "specialization": m["id"],
        })

    graduation_courses: dict[str, Any] = {}
    for m in curriculum["milestones"]:
        kind = m.get("kind") or m["course"]
        if kind in graduation_courses:
            prev = graduation_courses[kind]
            graduation_courses[kind] = (prev if isinstance(prev, list) else [prev]) + [m["course"]]
        else:
            graduation_courses[kind] = m["course"]

    fx: dict[str, Any] = {
        "schema_version": 1,
        "curriculum": {
            "code": curriculum["id"], "name": curriculum["name"], "cohort": curriculum["cohort"],
            "duration_years": p["duration_years"],
            "min_semester_credits": p["min_load"], "max_semester_credits": p["max_load"],
        },
        "rules": rules,
        "semesters": semesters,
        "courses": [{"code": c["id"], "name": c["name"], "credits": c["credits"]} for c in courses],
        "curriculum_courses": [{"course_code": c["id"], "recommended_year": c.get("typical_year"),
                                "recommended_term": c.get("typical_part")} for c in courses],
        "course_relations": [],
        "course_groups": groups,
        "offerings": {
            "unknown_policy": curriculum["offerings"]["unknown_policy"],
            "records": [{"course_code": r["course"], "semester_code": term_to_hcmut(r["term"]), "status": r["status"]}
                        for r in curriculum["offerings"]["records"]],
        },
    }
    for r in curriculum["relations"]:
        for other in r["any_of"]:
            if len(r["any_of"]) > 1:
                raise ConversionError("the planner fixture has no OR prerequisites")
            rel = {"course_code": r["course"], "related_course_code": other, "type": r["type"]}
            if r.get("source") is not None:
                rel["source"] = r["source"]
            fx["course_relations"].append(rel)
    conditions = [c["id"] for c in courses if c.get("kind") == "condition"]
    if conditions:
        fx["conditions"] = conditions
    if any("offered_in_summer" in c for c in courses):
        fx["summer_history"] = [c["id"] for c in courses if c.get("offered_in_summer")]
    excluded = [c["id"] for c in courses if c.get("allowed_terms") is not None and 3 not in c["allowed_terms"]]
    if excluded:
        fx["summer_excluded"] = excluded
    opened = {c["id"]: [str(t) for t in c["offered_terms"]] for c in courses if c.get("offered_terms")}
    if opened:
        fx["offering_history"] = opened
    if graduation_courses:
        fx["graduation_courses"] = graduation_courses

    fx["student"] = {
        "current_semester": term_to_hcmut(student["current_term"]),
        **({"source": student["source"]} if student.get("source") is not None else {}),
        **({"target_specialization": student["declared_major"]} if student.get("declared_major") else {}),
        "student_courses": [{"course_code": a["course"], "status": RESULT_TO_STATUS[a["result"]]}
                            for a in attempts],
    }
    if requests is not None:
        scenarios = []
        for req in requests:
            sc = {k: v for k, v in req.items() if k not in ("curriculum_id", "student_id")}
            if sc.get("label") is None:
                sc.pop("label", None)
            scenarios.append(_map_request_terms(sc, term_to_hcmut))
        fx["scenarios"] = scenarios
    return fx


def load_fixture(path: str | Path) -> dict[str, Any]:
    """Planner input for a request file ``instances/<university>/requests/<set>.json``.

    All requests of the file must be for one student; they become ``scenarios``.
    """
    from instances.loader import load_university

    path = Path(path).resolve()
    uni = load_university(path.parents[1])
    requests = uni.requests[path.stem]
    students = {(r["curriculum_id"], r["student_id"]) for r in requests}
    if len(students) != 1:
        raise ConversionError(f"{path}: requests for several students: {sorted(students)}")
    curriculum_id, student_id = students.pop()
    doc, _ = uni.student_record(student_id)
    return to_planner_fixture(uni.curricula[curriculum_id]["curriculum"], doc, student_id, requests)
