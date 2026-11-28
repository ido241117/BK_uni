"""Semester loop for one student under a course-selection policy.

Used by step 2 (the agent's records, ``agent.py``) and by the replay-after-a-fail
option of step 4 (``evaluate.py``). No solver is called here.

A policy is ``policy(state, k, semester, sem_index) -> (bundle, source)`` with ``k`` the
index of this main semester (suspended and internship semesters included).
``registrable(state, k, semester) -> courses`` (optional) lists every still-needed course
that could be registered: a main semester below the minimum load is not a suspension
reason when the bundle holds all of them (``[rules] forced_underload_exempt``).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from synthetic import grades as G
from synthetic import regulations as R
from synthetic.curriculum import FREE_PREFIX, Curriculum, base_values
from synthetic.grades import course_difficulties


@dataclass
class State:
    current: str                                   # last finished (or start) semester
    passed: set[str] = field(default_factory=set)
    failed_open: set[str] = field(default_factory=set)
    attempts: dict[str, int] = field(default_factory=dict)
    best: dict[str, float] = field(default_factory=dict)
    shock: bool = False                            # last main semester had a fail or warning
    free_taken: int = 0                            # free-elective attempts so far


class Context:
    """Everything shared by all students of a pool: config, curriculum, course effects."""

    def __init__(self, cfg, cur: Curriculum, seed: int):
        self.cfg, self.cur, self.seed = cfg, cur, seed
        self.grades = base_values(cfg["grades"])
        self.agent = base_values(cfg["agent"])
        codes = cur.all_codes()
        self.course_index = {c: i for i, c in enumerate(codes)}
        self.z_difficulty = course_difficulties(codes, 1.0, seed)   # b_c = difficulty_sd * z_c
        self.cohort = cur.raw["curriculum"]["cohort"] % 100

    def params(self, student) -> tuple[dict, dict, dict[str, float]]:
        """(grade params, agent params, course difficulties) for this student."""
        p = {**self.grades, **{k: v for k, v in student.params.items() if k in self.grades}}
        a = {**self.agent, **{k: v for k, v in student.params.items() if k in self.agent}}
        diff = {c: p["difficulty_sd"] * z for c, z in self.z_difficulty.items()}
        return p, a, diff

    def year(self, semester: str) -> int:
        return int(semester[:2]) - self.cohort + 1

    def pass_score(self, course: str) -> float:
        return G.GRADUATION_PASS_SCORE if course in self.cur.graduation_courses else G.PASS_SCORE

    def score(self, student, course: str, semester: str, attempt: int, p=None, diff=None) -> float:
        """Keyed draw: the same (student, course, attempt) gets the same noise everywhere."""
        if p is None:
            p, _, diff = self.params(student)
        z = G.noise(self.seed, student.id, self.course_index[course], attempt)
        return G.draw_score(p, student.theta, diff[course], self.year(semester), attempt, z)


def cpa(state: State, credits: dict[str, int], scale) -> float | None:
    rows = [(scale.points(s), credits[c]) for c, s in state.best.items() if credits[c] > 0]
    total = sum(w for _, w in rows)
    return sum(p * w for p, w in rows) / total if total else None


def run_student(ctx: Context, student, policy, registrable=None):
    """Returns (outcome dict, semester rows, transcript rows)."""
    cur = ctx.cur
    spec = student.specialization
    credits = dict(cur.credits(spec))
    p, _, diff = ctx.params(student)
    state, standing = State(current=cur.start), R.Standing(cur.standing)
    sem_rows, tx_rows = [], []
    status, reason, cost = "active", "", 0.0
    on_internship = False      # the previous term registered the internship (fills_next)

    for sem_index, semester in enumerate(cur.semesters[1:], start=1):
        summer = cur.is_summer(semester)
        if on_internship:
            on_internship = False
            sem_rows.append({"semester": semester, "event": "internship"})
            state.current = semester
            if not summer:
                reason = standing.internship_semester()
                if reason:
                    status = "withdrawn"
                    break
            continue
        if not summer and standing.suspended_next:
            reason = standing.serve_suspension()
            sem_rows.append({"semester": semester, "event": "suspended"})
            state.current = semester
            if reason:
                status = "withdrawn"
                break
            continue
        k = standing.main_semesters + 1
        bundle, source = policy(state, k, semester, sem_index)

        if summer and not bundle:
            state.current = semester
            continue
        if not summer and not bundle:
            status, reason = "withdrawn", "no_registration"   # standing.json _sources.no_registration
            break

        credits.update({c: cur.free_credits for c in bundle if c.startswith("FREE_")})
        reg = sum(credits[c] for c in bundle)
        fee = cur.fee(reg, summer)
        cost += fee
        year = ctx.year(semester)
        failed_cr, pts, w = 0, 0.0, 0
        would_finish = cur.graduated(spec, state.passed | set(bundle))
        forced = False
        if (not summer and reg < cur.standing.min_main_load and not would_finish and registrable
                and ctx.cfg["rules"]["forced_underload_exempt"]):
            forced = set(registrable(state, k, semester)) <= set(bundle)
        for slot in sorted(bundle):
            c = slot
            if slot.startswith("FREE_"):     # a new, distinct free elective each time
                state.free_taken += 1
                c = f"{FREE_PREFIX}{state.free_taken}"
                credits[c] = cur.free_credits
            att = state.attempts.get(c, 0) + 1
            s = ctx.score(student, c, semester, att, p, diff)
            ok = s >= ctx.pass_score(c)
            state.attempts[c] = att
            state.best[c] = max(s, state.best.get(c, 0.0))
            if ok:
                state.passed.add(c)
                state.failed_open.discard(c)
            else:
                failed_cr += credits[c]
                # A failed free elective is replaced by another one, so it is not owed.
                if c == slot and c not in state.passed:
                    state.failed_open.add(c)
            if credits[c] > 0:
                pts += cur.scale.points(s) * credits[c]
                w += credits[c]
            tx_rows.append({"semester": semester, "course": c, "credits": credits[c],
                            "attempt": att, "score": s, "passed": ok, "year": year})
        state.current = semester
        on_internship = bool(set(bundle) & cur.internships)
        row = {"semester": semester, "event": "studied", "k": k, "credits": reg,
               "fee": round(fee, 3), "failed_credits": failed_cr, "source": source}

        if cur.graduated(spec, state.passed):
            sem_rows.append(row)
            status = "graduated"
            if not summer:
                standing.main_semesters += 1
            break
        if summer:
            sem_rows.append(row)
            continue
        acc = sum(credits[c] for c in state.passed)
        sem_gpa = pts / w if w else None
        c_gpa = cpa(state, credits, cur.scale)
        reasons = R.warning_reasons(cur.standing,
            registered_credits=reg, failed_credits=failed_cr,
            outstanding_credits=sum(credits[c] for c in state.failed_open),
            semester_gpa=sem_gpa, first_semester=(standing.main_semesters == 0),
            cpa=c_gpa, accumulated_credits=acc)
        under = reg < cur.standing.min_main_load and not would_finish and not forced
        state.shock = bool(failed_cr or reasons)
        row.update(semester_gpa=None if sem_gpa is None else round(sem_gpa, 3),
                   cpa=None if c_gpa is None else round(c_gpa, 3),
                   warning="|".join(reasons), suspended_next=under)
        sem_rows.append(row)
        reason = standing.close_main_semester(semester, reasons, under)
        if reason:
            status = "withdrawn"
            break

    final = cpa(state, credits, cur.scale)
    outcome = {
        "status": status, "reason": reason or "",
        "main_semesters": standing.main_semesters,
        "summers_used": sum(1 for r in sem_rows if r.get("event") == "studied"
                            and cur.is_summer(r["semester"])),
        "last_semester": state.current, "cost": round(cost, 3),
        "cpa": None if final is None else round(final, 3),
        "warnings": len(standing.warnings),
        "credits_passed": sum(credits[c] for c in state.passed),
    }
    return outcome, sem_rows, tx_rows
