"""Load and validate one university's instance folder (format: instances/SCHEMA.md).

    from instances.loader import load_university
    uni = load_university("instances/hcmut")
    uni.curricula["CS-2023-KHMT"]["curriculum"]

    python -m instances.loader instances/hcmut     # validate, print a summary
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 3
RELATION_TYPES = {"prerequisite", "corequisite", "recommended", "prior"}
RELATION_SOURCES = {"curriculum", "inferred"}
GROUP_TYPES = {"mandatory", "elective"}
COURSE_KINDS = {"regular", "condition"}
ATTEMPT_RESULTS = {None, "passed", "failed", "in_progress"}
TERM_PARTS = {1, 2, 3}
_TERM = re.compile(r"^\d{4}-[123]$")
_REQUEST_TERM_ITEMS = ("locked", "not_offered", "offered", "assumed_fail")


class InstanceError(ValueError):
    def __init__(self, messages: list[str]):
        self.messages = messages
        super().__init__("\n".join(messages))


@dataclass
class University:
    root: Path
    policy: dict[str, Any] = field(default_factory=dict)          # "grading", "tuition"
    curricula: dict[str, dict[str, Any]] = field(default_factory=dict)  # id -> {"curriculum", "graduation"?, "popularity"?}
    students: dict[str, dict[str, Any]] = field(default_factory=dict)   # file stem -> student tables
    requests: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    def student_record(self, student_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        """(student tables file, student row) holding ``student_id``."""
        for doc in self.students.values():
            for row in doc["students"]:
                if row["student_id"] == student_id:
                    return doc, row
        raise KeyError(student_id)


def _read(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InstanceError([f"{path}: invalid JSON: {exc}"]) from exc


def _is_term(value: Any) -> bool:
    return isinstance(value, str) and bool(_TERM.match(value))


def validate_curriculum(cur: dict[str, Any], ctx: str) -> list[str]:
    errors: list[str] = []
    err = errors.append
    if cur.get("schema_version") != SCHEMA_VERSION:
        err(f"{ctx}: schema_version must be {SCHEMA_VERSION}")
    for key in ("id", "name", "planning", "courses", "relations", "groups", "majors", "milestones"):
        if key not in cur:
            err(f"{ctx}: missing {key!r}")
    if errors:
        return errors

    courses: dict[str, dict[str, Any]] = {}
    for c in cur["courses"]:
        cid = c.get("id")
        if not isinstance(cid, str) or cid in courses:
            err(f"{ctx}: missing or duplicate course id {cid!r}")
            continue
        courses[cid] = c
        if not isinstance(c.get("credits"), int) or c["credits"] < 0:
            err(f"{ctx}: course {cid}: credits must be a non-negative integer")
        if c.get("kind", "regular") not in COURSE_KINDS:
            err(f"{ctx}: course {cid}: unknown kind {c['kind']!r}")
        for key in ("offered_terms", "allowed_terms"):
            if c.get(key) is not None and not set(c[key]) <= TERM_PARTS:
                err(f"{ctx}: course {cid}: {key} must be a subset of {sorted(TERM_PARTS)}")
        if c.get("typical_part") is not None and c["typical_part"] not in TERM_PARTS:
            err(f"{ctx}: course {cid}: typical_part must be 1, 2 or 3")

    for i, r in enumerate(cur["relations"]):
        rctx = f"{ctx}: relations[{i}]"
        if r.get("type") not in RELATION_TYPES:
            err(f"{rctx}: unknown type {r.get('type')!r}")
        if r.get("source") is not None and r["source"] not in RELATION_SOURCES:
            err(f"{rctx}: unknown source {r['source']!r}")
        if r.get("course") not in courses:
            err(f"{rctx}: unknown course {r.get('course')!r}")
        if not r.get("any_of"):
            err(f"{rctx}: any_of must list at least one course")
        for other in r.get("any_of") or []:
            if other not in courses:
                err(f"{rctx}: unknown course {other!r} in any_of")

    group_ids: set[str] = set()
    for g in cur["groups"]:
        gid = g.get("id")
        if gid in group_ids:
            err(f"{ctx}: duplicate group id {gid!r}")
        group_ids.add(gid)
        if g.get("type") not in GROUP_TYPES:
            err(f"{ctx}: group {gid}: unknown type {g.get('type')!r}")
        if g.get("scope", "listed") not in ("listed", "any"):
            err(f"{ctx}: group {gid}: scope must be 'listed' or 'any'")
        if g.get("scope") == "any" and not g.get("slot_credits"):
            err(f"{ctx}: group {gid}: scope 'any' needs slot_credits")
        for c in g.get("course_ids", []):
            if c not in courses:
                err(f"{ctx}: group {gid}: unknown course {c!r}")

    for m in cur["majors"]:
        if m.get("refines_group") is not None and m["refines_group"] not in group_ids:
            err(f"{ctx}: major {m.get('id')}: unknown group {m['refines_group']!r}")
        for c in (m.get("rule") or {}).get("course_ids", []):
            if c not in courses:
                err(f"{ctx}: major {m.get('id')}: unknown course {c!r}")

    for m in cur["milestones"]:
        if m.get("course") not in courses:
            err(f"{ctx}: milestone course {m.get('course')!r} unknown")
        pct = m.get("min_credit_percent")
        if pct is not None and not 0 <= pct <= 100:
            err(f"{ctx}: milestone {m.get('course')}: min_credit_percent must be in 0..100")

    p = cur["planning"]
    for key in ("horizon", "min_load", "max_load"):
        if not isinstance(p.get(key), int):
            err(f"{ctx}: planning.{key} must be an integer")
    if isinstance(p.get("min_load"), int) and isinstance(p.get("max_load"), int) and p["min_load"] > p["max_load"]:
        err(f"{ctx}: planning.min_load > planning.max_load")
    if p.get("first_term") is not None and not _is_term(p["first_term"]):
        err(f"{ctx}: planning.first_term must look like YYYY-P")
    for c in p.get("summer_always_allowed") or []:
        if c not in courses:
            err(f"{ctx}: planning.summer_always_allowed: unknown course {c!r}")

    for r in (cur.get("offerings") or {}).get("records", []):
        if r.get("course") not in courses or not _is_term(r.get("term")):
            err(f"{ctx}: offerings record {r} has an unknown course or a bad term")
    return errors


def validate_students(doc: dict[str, Any], ctx: str, uni: University) -> list[str]:
    errors: list[str] = []
    err = errors.append
    grade_scale = {g["grade"] for g in uni.policy.get("grading", {}).get("grade_scale", [])}
    rows = {s["student_id"]: s for s in doc.get("students", [])}
    if len(rows) != len(doc.get("students", [])):
        err(f"{ctx}: duplicate student_id")
    for s in rows.values():
        if s.get("curriculum_id") not in uni.curricula:
            err(f"{ctx}: student {s['student_id']}: unknown curriculum {s.get('curriculum_id')!r}")
        for key in ("enrollment_term", "current_term"):
            if s.get(key) is not None and not _is_term(s[key]):
                err(f"{ctx}: student {s['student_id']}: {key} must look like YYYY-P")
    seen: set[str] = set()
    for a in doc.get("attempts", []):
        actx = f"{ctx}: attempt {a.get('attempt_id')}"
        if a.get("attempt_id") in seen:
            err(f"{actx}: duplicate attempt_id")
        seen.add(a.get("attempt_id"))
        s = rows.get(a.get("student_id"))
        if s is None:
            err(f"{actx}: unknown student {a.get('student_id')!r}")
            continue
        cur = uni.curricula.get(s.get("curriculum_id"), {}).get("curriculum")
        if cur and a.get("course") not in {c["id"] for c in cur["courses"]}:
            err(f"{actx}: course {a.get('course')!r} is not in curriculum {cur['id']}")
        if a.get("term") is not None and not _is_term(a["term"]):
            err(f"{actx}: term must look like YYYY-P or be null")
        if a.get("result") not in ATTEMPT_RESULTS:
            err(f"{actx}: unknown result {a.get('result')!r}")
        if a.get("grade") is not None and grade_scale and a["grade"] not in grade_scale:
            err(f"{actx}: grade {a['grade']!r} is not in the grading policy")
        if a.get("grade") is None and a.get("result") is None:
            err(f"{actx}: needs a grade or a result")
    for e in doc.get("external_progress", []):
        if e.get("student_id") not in rows:
            err(f"{ctx}: external_progress for unknown student {e.get('student_id')!r}")
    return errors


def validate_requests(reqs: list[dict[str, Any]], ctx: str, uni: University) -> list[str]:
    errors: list[str] = []
    err = errors.append
    for r in reqs:
        rctx = f"{ctx}: request {r.get('id')!r}"
        if r.get("curriculum_id") not in uni.curricula:
            err(f"{rctx}: unknown curriculum {r.get('curriculum_id')!r}")
            continue
        try:
            uni.student_record(r.get("student_id"))
        except KeyError:
            err(f"{rctx}: unknown student {r.get('student_id')!r}")
        courses = {c["id"] for c in uni.curricula[r["curriculum_id"]]["curriculum"]["courses"]}
        for key in _REQUEST_TERM_ITEMS:
            for item in r.get(key, []):
                if item.get("course_code") not in courses or not _is_term(item.get("term")):
                    err(f"{rctx}: {key} item {item} has an unknown course or a bad term")
        for course in r.get("in_progress_results", {}):
            if course not in courses:
                err(f"{rctx}: in_progress_results: unknown course {course!r}")
        terms = list(r.get("summer_opt_in", [])) + list(r.get("semester_limits", {})) + list(r.get("semester_targets", {}))
        if r.get("graduate_by") is not None:
            terms.append(r["graduate_by"])
        for t in terms:
            if not _is_term(t):
                err(f"{rctx}: term {t!r} must look like YYYY-P")
    return errors


def load_university(root: str | Path) -> University:
    root = Path(root)
    uni = University(root=root)
    errors: list[str] = []
    for name in ("grading", "tuition"):
        path = root / "policy" / f"{name}.json"
        if path.is_file():
            uni.policy[name] = _read(path)
    for cur_dir in sorted((root / "curricula").iterdir()) if (root / "curricula").is_dir() else []:
        entry: dict[str, Any] = {"curriculum": _read(cur_dir / "curriculum.json")}
        for name in ("graduation", "popularity"):
            if (cur_dir / f"{name}.json").is_file():
                entry[name] = _read(cur_dir / f"{name}.json")
        cid = entry["curriculum"].get("id")
        if cid != cur_dir.name:
            errors.append(f"{cur_dir}: folder name differs from curriculum id {cid!r}")
        errors += validate_curriculum(entry["curriculum"], str(cur_dir / "curriculum.json"))
        if "graduation" in entry and entry["graduation"].get("curriculum_id") != cid:
            errors.append(f"{cur_dir}/graduation.json: curriculum_id differs from {cid!r}")
        uni.curricula[cid] = entry
    for path in sorted((root / "students").glob("*.json")):
        uni.students[path.stem] = _read(path)
        errors += validate_students(uni.students[path.stem], str(path), uni)
    for path in sorted((root / "requests").glob("*.json")):
        uni.requests[path.stem] = _read(path)
        errors += validate_requests(uni.requests[path.stem], str(path), uni)
    if errors:
        raise InstanceError(errors)
    return uni


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    try:
        uni = load_university(argv[0])
    except InstanceError as exc:
        print(f"{len(exc.messages)} problem(s):")
        print(exc)
        return 1
    for cid, entry in uni.curricula.items():
        cur = entry["curriculum"]
        print(f"{cid}: {len(cur['courses'])} courses, {len(cur['relations'])} relations, "
              f"{len(cur['groups'])} groups, {len(cur['majors'])} majors")
    for stem, doc in uni.students.items():
        print(f"students/{stem}: {len(doc['students'])} students, {len(doc['attempts'])} attempts")
    for stem, reqs in uni.requests.items():
        print(f"requests/{stem}: {len(reqs)} requests")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
