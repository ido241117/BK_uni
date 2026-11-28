# Features

What the planner does today. The planner is one package (`pipeline/planner/`) with two solvers,
CP-SAT and the ASP engine, behind one input, one rule set ([CONSTRAINTS.md](CONSTRAINTS.md))
and one result shape. Input fields are in [USER-INPUT.md](USER-INPUT.md). A feature only one
solver has is marked; how such gaps are tracked and closed is in
[PLANNER-PARITY.md](PLANNER-PARITY.md).

Status: **Supported** = implemented and tested; **Partial** = implemented with a stated gap.

| ID | Feature | Solvers | Status |
|---|---|---|---|
| F-01 | Planner input from the canonical instances | both | Supported |
| F-02 | Normalization shared by every solver and the validator | both | Supported |
| F-03 | Plan the remaining terms, all at once | both | Supported |
| F-04 | Degree audit: groups, majors, free-elective slots, credit counting order | both | Supported |
| F-05 | What-if requests | both (some fields CP-SAT only) | Supported |
| F-06 | Independent validation of every plan | validator | Supported |
| F-07 | Why there is no plan, with one-click fixes; why a credit target was missed | both (explained with CP-SAT) | Supported |
| F-08 | Warnings with the regulation article; request report | both | Supported |
| F-09 | Soft-goal report | both | Supported |
| F-10 | Course facts for client-side checks | both | Supported |
| F-11 | Relation snapshot and inferred relations | both | Supported (inference off by default) |
| F-12 | GPA, tuition, external requirements, majors (reports) | ASP | Supported |
| F-13 | Interests from course tags | ASP | Supported |
| F-14 | Capability declarations and the goals-used note | both | Supported |
| F-15 | Command-line entry point for the web backend | both | Supported |
| F-16 | Solver registry for evaluation and plug-ins | both | Supported |

---

<a id="f-01"></a>
### F-01. Planner input from the canonical instances

- **Does**: `planner.model.input.load_fixture(path)` reads one request file of
  `instances/<uni>/requests/` and builds the planner input (the "fixture"): curriculum, terms,
  courses, relations, groups, offerings, the student's statuses, every attempt (term, grade), the
  external progress, the requests (`scenarios`) and the policy (grading, tuition, external
  requirements, graduation GPA). `to_planner_fixture(...)` does the same from loaded documents.
- **Checks**: `instances.loader` validates the instance first (schema 3); `facts.validate_input`
  checks the planner input before solving: unknown courses, relation types, overlapping groups,
  statuses, scenario terms outside the plan, in-progress results for exactly the in-progress
  courses, goal ids, wanted courses outside the program, graduation-course kinds. A bad input
  is an error with a reason, never a silent skip.

<a id="f-02"></a>
### F-02. Normalization shared by every solver and the validator

`planner/model/normalize.py` reshapes data, adds no rules, and is idempotent, so both solvers,
the validator and the reports see the same data. Steps:

0. **Student block choices** (`student.block_overrides`, T46, 22/11): a course counts in the
   block the student chose; a course outside the program joining a listed block becomes a member;
   joining the free elective counts its credits there.
1. **Condition courses** are removed from planning: `conditions` plus every 0-credit course.
   Their statuses are kept (`_condition_statuses`) for the external requirements.
2. **Specialization** (H15): with a target major, the parent group keeps only the major's list;
   without one, the child groups are dropped. The child groups are kept for the ASP major report.
3. **Total program credits** (`_total_credits`) = mandatory credits + each top-level elective
   group's threshold: the denominator of the graduation thresholds (H12).
4. **Free elective → slots** `FREE_k` (H13), reduced first by elective surplus inside the
   program, then by passed (or in progress and assumed passed) courses outside it, then by
   courses the student typed into the free elective (`student.free_choices`, T62, 23/11), which
   become a separate mandatory block. This is the myBK counting order (reviewer, 19/11).

<a id="f-03"></a>
### F-03. Plan the remaining terms

- **Does**: one 0/1 decision "course c in term k" for every course not passed and every
  remaining term; all hard constraints hold; among valid plans the best by the goal order. All
  remaining terms are planned at once (CONSTRAINTS.md 1.1).
- **Output per course**: `reason` (`required`, `elective`, `free_elective`, `wanted`, `retake`),
  `locked`, `block` (which requirement the course fills: each elective group fills its missing
  part first, the surplus goes to the free elective; courses the student pinned or wanted take
  the block first, 24/11) and `slot` (an elective the solver picked, shown as "block (x credits)"
  with a drop-down, Q7). An assumed-failed attempt appears in its term with `assumed_fail: true`.
- **Statuses**: `OPTIMAL`, `SAT_NOT_PROVEN_OPTIMAL`, `UNSAT`, `TIMEOUT`, `INPUT_ERROR`.
- **Speed (measured)**: CP-SAT proves optimality on KHMT-size cases in under 3 s (0.4 s for the
  demo student, 2026-11-28). The ASP engine finds plans with the same shared-goal values but no
  longer proves optimality on KHMT-size cases within 180 s (PLANNER-PARITY.md 3).

<a id="f-04"></a>
### F-04. Degree audit

Mandatory courses, elective groups by credits and/or course count, specialization lists,
free-elective slots, graduation-course thresholds, 0-credit courses as external requirements
(CONSTRAINTS.md H2, H3, H12, H13, H15, HC). Elective surplus counts toward the free elective
(CP-SAT; myBK "used for free elective"); the ASP engine plans only courses that count toward a
group (an open parity issue).

<a id="f-05"></a>
### F-05. What-if requests

A student changes any of these and solves again; the planner checks the plan and reports what
is met. Only pressing **Solve** calls the solver (W6, W10, 23/11): a course the student moves on
the plan becomes a pin, and the solver re-plans the rest.

| # | What-if | Hard / soft | Field | Solvers |
|---|---|---|---|---|
| E1 | In-progress course passes or fails; the block of a course | Hard | `in_progress_results`; `student.block_overrides` | both |
| E2 | Pin a course to a term, including a retake of a passed course (improvement) | Hard (absolute with `rules.pins_absolute`) | `locked` | both; absolute pins and improvement retakes CP-SAT only |
| E3 | Credits wanted per term | Soft, highest (ST), ±2 | `semester_targets` | CP-SAT |
| E4 | Which summers to study | Hard | `summer_opt_in` | both |
| E5 | Skip a regular term | Hard; two consecutive skipped regular terms warn | `skip_semesters` | both |
| E6 | Assume a pass or a failure: in-progress courses, and future planned courses (W1) | Hard | `in_progress_results`, `assumed_fail` | both; `assumed_fail` CP-SAT only |
| E7 | A course is / is not offered in a term | Not offered: hard; "is offered" lifts the summer-history rule and the OH warning (W2) | `not_offered`, `offered` | both; `offered` CP-SAT only |
| E8 | Goal order: rank and switch goals | Soft | `preferences.order`, `preferences.disabled` | both |
| E9 | Budget (tuition cap) | Later (W3) | — | — |
| E10 | Pick a course in an elective block; type any course into the free elective | Hard | `locked`, `preferences.wanted_courses`, `student.free_choices` | both |
| — | Finish by a term | Hard | `graduate_by` | both |
| — | Maximum credits for every term / per-term bounds | Hard | `max_credits`, `semester_limits` | both |
| — | Freeze a term (no unpinned course) | Hard | `frozen_semesters` (removed from the page, W13) | CP-SAT |
| — | Compare with a previous plan | Soft (S3) and report | `previous_plan` → `diff_vs_previous` | both |
| — | Interests | Soft (TA) | `interests` | ASP |

The web page saves up to 10 plans per account with their what-if settings (one starred plan is
the baseline, W7), and compares two saved plans, or a plan with the official teaching plan,
**without calling the solver** (12.7, 23/11): graduation term (earlier is better), regular terms
outside 15–18 credits (except the last), heaviest regular term, summer credits (not ranked),
mandatory courses later than the official plan (only courses with a recommended term: 37/96 in
KHMT 2023), number of warnings; plus the differing what-if settings and the courses that moved.

<a id="f-06"></a>
### F-06. Independent validation

`evaluation/validate.py` re-checks every returned plan in plain Python. It shares no rule code
with the solvers (only `normalize.py`). It checks future terms, unknown courses, double placement, re-planning a passed course, prerequisites, corequisites, offering,
locks, deadline, course level (cohort or credits), summer rules, graduation thresholds, credits
per term, free-elective slots, mandatory courses and elective groups. Any violation is returned
in `violations`; the web shows it as a red warning (a non-empty list means a solver bug). With
absolute pins, violations on pinned courses become warnings.

<a id="f-07"></a>
### F-07. Why there is no plan, and why a target was missed

- **UNSAT** (`_explain_unsat`, `planner/cli.py`): removes the student's choices one at a time
  (unpin, do not skip, reopen a closed course, drop a credit target, drop an assumed failure,
  assume a pass, open a summer, drop the deadline, unfreeze, drop credit caps) and returns every
  removal that gives a plan, as `infeasible_reason` and one-click `infeasible_fixes`. If none
  helps, relaxes each school rule (course level, graduation thresholds, prerequisites and
  corequisites) to say which one blocks.
- **Missed credit target** (`_explain_targets`, T53, 23/11), for up to 2 terms: in the last term,
  "only N credits are left"; otherwise re-solve with the target as a hard minimum and name the
  student choice, or the school rule, that prevents it.

<a id="f-08"></a>
### F-08. Warnings and the request report

`warning_items` (structured, for the page; `warnings` keeps the plain text), each with a
`rule` reference (T56):

| Kind | When | Rule |
|---|---|---|
| `english` | The thesis is planned and the student has not met the Listening–Reading standard | QĐ 285 PL7 |
| `mos` | The thesis is planned, cohort ≥ 2021, no MOS | QĐ 285 PL9 |
| `limit` | A student cap below the regular minimum | QĐ 285 Đ15.3 |
| `corequisite` | A course in the same term as its corequisite | QĐ 285 Đ2.1 |
| `low_credits` | A regular term below the minimum (never padded), except the last term, which may be lighter (28/11) | QĐ 285 Đ15.3, Đ37.2 |
| `skip_consecutive` | Two consecutive skipped regular terms | QĐ 285 Đ32.1 |
| `target_over_law` | A credit target above 25 (regular) or 12 (summer) | QĐ 285 Đ15.3 (11–25 is the team's) |
| `offering_history` | A placement in a term part where the course has not run (soft history) | Team (not a regulation) |

`english`, `mos` and `offering_history` carry a `confirm` action: the student confirms (e.g.
already has the certificate, the course is offered) and the warning goes away. The **request
report** (`requests`) gives one row per student request (pin, frozen term, skipped term, target,
wanted course, deadline, not-offered course): `met`, `warning` (met but against a school rule,
with which rule), `partial` or `unmet`, with the reason: no request is silently dropped (sprint
11). Each solver also warns about input fields it does not implement (F-14).

<a id="f-09"></a>
### F-09. Soft-goal report

`preferences_report`: S1 graduation term; S6 kept or the broken pairs (with the hint "keep
recommendations first" when S6 ranks below S1); S4 per wanted course; S2 total credits; and,
when active, S5 heaviest and lightest term, S7 summer loads against 6–9, S10 summer credits, S9
level-3+ courses in summer, S11 total shortfall against 11, S8 deviation from 15–18, S3 moved
courses.

<a id="f-10"></a>
### F-10. Course facts for client-side checks

`course_facts` (per course: prerequisites, corequisites, summer allowed, term parts) and
`credit_rules` (regular and summer maximum) let the page show, without calling the solver, which
terms a course may move to and why not (T61): "needs X first", "projects not in summer", "you
skip this term", "would exceed 25 credits".

<a id="f-11"></a>
### F-11. Relation snapshot and inferred relations

`instances/importers/hcmut/relations.py` snapshots the course relations of all programs
(`instances/hcmut/raw/relations-snapshot.json`, 19/11: 96 programs, 2,012 relations), reports
their consistency (493 courses in ≥ 2 programs; 371 with the same prerequisites/corequisites
everywhere, 122 differing) and can infer relations from other programs (≥ 50 % of the programs
having both courses). Inferred relations are **not used** when solving (reviewer, 19/11) unless
`scenario.use_inferred_relations`; the output lists courses without verified prerequisites
(`unverified_prerequisites`) and the inferred relations it would add.

<a id="f-12"></a>
### F-12. GPA, tuition, external requirements, majors (ASP)

From the policy and the full record in the input: GPA per scale with the retake grade cap and
latest-attempt selection (checked against the 7 hand-computed oracle students), best reachable
GPA and the average needed for 2.50; tuition per planned term; external requirements of
`policy/external.json` (missed, pending, blocking at graduation); majors the plan qualifies for.
In `engine_report`. CP-SAT does not compute these (recommendation in PLANNER-PARITY.md 4).

<a id="f-13"></a>
### F-13. Interests from course tags (ASP)

Course tags come from `instances/hcmut/course-tags.json` (written by `tag_classifier`; the list
of the student's program family, else the merged list). Each interest tag weighs 1; goal TA
maximizes the summed weights of planned electives' tags. An interest with no course in the
program is warned. `engine_report.interests` lists the planned courses per interest.

<a id="f-14"></a>
### F-14. Capability declarations and the goals-used note

Each solver declares the input fields and goal ids it implements (`CAPABILITIES`). A request
using something a solver lacks gets a warning ("asp ignores the input field
frozen_semesters…"), or a `FixtureError` with `strict=True`. Every result lists, as an
assumption, the goals that ranked it and the active goals the solver left out.

<a id="f-15"></a>
### F-15. Command-line entry point for the web backend

`python -m planner.cli --solver cpsat|clingo [--time-limit 30] < input.json`: the planner input
plus `scenario` and optional `previous_plan` on stdin, the result on stdout (USER-INPUT.md
part 4). Bad input gives status `INPUT_ERROR` with `error`, never a traceback; the exit code is 0
once JSON is printed. The web backend calls it per request (`PLANNER_DIR`, `PLANNER_PYTHON`,
`PLANNER_TIMEOUT_MS`, `PLANNER_DUMP_DIR`, all optional; 20 calls per minute per user). Students
use CP-SAT; the ASP option is hidden on the page (Q13).

<a id="f-16"></a>
### F-16. Solver registry

`planner/solvers/registry.py`: each solver adapter has `settings`, `fingerprint` (hash of its
sources and the shared planner code, part of the evaluation cache key), `solve` and
`stopped_by`; statuses map to OPTIMAL / FEASIBLE / INFEASIBLE / NO_PLAN. A plug-in loads with
`[solver] name = "package.module:factory"` (GUIDELINES.md 2).

---

## Hand-checked cases

Answers worked out by hand on the toy curriculum (`instances/toy`, 3–12 credits per term)
before the code, confirmed by the reviewer where marked; `planner/tests/test_cases_k.py` and
`test_real_khmt.py` run them on **both** solvers.

| Case | Input | Expected answer | Confirmed |
|---|---|---|---|
| K1 | Request `base` | Finishes in 271, 20 credits | 18/11 |
| K2 | Validator; CS202 failed (corequisite of CS301); hand plan CS301 in 262, CS202 retaken in 271 | Corequisite violation at CS301 (the web's former reading let it pass) | 18/11 |
| K2b | Solver, same input as K2 | CS202 in 262, with or before CS301; still 271, 23 credits | 18/11 |
| K3 | `base`, at most 9 credits a term | Finishes in 272 | 18/11 |
| K4 | `base`, wants EL303 | EL303 planned, still 271 | 18/11 |
| K5 | `base`, course levels on, cohort 2025 (26x = year 2, 27x = year 3) | 262 (year 2) may not hold level 3 (CS3xx, EL3xx) or 4 (CS401); MA201 needs MA102 passed first, so 262 holds only MA102 (3 credits). CS401 after CS301 (271 at the earliest), so **finishes in 272**, still 20 credits | 18/11 |
| K5b | As K5, cohort 2024 (26x = year 3) | As `base`: 271, 20 credits | 18/11 |
| K6 | `base`, CS401 as thesis at 85 %. Total = 30 mandatory + 6 elective = 36, so 31 credits needed | Counting through CS401's own term, CS401 excluded (23/11; every solver since 28/11): in 262 at most 16 + 10 = 26 < 31, in 271 up to 38, so **finishes in 271, 20 credits**. The validator rejects CS401 in 271 next to EL302 only (16 + 9 + 3 = 28). (Before: CP-SAT counted strictly before the term and gave 272) | Pending |
| K7 | `base`, S6 on, recommendation CS401 before EL302 | Kept without delay: drop EL302, take EL303 (with CS301 in 262) + EL304. **271, 20 credits**, S6 met, whichever S6 order | 18/11 |
| K7b | `base`, S6 on, recommendation CS401 before CS301 (a cycle with the prerequisite) | Must break; still 271, 20 credits; S6 **not met**, pair CS301–CS401 reported | 18/11 |
| K7c | `base`, S6 on, default order, recommendation MA102 before CS301 | MA102 failed: retake in 262 at the earliest; keeping it puts CS301 in 271 and CS401 in 272. Default S1 wins: **271, 20 credits**; S6 not met, pair MA102–CS301 | 18/11 |
| K7d | As K7c, `recommendations_first: true` | S6 wins: **272, 20 credits**, S6 met. E.g. 262 MA102, CS302 · 271 CS301, MA201, EL302, EL304 · 272 CS401; "one term later to keep recommendations" | 18/11 |
| K8 | `base` plus summer 263, at most 9 credits a term, summer **not** opted in | As K3: 272; 263 empty | Pending |
| K8b | As K8, summer 263 **opted in** | 262 and 271 hold 18 < 20, so the summer takes at least 2 credits. S9 above S7: levels 1–2 first, so MA201 or MA102 (3 credits) rather than CS401 (2, level 4). **271**, summer MA201 or MA102; S7 reports 3 credits, below 6–9 | Pending (answer changed 19/11 when S9 > S7) |
| K8d | As K8b, MA201 marked as a project (no summer) | Summer only MA102. **271** | Pending |
| K8c | As K8b, CS401 at 3 credits (21 in total, the summer must hold 3) | 3-credit courses allowed in summer: MA201, MA102 (levels 1–2) or EL3xx, CS401 (3–4). S9 picks levels 1–2: **271**, summer MA201 or MA102 | Pending |

Real program (KHMT 2023, made-up student): both solvers graduate in 262 with valid plans and
the same shared-goal values (2026-11-28; it was 271 before the thesis threshold counted its own
term). Earlier record: CP-SAT `OPTIMAL` in 440 ms; Clingo not proven after 30 s with the same
objective (18/11).

---

## Not supported, or out of scope

- Budget cap, interest-based goals on the web page, expected GPA from target grades (W3, W4, W9:
  later); SSO login to myBK.
- Equivalent and replacement courses; tuition, interests, GPA in CP-SAT (ASP only).
- A dedicated "skipping makes you exceed 12 regular terms" message (UNSAT offers "do not skip").
- Language standards per study year as a rule (reported as external requirements only).
- Grade prediction: every planned course is assumed passed.
- The planner never logs into myBK, never stores the original progress file, and never puts real
  names, student ids or grades in code or tests (made-up data only). AI advice does not use solver
  results.

## History

The web planner's project plan (stages 0–12, tasks T1–T66, review table, page and button specs,
myBK import decisions, the what-if UI design) is kept in git:
`git show feature/ui-redesign:docs/02-ke-hoach.md` and `git show
feature/ui-redesign:docs/04-luat-qd285.md`. Its planning rules, features and inputs are carried
into CONSTRAINTS.md, this file and USER-INPUT.md.
