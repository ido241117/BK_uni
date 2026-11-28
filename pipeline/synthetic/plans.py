"""Reference plans and plan following, shared by steps 2-4.

A *plan spec* places every course a student needs at a main-semester index 1..8:
``PlanSpec.semester`` maps course -> index, ``PlanSpec.free`` lists the indices of the
free-elective slots (slot codes change with the state, see ``Curriculum.free_slots``).

* ``official_spec``: the PDF plan (``official_plan.json``), electives filled from the
  student's own preference order.
* ``baseline_spec``: the "follow the curriculum" rule (``[baseline]`` in config.toml).

A *plan* is ``{term code: [courses]}``. Free electives in plans are named
``ELECTIVE_j`` = the j-th free elective in term order, the name the simulation gives
the j-th free-elective attempt, so the same course gets the same score draw in every
plan (common random numbers, DESIGN.md B4).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np

from synthetic.curriculum import _COMPLETENESS, FREE_PREFIX, PIPELINE, Curriculum

_STREAM_ELECTIVE = 4
MAX_MAIN_CREDITS = 25      # QD1260 Dieu 1.2b (p.3), regular students
MAX_SUMMER_CREDITS = 12    # fixture rules.summer_credits_max
OFFICIAL_SEMESTERS = 8


@dataclass(frozen=True)
class PlanSpec:
    semester: dict[str, int]     # course -> main-semester index
    free: tuple[int, ...]        # main-semester index of each free-elective slot


def load_official(cfg) -> dict:
    return json.loads((PIPELINE / cfg["run"]["official_plan"]).read_text(encoding="utf-8"))


def elective_order(cur: Curriculum, student, seed: int) -> dict[str, list[str]]:
    """Per-student preference order inside each elective group: courses sharing more
    tags with the student's interests first, ties in a random order fixed by seed."""
    rng = np.random.default_rng([seed, _STREAM_ELECTIVE, student.id])
    tags = cur.course_tags()
    likes = set(student.interests)
    out = {}
    for g in cur.groups(student.specialization):
        key = cur.elective_group_key(g)
        if g["kind"] == "elective" and key:
            members = list(g["members"])
            rng.shuffle(members)
            out[key] = sorted(members, key=lambda c: -len(tags.get(c, frozenset()) & likes))
    return out


def _spec_from_slots(cur: Curriculum, required: dict[str, int], slots: dict[str, list[int]],
                     order: dict[str, list[str]]) -> PlanSpec:
    sem = dict(required)
    for key, idx in slots.items():
        if key == cur.free_group:
            continue
        for course, k in zip(order[key], sorted(idx)):
            sem[course] = k
    return PlanSpec(sem, tuple(sorted(slots.get(cur.free_group, []))))


def official_spec(cur: Curriculum, official: dict, order: dict[str, list[str]]) -> PlanSpec:
    required, slots = {}, {}
    for s in official["semesters"]:
        for c in s["required"]:
            required[c] = s["semester"]
        for key, n in s["slots"].items():
            slots.setdefault(key, []).extend([s["semester"]] * n)
    return _spec_from_slots(cur, required, slots, order)


def baseline_spec(cur: Curriculum, spec: str, order: dict[str, list[str]]) -> PlanSpec:
    return _spec_from_slots(cur, dict(cur.recommended(spec)),
                            {k: list(v) for k, v in cur.elective_semesters.items()}, order)


def due(cur: Curriculum, ps: PlanSpec, state, student, k: int, semester: str,
        force_internship: bool = False) -> tuple[list[str], list[str]]:
    """(this semester's courses, backlog) of plan spec ``ps`` at main semester ``k``.

    Backlog = retakes, then courses planned before ``k`` and not passed, in plan order.
    Free-elective slots are named with the codes open in ``state``. The internship is
    left out unless ``internship_allowed`` or ``force_internship`` (callers retry with
    it when nothing else can be registered; otherwise the internship would never be
    taken by a student whose only other course needs it).
    """
    this, back = [], []
    for c, s in ps.semester.items():
        if c in state.passed:
            continue
        if c in state.failed_open or s < k:
            back.append(c)
        elif s == k:
            this.append(c)
    n_passed = sum(c.startswith(FREE_PREFIX) for c in state.passed)
    owed = max(0, sum(s <= k for s in ps.free) - n_passed)
    n_this = min(owed, sum(s == k for s in ps.free))
    slots = cur.free_slots(student.specialization, state.passed)
    this += slots[:n_this]
    back_free = slots[n_this:owed]
    when = {**ps.semester, **{c: 0 for c in back_free}}
    back = sorted(back, key=lambda c: (c not in state.failed_open, when[c], c)) + back_free
    if not force_internship and not internship_allowed(cur, semester, this + back, k):
        this = [c for c in this if c not in cur.internships]
        back = [c for c in back if c not in cur.internships]
    return sorted(this), back


def internship_allowed(cur: Curriculum, semester: str, remaining, k: int) -> bool:
    """Assumption: within the official plan's 8 semesters, students register the
    internship only in a term followed by a summer (it fills the next term, DESIGN.md
    B1). Past semester 8, or when it is the last course they need, in any term (the
    thesis needs it, so waiting would only delay graduation further)."""
    nxt = cur.next_term(semester)
    return (nxt is None or cur.is_summer(nxt) or k > OFFICIAL_SEMESTERS
            or set(remaining) <= cur.internships)


def registrable(cur: Curriculum, ps: PlanSpec, state, student, semester: str, k: int) -> list[str]:
    """Every still-needed course that can be registered now (main semester, within 25)."""
    this, back = due(cur, ps, state, student, k, semester, force_internship=True)
    return fit(cur, state, student, semester, back + this, MAX_MAIN_CREDITS)


def fit(cur: Curriculum, state, student, semester: str, ranked: list[str], cap: int,
        summer_opt_in=None) -> list[str]:
    """Greedy: legal courses in rank order within ``cap`` credits, then repair."""
    credits = slot_credits(cur, student.specialization, ranked)
    legal = cur.individually_legal(student.specialization, state.passed, state.failed_open,
                                   state.current, semester, ranked, summer_opt_in)
    bundle, load = [], 0
    for c in legal:
        if load + credits[c] <= cap:
            bundle.append(c)
            load += credits[c]
    return repair(cur, state, student, semester, bundle, summer_opt_in)


def repair(cur: Curriculum, state, student, semester: str, bundle, summer_opt_in=None) -> list[str]:
    """Drop courses named in validator errors until the bundle is legal."""
    spec = student.specialization
    bundle = list(bundle)
    while bundle:
        errs = cur.registration_errors(spec, state.passed, state.failed_open, state.current,
                                       semester, bundle, summer_opt_in)
        if not errs:
            return bundle
        bad = [e.split(":", 1)[0] for e in errs if ":" in e and not e.startswith("ky ")]
        if not bad:   # load above max: drop the last course
            bundle.pop()
            continue
        bundle = [c for c in bundle if c not in bad]
    return bundle


def slot_credits(cur: Curriculum, spec: str, courses) -> dict[str, int]:
    credits = cur.credits(spec)
    return {c: credits.get(c, cur.free_credits) for c in courses}


def baseline_bundle(cur: Curriculum, ps: PlanSpec, state, student, semester: str, k: int) -> list[str]:
    """Follow the curriculum: retakes, overdue, then this semester; no summer courses.
    Load cap = max(preferred max, this semester's on-schedule credits), at most 25."""
    if cur.is_summer(semester):
        return []
    for force in (False, True):
        this, back = due(cur, ps, state, student, k, semester, force)
        on_time = sum(slot_credits(cur, student.specialization, this).values())
        cap = min(MAX_MAIN_CREDITS, max(student.preferred_load[1], on_time))
        bundle = fit(cur, state, student, semester, back + this, cap)
        if bundle:
            break
    return bundle


# --- plans as {term: [courses]} --------------------------------------------------

def spec_plan(cur: Curriculum, ps: PlanSpec) -> dict[str, list[str]]:
    """The plan spec as written (every course at its index), free slots as ELECTIVE_j."""
    plan: dict[str, list[str]] = {}
    for c, k in ps.semester.items():
        plan.setdefault(cur.main_code(k), []).append(c)
    for j, k in enumerate(ps.free, start=1):
        plan.setdefault(cur.main_code(k), []).append(f"{FREE_PREFIX}{j}")
    return {s: sorted(v) for s, v in sorted(plan.items())}


def canonical(plan: dict[str, list[str]], start: int = 0) -> dict[str, list[str]]:
    """Rename free-elective slots (FREE_k_j / ELECTIVE_m) to ELECTIVE_<start+1>.. in term
    order (``start`` = free electives already passed in the state the plan starts from)."""
    out, j = {}, start
    for sem in sorted(plan):
        row = []
        for c in sorted(plan[sem]):
            if c.startswith("FREE_") or c.startswith(FREE_PREFIX):
                j += 1
                c = f"{FREE_PREFIX}{j}"
            row.append(c)
        if row:
            out[sem] = sorted(row)
    return out


def last_free_index(passed) -> int:
    """Highest j among passed ELECTIVE_j (new free electives are numbered after it)."""
    return max((int(c[len(FREE_PREFIX):]) for c in passed if c.startswith(FREE_PREFIX)), default=0)


def to_slots(cur: Curriculum, spec: str, plan: dict[str, list[str]], passed=()) -> dict[str, list[str]]:
    """Canonical plan -> validator form: ELECTIVE_j becomes the j-th open free slot."""
    slots = iter(cur.free_slots(spec, set(passed)))
    # More free electives than open slots (a record with a failed one): the extra ones keep
    # their ELECTIVE_m name, a course outside the curriculum the validator knows.
    return {s: sorted(next(slots, c) if c.startswith(FREE_PREFIX) and c not in passed else c
                      for c in cs) for s, cs in sorted(plan.items())}


def plan_errors(cur: Curriculum, student, plan: dict[str, list[str]], passed=(), failed=(),
                current: str | None = None) -> list[str]:
    """Validator errors (completeness ignored) + the internship fills_next rule."""
    from evaluation.validate import validate_plan
    spec = student.specialization
    current = current or cur.start
    opt_in = cur.summers_from(current) if student.summer_opt_in else []
    fx = cur.state_fixture(spec, passed, failed, current)
    rows = [{"semester_code": s, "courses": cs} for s, cs in to_slots(cur, spec, plan, passed).items()]
    errs = [e for e in validate_plan(fx, cur.scenario(opt_in), rows) if not e.startswith(_COMPLETENESS)]
    return errs + cur.fills_next_errors(plan)


def plan_completes(cur: Curriculum, student, plan: dict[str, list[str]], passed=()) -> bool:
    """Canonical ``plan`` (free electives named after those in ``passed``) completes the degree."""
    done = set(passed) | {c for cs in plan.values() for c in cs}
    return cur.graduated(student.specialization, done)


def allpass_plan(cur: Curriculum, student, ps: PlanSpec, passed=(), failed=(),
                 current: str | None = None, k0: int = 0) -> dict[str, list[str]]:
    """Plan from a state by the repair rule of ``baseline_bundle`` (retakes, overdue, this
    semester; no summer), every course assumed passed. ``k0`` main semesters elapsed.
    Free electives are named ELECTIVE_j after the highest one already passed."""
    from types import SimpleNamespace
    current = current or cur.start
    state = SimpleNamespace(passed=set(passed), failed_open=set(failed) - set(passed), current=current)
    n_free = last_free_index(state.passed)
    plan: dict[str, list[str]] = {}
    k, on_internship = k0, False
    for sem in cur.semesters[cur.semesters.index(current) + 1:]:
        if cur.graduated(student.specialization, state.passed):
            break
        summer = cur.is_summer(sem)
        if on_internship or summer:
            on_internship = False
            k += not summer
            state.current = sem
            continue
        k += 1
        bundle = baseline_bundle(cur, ps, state, student, sem, k)
        if not bundle:
            break
        names = []
        for c in sorted(bundle):
            if c.startswith("FREE_"):
                n_free += 1
                c = f"{FREE_PREFIX}{n_free}"
            names.append(c)
        plan[sem] = sorted(names)
        state.passed |= set(names)
        state.failed_open -= set(names)
        state.current = sem
        on_internship = bool(set(bundle) & cur.internships)
    return plan
