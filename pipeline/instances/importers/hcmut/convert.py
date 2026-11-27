"""HCMUT web-database layout -> canonical instance (instances/SCHEMA.md).

The HCMUT importers (``fetch_curriculum``) first assemble one program in the layout of
the web database (``curriculum``, ``rules``, ``semesters``, ``courses``,
``curriculum_courses``, ``course_relations``, ``course_groups``, ``conditions``,
``summer_history``, ``summer_excluded``, ``graduation_courses``, ``offerings``,
``student``, ``scenarios``; semester codes ``YYP``). ``from_planner_fixture`` turns that
into a curriculum, a student table and requests; ``write_instance`` writes them.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from planner.model.input import (
    STATUS_TO_RESULT,
    ConversionError,
    _map_request_terms,
    hcmut_to_term,
    term_sequence,
)

# HCMUT rule (QD 285 art. 15.4) used when the fixture sets ``rules.course_level``.
HCMUT_LEVEL_RULE = {"1": 1, "2": 2, "3": 3}
_LEVEL = re.compile(r"^[A-Za-z]+(\d)")


def from_planner_fixture(fx: dict[str, Any], student_id: str,
                         grading_policy: str | None = None) -> dict[str, Any]:
    """Planner fixture -> {"curriculum", "students", "requests"} in the canonical format."""
    cur = fx["curriculum"]
    rules = fx.get("rules") or {}
    curriculum_id = cur["code"]

    semesters = fx["semesters"]
    summer_terms = any(s.endswith("3") for s in semesters)
    first_term = hcmut_to_term(semesters[0])
    expected = term_sequence(first_term, len(semesters), summer_terms)
    if [hcmut_to_term(s) for s in semesters] != expected:
        raise ConversionError(f"{curriculum_id}: semesters are not consecutive: {semesters}")

    typical = {cc["course_code"]: cc for cc in fx["curriculum_courses"]}
    if set(typical) != {c["code"] for c in fx["courses"]}:
        raise ConversionError(f"{curriculum_id}: courses and curriculum_courses differ")
    conditions = set(fx.get("conditions", []))
    always_summer = set(rules.get("summer_courses", []))
    history = fx.get("summer_history")
    history = None if history is None else set(history)
    excluded = set(fx.get("summer_excluded", []))
    opened = fx.get("offering_history") or {}

    courses = []
    for c in fx["courses"]:
        code = c["code"]
        m = _LEVEL.match(code)
        course: dict[str, Any] = {"id": code, "name": c["name"], "credits": c["credits"]}
        if code in conditions:
            course["kind"] = "condition"
        if m:
            course["level"] = int(m.group(1))
        cc = typical[code]
        course["typical_year"] = cc["recommended_year"]
        course["typical_part"] = cc["recommended_term"]
        if code in opened:
            course["offered_terms"] = sorted(int(p) for p in opened[code])
        # Summer: rules (allowed_terms, hard) vs history (offered_in_summer, may be soft).
        if code in excluded:
            course["allowed_terms"] = [1, 2]
        if history is not None and summer_terms:
            course["offered_in_summer"] = code in history
        courses.append(course)

    relations = []
    for r in fx["course_relations"]:
        rel: dict[str, Any] = {"course": r["course_code"], "type": r["type"], "any_of": [r["related_course_code"]]}
        if "source" in r:
            rel["source"] = r["source"]
        relations.append(rel)

    by_name = {}
    groups, majors = [], []
    for i, g in enumerate(fx["course_groups"], start=1):
        by_name[g["name"]] = f"G{i}"
    for g in fx["course_groups"]:
        if g.get("parent"):
            majors.append({
                "id": g["specialization"],
                "name": g["name"],
                "refines_group": by_name[g["parent"]],
                "rule": {"type": "required_courses", "min_courses": g["required_count"],
                         "min_credits": g["required_credits"], "course_ids": list(g["members"])},
            })
            continue
        group: dict[str, Any] = {
            "id": by_name[g["name"]],
            "name": g["name"],
            "type": "mandatory" if g["kind"] == "required" else g["kind"],
            "course_ids": list(g["members"]),
            "min_courses": g["required_count"],
            "min_credits": g["required_credits"],
        }
        if g.get("pool_scope") == "any":
            group["scope"] = "any"
            group["slot_credits"] = g.get("pool_course_credits")
        groups.append(group)

    milestones = []
    thresholds = rules.get("graduation_thresholds") or {}
    for kind, codes in (fx.get("graduation_courses") or {}).items():
        for code in [codes] if isinstance(codes, str) else codes:
            ms: dict[str, Any] = {"course": code, "kind": kind}
            if kind in thresholds:
                pct = round(thresholds[kind] * 100, 6)
                ms["min_credit_percent"] = int(pct) if pct == int(pct) else pct
            milestones.append(ms)

    planning: dict[str, Any] = {
        "first_term": first_term,
        "horizon": len(semesters),
        "summer_terms": summer_terms,
        "duration_years": cur["duration_years"],
        "min_load": rules.get("credits_min", cur["min_semester_credits"]),
        "max_load": rules.get("credits_max", cur["max_semester_credits"]),
        "summer_max_load": rules.get("summer_credits_max"),
        "preferred_load": rules.get("preferred_load"),
        "summer_preferred_load": rules.get("summer_preferred_load"),
        "summer_always_allowed": sorted(always_summer),
        "level_min_year": HCMUT_LEVEL_RULE if rules.get("course_level") else None,
    }

    offerings = fx.get("offerings") or {}
    curriculum = {
        "schema_version": 3,
        "id": curriculum_id,
        "name": cur["name"],
        "cohort": cur["cohort"],
        "planning": planning,
        "courses": courses,
        "relations": relations,
        "groups": groups,
        "majors": majors,
        "default_major": None,
        "milestones": milestones,
        "offerings": {
            "unknown_policy": offerings.get("unknown_policy", "assume-open"),
            "records": [{"course": r["course_code"], "term": hcmut_to_term(r["semester_code"]), "status": r["status"]}
                        for r in offerings.get("records", [])],
        },
        "_provenance": {"converted_from": "planner fixture", "note": fx.get("_note")},
    }

    st = fx["student"]
    students = {
        "schema_version": 3,
        "students": [{
            "student_id": student_id,
            "curriculum_id": curriculum_id,
            "grading_policy": grading_policy,
            "cohort": cur["cohort"],
            "enrollment_term": first_term,
            "current_term": hcmut_to_term(st["current_semester"]),
            "declared_major": st.get("target_specialization"),
            "source": st.get("source"),
        }],
        "attempts": [
            {"student_id": student_id, "attempt_id": f"{student_id}-{i:02d}", "course": sc["course_code"],
             "term": None, "grade": None, "result": STATUS_TO_RESULT[sc["status"]], "course_kind": "regular"}
            for i, sc in enumerate(st["student_courses"], start=1) if sc["status"] != "not-started"
        ],
        "external_progress": [],
        "expected": [],
    }

    requests = []
    for sc in fx.get("scenarios", []):
        req = _map_request_terms(sc, hcmut_to_term)
        req = {"id": req.pop("id"), "label": req.pop("label", None), "curriculum_id": curriculum_id,
               "student_id": student_id, **req}
        requests.append(req)
    return {"curriculum": curriculum, "students": students, "requests": requests}


def write_instance(university: Path, converted: dict[str, Any], name: str) -> list[Path]:
    """Write ``from_planner_fixture`` output under ``instances/<university>/``."""
    cid = converted["curriculum"]["id"]
    targets = {
        university / "curricula" / cid / "curriculum.json": converted["curriculum"],
        university / "students" / f"{name}.json": converted["students"],
        university / "requests" / f"{name}.json": converted["requests"],
    }
    for path, obj in targets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return list(targets)
