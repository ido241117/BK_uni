# ASP planner pipeline

This folder turns three kinds of input into an optimal course plan:

1. **Ground truth** — curriculum, grading policy, graduation requirements and
   tuition policy, stored as JSON in `pipeline/data/`.
2. **Student record** — courses already taken, grades, external progress and
   optional planning preferences.
3. **Solver settings** — horizon, studied terms, load bounds, budget and the
   number of plans to return.

The Python layer compiles the data into ASP facts, the ASP layer models the
academic rules, and the Python layer turns the answer sets back into typed
plans and reports.

```
JSON data ──> data.py ──> translation.py ──> *.lp facts
                                                │
                                                ▼
                             clingo: encoding.lp
                                     extension.lp
                                     plan.lp
                                     + generated data files
                                                │
                                                ▼
                              engine.py ──> Solution / Plan
                                                │
                                                ▼
                              cli.py ──> text / Markdown / JSON / raw
```

---

## 1. File responsibilities

| File | Role | May contain |
| --- | --- | --- |
| `encoding.lp` | Stable, generic ASP core. Defines the set/map representation and generic `empty`, `subseteq`, `equal`, `card`, `sum`, `int` and `before` constraints. **Do not change.** | Rules only; no curriculum or school data. |
| `extension.lp` | Shared semantic base for any curriculum. Calendar, attempt history, retake/status rules, group and credit accounting, prerequisites/corequisites, offering, GPA. | Rules and constraints that use the data predicates below. No concrete course codes. |
| `plan.lp` | The school's planning model. Load bounds, regular-term contiguity, degree completion, milestone/GPA gates, tuition/budget, optimization order and display atoms. | School-specific rules and objective weights. No concrete course codes or credit values. |
| `cs-2023.lp` | Generated curriculum data. | Facts only. No rules and no constraints. |
| `policy.lp` | Generated university policy data: grading scales, grade rules, retake policy, graduation requirements, external requirements and tuition schedule. | Facts only. No rules and no constraints. |
| `student.lp` | Hand-written or generated student facts. | Facts only. |
| `data.py` | Typed input models, JSON loaders and validation. | Python. |
| `translation.py` | JSON / student record → ASP facts. | Python. |
| `engine.py` | Clingo runner and typed `Solution` / `Plan` output. | Python. |
| `cli.py` | Rendering and the runnable command-line entry point. | Python. |

The intended load order is:

```text
encoding.lp  policy.lp  extension.lp  cs-2023.lp  student.lp  plan.lp
```

`plan.lp` is last because it is the instance-level planning policy on top of the
generic core and the shared extension.

---

## 2. Input contract

### 2.1 Ground-truth JSON

`translation.py` reads four JSON files. Their schemas are validated in
`data.py`.

#### `curriculum.json`

Used for `cs-2023.lp`. Important fields:

- top-level `id`, `name`, `total_credits`, `default_major`, `majors`
- `courses[]`: `id`, `name`, `credits`, `level`, `offered_in`, `prerequisites`,
  `corequisites`
- `groups[]`: `id`, `type` (`mandatory` or elective), `course_ids`,
  `min_credits`, `max_credits`, `min_courses`, `max_courses`
- milestone course metadata (internship, specialized project, capstone)

The curriculum file describes **what exists**. It does not contain school
policy such as semester load, tuition or optimization weights.

#### `grading_policy.json`

Used for `policy.lp`. It supplies:

- grade symbols, passing/credit/GPA flags and provisional grades
- grade points per scale
- numeric GPA/score scales and their precision
- default scale and included course kinds
- retake eligibility grade, maximum attempts and retake grade cap
- rounding and GPA attempt-selection policy

All numeric values are compiled to fixed-point integers. For a scale with
precision `p`, the ASP value is `value × 10^p`. For example, a 4.00 GPA with
precision 2 is `400`.

#### `graduation_requirements.json`

Used for `policy.lp`. It supplies minimum total credits, minimum cumulative
GPA, named graduation requirements and external requirements/milestones.

The minimum GPA is emitted as `min_gpa(Scale, FixedPointValue)`. External
requirements are currently emitted for reporting only; see
[Current limitations](#8-current-limitations).

#### `tuition_policy.json`

Used for the tuition section of `policy.lp`. It supplies:

- currency and money unit
- program and semester-type matching
- flat or per-credit fee models
- piecewise credit tiers, including percentage discounts

The generated schedule is in fixed-point money units. With
`money_scale(1000)`, the fee `13750` means `13.750` in the policy's
`money_unit` (million VND in the current dataset).

> The CLI materializes the fee schedule for `--program` (default:
> `curriculum.default_major`). The current regular schedule is shared by
> Computer Science, DSE and ASE; summer applies to all programs. If programs
> acquire different schedules, the ASP contract needs a program dimension.
> A program name that matches no rule simply produces no fee for that term;
> validate it against `tuition_policy.json`.

### 2.2 Student input — `student.lp`

A student file is a set of ASP facts. `translation.py` has
`student_to_facts()` for the eventual JSON path; the CLI currently accepts a
ready-made `.lp` file through `--solve`.

#### Required facts

| Fact | Meaning |
| --- | --- |
| `taken(X, I).` | Attempt object `X` was enrolled in term `I`. History uses `I <= t`. |
| `map(g, X, G).` | Grade symbol of attempt `X`. |
| `result(X, passed).` / `result(X, failed).` | Direct status for pass/fail courses with no letter grade. |
| `attempt_count(E, N).` | Total kept attempts of base course `E`. Includes `W`. |
| `last_attempt(E, X).` | Attempt used for status/GPA. Normally the latest non-`W` attempt. |

`t` is the number of studied terms; the ASP file's `taken/2` facts must use
indices `1..t` only. An in-progress history attempt is `taken/2` without
`map(g,...)`; `extension.lp` treats it as unknown and optimistically credited.
Future attempts are not input: the planner generates `in/2` for them.

#### Attempt-object convention

- First attempt of course `co1005`: `co1005`
- Second attempt: `rt(co1005, 1)`
- Third attempt: `rt(co1005, 2)`

`attempt_count/2` counts the base attempt plus all retakes. `last_attempt/2`
points at the attempt whose grade determines the effective status and GPA.

#### Optional facts

| Fact | Meaning |
| --- | --- |
| `course_kind(X, Kind).` + `kind_known(X).` | Attempt kind (regular, summer, transfer, …). Only kinds in `included_course_kind/1` enter GPA. Without `kind_known`, `extension.lp` defaults the attempt to `regular`. |
| `request(E).` | Student asks to retake `E` even when it is not compulsory. |
| `offer(E, I).` / `closed(E, I).` | Registrar/student offering override. |
| `budget(B).` | Hard upper bound on future tuition, in fixed-point money units. |
| `avoid(E).` / `pref(E).` | Taste penalties/preferences used by the last objective level. |
| `external_progress(Requirement, Term, Amount).` | Progress on external requirements. Emitted by the JSON helper; not yet enforced. |
| `program(P).` | Optional program marker; the current tuition model does not consume it. |

### 2.3 Solver options

`SolverOptions` in `engine.py` maps to clingo constants:

| Option | Clingo constant | Meaning |
| --- | --- | --- |
| `horizon` | `n` | Last term index in the plan. |
| `studied_terms` | `t` | Number of fixed history terms. |
| `min_load`, `max_load` | `min_load`, `max_load` | Regular-term credit bounds. |
| `summer_min_load`, `summer_max_load` | `min_load_summer`, `max_load_summer` | Summer bounds. |
| `shift` | `shift` | Calendar parity shift for legacy `freq/3` offerings. |
| `term_offset` | `term_offset` | Offset of the three-term calendar in `policy.lp`. |
| `budget` | `budget/1` fact or option | Hard tuition cap. |
| `plans` | — | Number of optimal models to keep. |
| `seed` | `--seed` | Clingo random seed. |

Defaults come from `policy.lp`; an explicit `SolverOptions` value overrides the
corresponding `#const`.

---

## 3. Generated ASP data files

These files are generated. Edit the JSON and regenerate; do not hand-edit the
checked-in `.lp` files.

### 3.1 `cs-2023.lp` — curriculum facts

| Predicate | Meaning |
| --- | --- |
| `in(Course, Group).` | Course belongs to a curriculum group. |
| `map(c, Course, Credits).` | Course credit value. |
| `map(l, Group, Lower).` / `map(u, Group, Upper).` | Group credit bounds. |
| `map(min_courses, Group, N).` / `map(max_courses, Group, N).` | Optional course-count bounds. |
| `elective_group(Group).` | Group is an elective quota; `extension.lp` uses this to choose at most one quota bucket per credited course. |
| `course_level(Course, Level).` | Numeric level (1, 2, 3, …) used by the level-order objective. |
| `prereq(Course, Prereq).` | Direct prerequisite. |
| `prereq_group(Course, Group).` + `prereq_option(Course, Group, Option).` | Alternative prerequisite OR-group. |
| `coreq(Course, Coreq).` | Direct co-requisite. |
| `coreq_group(Course, Group).` + `coreq_option(Course, Group, Option).` | Alternative co-requisite OR-group. |
| `offered_in(Course, Type).` | Course is offered in `regular` or `summer`. |
| `freq(Course, Period, Offset).` | Legacy fall/spring parity; used only when `offered_in` is absent. |
| `milestone(Course, MinimumCredits).` | Credits that must be accumulated strictly before the milestone course. |

`cs-2023.lp` deliberately contains **no** `in(E, m)`, `group/1`, credit
accounting, prerequisite constraints or milestone constraints. Those are
generic and live in `extension.lp` / `plan.lp`.

### 3.2 `policy.lp` — university policy facts

| Predicate | Meaning |
| --- | --- |
| `#const maxtries`, `shift`, `term_offset` | Retake cap and calendar constants. |
| `#const min_load`, `max_load`, `min_load_summer`, `max_load_summer` | Default load bounds. |
| `scale(Scale, Min, Max).` | Fixed-point numeric scale. |
| `scale_precision(Scale, P).` / `scale_role(Scale, Role).` | Scale metadata. |
| `default_scale(Scale).` | Scale used for the hard GPA gate and the compatibility `gpa/1` atom. |
| `grade(G).` / `grade_symbol(G, Symbol).` | Grade symbols. |
| `grade_rank(G, Rank).` | Ordering used for retake caps. |
| `grade_passing(G).` / `grade_earns_credit(G).` / `grade_provisional(G).` | Status flags. |
| `grade_points(Scale, G, Points).` | Points on a named scale. |
| `grade_in_gpa(Scale, G).` | Grade participates in that scale's GPA. |
| `grade_points(G, Points).` / `grade_in_gpa(G).` | Backward-compatible aliases for the default scale. |
| `included_course_kind(Kind).` | Course kinds included in GPA. |
| `retake_eligibility(G).` / `retake_grade_cap(G).` | Improvement-retake eligibility and cap. |
| `graduation_requirement(Name).` / `(Name, Value).` | Graduation requirements for reporting. |
| `min_gpa(Scale, FixedPointValue).` | Hard minimum cumulative GPA. |
| `external_requirement(Id, Unit, Mode, Enforcement).` | External requirement metadata (currently report-only). |
| `external_milestone(Id, Deadline, Year, Minimum).` / `(Id, Deadline, Minimum).` | External milestone metadata. |
| `map(l, total_degree, N).` / `map(u, total_degree, N).` | Total-degree credit bound. |
| `money_scale(S).` / `money_currency(C).` / `money_unit(U).` | Tuition units. |
| `fee_rule(Type, flat, Min, Max, Fee).` / `fee_rule(Type, per_credit, Min, Max, Rate).` | Tuition schedule by semester type. |

### 3.3 `student.lp` — student facts

The current file is a sample record for `cs-2023.lp`. Real student records
should preserve the same predicate contract. In particular:

- history attempts are immutable input; they are not rescheduled;
- `W` remains in `attempt_count/2` and is a `withdrawn` status;
- `last_attempt/2` should prefer the latest non-`W` attempt;
- failed courses remain load-bearing and tuition-bearing but do not earn
  degree credit;
- only future terms (`I > t`) are selected by the planner.

---

## 4. What the ASP layer derives

### Calendar

Terms follow a three-term cycle:

```text
regular, regular, summer, regular, regular, summer, ...
```

`semester_type/2` is derived from `term_offset`. Regular terms must be
contiguous; summer is optional and may host any course offered in summer.
History terms are fixed and never selected.

### Attempts, status and retakes

For every attempt the engine derives:

- `status(X, passed | failed | pending | withdrawn | unknown)`
- `effective_grade(X, G)` after applying the retake cap
- `elig(E, failed | improve)` when another attempt is allowed
- `must(E)` for failed compulsory courses and explicit requests
- `rejected_request(E)` for requests that are no longer eligible

An improvement retake is optional and is penalized in the objective. A failed
compulsory course must be retaken when the student is still eligible.

### Credits, passing and degree progress

- `pass(E)` / `passed_course(E)` means passed in the transcript.
- `credited(E)` means credit is counted optimistically for the current plan,
  including future scheduled attempts and in-progress history.
- `in(E, ok(I))` is the per-term credited set.
- `in(E, credit(G))` is the requirement-bucket set.
- `credited_before(E, J)` is used by milestones and prerequisites so an
  improvement retake cannot double-count the same course.
- Failed courses count as attempted load and tuition but not as earned credit.
  `semester_earned/2` and `total_credit/1` use `ok`; `semester_credits/2` and
  `total_attempted/1` use all scheduled attempts.

### Groups and electives

Mandatory groups count all credited members. Elective quota buckets compete
for at most one bucket per credited course, so an extra passed elective is left
uncounted rather than violating a group upper bound. A course outside every
requirement group cannot be scheduled.

### Prerequisites, co-requisites and milestones

- Prerequisites must be credited in an earlier term.
- Co-requisites must be credited in the same or an earlier term.
- OR-groups require at least one alternative.
- Milestones require a minimum number of credits accumulated strictly before
  the milestone term.

### GPA

GPA is credit-weighted and uses the effective (latest/capped) attempt. Grades
with `grade_in_gpa(Scale, G)` contribute; course kinds outside
`included_course_kind/1` are excluded; provisional attempts are excluded.
Rounding is half-up once, at the end, using integer arithmetic.

The hard graduation gate uses `min_gpa(Scale, Min)` on the default scale.
Per-scale values are reported as `gpa(Scale, Value)`; the compatibility
`gpa/1` is the default-scale value.

### Tuition and budget

Only future terms with positive load are billed. `fee/2` selects the matching
flat or per-credit rule; `semester_fee/2` exposes it for output and Python
sums those atoms into the reported total. A `budget(B)` fact makes total future
tuition a hard upper bound. Without a budget, tuition is still minimized after
graduation and retake quality.

### Optimization order

Clingo objectives are lexicographic by level, highest first:

| Level | Name | Meaning |
| ---: | --- | --- |
| `@6` | `last_semester` | Earliest last used term / earliest graduation. |
| `@5` | `retakes` | Earliest retake of failed compulsory courses; voluntary retakes penalized. |
| `@4` | `cost` | Minimum future tuition. |
| `@3` | `level_order` | Lower-level courses earlier. |
| `@2` | `balance` | Minimum heaviest future semester. |
| `@1` | `taste` | Avoid disliked electives; prefer liked ones. |

---

## 5. Output contract

### 5.1 Clingo answer-set atoms

The stable display surface is declared at the bottom of `plan.lp`:

| Atom | Meaning |
| --- | --- |
| `plan(Course, Term).` | A future scheduled attempt. Retakes appear as `rt(course, K)`. |
| `semester_credits(Term, Credits).` | Attempted load. |
| `semester_earned(Term, Credits).` | Earned degree credit. |
| `semester_fee(Term, Fee).` | Fixed-point tuition. |
| `total_planned(Credits).` | Future attempted credits. |
| `total_attempted(Credits).` | Alias of `total_planned`. |
| `total_credit(Credits).` | Cumulative earned credits (history + plan). |
| `degree_complete.` | Present when the plan satisfies the completion test. |
| `pass(Course).` / `passed_course(Course).` | Transcript pass. |
| `credited(Course).` | Optimistically credited. |
| `pending(Course).` | Provisional/in-progress. |
| `must(Course).` | Compulsory course that must be retaken. |
| `elig(Course, Kind).` | Retake eligibility. |
| `rejected_request(Course).` | Requested retake that is not eligible. |
| `gpa(Value).` / `gpa(Scale, Value).` | Default-scale and per-scale GPA. |
| `semester_type(Term, Type).` | `regular` or `summer`. |

Data/reporting atoms such as `external_requirement/4` and `milestone/2` are not
on the display surface. They are available to rules and can be added to
`#show` if a report needs them.

### 5.2 Python `Plan` output

`engine.py` converts each answer set into:

```text
Plan
  history[]          term, credits
  semesters[]        term, type, credits, earned, fee, cumulative, courses[]
  total_planned      future attempted credits
  total_attempted    alias of total_planned
  total_credit       cumulative earned credits
  total_degree       curriculum requirement
  total_cost         sum of semester_fee (fixed-point money)
  degree_complete    bool
  gpa                default-scale fixed-point GPA
  gpa_by_scale       map scale id -> fixed-point GPA
  must[]             retake-required courses
  passed[]           transcript passes
  credited[]         optimistically credited courses
  pending[]          in-progress courses
  objective          six labelled objective values
  objective_vector   raw clingo objective vector
  priority           clingo priority levels
  optimal            true when optimality is proven
  status             SATISFIABLE / UNSATISFIABLE / UNKNOWN
```

`PlannedCourse` is `code`, `name`, `credits`, and `retake` (the retake number,
or `None`).

### 5.3 CLI formats

```text
--format text       human-readable terms and courses
--format markdown   Markdown report
--format json       Plan.to_dict() array
--format raw        raw answer sets plus labelled objective
```

Reports default to `<student>-plan.<extension>` next to the student file.
`--no-report` prints only.

### 5.4 Units and status

- **Credits:** integers.
- **GPA and score:** fixed-point integers. Read `scale_precision/2` to render.
- **Money:** fixed-point integers. Read `money_scale/1`,
  `money_currency/1` and `money_unit/1` to render.
- **Objective:** a list ordered by descending priority; use
  `Solution.labelled_objective()` rather than positional assumptions.
- **`UNSATISFIABLE`:** no plan satisfies the hard constraints (for example a
  failing GPA below `min_gpa`, an impossible prerequisite chain, or a budget
  that cannot cover the required load).
- **`optimal`:** false when the solver was interrupted or did not finish the
  optimization proof; the plan is still a valid answer set.

---

## 6. Consistency rules

These are the invariants the files are expected to maintain.

1. `encoding.lp` remains generic and unchanged.
2. `cs-2023.lp` and `policy.lp` contain **facts only**.
3. `extension.lp` contains generic rules; no concrete course codes.
4. `plan.lp` contains school-specific rules and may use policy constants, but
   no concrete course codes or credit values.
5. Any predicate read by `extension.lp` or `plan.lp` must be emitted by the
   data files:
   - group membership and bounds from `cs-2023.lp`
   - `map(c,...)`, `elective_group/1`, `prereq*`, `coreq*`, `offered_in/2`,
     `milestone/2`
   - scales, grades, retake policy, `min_gpa/2`, load constants and
     `fee_rule/5` from `policy.lp`
   - `taken/2`, `map(g,...)`, `attempt_count/2`, `last_attempt/2` from
     `student.lp`
6. Generated files are one-way products of the JSON loader. Re-run
   `python -m pipeline.engine.asp.cli` (or the local `cli.py`) after changing
   the JSON.

---

## 7. Example

A minimal student file:

```prolog
taken((co1005; co1023), 1).
map(g, co1005, b_plus).
map(g, co1023, c).
attempt_count(co1005, 1).
attempt_count(co1023, 1).
last_attempt(co1005, co1005).
last_attempt(co1023, co1023).
budget(150000).
```

The answer set then contains illustrative facts of the form:

```prolog
plan(co2001, 3).
semester_credits(3, 18).
semester_earned(3, 18).
semester_fee(3, 13750).
total_planned(112).
total_credit(128).
degree_complete.
gpa(312).
```

The exact facts depend on the curriculum, history and horizon. `total_cost` is
computed by the Python layer from `semester_fee/2`; it is intentionally not
materialized in ASP because a `total_cost/1` set over a 12-term horizon grounds
every possible intermediate sum and is unnecessarily expensive.

---

## 8. Current limitations

- **Student JSON CLI is not fully wired.** `student_to_facts()` and
  `StudentFacts` exist (and emit `budget/1`), but the CLI currently takes
  `--solve student.lp`. `--student-json` / `--student-id` are not yet exposed.
- **External requirements are report-only.** `external_requirement/4`,
  `external_milestone/3,4` and `external_progress/3` are emitted, but no hard
  constraint uses them. A blocking external requirement therefore does not
  make a plan UNSAT.
- **`objective_scale` is accepted by `SolverOptions` but not consumed by
  `plan.lp`.** GPA selection currently affects reporting and the default-scale
  hard GPA gate only.
- **Tuition has no program dimension in ASP.** `policy.lp` materializes one
  fee schedule (currently the default major). This is sufficient while all
  regular programs share the same tiers; divergent programs need a
  `program/1` + `fee_rule/6` design.
- **Real-data solving can be expensive.** Grounding is fast (about 1.3 s for
  `n=12`), but the optimization search for the full 128-credit curriculum may
  exceed a one-minute interactive budget. Use a realistic horizon, a plan
  limit, or increase the solver timeout.
