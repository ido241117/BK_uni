#!/usr/bin/env python3
"""Generate the ASP curriculum program from ``curriculum.json``.

The generated program is meant to be loaded together with ``encoding.lp``,
``extension.lp`` and the curriculum-independent ``plan.lp``.  It only contains
curriculum facts and curriculum-level constraints; student history, retake
decisions, semester load bounds, display rules and optimization stay outside
the JSON-derived file (see ``student.lp`` / ``example-student.lp`` / ``plan.lp``).

Usage
-----
    python solver.py
    python solver.py --curriculum path/to/curriculum.json --output cs-2023.lp
    python solver.py --semesters 10
    python solver.py --solve student.lp --t 3 --plans 3
    python solver.py --solve student.lp --t 2 --format markdown
    python solver.py --solve student.lp --t 2 --format json --report plan.json

By default the script reads ``pipeline/data/curriculum.json`` and writes
``pipeline/engine/asp/cs-2023.lp``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import clingo

ASP_DIR = Path(__file__).resolve().parent
DEFAULT_CURRICULUM = ASP_DIR.parents[1] / "data" / "curriculum.json"
DEFAULT_OUTPUT = ASP_DIR / "cs-2023.lp"

# Percentage of the total degree credits a student must have accumulated
# *before* the corresponding milestone course.
INTERNSHIP_PCT = 65
SPECIALIZED_PROJECT_PCT = 70
CAPSTONE_PCT = 85


def asp_name(value: str) -> str:
    """Turn an arbitrary identifier into a safe ASP constant."""
    name = re.sub(r"[^0-9a-zA-Z_]", "_", value.strip().lower())
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "item"
    if name[0].isdigit():
        name = f"c_{name}"
    return name


def _fact(predicate: str, *args: Any) -> str:
    return f"{predicate}({', '.join(str(arg) for arg in args)})."


def _percent_credits(total: int, percent: int) -> int:
    """Smallest integer credit count satisfying ``percent`` of ``total``."""
    return (total * percent + 99) // 100


def _tuple(items: Iterable[str]) -> str:
    return "(" + "; ".join(items) + ")"


def _chunks(items: list[str], size: int = 8) -> Iterable[list[str]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _emit_membership(
    lines: list[str],
    members: Iterable[str],
    group: str,
    predicate: str = "in",
) -> None:
    """Emit ``predicate((member; ...), group).`` in readable chunks."""
    ordered = sorted(set(members), key=str.lower)
    for chunk in _chunks(ordered, 8):
        lines.append(_fact(predicate, _tuple(chunk), group))


def _frequency_terms(course: dict[str, Any]) -> list[tuple[int, int]]:
    """Convert ``offered_terms`` to extension.lp ``freq(E,K,O)`` pairs.

    The curriculum uses three terms per year (1=fall, 2=spring, 3=summer).
    A term ``T`` is offered in every semester ``I`` with ``I mod 3 == T mod 3``.
    Courses offered in all three seasons need no fact at all: extension.lp
    already defaults every undeclared module to "offered every semester".
    """
    terms = course.get("offered_terms") or [1, 2, 3]
    residues = sorted({int(term) % 3 for term in terms})
    if residues == [0, 1, 2]:
        return []
    return [(3, residue) for residue in residues]


def _course_level(course_id: str) -> int | None:
    """Return the course level from the first digit in its code."""
    match = re.search(r"\d", course_id)
    return int(match.group(0)) if match else None


def _course_counts_implied(
    group: dict[str, Any],
    members: list[str],
    credits: dict[str, int],
    lower: int,
    upper: int,
) -> bool:
    """True when min/max_courses add nothing beyond the credit bounds."""
    if "min_courses" not in group and "max_courses" not in group:
        return True

    values = {credits[member] for member in members}
    if len(values) != 1:
        return False

    unit = next(iter(values))
    min_courses = group.get("min_courses")
    max_courses = group.get("max_courses")
    min_ok = min_courses is None or lower == int(min_courses) * unit
    max_ok = max_courses is None or upper == int(max_courses) * unit
    return min_ok and max_ok


def _group_upper_bound(
    group: dict[str, Any],
    members: list[str],
    credits: dict[str, int],
    mandatory: bool,
) -> int:
    if mandatory:
        return sum(credits.get(course, 0) for course in members)

    if "max_credits" in group:
        return int(group["max_credits"])

    if "max_courses" in group:
        best = sorted((credits.get(course, 0) for course in members), reverse=True)
        return sum(best[: int(group["max_courses"])])

    # No explicit upper quota: the whole pool is the theoretical maximum.
    return sum(credits.get(course, 0) for course in members)


def build_curriculum(
    curriculum: dict[str, Any],
) -> str:
    """Return the ASP program for ``curriculum`` as a string."""
    courses = {course["id"]: course for course in curriculum.get("courses", [])}
    credits = {cid: int(course.get("credits", 0)) for cid, course in courses.items()}
    course_atom = {cid: asp_name(cid) for cid in courses}
    total_credits = int(curriculum.get("total_credits", 0))

    group_rows: list[dict[str, Any]] = []
    for raw_group in curriculum.get("groups", []):
        members = [cid for cid in raw_group.get("course_ids", []) if cid in courses]
        if not members:
            continue
        group_id = asp_name(raw_group["id"])
        mandatory = raw_group.get("type", "").lower() == "mandatory"
        lower = int(raw_group.get("min_credits", sum(credits[c] for c in members)))
        if mandatory:
            lower = sum(credits[c] for c in members)
        upper = _group_upper_bound(raw_group, members, credits, mandatory)
        group_rows.append(
            {
                "atom": group_id,
                "members": members,
                "mandatory": mandatory,
                "lower": lower,
                "upper": upper,
                "min_courses": raw_group.get("min_courses"),
                "max_courses": raw_group.get("max_courses"),
                "counts_implied": _course_counts_implied(
                    raw_group, members, credits, lower, upper
                ),
            }
        )

    group_rows.sort(key=lambda row: row["atom"])

    lines: list[str] = []
    lines.append("% " + "=" * 69)
    lines.append("% cs-2023.lp : curriculum facts and constraints")
    lines.append("% Generated from curriculum.json by solver.py -- do not edit by hand.")
    lines.append("% Load together with encoding.lp and extension.lp.")
    lines.append("% " + "=" * 69)
    lines.append("")
    lines.append(f"% Total degree credit requirement: {total_credits}")
    lines.append("% Semester load bounds, completion test, display and optimization")
    lines.append("% are in plan.lp, which does not depend on this JSON file.")
    lines.append("")

    # ------------------------------------------------------------------
    # Groups and course membership
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course groups and membership (in/2)")
    lines.append("% " + "-" * 66)
    for row in group_rows:
        _emit_membership(
            lines,
            [course_atom[cid] for cid in row["members"]],
            row["atom"],
        )
    lines.append("")
    lines.append("% A module is any course that belongs to at least one group.")
    lines.append("in(E, m) :- group(G), in(E, G).")
    lines.append("")
    lines.append("% Groups are exactly the entities with lower and upper bounds.")
    lines.append("group(G) :- map(l, G, _), map(u, G, _), G != total_degree.")
    for row in group_rows:
        if not row["mandatory"]:
            lines.append(_fact("elective_group", row["atom"]))
    lines.append("")

    # ------------------------------------------------------------------
    # Credit values
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course credits (map/3 with key 'c')")
    lines.append("% " + "-" * 66)
    by_credit: dict[int, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        by_credit[credits[cid]].append(course_atom[cid])
    for value in sorted(by_credit):
        for chunk in _chunks(sorted(by_credit[value], key=str.lower), 8):
            lines.append(_fact("map", "c", _tuple(chunk), value))
    lines.append("")

    # ------------------------------------------------------------------
    # Course levels
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Course levels (first digit of the course code)")
    lines.append("% " + "-" * 66)
    by_level: dict[int, list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        level = _course_level(cid)
        if level is not None:
            by_level[level].append(course_atom[cid])
    for level in sorted(by_level):
        for chunk in _chunks(sorted(by_level[level], key=str.lower), 8):
            lines.append(_fact("course_level", _tuple(chunk), level))
    lines.append("")

    # ------------------------------------------------------------------
    # Prerequisites and co-requisites
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Prerequisites: prereq(B, A) means A is credited before B")
    lines.append("% " + "-" * 66)
    prerequisite_alt: list[tuple[str, str, str]] = []
    for cid in sorted(courses, key=str.lower):
        course = courses[cid]
        alt_index = 0
        for alternatives in course.get("prerequisites", []):
            alternatives = [item for item in alternatives if item in courses]
            if not alternatives:
                continue
            if len(alternatives) == 1:
                lines.append(_fact("prereq", asp_name(cid), asp_name(alternatives[0])))
            else:
                alt_index += 1
                group_atom = f"pre_{asp_name(cid)}_{alt_index}"
                lines.append(_fact("prereq_group", asp_name(cid), group_atom))
                for option in alternatives:
                    prerequisite_alt.append((asp_name(cid), group_atom, asp_name(option)))
    if prerequisite_alt:
        lines.append("")
        lines.append("% One alternative from each prerequisite OR-group is enough.")
        for cid, group_atom, option in prerequisite_alt:
            lines.append(_fact("prereq_option", cid, group_atom, option))
        lines.append(
            ":- in(X, s(J)), base(X, C), J > t, prereq_group(C, G),\n"
            "   #count{ A : prereq_option(C, G, A), precred(A, J) } < 1."
        )
    lines.append("")

    lines.append("% " + "-" * 66)
    lines.append("% Co-requisites: co/2 must be credited in the same or an earlier term")
    lines.append("% " + "-" * 66)
    corequisite_alt: list[tuple[str, str, str]] = []
    for cid in sorted(courses, key=str.lower):
        course = courses[cid]
        alt_index = 0
        for alternatives in course.get("corequisites", []):
            alternatives = [item for item in alternatives if item in courses]
            if not alternatives:
                continue
            if len(alternatives) == 1:
                lines.append(_fact("coreq", asp_name(cid), asp_name(alternatives[0])))
            else:
                alt_index += 1
                group_atom = f"co_{asp_name(cid)}_{alt_index}"
                lines.append(_fact("coreq_group", asp_name(cid), group_atom))
                for option in alternatives:
                    corequisite_alt.append((asp_name(cid), group_atom, asp_name(option)))
    if corequisite_alt:
        lines.append("")
        lines.append("% One alternative from each co-requisite OR-group is enough.")
        for cid, group_atom, option in corequisite_alt:
            lines.append(_fact("coreq_option", cid, group_atom, option))
        lines.append("coreq_met(C, G, J) :- coreq_option(C, G, A), in(A, ok(J)).")
        lines.append("coreq_met(C, G, J) :- coreq_option(C, G, A), precred(A, J).")
        lines.append(
            ":- coreq_group(C, G), in(X, s(J)), base(X, C), J > t,\n"
            "   not coreq_met(C, G, J)."
        )
    lines.append("")
    lines.append(
        ":- coreq(C, A), in(X, s(J)), base(X, C), J > t,\n"
        "   not in(A, ok(J)), not precred(A, J)."
    )
    lines.append("")

    # ------------------------------------------------------------------
    # Offering frequency
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Offering frequency: freq(E,K,O) = every I with (I+shift) mod K = O")
    lines.append("% " + "-" * 66)
    frequency_courses: dict[tuple[int, int], list[str]] = defaultdict(list)
    for cid in sorted(courses, key=str.lower):
        for pair in _frequency_terms(courses[cid]):
            frequency_courses[pair].append(asp_name(cid))
    for (period, offset), members in sorted(frequency_courses.items()):
        for chunk in _chunks(members, 8):
            lines.append(_fact("freq", _tuple(chunk), period, offset))
    lines.append("")

    # ------------------------------------------------------------------
    # Group bounds
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Group credit bounds: map(l, Group, Lower) and map(u, Group, Upper)")
    lines.append("% " + "-" * 66)
    for row in group_rows:
        lines.append(f"map(l, {row['atom']}, {row['lower']}).")
        lines.append(f"map(u, {row['atom']}, {row['upper']}).")
        if not row["counts_implied"]:
            if row["min_courses"] is not None:
                lines.append(_fact("map", "min_courses", row["atom"], int(row["min_courses"])))
            if row["max_courses"] is not None:
                lines.append(_fact("map", "max_courses", row["atom"], int(row["max_courses"])))
    lines.append("")
    lines.append("% Total degree requirement")
    lines.append(_fact("map", "l", "total_degree", total_credits))
    lines.append(_fact("map", "u", "total_degree", total_credits))
    lines.append("")

    # ------------------------------------------------------------------
    # Credit accounting
    # ------------------------------------------------------------------
    lines.append("% " + "-" * 66)
    lines.append("% Credit accounting")
    lines.append("% " + "-" * 66)
    compulsory_groups = [row["atom"] for row in group_rows if row["mandatory"]]
    elective_groups = [row["atom"] for row in group_rows if not row["mandatory"]]

    if compulsory_groups:
        lines.append("% extension.lp uses comp to force retakes of failed compulsory courses.")
        lines.append("in(E, comp) :- group(G), in(E, G), not elective_group(G).")
        lines.append("subseteq(comp, ok).")
        lines.append("")
        for atom in compulsory_groups:
            lines.append(f"in(E, credit({atom})) :- in(E, {atom}), in(E, ok).")
        lines.append("")

    if elective_groups:
        lines.append("% A credited elective may count towards at most one quota bucket.")
        lines.append("% Extra passed electives are left uncounted instead of violating")
        lines.append("% a group upper bound.")
        lines.append("candidate(E, B) :- elective_group(B), in(E, B).")
        lines.append(
            "{ counted(E, B) : candidate(E, B) } <= 1 "
            ":- candidate(E, _), in(E, ok)."
        )
        for atom in elective_groups:
            lines.append(
                f"in(E, credit({atom})) :- counted(E, {atom}), in(E, ok)."
            )
        lines.append("")

    lines.append(
        "in(E, credit(total_degree)) :- group(G), in(E, credit(G))."
    )
    lines.append("% Only courses that count towards a requirement group are scheduled.")
    lines.append("counted_course(E) :- group(G), in(E, credit(G)).")
    lines.append(
        ":- in(E, s(I)), I > t, in(E, m), not counted_course(E)."
    )
    lines.append(
        "sum(credit(G), c, bw, (L, U)) :- group(G), map(l, G, L), map(u, G, U)."
    )
    lines.append(
        "sum(credit(total_degree), c, bw, (L, U)) "
        ":- map(l, total_degree, L), map(u, total_degree, U)."
    )
    if any(row["min_courses"] is not None and not row["counts_implied"] for row in group_rows):
        lines.append(
            ":- map(min_courses, G, M), #count{ E : in(E, credit(G)) } < M."
        )
    if any(row["max_courses"] is not None and not row["counts_implied"] for row in group_rows):
        lines.append("card(credit(G), leq, M) :- map(max_courses, G, M).")
    lines.append("")

    # ------------------------------------------------------------------
    # Milestone credit thresholds
    # ------------------------------------------------------------------
    internship_min = _percent_credits(total_credits, INTERNSHIP_PCT)
    project_min = _percent_credits(total_credits, SPECIALIZED_PROJECT_PCT)
    capstone_min = _percent_credits(total_credits, CAPSTONE_PCT)

    lines.append("% " + "-" * 66)
    lines.append("% Milestone thresholds (credits accumulated before the course)")
    lines.append(f"% Internship        : {INTERNSHIP_PCT}% of {total_credits} -> {internship_min}")
    lines.append(f"% Specialized project: {SPECIALIZED_PROJECT_PCT}% of {total_credits} -> {project_min}")
    lines.append(f"% Capstone          : {CAPSTONE_PCT}% of {total_credits} -> {capstone_min}")
    lines.append("% " + "-" * 66)
    def threshold_rule(course_atom: str, minimum: int) -> str:
        return (
            f":- in(X, s(J)), base(X, {course_atom}), J > t,\n"
            f"   #sum{{ C, E : in(E, ok(I)), map(c, E, C), I < J }} < {minimum}."
        )

    lines.append(threshold_rule("co3335", internship_min))
    lines.append(threshold_rule("co4029", project_min))
    lines.append(threshold_rule("co4337", capstone_min))
    lines.append("")
    lines.append("% Capstone additionally requires ENG_GC to be passed beforehand.")
    lines.append("prereq(co4337, eng_gc).")
    lines.append("")
    lines.append("% Curriculum-derived file ends here; see plan.lp for the")
    lines.append("% curriculum-independent load bounds, display and optimization.")
    lines.append("")

    return "\n".join(lines)


_RETAKE_RE = re.compile(r"^rt\(([^,]+),(\d+)\)$")
_REPORT_EXTENSIONS = {
    "text": "txt",
    "markdown": "md",
    "json": "json",
    "raw": "txt",
}


@dataclass
class Solution:
    """One clingo answer set plus its optimization cost."""

    symbols: list[clingo.Symbol]
    cost: list[int]
    status: str = "SATISFIABLE"


def _split_course_atom(atom: str) -> tuple[str, int | None]:
    """Return the base course atom and optional retake number."""
    match = _RETAKE_RE.match(atom)
    if match:
        return match.group(1), int(match.group(2))
    return atom, None


def _course_display(
    atom: str,
    catalog: dict[str, dict[str, Any]],
) -> tuple[str, str, int, int | None]:
    """Map an ASP course atom to ``(code, name, credits, retake)``."""
    base, retake = _split_course_atom(atom)
    course = catalog.get(base)
    if course is None:
        return base.upper(), "(unknown course)", 0, retake
    return (
        str(course.get("id", base)),
        str(course.get("name", "")),
        int(course.get("credits", 0)),
        retake,
    )


def _model_to_plan(
    symbols: list[clingo.Symbol],
    curriculum: dict[str, Any],
) -> dict[str, Any]:
    """Turn one answer set into a semester-oriented plan dictionary."""
    catalog = {
        asp_name(course["id"]): course
        for course in curriculum.get("courses", [])
    }
    plan_by_semester: dict[int, list[dict[str, Any]]] = defaultdict(list)
    semester_credits: dict[int, int] = {}
    total_planned: int | None = None
    total_credit: int | None = None
    total_degree = int(curriculum.get("total_credits", 0))
    degree_complete = False
    gpa: int | None = None
    must: list[str] = []
    must_atoms: set[str] = set()
    retake_semesters: list[tuple[str, int]] = []

    for symbol in symbols:
        name = getattr(symbol, "name", "")
        arguments = getattr(symbol, "arguments", ())
        if name == "plan" and len(arguments) >= 2:
            code, title, credits, retake = _course_display(
                str(arguments[0]), catalog
            )
            semester = int(str(arguments[1]))
            plan_by_semester[semester].append(
                {
                    "code": code,
                    "name": title,
                    "credits": credits,
                    "retake": retake,
                }
            )
            if retake is not None:
                retake_semesters.append((code, semester))
        elif name == "semester_credits" and len(arguments) >= 2:
            semester_credits[int(str(arguments[0]))] = int(str(arguments[1]))
        elif name == "total_planned" and arguments:
            total_planned = int(str(arguments[0]))
        elif name == "total_credit" and arguments:
            total_credit = int(str(arguments[0]))
        elif name == "degree_complete":
            degree_complete = True
        elif name == "gpa" and arguments:
            gpa = int(str(arguments[0]))
        elif name == "must" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            must.append(code)
            must_atoms.add(code)

    for courses in plan_by_semester.values():
        courses.sort(key=lambda course: course["code"])

    future_semesters = set(plan_by_semester)
    history = [
        {"semester": semester, "credits": credits}
        for semester, credits in sorted(semester_credits.items())
        if semester not in future_semesters
    ]

    cumulative = sum(item["credits"] for item in history)
    semesters: list[dict[str, Any]] = []
    for semester in sorted(plan_by_semester):
        courses = plan_by_semester[semester]
        credits = semester_credits.get(
            semester, sum(course["credits"] for course in courses)
        )
        cumulative += credits
        semesters.append(
            {
                "semester": semester,
                "credits": credits,
                "cumulative": cumulative,
                "courses": courses,
            }
        )

    if total_planned is None:
        total_planned = sum(item["credits"] for item in semesters)
    if total_credit is None:
        total_credit = cumulative

    max_used = semesters[-1]["semester"] if semesters else 0
    retake_recovery = sum(
        semester
        for code, semester in retake_semesters
        if code in must_atoms
    )
    lower_sum = sum(
        semester["semester"]
        for semester in semesters
        for course in semester["courses"]
        if (_course_level(course["code"]) or 99) <= 2
    )
    maxload = max(
        (semester["credits"] for semester in semesters), default=0
    )

    return {
        "history": history,
        "semesters": semesters,
        "total_planned": total_planned,
        "total_credit": total_credit,
        "total_degree": total_degree,
        "degree_complete": degree_complete,
        "gpa": gpa,
        "must": sorted(must),
        "_sort_key": (max_used, retake_recovery, lower_sum, maxload),
    }


def _credit_label(credits: int) -> str:
    return f"{credits} credit" if credits == 1 else f"{credits} credits"


def _truncate(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    return text[: max(0, width - 3)] + "..."


def _format_plan_text(plan: dict[str, Any], index: int, total: int) -> str:
    lines = [f"PLAN {index} / {total}", "=" * 66]

    if plan["history"]:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan["history"]
        )
        lines.append("History: " + history)
        lines.append("")

    if not plan["semesters"]:
        lines.append("(no future courses)")
        lines.append("")

    for semester in plan["semesters"]:
        lines.append(
            f"Semester {semester['semester']}  "
            f"({_credit_label(semester['credits'])}, "
            f"cumulative {semester['cumulative']})"
        )
        lines.append(
            f"  {'Code':<8}  {'Course name':<48}  {'Credits':>7}"
        )
        lines.append(
            f"  {'-' * 8}  {'-' * 48}  {'-' * 7}"
        )
        for course in semester["courses"]:
            title = course["name"]
            if course["retake"] is not None:
                title += f" (retake {course['retake']})"
            lines.append(
                f"  {course['code']:<8}  "
                f"{_truncate(title, 48):<48}  "
                f"{course['credits']:>7}"
            )
        lines.append("")

    lines.append("-" * 66)
    lines.append(f"Planned credits : {plan['total_planned']}")
    lines.append(
        f"Total credits   : {plan['total_credit']} / {plan['total_degree']}"
    )
    status = "COMPLETE" if plan["degree_complete"] else "INCOMPLETE"
    lines.append(f"Status          : {status}")
    if plan["gpa"] is not None:
        lines.append(f"GPA             : {plan['gpa'] / 10:.1f}")
    if plan["must"]:
        lines.append("Retakes needed  : " + ", ".join(plan["must"]))
    return "\n".join(lines)


def _format_plan_markdown(plan: dict[str, Any], index: int, total: int) -> str:
    lines = [f"## Plan {index} / {total}", ""]

    if plan["history"]:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan["history"]
        )
        lines.append(f"**History:** {history}")
        lines.append("")

    for semester in plan["semesters"]:
        lines.append(
            f"### Semester {semester['semester']} - "
            f"{_credit_label(semester['credits'])} "
            f"(cumulative {semester['cumulative']})"
        )
        lines.append("")
        lines.append("| Code | Course | Credits |")
        lines.append("| --- | --- | ---: |")
        for course in semester["courses"]:
            title = course["name"]
            if course["retake"] is not None:
                title += f" (retake {course['retake']})"
            title = title.replace("|", "\\|")
            lines.append(
                f"| {course['code']} | {title} | {course['credits']} |"
            )
        lines.append("")

    status = "COMPLETE" if plan["degree_complete"] else "INCOMPLETE"
    lines.append(f"- **Planned credits:** {plan['total_planned']}")
    lines.append(
        f"- **Total credits:** {plan['total_credit']} / {plan['total_degree']}"
    )
    lines.append(f"- **Status:** {status}")
    if plan["gpa"] is not None:
        lines.append(f"- **GPA:** {plan['gpa'] / 10:.1f}")
    if plan["must"]:
        lines.append("- **Retakes needed:** " + ", ".join(plan["must"]))
    return "\n".join(lines)


def _format_solution_raw(solution: Solution, index: int, total: int) -> str:
    atoms = " ".join(str(symbol) for symbol in solution.symbols)
    return f"% plan {index} / {total}\n{atoms}"


def _render_solutions(
    solutions: list[Solution],
    curriculum: dict[str, Any],
    output_format: str,
) -> str:
    satisfiable = [
        solution for solution in solutions if solution.status == "SATISFIABLE"
    ]
    if not satisfiable:
        return solutions[0].status if solutions else "UNSATISFIABLE"

    plans = [
        _model_to_plan(solution.symbols, curriculum)
        for solution in satisfiable
    ]
    plans.sort(key=lambda plan: plan["_sort_key"])
    total = len(plans)

    if output_format == "json":
        json_plans = [
            {key: value for key, value in plan.items() if key != "_sort_key"}
            for plan in plans
        ]
        return json.dumps(json_plans, ensure_ascii=False, indent=2)
    if output_format == "raw":
        return "\n\n".join(
            _format_solution_raw(solution, index, total)
            for index, solution in enumerate(satisfiable, start=1)
        )
    if output_format == "markdown":
        return "\n\n".join(
            _format_plan_markdown(plan, index, total)
            for index, plan in enumerate(plans, start=1)
        )
    return "\n\n".join(
        _format_plan_text(plan, index, total)
        for index, plan in enumerate(plans, start=1)
    )


def solve(
    curriculum_path: Path,
    student_path: Path,
    semesters: int | None = None,
    studied_terms: int | None = None,
    plans: int = 3,
) -> list[Solution]:
    """Run clingo on encoding.lp + extension.lp + curriculum + student."""
    arguments = [f"--models={plans}", "--warn=none"]
    if semesters is not None:
        arguments.append(f"-c n={semesters}")
    if studied_terms is not None:
        arguments.append(f"-c t={studied_terms}")

    control = clingo.Control(arguments)
    # Pass source text instead of file paths: clingo's native loader can fail
    # on Windows paths containing non-ASCII characters.
    for path in (
        ASP_DIR / "encoding.lp",
        ASP_DIR / "extension.lp",
        curriculum_path,
        student_path,
        ASP_DIR / "plan.lp",
    ):
        control.add("base", [], Path(path).read_text(encoding="utf-8"))

    control.ground([("base", [])])
    models: list[Solution] = []

    def on_model(model: clingo.Model) -> None:
        models.append(
            Solution(
                symbols=list(model.symbols(shown=True)),
                cost=list(model.cost),
            )
        )

    result = control.solve(on_model=on_model)
    if not result.satisfiable:
        status = "UNKNOWN" if result.unknown else "UNSATISFIABLE"
        models = [Solution(symbols=[], cost=[], status=status)]
    return models


def main(argv: list[str] | None = None) -> int:
    # The workspace path may contain non-ASCII characters.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--curriculum",
        type=Path,
        default=DEFAULT_CURRICULUM,
        help="path to the structured curriculum.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="where to write the generated ASP curriculum",
    )
    parser.add_argument(
        "--semesters",
        type=int,
        default=8,
        help="planning horizon passed to clingo as -c n=... (default: 8, "
        "the nominal curriculum length; raise it for part-time plans)",
    )
    parser.add_argument(
        "--solve",
        type=Path,
        metavar="STUDENT_LP",
        help="optional student input file; run clingo after writing the program",
    )
    parser.add_argument(
        "--t",
        type=int,
        default=None,
        help="number of semesters already studied (passed to clingo as -c t=...)",
    )
    parser.add_argument(
        "--plans",
        type=int,
        default=3,
        help="maximum number of plans/models to print (default: 3; 0 = all)",
    )
    parser.add_argument(
        "--format",
        choices=("text", "markdown", "json", "raw"),
        default="text",
        help="plan output format (default: text)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="report path; default is <student>-plan.<ext> next to the student file",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="print to the console only; do not write a report file",
    )

    args = parser.parse_args(argv)
    with args.curriculum.open(encoding="utf-8") as handle:
        curriculum = json.load(handle)

    program = build_curriculum(curriculum)
    args.output.write_text(program, encoding="utf-8")
    print(f"wrote {args.output}")

    if args.solve:
        solutions = solve(
            args.output,
            args.solve,
            semesters=args.semesters,
            studied_terms=args.t,
            plans=args.plans,
        )
        rendered = _render_solutions(solutions, curriculum, args.format)
        print(rendered)

        if not args.no_report:
            extension = _REPORT_EXTENSIONS[args.format]
            report_path = args.report
            if report_path is None:
                report_path = args.solve.with_name(
                    f"{args.solve.stem}-plan.{extension}"
                )
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(rendered + "\n", encoding="utf-8")
            print(f"wrote {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
