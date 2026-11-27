# Student agent model

**Status (23/11/2026):**
- Sections 1–4: the agent of the closed-loop prototype (planner arm), **removed** on 23/11/2026 with the prototype. Kept because sections 5–7 refer to it; `trust` and the planner candidates no longer exist in the code.
- Section 5: known flaws, with the decision on each (reviewed 22/11/2026).
- Section 6: the agreed changes. Accepted in principle, **not implemented**.
- Section 7: the agent of the open-loop pipeline, **implemented** (`agent.py`), with the section-3 utility minus `trust` and without the section-6 changes.

## 1. What the agent is for

The planner only suggests a plan; a real student may not follow it. The agent stands in for that student. Each semester it decides which courses to register, given:
- the planner's suggestion for this semester;
- its own traits;
- its recent experience.

What the agent produces:
- the courses actually registered, which then get graded;
- adherence: the share of semesters in which the planner's suggestion was taken unchanged.

## 2. Student traits

Each trait is drawn once per student and stays fixed. The sampler uses its own random stream, so changing an agent parameter does not change the students.

| Trait | Distribution | Used for |
|---|---|---|
| Ability θ | N(0, 1) | Grades; the agent's own fail-risk estimate |
| Specialization | Uniform over CNDL, CNPM, MMANM, TTNT, XLA | Group-C electives, planner input |
| Preferred load `[max−3, max]` | max ~ N(18, 1.5), rounded, clipped to [14, 22]; the mean is ranged 16–20 | Planner input; load term of the utility |
| Early-finish preference | U(0, 1) | Summer opt-in; progress term |
| Cost sensitivity | U(0, 1) | Cost term |
| Summer opt-in | early-finish preference > `summer_threshold` (0.5; ranged 0.3–0.7) | Planner may schedule summer courses only for opted-in students |

The traits are independent of each other and of ability.

## 3. The decision each semester

**3.1 Planner input.** CP-SAT plans from the student's real state: passed courses, failed courses, current semester, preferred load, and the summers from now on (only if opted in). It replans only after a deviation, a fail, a fallback or a suspension (`replan = "on_deviation"`); otherwise it keeps the previous plan. If CP-SAT returns no plan, or an empty main semester, the student falls back to the baseline's courses for that semester. That semester counts as no decision.

**3.2 Candidate bundles.** The agent chooses among at most three:

| Candidate | Courses | When offered |
|---|---|---|
| `planner` | The planner's courses for this semester, after the legality repair | Always |
| `drop_hardest` | The same, minus the course with the highest difficulty b_c | If the planner's bundle has 2 or more courses and the reduced bundle is still legal |
| `curriculum` | What the baseline policy would register (in summer: the internship or nothing) | If it differs from the planner's bundle |

**3.3 Utility.** For a candidate with `cr` credits:

```
U = trust * [candidate is the planner's]
  - w_load     * |cr - preferred_mid| / 3
  - w_cost     * cost_sensitivity * fee(cr, summer) / fee_ref
  - w_risk     * (1 + panic_gain * shock) * expected_failed_credits / 3
  + w_progress * early_pref * cr / 3
  + Gumbel noise
```

The candidate with the highest U is registered. With Gumbel noise this is a multinomial logit choice: a candidate is picked with probability ∝ exp(U without noise). The noise is keyed on (seed, student, semester), so a rerun makes the same choices.

| Term | Meaning | Base (range) |
|---|---|---|
| `trust` | Bonus for following the planner | 1.0 (0–2) |
| `w_load` | Penalty per 3 credits away from the middle of the preferred load band (about 16.5 at base) | 0.5 (0–1) |
| `w_cost` | Penalty per regular-semester fee (`fee_ref` = 13.75 M VND), scaled by cost sensitivity | 0.5 (0–1) |
| `w_risk` | Penalty per 3 expected failed credits | 1.0 (0.5–2) |
| `panic_gain` | Extra risk aversion after a bad semester | 1.0 (0–3) |
| `w_progress` | Reward per 3 credits, scaled by early-finish preference | 0.5 (0–1) |

- **Fee:** from `policy.lp`. A main semester of 13–18 credits costs 13.75 M VND, plus 0.805 M per credit above 18. Summer costs 1.23 M per credit.
- **Expected failed credits:** Σ credits × P(fail), with P(fail) from the score model, using the student's true θ, the course's true difficulty, the year and the attempt number. The pass mark is 5.5 for graduation courses and 4.0 for the others.
- **Shock:** 1 if the last main semester had a failed course or an academic warning, else 0.

The `/3` scales the terms so one 3-credit course is about one utility unit.

**3.4 After the choice.** The registered courses are graded, then the attrition rules are applied (warning, suspension, withdrawal; README section 3). If the student took the planner's bundle and passed everything, the plan is kept for the next semester; otherwise the next semester triggers a replan.

## 4. What the agent does not do

- It looks at one semester only. It does not compare whole plans or think about graduation timing, except through the planner and the progress term.
- It never invents its own course set: the only options are the three candidates.
- It does not learn. Trust does not change after following the planner went well or badly; the only memory is `shock`.
- It never takes leave, drops out by choice, or skips a semester by choice. Withdrawal comes only from the rules.

## 5. Known flaws and decisions (reviewed 22/11/2026)

| # | Flaw | Decision |
|---|---|---|
| 1 | **The summer opt-in ignores cost.** It depends on the early-finish preference alone. In the 40-student pilot, the 24 opted-in students took about 2.1 summer terms with courses other than the internship; students with high cost sensitivity took slightly more (2.3) than those with low (1.9), not fewer | **Critical, must fix** |
| 2 | **The load term applies to summer.** Summer is measured against the main-semester preferred load (about 16.5 credits), so an empty summer is penalised by about 2.75 units, more than a 6-credit summer (about 1.75). This pushes students into summer courses | **Critical, must fix.** Ignoring optional summer altogether is the fallback if the fix proves too complicated |
| 3 | **The cost term is weak against that push.** A 6-credit summer (7.4 M VND) costs at most 0.27 units, while flaw 2 and the progress term each favour it by up to about 1 unit. Summer's higher price per credit (1.23 M against 0.76–1.06 M in a main semester) has almost no deterrent effect | **Modify the utility function** |
| 4 | **The agent knows its true ability and the true course difficulties** | **Not a problem:** the score noise already covers the uncertainty. No change |
| 5 | **A heavier semester does not lower grades** (a score-model assumption). Combined with the progress term, this favours heavy loads | **Medium:** fix, but after 1–3 |
| 6 | **The parameter values are guesses.** For example, the 0.63 adherence in the pilot comes mostly from the chosen `trust` | **Acceptable**, but each part should follow an established probability or behavioural model where one exists (as θ ~ N(0,1) does) |

Flaws 1–3 inflate summer use in the prototype's planner arm, and with it part of the planner's apparent advantage in time to completion. Prototype runs made before a fix should be read with this in mind.

## 6. Agreed changes (not implemented)

| Change | Fixes | Model |
|---|---|---|
| Probabilistic, cost-aware summer opt-in | 1 | Binary logit: P(opt in) = logistic(α + β₁·early-finish preference − β₂·cost sensitivity), coefficients ranged |
| No load term in summer | 2 | The load term applies to main semesters only. A summer option is scored by progress minus cost minus risk. Fallback: no optional summer courses in any plan or record |
| Money-based utility | 3 | Random utility in money terms (mixed logit): U = −λᵢ·fee + value of finishing earlier − risk penalty + …, with the student's cost coefficient λᵢ log-normal (keeps the sign, allows a tail of very budget-constrained students). The ratio of the time and money terms is a value of time in real units. After the change, a pilot must show that more cost-sensitive students take fewer summers |
| Load effect on grades | 5 | Score shift −γ·max(0, credits − c₀), c₀ near the official plan's 15–17 credits, γ ranged from 0 (evidence on load and grades is mixed: stronger students choose heavier loads) |
| Grounded parameters | 6 | θ ~ N(0,1) and course difficulty ~ N(0, σ) as a crossed random-effects (IRT-style) model, estimable from real grades if they ever become available; preferred load centred on the official plan's 15–17 credits; choices as multinomial logit (random utility); summer opt-in as binary logit; cost coefficient log-normal |
| Trust set by an adherence target | 6 | In any setting where the agent receives a planner suggestion, choose `trust` so adherence hits a stated level (e.g. 0.5 / 0.7 / 0.9). Not needed in step 2 of the open-loop pipeline, which has no planner |

Each change ships with a pilot and an update to this file.

## 7. The agent in the open-loop pipeline (`DESIGN.md`, implemented 23/11/2026)

In the open-loop design the agent only produces the student records (step 2). It runs once per student, with **no solver** (`agent.py`, `simulate.py`):
- It starts from the official plan (`official_plan.json`), with electives filled from the student's own order: courses sharing more tags with the student's interests first, ties in a fixed random order.
- Each term it picks one option by utility plus Gumbel noise (multinomial logit), the noise keyed on (seed, student, term).
- The score model grades the chosen courses, and the attrition rules apply.
- The internship fills the next term (`DESIGN.md` B1).

**Options** (main semester `k`; backlog = retakes first, then courses of the plan's earlier semesters):

| Option | Courses | Offered |
|---|---|---|
| `plan` | The plan's courses for semester `k` (legal part) | If non-empty |
| `drop_hardest` | `plan` minus its course with the highest difficulty b_c | If `plan` has 2+ courses and the rest is legal |
| `plus_one` | `plan` plus the first legal backlog course | If there is a backlog |
| `catch_up` | Backlog then `plan`, greedily within max(preferred max, plan credits), at most 25 | If there is a backlog |
| `all_left` | Every still-needed course that can be registered | Only when no option above reaches 11 credits |
| `nothing` / `retakes` | Summer, opted-in students only: nothing, or open retakes (internship excluded) within 12 credits | Summer |

Rules on the option set:
- Empty options are never offered in a main semester; identical bundles are offered once.
- **Minimum load** (QĐ1260 Điều 1.2b): options under 11 credits are dropped when another option reaches 11. Without this, the cost term (per-credit fee below 13 credits) and the risk term made the agent pick 2–3 credit bundles, which trigger suspension (n = 200 pilot: 52 suspensions, 19 withdrawals at the 12-semester limit; after the rule: 0 and 9).
- **Internship placement:** within semesters 1–8 only in a term followed by a summer; past semester 8, as the last course, or when nothing else can be registered, in any term. Without it the agent registered the internship in semester 7 and lost semester 8 to it.

**Utility:** section 3 without `trust`:

```
U = - w_load     * |cr - preferred_mid| / 3
    - w_cost     * cost_sensitivity * fee(cr, summer) / fee_ref
    - w_risk     * (1 + panic_gain * shock) * expected_failed_credits / 3
    + w_progress * early_pref * cr / 3
    + Gumbel noise
```

Flaws 1–3 (summer) and 5 still apply; the summer options are limited to retakes, which limits flaw 2's effect (n = 200: opted-in students used 0.41 summers on average). Flaw 6 shows in the records: the agent picks `drop_hardest` in about a quarter of the terms, so only about 20% graduate within 8 semesters (`README.md` §6).
