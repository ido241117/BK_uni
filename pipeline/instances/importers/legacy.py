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

PIPELINE = Path(__file__).resolve().parents[2]
INSTANCES = PIPELINE / "instances"

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
