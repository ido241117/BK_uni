"""Adapter: planner input -> ASP engine (``planner/solvers/asp/core``) -> common result.

The ASP engine reads the same planner input as CP-SAT (``planner.model.input``) and is held to
the same rules (docs/PLANNER-PARITY.md): load bounds, summer rules, graduation thresholds and
goals all come from the input and from ``planner.model.facts``, not from the engine files.
The engine does not know JSON; the adapter holds no rules, it only translates.

    from planner.solvers.asp.adapter import solve_asp
    result = solve_asp(fixture, scenario, previous_plan=None, time_limit=30.0)

Same signature and result shape as ``solve_cpsat`` (``result.make_result``), plus
``engine_report`` (GPA, majors, external requirements, tuition, tags, objective).

Clingo program, in load order:
    core/encoding.lp  core/extension.lp  <policy facts>  <adapter facts>
    core/translate.lp  core/optimize.lp
The policy facts are compiled from ``fixture["policy"]`` by ``planner/solvers/asp/policy.py``.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import clingo

from planner.model.facts import (
    FixtureError,
    preferences,
    preferred_load,
    summer_courses,
    summer_preferred_load,
    summer_specialized,
    base_credit_limits,
    check_capabilities,
    course_level,
    credit_limits,
    goals_note,
    graduation_needs,
    is_summer,
    level_enabled,
    offered_pairs,
    offered_terms,
    offering_soft,
    pinned,
    plan_semesters,
    preference_order,
    required_year,
    semester_year,
    summer_allowed,
    validate_input,
    year_thresholds,
)
from planner.model.normalize import normalize
from planner.model.result import make_result
from planner.solvers.asp.policy import applies, compile_policy, grade_atom

ASP_DIR = Path(__file__).resolve().parent
PIPELINE = ASP_DIR.parents[2]
SOURCES_BEFORE = (ASP_DIR / "core" / "encoding.lp", ASP_DIR / "core" / "extension.lp")
SOURCES_AFTER = (ASP_DIR / "core" / "translate.lp", ASP_DIR / "core" / "optimize.lp")
TAGS_FILE = PIPELINE / "instances" / "hcmut" / "course-tags.json"
ALIASES_FILE = PIPELINE / "instances" / "importers" / "hcmut" / "mybk-code-aliases.json"
# Clingo threads (configuration portfolio). Measured 20/11/2026 on real data (KHMT, 21 terms):
# 1 thread hit 30 s without proving optimality and found worse plans; 4 threads found the best
# plan within 30 s in all 3 runs and proved optimality in 1 of 3. planner/solvers/asp/ADAPTER.md §8.
THREADS = 4

# What this solver implements (docs/PLANNER-PARITY.md). Not implemented: offered,
# assumed_fail, frozen_semesters, semester_targets with its goal ST (CP-SAT only, decision of
# 2026-11-28) and rules.pins_absolute (web only).
CAPABILITIES = {
    "fields": frozenset({"locked", "not_offered", "graduate_by", "max_credits", "semester_limits",
                         "summer_opt_in", "skip_semesters", "interests"}),
    "goals": frozenset({"S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "OH",
                        "RT", "FEE", "LO", "TA"}),
}

SEMESTER = re.compile(r"^(\d\d)([123])$")


# --- Helpers ------------------------------------------------------------------

def _q(value: str) -> str:
    """Quoted ASP string (course codes are kept as they are and read back from the result)."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _load_json(path: Path, default: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _parse_score(value: Any) -> int | None:
    """10-point score as a string ("7.5", "7,5") or number -> integer x100; unreadable -> None."""
    if value is None:
        return None
    try:
        score = float(str(value).strip().replace(",", "."))
    except ValueError:
        return None
    return round(score * 100) if 0 <= score <= 10 else None


class Calendar:
    """Semester code YYS -> engine term index; term 1 is the first code of ``semesters``.

    The engine numbers terms continuously (1, 2, summer, 1, 2, summer...), so the index is
    computed from the code, not from the position in the list (a fixture may omit summers).
    """

    def __init__(self, semesters: list[str]):
        bad = [s for s in semesters if not SEMESTER.match(s)]
        if bad:
            raise FixtureError(f"the ASP engine needs YYS semester codes (e.g. 251, 253), got {bad[:3]}")
        first = SEMESTER.match(semesters[0])
        self.year0, self.part0 = int(first.group(1)), int(first.group(2))

    @property
    def enroll_part(self) -> int:
        return self.part0

    def index(self, code: str) -> int:
        m = SEMESTER.match(code)
        if not m:
            raise FixtureError(f"bad semester code: {code}")
        return (int(m.group(1)) - self.year0) * 3 + (int(m.group(2)) - self.part0) + 1

    def code(self, index: int) -> str:
        k = (index - 1) + (self.part0 - 1)
        return f"{self.year0 + k // 3:02d}{k % 3 + 1}"


def active_goals(fixture: dict[str, Any], scenario: dict[str, Any]) -> list[tuple[str, int]]:
    """[(goal id, priority)] of the active goals this engine implements, highest priority first."""
    order = [g for g in preference_order(fixture, scenario) if g in CAPABILITIES["goals"]]
    return [(g, len(order) - k) for k, g in enumerate(order)]


# --- Facts ----------------------------------------------------------------------

def build_program(fixture: dict[str, Any], scenario: dict[str, Any],
                  previous_plan: dict[str, str] | None = None) -> tuple[str, dict[str, Any]]:
    """NORMALIZED fixture + scenario -> (facts, context for reading the result).

    Pure function, no Clingo call: testable on its own.
    """
    cal = Calendar(fixture["semesters"])
    plan = plan_semesters(fixture)
    current = fixture["student"]["current_semester"]
    t = cal.index(current)
    deadline = scenario.get("graduate_by")
    n = cal.index(deadline) if deadline else (cal.index(plan[-1]) if plan else t)
    future = range(t + 1, n + 1)
    plan_index = {code: cal.index(code) for code in plan if cal.index(code) <= n}
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    cur = fixture["curriculum"]
    goals = active_goals(fixture, scenario)
    goal_ids = {g for g, _ in goals}
    policy_text, warnings = compile_policy(fixture.get("policy"), cur.get("program"), cur.get("cohort"))
    out: list[str] = [policy_text.rstrip(), f"enroll_part_in({cal.enroll_part})."]
    out += [f"goal({g.lower()}, {p})." for g, p in goals]

    # Terms in t+1..n the fixture does not list (e.g. a calendar without summers).
    plannable = set(plan_index.values())
    out.extend(f"empty(s({i}))." for i in future if i not in plannable)

    # -- Curriculum: groups, credits, relations ------------------------------------
    members: set[str] = set()
    lower_total = 0
    for k, group in enumerate(fixture["course_groups"], start=1):
        gid = f"g{k}"
        codes = sorted(group["members"])
        members.update(codes)
        out.extend(f"in({_q(c)}, {gid})." for c in codes)
        member_credits = sum(credits[c] for c in codes)
        if group["kind"] == "required":
            lo, hi = member_credits, member_credits
        else:
            out.append(f"elective_group({gid}).")
            lo, hi = group["required_credits"] or 0, member_credits
            if group["required_count"] is not None:
                out.append(f"map(min_courses, {gid}, {group['required_count']}).")
        out.append(f"map(l, {gid}, {lo}). map(u, {gid}, {hi}).  % {group['name']}")
        lower_total += lo
    out.extend(f"map(c, {_q(c)}, {credits[c]})." for c in sorted(members))
    out.append(f"map(l, total_degree, {lower_total}). "
               f"map(u, total_degree, {sum(credits[c] for c in members)}).")

    for rel in fixture["course_relations"]:
        course, related = rel["course_code"], rel["related_course_code"]
        if course not in members:
            continue
        if rel["type"] == "prerequisite":
            out.append(f"prereq({_q(course)}, {_q(related)}).")
        elif rel["type"] == "corequisite":
            out.append(f"coreq({_q(course)}, {_q(related)}).")
        elif rel["type"] == "recommended":  # soft prerequisite, goal S6 (D1)
            out.append(f"recommended({_q(course)}, {_q(related)}).")
        # "prior" never arrives here: normalize() turns it into "prerequisite" (28/11).

    for code in sorted(members):
        level = course_level(code)
        if level is not None:
            out.append(f"course_level({_q(code)}, {level}).")

    # Course level (QD 285 art. 15.4): level L only from year required_year(L). The year is the
    # cohort year, or with rules.year_by_credits the year reached by accumulated credits (Q6),
    # as in CP-SAT. Credits outside the program (counted as free electives) are not in the
    # engine, so they are subtracted from the threshold.
    outside = fixture.get("_free_outside_credits", 0)
    if level_enabled(fixture):
        thresholds = year_thresholds(fixture)
        cohort = cur["cohort"]
        for code in sorted(members):
            level = course_level(code)
            if level is None:
                continue
            need = required_year(level)
            if thresholds:
                if need >= 2:
                    floor = thresholds[min(need - 2, len(thresholds) - 1)]
                    out.append(f"level_need({_q(code)}, {max(0, floor - outside)}).")
                continue
            for i in future:
                if semester_year(cal.code(i), cohort) < need:
                    out.append(f"ban({_q(code)}, {i}).")

    # Graduation courses (QD 285 art. 15.5): credits through the course's own term, the course
    # excluded (D4, as CP-SAT and the validator).
    for code, need in sorted(graduation_needs(fixture).items()):
        if code in members:
            out.append(f"milestone({_q(code)}, {max(0, need - outside)}).")

    # Offering history (goal OH, D10): placements in a term part where the course has not run.
    if "OH" in goal_ids and offering_soft(fixture):
        pins = pinned(scenario)
        reported = offered_pairs(scenario)
        for code in sorted(members):
            parts = offered_terms(fixture, code)
            if parts is None:
                continue
            for sem, i in sorted(plan_index.items()):
                if sem[-1] not in parts and pins.get(code) != sem and (code, sem) not in reported:
                    out.append(f"oh_pair({_q(code)}, {i}).")

    # Specializations -> major (count of courses, required_count of the child group).
    target = fixture["student"].get("target_specialization")
    for spec in fixture.get("_specializations", []):
        major = _q(spec["code"])
        out.append(f"major({major}).")
        out.extend(f"major_course({major}, {_q(c)})." for c in sorted(spec["members"]) if c in members)
        if spec["required_count"] is not None:
            out.append(f"major_min({major}, {spec['required_count']}).")
            if spec["code"] == target:
                out.append(f"student_major({major}).")

    # Tags (instances/hcmut/course-tags.json, written by pipeline/tag_classifier): the list of the
    # student's program family (all cohorts of the program), else the merged list of every family.
    tag_file = _load_json(TAGS_FILE, {})
    family = (tag_file.get("families") or {}).get(cur.get("code"))
    tags = (tag_file.get("by_family") or {}).get(family) if family else None
    if tags is None:
        tags = tag_file.get("tags") or {}
    course_tags: dict[str, list[str]] = {}
    for tag, codes in sorted(tags.items()):
        for code in codes:
            if code in members:
                out.append(f"tag({_q(code)}, {_q(tag)}).")
                course_tags.setdefault(code, []).append(tag)

    # -- Loads (D2, D3): the same numbers as CP-SAT, from the input -------------------
    base_min, base_max = base_credit_limits(fixture)
    limits = credit_limits(fixture, scenario)
    summer_max = max((hi for sem, (lo, hi) in limits.items() if is_summer(sem)), default=0)
    out.append(f"load_bound(regular, 0, {base_max}). load_bound(summer, 0, {max(summer_max, 0)}).")
    for sem, i in sorted(plan_index.items(), key=lambda kv: kv[1]):
        lo, hi = limits[sem]
        out.append(f"sem_max({i}, {hi}).")
        if lo > 0:
            out.append(f"sem_min({i}, {lo}).")
        if is_summer(sem):
            out.append(f"summer_plan({i}).")
        else:
            out.append(f"soft_min({i}, {base_min}). regular_plan({i}).")

    # -- Goal inputs (same definitions as CP-SAT, planner/solvers/cpsat.py) -----------
    band = preferred_load(fixture, scenario)
    if band:
        out.append(f"pref_band({band[0]}, {band[1]}).")  # S8
    s_lo, s_hi = summer_preferred_load(fixture)
    out.append(f"summer_band({s_lo}, {s_hi}).")  # S7
    out.extend(f"internship({_q(c)})." for c in sorted(summer_courses(fixture) & members))
    out.extend(f"summer_heavy({_q(c)})." for c in sorted(members) if summer_specialized(fixture, c))  # S9
    passed_now = {sc["course_code"] for sc in fixture["student"]["student_courses"]
                  if sc["status"] == "completed"
                  or (sc["status"] == "in-progress" and scenario["in_progress_results"].get(sc["course_code"]) == "pass")}
    out.extend(f"wanted({_q(c)})." for c in preferences(scenario)["wanted_courses"]
               if c in members and c not in passed_now)  # S4
    out.extend(f"prev({_q(c)}, {plan_index[sem]})." for c, sem in sorted((previous_plan or {}).items())
               if sem in plan_index)  # S3

    # -- Summer (H14, D5): who may study in which summer, per term and course --------
    for sem, i in sorted(plan_index.items(), key=lambda kv: kv[1]):
        if is_summer(sem):
            out.extend(f"closed({_q(c)}, {i})." for c in sorted(members)
                       if not summer_allowed(fixture, scenario, c, sem))

    # -- Student ---------------------------------------------------------------------
    results = scenario.get("in_progress_results", {})
    if fixture["student"].get("attempts"):
        _attempt_facts(fixture, members, cal, t, results, out, warnings)
    else:
        _status_facts(fixture, members, t, results, out, warnings)

    # -- External requirements (policy/external.json, conditions, progress) -----------
    _external_facts(fixture, cal, t, out, warnings)

    # -- Request ---------------------------------------------------------------------
    def future_index(code: str, where: str) -> int:
        if code not in plan_index:
            raise FixtureError(f"{where}: term {code} is not a term to plan")
        return plan_index[code]

    for item in scenario.get("locked", []):
        out.append(f"pin({_q(item['course_code'])}, {future_index(item['semester_code'], 'scenario.locked')}).")
    blocked = [r for r in fixture["offerings"]["records"] if r["status"] == "not-offered"]
    blocked += scenario.get("not_offered", [])
    for rec in blocked:
        if rec["semester_code"] in plan_index:
            out.append(f"closed({_q(rec['course_code'])}, {plan_index[rec['semester_code']]}).")
    for sem in scenario.get("skip_semesters") or []:
        out.append(f"skip({future_index(sem, 'scenario.skip_semesters')}).")

    # Interests: tag names the student picked. Weight 1 each; goal TA maximises the summed
    # weights of the planned electives' tags.
    interests = scenario.get("interests") or []
    if not isinstance(interests, list) or not all(isinstance(x, str) and x for x in interests):
        raise FixtureError("scenario.interests: expected a list of tag names")
    interests = sorted(set(interests))
    tagged = {tag for course_tag_list in course_tags.values() for tag in course_tag_list}
    for tag in interests:
        out.append(f"interest({_q(tag)}, 1).")
        if tag not in tagged:
            warnings.append(f'Interest "{tag}" has no course in your program, so it does not change the plan.')

    context = {
        "calendar": cal, "t": t, "n": n, "plan": plan, "plan_index": plan_index,
        "allow_summer": any(is_summer(s) for s in plan_index), "course_tags": course_tags,
        "interests": interests, "warnings": warnings, "goals": goals,
    }
    return "\n".join(out) + "\n", context


def _attempt_facts(fixture: dict[str, Any], members: set[str], cal: Calendar, t: int,
                   results: dict[str, str], out: list[str], warnings: list[str]) -> None:
    """History from the full record (``student.attempts``, D8): one engine attempt per recorded attempt.

    The first attempt of course E is ``E``, the k-th retake ``rt(E, k)``. A grade becomes
    ``map(g, X, Grade)`` (the policy decides pass, credit and GPA); without a grade the
    recorded result is used. An attempt without a term is put in the current term.
    """
    graded = bool((fixture.get("policy") or {}).get("grading"))
    by_course: dict[str, list[tuple[int, dict[str, Any]]]] = {}
    skipped_outside, skipped_late = set(), set()
    for k, a in enumerate(fixture["student"]["attempts"]):
        code = a["course_code"]
        if code not in members:
            skipped_outside.add(code)
            continue
        i = cal.index(a["semester_code"]) if a.get("semester_code") else t
        if i > t:
            skipped_late.add(code)
            continue
        by_course.setdefault(code, []).append((max(1, i), a))
    for code, rows in sorted(by_course.items()):
        rows.sort(key=lambda r: r[0])
        objects = [_q(code)] + [f"rt({_q(code)}, {k})" for k in range(1, len(rows))]
        last_graded = None
        for obj, (i, a) in zip(objects, rows):
            out.append(f"taken({obj}, {i}).")
            kind = a.get("course_kind") or "regular"
            if kind != "regular":
                out.append(f"course_kind({obj}, {kind}). kind_known({obj}).")
            if a.get("grade") is not None and graded:
                out.append(f"map(g, {obj}, {grade_atom(a['grade'])}).")
                last_graded = obj
            elif a.get("result") in ("passed", "failed"):
                out.append(f"result({obj}, {a['result']}).")
            elif a.get("result") == "in_progress":
                if obj == objects[-1] and results.get(code) == "fail":
                    out.append(f"result({obj}, failed).")
            else:
                raise FixtureError(f"attempt {a.get('attempt_id')} of {code}: no grading policy and no result")
        out.append(f"attempt_count({_q(code)}, {len(rows)}). last_attempt({_q(code)}, {objects[-1]}).")
        if last_graded is not None:
            out.append(f"gpa_last({_q(code)}, {last_graded}).")
    if skipped_outside:
        warnings.append("Attempts of courses outside the program are not in the ASP engine (GPA leaves them out): "
                        + ", ".join(sorted(skipped_outside)))
    if skipped_late:
        warnings.append("Attempts recorded after the current term are left out: " + ", ".join(sorted(skipped_late)))


def _status_facts(fixture: dict[str, Any], members: set[str], t: int, results: dict[str, str],
                  out: list[str], warnings: list[str]) -> None:
    """History from course statuses only (web input): every past course is in the current term."""
    statuses = {sc["course_code"]: sc["status"] for sc in fixture["student"]["student_courses"]}
    graded = bool((fixture.get("policy") or {}).get("grading"))
    grades = {row["code"]: row for row in fixture["student"].get("scores") or []}
    letters = {g["grade"] for g in ((fixture.get("policy") or {}).get("grading") or {}).get("grade_scale", [])}
    unknown_letters: set[str] = set()
    for code in sorted(members):
        status = statuses.get(code, "not-started")
        row = grades.get(code, {})
        score = _parse_score(row.get("score")) if graded else None
        letter = row.get("letter") if graded else None
        if status == "not-started" and not (score is not None and score < 400):
            continue  # not taken (a failing score from a myBK file still counts as a failed attempt)
        a = _q(code)
        out.append(f"taken({a}, {t}). attempt_count({a}, 1). last_attempt({a}, {a}).")
        if status == "in-progress":
            if results.get(code) == "fail":
                out.append(f"result({a}, failed).")
            continue  # in progress, assumed passed: the engine keeps it open (status unknown)
        if letter in letters:
            out.append(f"map(g, {a}, {grade_atom(letter)}).")
        elif letter:
            unknown_letters.add(str(letter))
        if score is not None:
            out.append(f"raw_score({a}, {score}).")
        elif letter not in letters:
            out.append(f"result({a}, {'passed' if status == 'completed' else 'failed'}).")
    if unknown_letters:
        warnings.append("Letter grades not in the grading policy, left out of the GPA: "
                        + ", ".join(sorted(unknown_letters)))


def _external_facts(fixture: dict[str, Any], cal: Calendar, t: int, out: list[str], warnings: list[str]) -> None:
    """Progress on the external requirements of ``policy/external.json``, and condition courses.

    A requirement with ``satisfied_by_courses`` progresses by one per such course passed. A
    condition course that no requirement covers becomes its own requirement (pass it once
    before graduation), as before the external policy existed.
    """
    cohort = fixture["curriculum"].get("cohort")
    reqs = [r for r in ((fixture.get("policy") or {}).get("external") or {}).get("requirements", [])
            if applies(r, cohort)]
    aliases = _load_json(ALIASES_FILE, {}).get("aliases") or {}
    passed = {code for code, st in (fixture.get("_condition_statuses") or {}).items() if st == "completed"}
    for row in fixture["student"].get("graduation_conditions") or []:
        if row.get("passed"):
            # The program may use the base code (ENG_GC) or the myBK code (ENG_GC_600): accept both.
            passed.update({row["code"], aliases.get(row["code"], row["code"])})
    covered: set[str] = set()
    progress: dict[tuple[str, int], int] = {}
    for r in reqs:
        courses = r.get("satisfied_by_courses") or []
        covered.update(courses)
        done = sum(1 for c in courses if c in passed)
        if done:
            progress[(r["id"], t)] = progress.get((r["id"], t), 0) + done
    known = {r["id"] for r in reqs}
    unknown = set()
    for e in fixture["student"].get("external_progress") or []:
        if e["requirement"] not in known:
            unknown.add(e["requirement"])
            continue
        i = cal.index(e["semester_code"]) if e.get("semester_code") else t
        if i <= t:
            key = (e["requirement"], max(0, i))
            progress[key] = progress.get(key, 0) + int(e["amount"])
    if unknown:
        warnings.append("External progress for requirements not in the policy (or not for this cohort), left out: "
                        + ", ".join(sorted(unknown)))
    out.extend(f"external_progress({_q(rid)}, {i}, {amount})." for (rid, i), amount in sorted(progress.items()))
    for code in fixture.get("conditions", []):
        if code in covered:
            continue
        r = _q(code)
        out.append(f"external_requirement({r}, course, cumulative, blocking). "
                   f"external_milestone({r}, graduation, 1).")
        if code in passed:
            out.append(f"external_progress({r}, {t}, 1).")


# --- Solve ----------------------------------------------------------------------

def _term(symbol: clingo.Symbol) -> Any:
    if symbol.type == clingo.SymbolType.Number:
        return symbol.number
    if symbol.type == clingo.SymbolType.String:
        return symbol.string
    return str(symbol)


def _base_code(symbol: clingo.Symbol) -> tuple[str, bool]:
    """plan(X, I): X is "CODE" or rt("CODE", K) (a retake)."""
    if symbol.type == clingo.SymbolType.Function and symbol.name == "rt":
        return symbol.arguments[0].string, True
    return symbol.string, False


def solve_asp(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    previous_plan: dict[str, str] | None = None,
    time_limit: float = 30.0,
    threads: int = THREADS,
    solve_limit: int | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """Solve with the ASP engine. ``previous_plan`` feeds goal S3 (stay close to it).

    ``solve_limit``: stop after this many conflicts (clasp ``--solve-limit``). With
    ``threads=1`` the result is then reproducible, unlike the wall-clock ``time_limit``
    (still applied as a safety net; ``engine_report.stopped_by`` says which limit hit).
    ``strict``: a request field or goal this solver does not implement raises ``FixtureError``
    instead of adding a warning (``facts.check_capabilities``).
    """
    fixture = normalize(fixture)
    validate_input(fixture, scenario)
    unsupported = check_capabilities(fixture, scenario, "asp", CAPABILITIES["fields"], CAPABILITIES["goals"],
                                     previous_plan, strict)
    facts, ctx = build_program(fixture, scenario, previous_plan)

    args = ["--opt-mode=opt", "--warn=none", f"--parallel-mode={threads}", f"-c t={ctx['t']}", f"-c n={ctx['n']}"]
    if solve_limit is not None:
        args.append(f"--solve-limit={solve_limit}")
    if ctx["allow_summer"]:
        args.append("-c extra_sem=1")  # which course may use which summer: closed/2 facts (D5)
    ctl = clingo.Control(args)
    # Not ctl.load(): Clingo on Windows cannot open paths with accented characters.
    for path in SOURCES_BEFORE:
        ctl.add("base", [], path.read_text(encoding="utf-8"))
    ctl.add("base", [], facts)
    for path in SOURCES_AFTER:
        ctl.add("base", [], path.read_text(encoding="utf-8"))

    started = time.perf_counter()
    ctl.ground([("base", [])])
    best: list[clingo.Symbol] | None = None
    cost: list[tuple[int, int]] = []
    proven = False

    def on_model(model: clingo.Model) -> None:
        nonlocal best, cost, proven
        best = list(model.symbols(shown=True))
        # Clingo drops priority levels without elements, so pair values with the real priorities.
        cost = list(zip(model.priority, model.cost))
        proven = model.optimality_proven

    # Time limit: soft (Clingo checks it between propagation steps; grounding cannot be
    # interrupted). The hard limit is the backend's PLANNER_TIMEOUT_MS (kills the process).
    remaining = max(0.1, time_limit - (time.perf_counter() - started))
    timed_out = False
    with ctl.solve(on_model=on_model, async_=True) as handle:
        if not handle.wait(remaining):
            timed_out = True
            handle.cancel()
        outcome = handle.get()
    proven = proven or (best is not None and outcome.exhausted)
    if best is None:
        status = "UNSAT" if outcome.unsatisfiable else "TIMEOUT"
    else:
        status = "OPTIMAL" if proven else "SAT_NOT_PROVEN_OPTIMAL"

    takes = None
    report: dict[str, Any] = {"objective": [], "ground_and_solve_ms": round((time.perf_counter() - started) * 1000)}
    engine_warnings = unsupported + list(ctx["warnings"])
    if best is not None:
        takes, report, more = _decode(best, cost, ctx)
        report["ground_and_solve_ms"] = round((time.perf_counter() - started) * 1000)
        engine_warnings += more
    report["stopped_by"] = ("proven" if proven or outcome.unsatisfiable
                            else "time_limit" if timed_out else "solve_limit")

    result = make_result(fixture, scenario, "clingo", status, takes, previous_plan)
    result["assumptions"] += [
        "Solver: ASP engine (planner/solvers/asp/core); rule values from the planner input",
        "Past courses without a recorded term are placed in the current term",
        goals_note(fixture, scenario, "asp", CAPABILITIES["goals"]),
    ]
    if ctx["interests"]:
        result["assumptions"].append(f"Interests: {', '.join(ctx['interests'])} (goal TA ranks the electives by them)")
    result["warnings"] = engine_warnings + result["warnings"]
    result["engine_report"] = report
    return result


def _decode(symbols: list[clingo.Symbol], cost: list[tuple[int, int]], ctx: dict[str, Any]):
    cal: Calendar = ctx["calendar"]
    plan_pos = {code: k for k, code in enumerate(ctx["plan"], start=1)}
    by_priority = {p: g for g, p in ctx["goals"]}
    takes: list[tuple[str, int]] = []
    report: dict[str, Any] = {
        "objective": [{"level": by_priority.get(p, str(p)), "priority": p, "value": v} for p, v in cost],
        "gpa": {}, "majors": [], "fees": {}, "offering_misses": [], "recommendations_broken": [],
        "load_deficits": {}, "graduation_blocked": [], "external_missed": [], "external_pending": [],
        "degree_complete": False, "ready_to_graduate": False,
    }
    warnings: list[str] = []
    major_count: dict[str, int] = {}
    majors_earned: set[str] = set()
    for s in symbols:
        args = s.arguments
        if s.name == "plan" and len(args) == 2:
            code, _ = _base_code(args[0])
            takes.append((code, plan_pos[cal.code(args[1].number)]))
        elif s.name == "gpa" and len(args) == 2:
            report["gpa"][str(args[0])] = args[1].number / 100
        elif s.name in ("gpa_best_case", "gpa_required_avg"):
            report[s.name] = args[0].number / 100
        elif s.name in ("gpa_already_satisfied", "gpa_requirement_impossible", "degree_complete",
                        "ready_to_graduate"):
            report[s.name] = True
        elif s.name == "major_count":
            major_count[_term(args[0])] = args[1].number
        elif s.name == "major_earned":
            majors_earned.add(_term(args[0]))
        elif s.name == "semester_fee":
            report["fees"][cal.code(args[0].number)] = args[1].number
        elif s.name == "oh":
            report["offering_misses"].append({"course": _term(args[0]), "semester": cal.code(args[1].number)})
        elif s.name == "kn_broken":
            report["recommendations_broken"].append({"course": _term(args[0]), "before": _term(args[1])})
        elif s.name == "deficit":
            report["load_deficits"][cal.code(args[0].number)] = args[1].number
        elif s.name == "graduation_blocked":
            report["graduation_blocked"].append(_term(args[0]))
        elif s.name == "ext_missed":
            report["external_missed"].append({"requirement": _term(args[0]), "year": args[1].number})
        elif s.name == "ext_pending":
            report["external_pending"].append({"requirement": _term(args[0]), "year": args[1].number,
                                               "missing": args[2].number})
    report["majors"] = [{"code": m, "count": c, "earned": m in majors_earned} for m, c in sorted(major_count.items())]
    report["course_tags"] = {c: tags for c, tags in ctx["course_tags"].items() if any(c == x for x, _ in takes)}
    # Planned courses carrying each interest the student picked ([] when none of them was planned).
    report["interests"] = {tag: sorted(c for c, tags in report["course_tags"].items() if tag in tags)
                           for tag in ctx["interests"]}
    for key in ("graduation_blocked", "offering_misses", "recommendations_broken"):
        report[key].sort(key=str)
    for req in report["graduation_blocked"]:
        warnings.append(f"External requirement {req} is not met yet (with the data available).")
    return takes, report, warnings
