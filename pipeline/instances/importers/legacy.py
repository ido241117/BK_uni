"""Convert the two legacy input formats to the canonical instance format and back.

Legacy formats:
    data/            engine-native JSON read by the ASP engine and data_tools
    planner fixture  web-entity JSON (planner/fixtures/*.json) read by CP-SAT, the
                     validator and synthetic/

The reverse direction (canonical -> legacy) exists so that modules can be moved onto
the canonical format one at a time while their tests keep passing.

    cd pipeline
    python -m instances.importers.legacy build      # writes instances/<university>/...
"""

from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path
from typing import Any

PIPELINE = Path(__file__).resolve().parents[2]
INSTANCES = PIPELINE / "instances"

# Planner student statuses <-> canonical attempt results.
STATUS_TO_RESULT = {"completed": "passed", "failed": "failed", "in-progress": "in_progress"}
RESULT_TO_STATUS = {v: k for k, v in STATUS_TO_RESULT.items()}

# HCMUT rule (QD 285 art. 15.4) used when the fixture sets ``rules.course_level``.
HCMUT_LEVEL_RULE = {"1": 1, "2": 2, "3": 3}
_LEVEL = re.compile(r"^[A-Za-z]+(\d)")

# Scenario fields that carry terms (planner semester codes).
_TERM_ITEM_LISTS = ("locked", "not_offered", "offered", "assumed_fail")
_TERM_KEYED_DICTS = ("semester_limits", "semester_targets")


class ConversionError(ValueError):
    pass


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


# ---------------------------------------------------------------------------
# Planner fixture <-> canonical
# ---------------------------------------------------------------------------


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


def to_planner_fixture(curriculum: dict[str, Any], students: dict[str, Any], student_id: str,
                       requests: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Canonical -> planner fixture (the input CP-SAT, the validator and synthetic/ read)."""
    student = next(s for s in students["students"] if s["student_id"] == student_id)
    attempts = [a for a in students["attempts"] if a["student_id"] == student_id]
    p = curriculum["planning"]
    semesters = [term_to_hcmut(t) for t in term_sequence(p["first_term"], p["horizon"], p["summer_terms"])]
    courses = curriculum["courses"]

    rules: dict[str, Any] = {"credits_min": p["min_load"], "credits_max": p["max_load"]}
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


# ---------------------------------------------------------------------------
# data/ <-> canonical
# ---------------------------------------------------------------------------


def from_data_curriculum(raw: dict[str, Any]) -> dict[str, Any]:
    """data/curriculum.json (schema 1) -> canonical curriculum (schema 3)."""
    out = copy.deepcopy(raw)
    out["schema_version"] = 3
    courses, relations = [], []
    for c in out.pop("courses"):
        for kind, key in (("prerequisite", "prerequisites"), ("corequisite", "corequisites")):
            for alternatives in c.pop(key):
                relations.append({"course": c["id"], "type": kind, "any_of": list(alternatives),
                                  "source": "curriculum"})
        if "typical_regular_term" in c:
            i = c.pop("typical_regular_term")
            c["typical_year"], c["typical_part"] = (i + 1) // 2, 2 - i % 2
        courses.append(c)
    out["courses"] = courses
    out["relations"] = relations
    return out


def to_data_curriculum(cur: dict[str, Any]) -> dict[str, Any]:
    """Canonical curriculum -> data/curriculum.json (schema 1), as the ASP engine reads it."""
    out = copy.deepcopy(cur)
    out["schema_version"] = 1
    rels = out.pop("relations")
    courses = []
    for c in out.pop("courses"):
        c = dict(c)
        prereq = [r["any_of"] for r in rels if r["course"] == c["id"] and r["type"] == "prerequisite"]
        coreq = [r["any_of"] for r in rels if r["course"] == c["id"] and r["type"] == "corequisite"]
        year, part = c.pop("typical_year", None), c.pop("typical_part", None)
        rebuilt = {"id": c.pop("id"), "name": c.pop("name"), "credits": c.pop("credits"),
                   "prerequisites": prereq, "corequisites": coreq}
        rebuilt.update(c)
        if year is not None:
            rebuilt["typical_regular_term"] = (year - 1) * 2 + part
        courses.append(rebuilt)
    out["courses"] = courses
    return out


# ---------------------------------------------------------------------------
# Build the instance folders
# ---------------------------------------------------------------------------


def _write(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build() -> None:
    data = PIPELINE / "data"
    fixtures = PIPELINE / "planner" / "fixtures"
    hcmut = INSTANCES / "hcmut"

    # Shared university policy (data/ format, unchanged).
    _write(hcmut / "policy" / "grading.json", _read(data / "grading_policy.json"))
    _write(hcmut / "policy" / "tuition.json", _read(data / "tuition_policy.json"))

    # cs_2023: the hand-curated example dataset with oracle students.
    raw = _read(data / "curriculum.json")
    cur = from_data_curriculum(raw)
    cur_dir = hcmut / "curricula" / cur["id"]
    _write(cur_dir / "curriculum.json", cur)
    _write(cur_dir / "graduation.json", _read(data / "graduation_requirements.json"))
    _write(cur_dir / "popularity.json", _read(data / "elective_popularity.json"))
    _write(hcmut / "students" / "cs_2023-oracle.json", _read(data / "student_history.json"))

    # CS-2023-KHMT: built from the database (via the planner fixture).
    grading_id = _read(data / "grading_policy.json")["id"]
    conv = from_planner_fixture(_read(fixtures / "khmt2023.json"), "khmt2023-demo", grading_id)
    cur_dir = hcmut / "curricula" / conv["curriculum"]["id"]
    _write(cur_dir / "curriculum.json", conv["curriculum"])
    # Same program as cs_2023; the ASP adapter already applied cs_2023's graduation rules to it.
    graduation = _read(data / "graduation_requirements.json")
    graduation["curriculum_id"] = conv["curriculum"]["id"]
    graduation["_provenance"] = "copied from cs_2023 (same program, CS 2023); not checked against the database"
    _write(cur_dir / "graduation.json", graduation)
    _write(hcmut / "students" / "khmt2023-demo.json", conv["students"])
    _write(hcmut / "requests" / "khmt2023-demo.json", conv["requests"])

    # toy: invented 14-course program for tests.
    conv = from_planner_fixture(_read(fixtures / "toy.json"), "toy-demo")
    toy = INSTANCES / "toy"
    _write(toy / "curricula" / conv["curriculum"]["id"] / "curriculum.json", conv["curriculum"])
    _write(toy / "students" / "toy-demo.json", conv["students"])
    _write(toy / "requests" / "toy-demo.json", conv["requests"])


if __name__ == "__main__":
    if sys.argv[1:] != ["build"]:
        sys.exit(__doc__)
    build()
