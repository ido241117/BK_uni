"""Step 2 agent (AGENT-MODEL.md section 7): picks a bundle each term, no solver.

Options are built from the student's official plan (``plans.official_spec``):

| Option | Courses | Offered |
|---|---|---|
| ``plan`` | This main semester's courses of the official plan (legal part) | If non-empty |
| ``drop_hardest`` | ``plan`` minus its course with the highest difficulty | If ``plan`` has 2+ courses and the rest is legal |
| ``plus_one`` | ``plan`` plus the first legal backlog course (retakes first, then overdue) | If there is a backlog |
| ``catch_up`` | Backlog then ``plan``, greedily within max(preferred max, plan credits) <= 25 | If there is a backlog |
| ``nothing`` / ``retakes`` | Summer, opted-in students only: nothing, or open retakes (internship excluded) within 12 credits | Summer |

| ``all_left`` | Every still-needed course that can be registered | Only when no option above reaches 11 credits |

Empty options are never offered in a main semester (the agent never skips by choice).
Options below the 11-credit minimum (QD1260 Dieu 1.2b) are dropped when another option
reaches it; when none does, ``all_left`` replaces them (a forced under-load, which
``[rules] forced_underload_exempt`` exempts from suspension).
Identical bundles are offered once. Utility: AGENT-MODEL section 3 without ``trust``
(see config.toml [agent]); the pick is the highest utility plus Gumbel noise keyed on
(seed, student, term), i.e. a multinomial logit choice.
"""

from __future__ import annotations

import numpy as np

from synthetic import grades as G
from synthetic import regulations as R
from synthetic.plans import MAX_MAIN_CREDITS, MAX_SUMMER_CREDITS, due, fit, registrable, slot_credits

_STREAM_AGENT = 3


def options(ctx, ps, state, student, semester: str, k: int, diff) -> list[tuple[str, list[str]]]:
    out = _options(ctx, ps, state, student, semester, k, diff, False)
    if not out and not ctx.cur.is_summer(semester):
        out = _options(ctx, ps, state, student, semester, k, diff, True)
    return out


def _options(ctx, ps, state, student, semester, k, diff, force_internship):
    cur = ctx.cur
    spec = student.specialization
    opt_in = cur.summers_from(cur.start) if student.summer_opt_in else None
    if cur.is_summer(semester):
        if not student.summer_opt_in:
            return [("nothing", [])]
        retakes = sorted(c for c in state.failed_open if c not in cur.internships)
        b = fit(cur, state, student, semester, retakes, MAX_SUMMER_CREDITS, opt_in) if retakes else []
        return [("nothing", [])] + ([("retakes", b)] if b else [])

    this, back = due(cur, ps, state, student, k, semester, force_internship)
    plan = fit(cur, state, student, semester, this, MAX_MAIN_CREDITS) if this else []
    cands = [("plan", plan)]
    if len(plan) >= 2:
        hardest = max(plan, key=lambda c: (diff.get(c, 0.0), c))
        cut = [c for c in plan if c != hardest]
        if not cur.registration_errors(spec, state.passed, state.failed_open, state.current,
                                       semester, cut):
            cands.append(("drop_hardest", cut))
    if back:
        legal = cur.individually_legal(spec, state.passed, state.failed_open, state.current,
                                       semester, back + plan)
        for c in [c for c in back if c in legal][:5]:
            b = plan + [c]
            if not cur.registration_errors(spec, state.passed, state.failed_open, state.current,
                                           semester, b):
                cands.append(("plus_one", b))
                break
        plan_cr = sum(slot_credits(cur, spec, plan).values())
        cap = min(MAX_MAIN_CREDITS, max(student.preferred_load[1], plan_cr))
        cands.append(("catch_up", fit(cur, state, student, semester, back + plan, cap)))
    out, seen = [], set()
    for name, b in cands:
        key = tuple(sorted(b))
        if b and key not in seen:
            seen.add(key)
            out.append((name, b))
    # Minimum load (QD1260 Dieu 1.2b, 11 credits): options below it are dropped when any
    # option reaches it; when none does, the only option is everything still registrable.
    big = [o for o in out if sum(slot_credits(cur, spec, o[1]).values()) >= R.MIN_MAIN_CREDITS]
    if big or not out:
        return big
    full = registrable(cur, ps, state, student, semester, k)
    return [("all_left", full)] if full else out


def utility(ctx, student, a, p, diff, state, semester: str, bundle: list[str]) -> float:
    """AGENT-MODEL section 3 without the planner's trust term (no noise)."""
    cur = ctx.cur
    credits = slot_credits(cur, student.specialization, bundle)
    cr = sum(credits.values())
    fee = cur.fee(cr, cur.is_summer(semester))
    year = ctx.year(semester)
    risk = sum(credits[c] * G.fail_probability(
        p, student.theta, diff.get(c, 0.0), year, state.attempts.get(c, 0) + 1, ctx.pass_score(c))
        for c in bundle)
    mid = sum(student.preferred_load) / 2
    return (- a["w_load"] * abs(cr - mid) / 3
            - a["w_cost"] * student.cost_sensitivity * fee / a["fee_ref"]
            - a["w_risk"] * (1 + a["panic_gain"] * state.shock) * risk / 3
            + a["w_progress"] * student.early_pref * cr / 3)


def make_policy(ctx, student, ps):
    """Policy for ``simulate.run_student``: source = the chosen option's name."""
    p, a, diff = ctx.params(student)

    def policy(state, k, semester, sem_index):
        cands = options(ctx, ps, state, student, semester, k, diff)
        if not cands:
            return [], "none"
        if len(cands) == 1:
            return cands[0][1], cands[0][0]
        g = np.random.default_rng([ctx.seed, _STREAM_AGENT, student.id, sem_index]).gumbel(size=len(cands))
        u = [utility(ctx, student, a, p, diff, state, semester, b) + gi
             for (_, b), gi in zip(cands, g)]
        name, b = cands[int(np.argmax(u))]
        return b, name

    return policy


def record(ctx, student, official: dict):
    """One run of the student through the program (step 2)."""
    from synthetic.plans import elective_order, official_spec
    from synthetic.simulate import run_student
    ps = official_spec(ctx.cur, official, elective_order(ctx.cur, student, ctx.seed))
    return run_student(ctx, student, make_policy(ctx, student, ps),
                       lambda state, k, sem: registrable(ctx.cur, ps, state, student, sem, k))
