# ASP planner pipeline

This folder turns three kinds of input into up to `k` course plans (one by
default; pass `--plans 3` for alternatives), optimized when a proof is
available and honestly labelled otherwise:

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
                        clingo: encoding.lp + extension.lp
                                + generated policy/curriculum files
                                + core/translate.lp + student.lp
                                + core/optimize.lp
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
| `extension.lp` | Shared semantic base for any curriculum. Calendar and term parts, attempt history, retake/status rules, load bounds and regular-term contiguity, group and credit accounting, majors, prerequisites/corequisites, offering, milestones, degree completion, external requirements/readiness, GPA, tuition, pins/bans, fills-next terms, typical terms, interests/tags/popularity, elective slots and symmetry breaking. | Rules and constraints that use the data predicates below. No concrete course codes. |
| `core/translate.lp` | Student-input boundary. The only file that reads the raw student record; it converts transcript facts into the attempt/set vocabulary used by `extension.lp` and `core/optimize.lp`. | Rules only; no curriculum or school data. |
| `core/optimize.lp` | The school's optimization order (eight weighted `#minimize` levels) and the stable `#show` display surface. | Objective weights and display rules. No concrete course codes or credit values. |
| `<curriculum-id>.lp` | Generated curriculum data. The file name follows `curriculum.json`'s `id` (`cs_2023` → `cs-2023.lp`); the current dataset is `cs-2023.lp`. | Facts only. No rules and no constraints. |
| `policy.lp` | Generated university policy data: academic calendar and term types, load bounds, grading scales, grade rules, retake policy, graduation requirements, external requirements and the tuition schedule selected for one program. | Facts only. No rules and no constraints. |
| `student.lp` | Hand-written or generated student facts. | Facts only. |
| `data.py` | Typed input models, JSON loaders and validation. | Python. |
| `translation.py` | JSON / student record → ASP facts. | Python. |
| `engine.py` | Clingo runner and typed `Solution` / `Plan` output. | Python. |
| `cli.py` | Fact generation, rendering and the runnable command-line entry point. | Python. |

The intended load order is:

```text
encoding.lp  extension.lp  policy.lp  <curriculum-id>.lp
core/translate.lp  student.lp  core/optimize.lp
```

The generic core and shared semantics come first, followed by the generated
policy and curriculum facts. `core/translate.lp` then turns the raw student
record into the engine vocabulary, and `core/optimize.lp` supplies the objective
order and display atoms.

---

## 2. Input contract

### 2.1 Ground-truth JSON

`cli.py` reads four JSON files. Their schemas are validated in `data.py` and
`translation.py`.

#### `curriculum.json`

Used to generate the curriculum ASP file. The output name is derived from the
curriculum `id` unless `--output` or an explicit `file_stem`/`slug` overrides
it. Important fields:

- top-level `schema_version`, `id`, `name`, `program`, `total_credits`,
  `default_major`, `planning`, `milestones`, `equivalents`, `majors`, and an
  optional `file_stem`/`slug`
- `courses[]`: `id`, `name`, `credits`, optional `level`, `prerequisites`,
  `corequisites`, `offered_terms`, and the optional planning attributes
  `tags`, `typical_regular_term`, `fills_next_term` and `note`
- `groups[]`: `id`, `type` (`mandatory` or `elective`), `course_ids`,
  `min_credits`, `max_credits`, `min_courses`, `max_courses`
- `majors[]`: `id`, `name`, and a `rule` with `type: "required_courses"`,
  `min_courses` and `course_ids`
- `planning`: `min_load`, `max_load`, `summer_min_load`, `summer_max_load` and
  a suggested `horizon`
- `milestones`: `{course, min_credits}` or
  `{course, min_credit_percent}`
- `equivalents`: `{old_code: canonical_code}`

`offered_terms` uses the three-part academic year:

- `1` = first regular term (fall)
- `2` = second regular term (spring)
- `3` = summer

A missing or empty `offered_terms` means "offered in every part". The course
level is not a JSON field; the translator derives it from the first digit in
the course id (`CO2001` → level 2). The curriculum file describes **what
exists**. It does not contain school policy such as load bounds, tuition or
optimization weights.

`planning.min_load` and friends are compiled into `policy.lp`. The suggested
`planning.horizon` is the number of **future** terms after the studied terms.
`translation.planning_horizon()` returns `studied_terms + horizon`; the CLI
uses that value by default when neither `--semesters` nor `--future-terms` is
given. `--semesters` sets the absolute last term index, while
`--future-terms` overrides only the number of terms after `--t`.

#### `elective_popularity.json` (optional)

Historical enrollment counts per elective (`--popularity`, default
`pipeline/data/elective_popularity.json`; skipped when missing). Compiled into
`popularity/2` facts in the curriculum file. The checked-in file is a
**placeholder**: every count is `null`, so it emits no facts and the
popularity objective is inactive.

#### `grading_policy.json`

Used for `policy.lp`. It supplies:

- grade symbols and passing/credit/GPA flags
- grade points per scale and their rank on the transcript scale
- numeric GPA/score scales and their precision
- default scale and included course kinds
- rounding policy and GPA attempt-selection mode
- optional retake grade cap

All numeric values are compiled to fixed-point integers. For a scale with
precision `p`, the ASP value is `value × 10^p`. For example, a 4.00 GPA with
precision 2 is `400`. Score bands may be represented by their midpoint (for
example `8.5..9.49` → `9.00` on the 10-point scale).

The ASP implementation supports `gpa_attempt_selection: "latest"` (default),
`"best"` (also accepted as `"highest"` or `"highest_grade"`), and
`equivalence: "use_course_equivalents"`. Other values are rejected rather than
silently producing different semantics. A retake can also be capped by
`retake.grade_cap` (`applies_to: "retakes"`, `max_grade: "B"` in the current
dataset); the cap lowers a better retake grade before GPA selection.

#### `graduation_requirements.json`

Used for `policy.lp`. It supplies minimum total credits, minimum cumulative
GPA, named graduation requirements and external requirements/milestones.

- `min_total_credits` becomes the lower and upper bound of `total_degree`.
- `min_cumulative_gpa` becomes `min_gpa(Scale, FixedPointValue)` on the default
  scale.
- `all_groups_satisfied` is implicit in the group accounting rules.
- External requirements become `external_requirement/4` and
  `external_milestone/3,4`. A blocking graduation milestone and a blocking
  end-of-year deadline that has already passed prevent `ready_to_graduate`;
  a future deadline is reported as `ext_pending/3`.

#### `tuition_policy.json`

Used for the tuition section of `policy.lp`. It supplies:

- currency, money unit and fixed-point `precision`
- program and semester-type matching
- flat or per-credit fee models
- piecewise credit tiers, including percentage discounts and surcharges over
  a covered load

The generated schedule is in fixed-point money units. With
`money_scale(1000)`, the fee `13750` means `13.750` in the policy's
`money_unit` (million VND in the current dataset).

> The CLI materializes the fee schedule for `--program` (default:
> `curriculum.default_major`). A rule may list several program names or major
> ids; `"*"` matches every program. Every semester type the planner can use
> must have exactly one matching rule, otherwise generation fails. The ASP
> layer has no program dimension, so one `policy.lp` describes one program's
> tuition schedule. If programs acquire different schedules, generate a
> separate policy file per program or add a program dimension to the fee
> contract.

### 2.2 Student input — `student.lp`

A student file is a set of ASP facts. `translation.py` has
`student_to_facts()` and `StudentFacts` for the JSON path. The CLI accepts
either a ready-made `.lp` file through `--solve` or a record from
`student_history.json` through `--student-json` (optionally select one with
`--student-id`).

#### Core facts

| Fact | Meaning |
| --- | --- |
| `taken(X, I).` | Attempt object `X` was enrolled in term `I`. History uses `I <= t`. |
| `map(g, X, G).` | Grade symbol of a graded attempt. |
| `result(X, passed).` / `result(X, failed).` | Direct status for pass/fail courses with no letter grade; use instead of `map(g,...)`. |
| `attempt_count(E, N).` | Total recorded attempts of base course `E`. |
| `last_attempt(E, X).` | Latest attempt; drives pass/fail status and retake generation. |

`t` is the number of studied terms; the ASP file's `taken/2` facts must use
indices `1..t` only. The CLI infers `t` from the largest `taken/2` term, so
`--t` is optional; an explicit value smaller than that term is rejected because
those attempts would be treated as future courses (the `taken(_, I), I > t`
constraint makes the instance unsatisfiable). An in-progress history attempt is
`taken/2` without `map(g,...)`; `extension.lp` treats it as unknown and
optimistically credited. Future attempts are not input: the planner generates
`in/2` for them.

#### Attempt-object convention

- First attempt of course `co1005`: `co1005`
- Second attempt: `rt(co1005, 1)`
- Third attempt: `rt(co1005, 2)`

`attempt_count/2` counts the base attempt plus all retakes. `last_attempt/2`
points at the attempt whose transcript status determines pass/fail and retake
generation. A `gpa_last/2` fact may additionally point at the latest attempt
with a final letter grade; it skips in-progress attempts. In `latest` mode,
when any `gpa_last/2` fact is present, the GPA layer uses that selection for
every course; otherwise it falls back to `last_attempt/2` (useful for old
hand-written student files). In `best` mode the GPA layer derives the highest
effective grade from all recorded attempts and does not depend on
`gpa_last/2`.

Every recorded attempt is kept. There is no eligibility threshold or attempt
limit, so a course may be retaken at any time. A retake that improves the
grade is capped by the policy's `retake.grade_cap` before GPA selection. In
`latest` mode the latest graded attempt supplies the course's GPA grade; in
`best` mode the attempt with the highest effective (capped) grade wins, with a
later attempt breaking ties. Credit is earned once per course and is not lost
by a later failed retake.

#### Optional facts

| Fact | Meaning |
| --- | --- |
| `enroll_part_in(Q).` | Term part (`1`, `2` or `3`) of the student's enrollment term. Defaults to `1`. It decides the calendar phase. |
| `course_kind(X, Kind).` + `kind_known(X).` | Attempt kind (regular, summer, transfer, …). Only kinds in `included_course_kind/1` enter GPA. Without `kind_known`, `extension.lp` defaults the attempt to `regular`. |
| `student_major(M).` | Declared major atom; the plan must earn it. |
| `request(E).` | Student asks to retake `E` even when it is not compulsory. |
| `offer(E, I).` / `closed(E, I).` | Registrar/student offering override. |
| `budget(B).` | Hard upper bound on future tuition, in fixed-point money units. |
| `interest(K, W).` | Keyword weight, `W` in −10..10. An elective's score is the sum of the weights of its tags (course `tags`, its major lists, its own id). Maximized at `@1`. |
| `pin(E, I).` | Hard: course `E` is scheduled in future term `I` (and is available there). |
| `ban(E).` / `ban(E, I).` | Hard: course `E` is not scheduled at all / not in future term `I`. |
| `external_progress(Requirement, Term, Amount).` | Cumulative progress on an external requirement, dated by term. Emitted by the JSON helper. |

#### JSON helper

`student_to_facts()` understands `student_history.json`. The row-oriented
schema v2 keeps `students[]`, `attempts[]`, `external_progress[]` and
`expected[]` as separate tables linked by `student_id`; the loader folds those
rows back into one record (legacy nested v1 files are still accepted). A record
provides `student_id`, `enrollment_term`, `attempts[]`, `as_of_term` (or
`expected.as_of_term`), `program`, `major`, `budget`, `external_progress[]`,
`request[]`, `interests`, `pin[]`, `ban[]`, `offer[]`
and `closed[]`. See `pipeline/docs/USER-INPUT.md` for every field. It resolves
course equivalents, validates grades and courses, numbers retakes, and emits
`enroll_part_in/1`, `gpa_last/2` and `student_major/1`. A budget is converted
to fixed-point money with the tuition policy's `precision`.

### 2.3 Solver options

`SolverOptions` in `engine.py` maps to clingo constants:

| Option | Clingo constant | Meaning |
| --- | --- | --- |
| `horizon` | `n` | Last term index in the plan (`--semesters`). |
| `studied_terms` | `t` | Number of fixed history terms (`--t`). |
| `min_load`, `max_load` | `min_load`, `max_load` | Regular-term credit bounds. |
| `summer_min_load`, `summer_max_load` | `min_load_summer`, `max_load_summer` | Summer bounds; when unset they follow `min_load` / `max_load`. |
| `allow_summer` | `extra_sem` | Opt into optional extra terms (summer) with `-c extra_sem=1`. Off by default: extra terms stay empty unless enabled. |
| `budget` | `budget/1` fact | Hard tuition cap. |
| `plans` | — | Number of distinct plans to return (`--plans`; CLI default 1, `SolverOptions` default 3; 0 = all models). Optimized mode fills missing slots only with `fill=True`. |
| `opt_mode` | `--opt-mode` | `optN` proves optimality and enumerates up to `plans` optimal plans (default), `opt` is a compatibility alias for `optN`, `ignore` returns up to `plans` models without optimizing. |
| `time_limit` | `--time-limit` | Soft wall-clock search limit in seconds. The CLI uses 30 seconds by default for optimized modes when `--plans > 0`; `--time-limit 0` disables the limit. Returns the best models found with `optimal=false` unless optimality was already proven. A real CLI run also supervises the solve in a child process with a hard wall clock (the limit plus a small grace) so a long clingo propagation step cannot hang the command. |
| `fill` | `--fill` | When fewer than `plans` optimal plans exist, add distinct non-optimal models and mark them `optimal=false`. Off by default in the CLI; the engine's `SolverOptions` default is on for programmatic callers. |
| `progress` | `--progress` | Print candidate/optimal objectives, grounding time and time-limit events to stderr. |
| `seed` | `--seed` | Clingo random seed. |
| `shift` | `shift` | Legacy calendar shift. It is accepted and passed through, but no current rule consumes it. |
| `objective_scale` | `objective_scale/1` fact | Accepted but not consumed by `core/optimize.lp`; see [Current limitations](#8-current-limitations). |
| `extra_args` | — | Additional raw clingo arguments. Set `opt_mode` through `SolverOptions`, not here. |

Defaults come from `policy.lp`; an explicit `SolverOptions` value overrides the
corresponding `#const`. The calendar is derived from `enroll_part_in(Q)`,
`term_parts/1` and `term_part_type/2` rather than from a global term offset.
Terms whose type is in `extra_semester_type/1` are additionally gated by
`extra_sem`, which only `allow_summer=True` raises to `1`.

Only `opt_mode="optN"` and its alias `opt_mode="opt"` can set
`Solution.optimal` to `True`; both require an optimality proof. They return up
to `plans` proven-optimal plans. If fewer distinct optimal plans exist, the
remaining slots stay empty unless `--fill` is given; with `--fill`, they are
filled with non-optimal models found during the search (and, for a completed
proof, a short unoptimized enumeration), all marked `optimal=false`. `ignore`
never proves optimality, so its plans are reported as **unoptimized**.
`time_limit` cancels the asynchronous clingo search; returned models are the
best seen before the deadline and are marked not proven optimal unless
optimality was already established. The engine limit is checked between
propagation steps, so a real CLI run also starts a supervising process that
kills the solve if it exceeds the limit plus a small grace. If that hard limit
is reached before any model is printed, the CLI exits with code 4.
`progress=True` is useful for long searches because it prints each improving
objective as the search advances. Each `Solution` and `Plan` carries `runtime`
/ `runtime_seconds`, the wall-clock time spent in grounding and solving.

---

## 3. Generated ASP data files

These files are generated. Edit the JSON and regenerate; do not hand-edit the
checked-in `.lp` files.

### 3.1 `<curriculum-id>.lp` — curriculum facts

The checked-in `cs-2023.lp` is the generated file for `curriculum.id =
"cs_2023"`. A different curriculum id produces a different file name; the
header records the curriculum id, display name and default file name.

| Predicate | Meaning |
| --- | --- |
| `in(Course, Group).` | Course belongs to a curriculum group. |
| `map(c, Course, Credits).` | Course credit value. |
| `map(l, Group, Lower).` / `map(u, Group, Upper).` | Group credit bounds. |
| `map(min_courses, Group, N).` / `map(max_courses, Group, N).` | Course-count bounds, emitted only when they add information beyond the credit bounds. |
| `elective_group(Group).` | Group is an elective quota; `extension.lp` uses this to choose at most one quota bucket per credited course. |
| `course_level(Course, Level).` | Numeric level used by the level-order objective. The optional course field `level` wins; otherwise the first digit of the course id is used. |
| `prereq(Course, Prereq).` | Direct prerequisite. |
| `prereq_group(Course, Group).` + `prereq_option(Course, Group, Option).` | Alternative prerequisite OR-group. |
| `coreq(Course, Coreq).` | Direct co-requisite. |
| `coreq_group(Course, Group).` + `coreq_option(Course, Group, Option).` | Alternative co-requisite OR-group. |
| `offered_slot(Course, Part).` | Course runs in term part `1` (fall), `2` (spring) or `3` (summer) of every academic year. A course with no declaration is always offered. |
| `major(Major).` / `major_min(Major, K).` / `major_course(Major, Course).` | Major-determination rule: earn at least `K` courses from the list. |
| `milestone(Course, MinimumCredits).` | Credits that must be accumulated strictly before the milestone course. |
| `tag(Course, Keyword).` | Keyword from the course `tags` field (major lists and course ids are added as tags in `extension.lp`). |
| `typical_term(Course, K).` | Course is usually taken in the K-th regular term (`typical_regular_term`). |
| `fills_next(Course).` | Course also occupies the following term (`fills_next_term`). |
| `map(note, Course, "Text").` | Note shown whenever the course is planned. |
| `popularity(Course, Count).` | Historical enrollment count from `elective_popularity.json`. |
| `elective_class(Course, Class, Rank).` | Interchangeable electives (identical curriculum facts), used for symmetry breaking and slot options. |

The generated curriculum file deliberately contains **no** `in(E, m)`, `group/1`, credit
accounting, prerequisite constraints or milestone constraints. Those are
generic and live in `extension.lp`; the objectives that consume them live in
`core/optimize.lp`.

### 3.2 `policy.lp` — university policy facts

| Predicate | Meaning |
| --- | --- |
| `#const min_load`, `max_load`, `min_load_summer`, `max_load_summer` | Load bounds from `curriculum.planning`. |
| `term_parts(N).` | Number of parts in an academic year (currently 3). |
| `term_part_type(Part, Type).` | Term type at each part (`regular`, `regular`, `summer`). |
| `extra_semester_type(Type).` | Term types that are optional extra terms. They stay empty unless the run passes `-c extra_sem=1`. |
| `load_bound(Type, MinConstant, MaxConstant).` | Per-term-type load bounds, referencing the load constants. |
| `scale(Scale, Min, Max).` | Fixed-point numeric scale. |
| `scale_precision(Scale, P).` / `scale_role(Scale, Role).` | Scale metadata. |
| `default_scale(Scale).` | Scale used for GPA target reporting and the compatibility `gpa/1` atom. |
| `grade(G).` / `grade_symbol(G, Symbol).` | Grade symbols. |
| `grade_passing(G).` / `grade_earns_credit(G).` | Status flags. |
| `grade_points(Scale, G, Points).` | Points on a named scale. |
| `grade_in_gpa(Scale, G).` | Grade participates in that scale's GPA. |
| `grade_rank(G, Rank).` | Transcript order, lower is better; used by the retake cap. |
| `grade_points(G, Points).` / `grade_in_gpa(G).` | Backward-compatible aliases for the default scale. |
| `included_course_kind(Kind).` | Course kinds included in GPA. |
| `gpa_attempt_selection(Mode).` | `latest` or `best` GPA attempt selection. |
| `retake_grade_cap(G).` | Optional cap on a retake's effective grade. |
| `graduation_requirement(Name).` / `(Name, Value).` | Graduation requirements for reporting. |
| `min_gpa(Scale, FixedPointValue).` | Minimum cumulative GPA target. |
| `external_requirement(Id, Unit, Mode, Enforcement).` | External requirement metadata. |
| `external_milestone(Id, Deadline, Year, Minimum).` / `(Id, Deadline, Minimum).` | External milestone metadata. |
| `map(l, total_degree, N).` / `map(u, total_degree, N).` | Total-degree credit bound. |
| `money_scale(S).` / `money_currency(C).` / `money_unit(U).` | Tuition units. |
| `fee_rule(Type, Min, Max, Base, Rate, Over).` | Tuition tier: for `Min <= credits <= Max`, the fee is `Base + Rate × max(0, credits − Over)`. A flat tier has `Rate = 0`; a per-credit-on-everything tier has `Base = 0` and `Over = 0`. |

The current regular schedule is compiled as:

```prolog
fee_rule(regular,  0,   6,  7563,   0,  0).
fee_rule(regular,  7,   9,  9625,   0,  0).
fee_rule(regular, 10,  12, 11688,   0,  0).
fee_rule(regular, 13,  18, 13750,   0,  0).
fee_rule(regular, 19, 999, 13750, 805, 18).
fee_rule(summer,   0, 999,     0, 1230, 0).
```

With `money_scale(1000)`, the last regular tier means
`13.750 + 0.805 × (credits − 18)` for 19 or more credits.

The calendar facts describe the default three-part year: parts 1 and 2 are
regular, part 3 is summer, and summer is an extra term that the planner uses
only with `-c extra_sem=1`.

### 3.3 `student.lp` — student facts

The current file is a sample record for the `cs_2023` curriculum. Real student
records should preserve the same predicate contract. In particular:

- history attempts are immutable input; they are not rescheduled;
- `taken/2`, `result/2` and `map(g,...)` normally reference courses in the
  generated curriculum file. A course outside the curriculum derives no
  `base/2` atom and is silently ignored by the planner, so only genuinely
  external attempts should be listed that way (the sample's
  `pe1003`/`pe1005` physical-education records are an example); otherwise a
  typo in a course code is hidden;
- `last_attempt/2` points at the latest attempt;
- `gpa_last/2` points at the latest attempt with a final letter grade;
- failed courses remain load-bearing and tuition-bearing but do not earn
  degree credit;
- only future terms (`I > t`) are selected by the planner.

---

## 4. What the ASP layer derives

### Calendar

Term `1` is the student's enrollment term. Its part is
`enroll_part_in(Q)` (default `1`), and parts then cycle through
`term_parts/1`:

```text
enroll part 1: 1, 2, 3, 1, 2, 3, ...
enroll part 2: 2, 3, 1, 2, 3, 1, ...
enroll part 3: 3, 1, 2, 3, 1, 2, ...
```

`term_part_type/2` names each part (`regular`, `regular`, `summer`). Parts whose
type appears in `extra_semester_type/1` are optional **extra** terms: with the
default `#const extra_sem = 0` they stay empty, and only `-c extra_sem=1`
(`--summer` on the CLI) lets the planner use them. History is unaffected.

Core (non-extra) terms must form one contiguous block: a student may skip
summer, but cannot skip a regular term and then resume. History terms are fixed
and never selected. A used regular term before the last one must meet its
`load_bound/3` minimum; the last used term may be lighter because only the
remaining credits are left.

### Attempts, status and retakes

For every attempt the engine derives:

- `status(X, passed | failed | unknown)`
- `effective_grade(X, G)` (the raw grade on a first attempt, or the capped
  grade on a retake)
- `must(E)` for failed compulsory courses and explicit requests

There is no retake eligibility rule and no attempt limit: a course may be
retaken at any time. A configured `retake_grade_cap/1` lowers a better retake
grade before status and GPA accounting; it never raises a grade and never
applies to a first attempt. For planning, the search space is limited to the
retakes that have a reason to exist. A course whose latest attempt failed is a
retake candidate. A retake of a passed course is generated **only** when the
student states `request(E)`. A failed compulsory course must be retaken, and an
explicit request is mandatory as well.

If a course fails and the retake also fails, the next retake is a new planning
problem after the second grade is known. The model represents the next attempt
with `rt(E, attempt_count)`, not an unlimited chain of future attempts.

### Credits, passing and degree progress

- `pass(E)` / `passed_course(E)` means passed in the transcript.
- `credited(E)` means credit is counted optimistically for the current plan,
  including future scheduled attempts and in-progress history.
- `in(E, ok(I))` is the per-term credited set.
- `in(E, credit(G))` is the requirement-bucket set.
- `credited_before(E, J)` is used by milestones and prerequisites so an
  improvement retake cannot double-count the same course.
- `assumed_pass(E)` reports an in-progress history attempt that is credited
  optimistically but not yet earned.

Failed courses count as attempted load and tuition but not as earned credit.
`semester_earned/2` and `total_credit/1` use `ok`; `semester_credits/2` and
`total_attempted/1` use all scheduled attempts.

### Groups and electives

Mandatory groups count all credited members. Elective quota buckets compete
for at most one bucket per credited course, so an extra passed elective is left
uncounted rather than violating a group upper bound. A course outside every
requirement group cannot be scheduled.

### Majors

`major_count(M, N)` counts credited courses in major `M`; `major_earned(M)`
holds when `N >= major_min(M, K)`. All majors the transcript qualifies for are
reported. A declared `student_major(M)` is a hard requirement: the plan must
earn that major.

### Prerequisites, co-requisites, offering and milestones

- Prerequisites must be credited in an earlier term.
- Co-requisites must be credited in the same or an earlier term.
- OR-groups require at least one alternative.
- A course may only be scheduled in a term where its `offered_slot/2` matches
  the term part. `offer/2` forces availability; `closed/2` removes it.
- Milestones require a minimum number of credits accumulated strictly before
  the milestone term.

### GPA

GPA is credit-weighted. Each retake is first capped by `retake_grade_cap/1`
when the policy defines one; first attempts keep their raw grade. The selected
attempt is then the latest graded attempt (`latest`, default) or the highest
effective grade (`best`, later attempt on ties). Grades with
`grade_in_gpa(Scale, G)` contribute; course kinds outside
`included_course_kind/1` are excluded. Rounding is half-up once, at the end,
using integer arithmetic.

The minimum GPA is **not** a hard per-semester constraint. The planner reports
the backward-calculated target instead: the average that all remaining GPA
credits must reach for the rounded cumulative GPA to meet `min_gpa/2`. It
starts from the historical cumulative record of courses that are not being
replaced by a future attempt and weights by the remaining credits.

- `gpa(Scale, Value)` / `gpa(Value)` report the current cumulative GPA.
- `gpa_best_case(G)` is the best reachable GPA if every remaining credit earns
  the best available grade, applying the retake cap to planned retakes.
- `gpa_required_avg(R)` is the target average on the default scale for the
  remaining GPA credits; it is clamped to `0` when no extra GPA is needed.
- `gpa_already_satisfied` means enough GPA points are already accumulated (the
  raw target is non-positive, or there are no remaining GPA credits and the
  current GPA meets the minimum).
- `gpa_requirement_impossible` means even the best case with the retake cap
  stays below `min_gpa/2`; the requirement cannot be met by planning alone.
  This covers the "required target above the maximum scale" edge case.
- `ready_to_graduate` requires `degree_complete`, no blocking external failure,
  and `not gpa_requirement_impossible`.

### External requirements

External progress is cumulative and dated by term. For each blocking
requirement:

- `ext_missed(R, Year)` means an end-of-year deadline that has already passed
  was not met.
- `ext_pending(R, Year, Missing)` means a future end-of-year deadline is not
  currently met; it is not scheduled automatically.
- `graduation_blocked(R)` means a blocking graduation milestone is not met.

`ready_to_graduate` is derived from `degree_complete` plus the absence of
`ext_missed/2` and `graduation_blocked/1`. The planner cannot invent external
progress; it can only report readiness from the facts it was given.

### Tuition and budget

Only future terms with positive load are billed. `fee/2` selects the matching
`fee_rule/6` tier; `semester_fee/2` exposes it for output and Python sums those
atoms into the reported total. A budget fact makes total future tuition a hard
upper bound. Without a budget, tuition is still minimized after graduation and
retake quality. A billed semester with no matching fee rule is unsatisfiable
rather than silently free.

### Optimization order

Clingo objectives are lexicographic by level, highest first:

| Level | Name | Meaning |
| ---: | --- | --- |
| `@7` | `last_semester` | Earliest last used term / earliest graduation. |
| `@6` | `retakes` | Earliest retake of failed compulsory courses; voluntary retakes penalized. |
| `@5` | `cost` | Minimum future tuition. |
| `@4` | `typical_term` | Special courses near their typical regular term (half-step distance). |
| `@3` | `level_order` | Lower-level courses earlier. |
| `@2` | `balance` | Minimum heaviest future semester. |
| `@1` | `taste` | Maximum interest score of planned electives (`interest`). |
| `@0` | `popularity` | Most-taken electives (inactive while popularity counts are null). |

Every hard and soft rule, with its data and scope, is listed in
`pipeline/docs/CONSTRAINTS.md`.

### Pins, bans, reserved terms, slots and notes

- `pin(E, I)` forces a placement; `ban(E)` / `ban(E, I)` forbids one in every
  term / in term `I` (§16).
- `fills_next(E)`: the term after `E`'s term is kept empty and reported as
  `reserved(Term, E)` (§17).
- An elective the student did not name is reported as `elective_slot(E,
  Group)`, with interchangeable alternatives `slot_option(E, A)` and matched
  tags `interest_match(E, K)` (§20).
- `course_note(E, Text)` repeats a curriculum note for a planned course.

---

## 5. Output contract

### 5.1 Clingo answer-set atoms

The stable display surface is declared at the bottom of `core/optimize.lp`:

| Atom | Meaning |
| --- | --- |
| `plan(Course, Term).` | A future scheduled attempt. Retakes appear as `rt(course, K)`. |
| `semester_credits(Term, Credits).` | Attempted load. |
| `semester_earned(Term, Credits).` | Earned degree credit. |
| `semester_fee(Term, Fee).` | Fixed-point tuition. |
| `total_planned(Credits).` | Future attempted credits. |
| `total_attempted(Credits).` | Alias of `total_planned`. |
| `total_credit(Credits).` | Cumulative earned credits (history + plan). |
| `degree_complete.` | Course and credit requirements are satisfied. |
| `ready_to_graduate.` | `degree_complete` plus no blocking external failure and no impossible GPA target. |
| `pass(Course).` / `passed_course(Course).` | Transcript pass. |
| `credited(Course).` | Optimistically credited. |
| `assumed_pass(Course).` | In-progress attempt credited optimistically but not yet earned. |
| `must(Course).` | Compulsory course or explicit request that must be retaken. |
| `gpa(Value).` / `gpa(Scale, Value).` | Default-scale and per-scale GPA. |
| `gpa_best_case(Value).` | Best reachable default-scale GPA, cap-aware. |
| `gpa_required_avg(Value).` | Target average needed on remaining GPA credits. |
| `gpa_already_satisfied.` | No extra GPA points are needed. |
| `gpa_requirement_impossible.` | The minimum GPA is unreachable. |
| `major_earned(Major).` / `major_count(Major, N).` | Major qualification and course count. |
| `student_major(Major).` | Declared major (input fact, also displayed so reports can show it). |
| `ext_missed(Requirement, Year).` | A blocking past external deadline was missed. |
| `ext_pending(Requirement, Year, Missing).` | A future external deadline is not yet met. |
| `graduation_blocked(Requirement).` | A blocking graduation milestone is unmet. |
| `semester_type(Term, Type).` | `regular` or `summer`. |
| `elective_slot(Course, Group).` | Planned elective shown as a slot of `Group` (not named by the student). |
| `slot_option(Course, Alternative).` | Unplanned course fully interchangeable with a slot's course. |
| `interest_match(Course, Keyword).` | Weighted keyword that matched a slot's course. |
| `course_note(Course, Text).` | Note of a planned course. |
| `reserved(Term, Course).` | Term kept empty by a fills-next course. |

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
  ready_to_graduate  degree_complete plus no blocking external failure and no
                     impossible GPA target
  gpa                default-scale fixed-point GPA
  gpa_by_scale       map scale id -> fixed-point GPA
  gpa_best_case      best reachable default-scale GPA, cap-aware
  gpa_required_avg   target average on remaining credits, clamped to 0
  gpa_already_satisfied     no extra GPA points needed
  gpa_requirement_impossible  minimum GPA is unreachable
  major_earned[]     majors the transcript qualifies for
  major_counts{}     credited course count per major
  major_titles{}     display names per major
  declared_major     student_major/1, or None
  default_major      curriculum default for reports
  must[]             retake-required courses
  passed[]           transcript passes
  credited[]         optimistically credited courses
  assumed_pass[]     in-progress attempts credited optimistically
  graduation_blocked[]  unmet blocking external milestones
  ext_missed[]       missed external deadlines
  ext_pending[]      future external deadlines with missing amounts
  reserved_terms[]   terms kept empty by fills-next courses
  objective          eight labelled objective values
  objective_vector   raw clingo objective vector
  priority           clingo priority levels
  optimal            true when optimality is proven
  optimization       proven_optimal / not_proven_optimal / unoptimized
  runtime            wall-clock grounding + solving time in seconds
  status             SATISFIABLE / UNSATISFIABLE / UNKNOWN
```

`PlannedCourse` is `code`, `name`, `credits`, `retake` (the retake number,
or `None`), `note` (or `None`) and `slot` (or `None`). A slot
(`ElectiveSlot`) has `group`, `major` (declared major, if the course is in its
list), `interests`, `representative` (the course used) and `options`; text
and Markdown show the slot label instead of the course name. `total_cost` is computed by the Python layer from `semester_fee/2`;
it is intentionally not materialized in ASP because a `total_cost/1` set over
a 12-term horizon grounds every possible intermediate sum and is unnecessarily
expensive.

The typed `Plan` covers the report fields above and all of them are included
in `Plan.to_dict()` (JSON). `--format raw` remains available when you need the
complete answer set, including unrendered internal atoms.

### 5.3 CLI formats

```text
--format text       human-readable terms and courses
--format markdown   Markdown report
--format json       Plan.to_dict() array
--format raw        raw answer sets plus labelled objective
```

Reports default to `reports/<student>-plan.<extension>` in the current
directory. `--no-report` prints only. `--report PATH` writes to an explicit
path.

Inputs and scenario controls:

```text
--solve STUDENT_LP          hand-written student facts
--student-json FILE         load a record from student_history.json instead
--student-id ID             select one record (default: first)
--t N                       number of studied terms (default: inferred from
                            the last taken/2 term; --student-json uses
                            expected.as_of_term)
--curriculum/--grading-policy/--graduation/--tuition-policy PATH
--popularity PATH           elective_popularity.json (skipped if missing)
--program NAME              tuition program (default: student, then curriculum)
--semesters N               absolute last term index
--future-terms N            terms after --t (default: curriculum planning.horizon)
--max-budget MONEY          extra tuition cap in money units, e.g. 14 = 14M VND
--summer, --allow-summer    allow optional extra terms (summer) via -c extra_sem=1;
                            off by default
--max-terms N               cap the horizon at absolute term N (lowers n to at
                            most N; must be >= --t)
--no-summer                 deprecated no-op kept for old command lines (summer is
                            already off unless --summer is given)
--fact 'ASP.'               append a scenario fact or rule (repeatable)
--min-load / --max-load N   override load bounds
--seed N                    clingo random seed
```

Solver and reporting controls:

```text
--opt-mode optN       prove optimality and return up to --plans optimal plans (default)
--opt-mode opt        alias for optN
--opt-mode ignore     return up to --plans models without an objective
--time-limit SECONDS  soft solver limit; a supervising process enforces a hard
                      wall clock (limit + small grace). Default: 30 for optN/opt
                      with --plans > 0; 0 = no limit.
--plans N             return N plans (default 1; 0 = all)
--fill                add non-optimal plans when fewer optimal plans exist
--require-optimal     exit 3 unless at least one plan's optimality was proven
--progress            print improving objectives and timing to stderr
--explain             on UNSAT, retry without the budget and with +3 terms
--format text|markdown|json|raw
--report PATH         explicit report path
--no-report           print only
```

Exit codes: `0` success, `2` no feasible plan (UNSAT), `3` a plan was found
but `--require-optimal` could not be satisfied, and `4` no model was produced
before the soft/hard time limit. Input and configuration errors return `1`.

For a fast feasible plan use `--opt-mode ignore --plans 1`. Optimized runs are
bounded to 30 seconds by default, so they return a plan or a clear timeout
instead of running indefinitely; pass `--time-limit 120` (or `0` for no limit)
when a proof legitimately needs longer. The result is marked not proven optimal
if the proof did not finish. Without `--fill`, optimized mode returns only
proven-optimal plans; with `--fill`, it adds distinct unoptimized models when
fewer optimal plans exist.

### 5.4 Units and status

- **Credits:** integers.
- **GPA and score:** fixed-point integers. Read `scale_precision/2` to render.
- **Money:** fixed-point integers. Read `money_scale/1`,
  `money_currency/1` and `money_unit/1` to render.
- **Objective:** a list ordered by descending priority; use
  `Solution.labelled_objective()` rather than positional assumptions.
- **`UNSATISFIABLE`:** no plan satisfies the hard constraints (for example an
  impossible prerequisite chain, a budget that cannot cover the required load,
  a billed term with no fee rule, or a compulsory course with no recorded
  attempt to retake).
- **`optimal`:** false when the solver was interrupted, when `--time-limit`
  expired, when `--opt-mode` is `ignore`, or when an unoptimized plan fills a
  slot added by `--fill`; the plan is still a valid answer set.
  Text/Markdown/raw output says `not proven optimal` or `unoptimized`, and JSON
  includes `optimal`, `optimization`, and `runtime_seconds`.
- **Runtime:** each plan reports the wall-clock grounding + solving time in
  seconds. It is the same for every plan returned by one solve. If the CLI's
  hard supervisor kills the child before a model is printed, there is no
  runtime row; the command exits `4`.

---

## 6. Consistency rules

These are the invariants the files are expected to maintain.

1. `encoding.lp` remains generic and unchanged.
2. The generated curriculum file and `policy.lp` contain **facts only**.
3. `extension.lp` contains generic rules; no concrete course codes.
4. `core/translate.lp` is the only file that reads raw student facts.
   `core/optimize.lp` contains only the objective order and display atoms; it
   must not add concrete course codes or credit values.
5. Any predicate read by `extension.lp`, `core/translate.lp` or
   `core/optimize.lp` must be emitted by the data files:
   - group membership, bounds, `map(c,...)`, `elective_group/1`, `prereq*`,
     `coreq*`, `offered_slot/2`, `major*`, `milestone/2`, `tag/2`,
     `typical_term/2`, `fills_next/1`, `map(note,...)`, `popularity/2`,
     `elective_class/3` from the generated curriculum file
   - scales, grades, `min_gpa/2`, load constants, `term_parts/1`,
     `term_part_type/2`, `extra_semester_type/1`, `load_bound/3`, `fee_rule/6`
     and money facts from `policy.lp`
   - `taken/2`, `map(g,...)`, `attempt_count/2`, `last_attempt/2` and the
     optional `gpa_last/2`, `enroll_part_in/1`, `student_major/1`,
     `external_progress/3` from `student.lp`
6. Generated files are one-way products of the JSON loader. Re-run
   `python -m pipeline.engine.asp.cli` from the repository root (or
   `python cli.py` from this directory) after changing the JSON. Use
   `--program` to choose the tuition schedule written into `policy.lp`.

---

## 7. Examples

### 7.1 Quick sample: `student.lp`

The small hand-written sample has two studied terms (`t=2`, inferred from its
`taken/2` facts) and a 33-credit history. Summer terms are off by default, so
only the regular terms in the horizon can carry the remaining 95 credits;
`--semesters 12` leaves enough regular terms and produces a plan ending in term
11. For a fast, unoptimized feasibility plan:

```powershell
python -m pipeline.engine.asp.cli --solve pipeline/engine/asp/student.lp `
  --semesters 12 --plans 1 --opt-mode ignore --time-limit 20 --no-report
```

The CLI prints `studied terms: t=2 (inferred from taken/2)` before solving.

The text report labels the plan `unoptimized` and includes the diagnostic
summary:

```text
Planned credits : 95 (attempted)
Total credits   : 128 / 128 (earned)
Status          : COMPLETE
GPA             : 3.00
Graduation      : DEGREE COMPLETE (external requirements outstanding)
Major           : Computer Science (default; no major declared)
GPA best case   : 3.98
GPA needed      : 2.49 on remaining credits
Assumed passes  : CO1005, CO1007, CO1023, CO1027, LA1005, MT1003,
                  MT1005, MT1007, PH1003, PH1007
External        : social_work_days needs 3 more by year 1; social_work_days
                  needs 6 more by year 2; social_work_days is below the
                  graduation minimum
Future tuition  : 81.143 million VND
```

With `--semesters 9` the sample is UNSAT when summer is disabled, because only
four regular terms remain in the horizon. Add `--summer` if the plan should be
allowed to use the extra terms.

The exact course mix can vary between runs. For an optimality proof instead of
a quick answer, replace `--opt-mode ignore` with `--time-limit 120` (or add
`--progress` to watch improving objectives). A 30-second run returned a valid
candidate marked `not proven optimal`; raise the limit when the proof matters.

### 7.2 Showcase: `student_showcase.lp`

`student_showcase.lp` is a full transcript for the AI major. It has 118
attempted credits, 114 credited, 14 remaining, pass/fail results for ENG_GC and
SA4001, a failed retake, two in-progress courses, a requested improvement
retake that is capped at `B`, and a 20M VND budget. The fixture closes the remaining elective slots
to CO3057 and CO3061 so the showcase is deterministic; remove the scenario rule
near the top to search the full 44-course B3.4/C pool (noticeably slower).

Run from the repository root; with the current ASP layer the optimality proof
finishes in about a second:

```powershell
python -m pipeline.engine.asp.cli --solve pipeline/engine/asp/student_showcase.lp `
  --semesters 12 --plans 1 --time-limit 120 --no-report
```

`t` is inferred as `8` from the transcript; pass `--t 8` explicitly if you
prefer. Summer is off by default, so the 17 remaining credits are compressed
into one regular term. `--max-budget 14` (14 million VND) is still satisfied and
returns the same optimal plan:

```powershell
python -m pipeline.engine.asp.cli --solve pipeline/engine/asp/student_showcase.lp `
  --semesters 12 --plans 1 --max-budget 14 --time-limit 120 --no-report
```

Its key output is:

```text
objective: last_semester=10, retakes=20, cost=13750, typical_term=2, level_order=10, balance=17, taste=-10, popularity=0 (proven optimal)
Solve time      : 0.24 s

Semester 10  (regular, 17 credits, scheduled total 135, fee 13.750 million VND)
  CO3035    Real-Time Systems (retake 1)                            3
  CO3057    Digital Image Processing and Computer Vision            3
  CO4337    Capstone Project                                        4
            note: Faculty regulations for this term may add requirements; confirm with the faculty.
  MT2013    Probability and Statistics (retake 1)                   4
  slot      one C elective (3 credits), AI major course             3

Planned credits : 17 (attempted)
Total credits   : 128 / 128 (earned)
Status          : COMPLETE
GPA             : 3.38
Graduation      : READY
Major           : Applied Artificial Intelligence (5 courses)
GPA best case   : 3.57
GPA needed      : already met (no extra GPA needed)
Assumed passes  : CO3005, LA1009
Retakes needed  : CO3035, MT2013
Future tuition  : 13.750 million VND
```

Add `--summer` to let the showcase use the extra term. The optimal proof then
moves one 3-credit retake into a summer term and is slightly more expensive:

```text
objective: last_semester=10, retakes=19, cost=17440, typical_term=2, level_order=10, balance=14, taste=-10, popularity=0 (proven optimal)
Semester 9  (summer, 3 credits, scheduled total 121, fee 3.690 million VND)
Semester 10 (regular, 14 credits, scheduled total 135, fee 13.750 million VND)
Future tuition  : 17.440 million VND
```

`--max-budget` is in tuition money units, so `14` means 14 million VND. It is
applied together with any `budget/1` fact in the student file; the tighter cap
wins. `--progress` shows grounding and search timing.

### 7.3 JSON student record

`--student-json` uses `student_history.json` and the same engine. For example:

```powershell
python -m pipeline.engine.asp.cli --student-json pipeline/data/student_history.json `
  --student-id S003 --future-terms 12 --plans 1 --opt-mode ignore `
  --time-limit 30 --no-report
```

The CLI derives `t` from `expected.as_of_term` and emits the same facts as
`student_to_facts()`. Use `--semesters` when you want an absolute last-term
index instead of `--future-terms`.

---

## 8. Current limitations

- **The full elective pool is expensive.** `student_showcase.lp` closes every
  remaining elective slot except two. Remove its scenario rule to search all 44
  B3.4/C courses; grounding and the optimality proof can then take several
  minutes.
- **Time limits are soft inside clingo; the CLI adds a hard supervisor.**
  `SolveHandle.wait` is only checked between propagation steps, so a single
  step can overshoot `--time-limit` by a large margin. A real CLI invocation
  runs the solve in a child process and kills it after the limit plus a small
  grace period. If no model was printed before that hard limit, the exit code
  is `4` and no report is written. Programmatic `engine.solve()` calls only get
  the soft engine limit.
- **External progress cannot be scheduled.** The planner enforces and reports
  external milestones from `external_progress/3`, but it cannot add progress.
  A future deadline that is currently unmet is only reported as
  `ext_pending/3`; it does not make the plan UNSAT.
- **`objective_scale` is accepted by `SolverOptions` but not consumed by
  `core/optimize.lp`.** GPA selection and the retake cap affect the reported
  historical GPA, the best-case figure and the target; they do not add an
  optimization objective.
- **`shift` is legacy and has no effect.** It is still accepted by
  `SolverOptions` and the CLI, but the calendar comes from `enroll_part_in(Q)`.
- **Tuition has no program dimension in ASP.** `policy.lp` materializes one
  fee schedule for the selected `--program` (default: `default_major`).
  Divergent programs need one generated policy per program or a `program/1` +
  program-keyed fee contract.
- **The horizon is absolute in the ASP layer.** `--semesters` is the last term
  index; the CLI default is `--t + curriculum.planning.horizon` (currently 15).
  A larger horizon increases grounding and search even when the chosen plan
  ends earlier. `--max-terms N` caps the horizon at `N` and must be at least
  `--t`. The showcase uses `--semesters 12`; its plan ends in term 10.
- **Real-data solving is much faster than it used to be, but proofs vary.**
  The showcase at `n=12` grounds in about 0.5 seconds and proves optimality in
  about 0.3 seconds on the reference machine. The small sample at `n=12`
  grounds in about 0.4 seconds and finds an unoptimized model in about
  1.5 seconds, but its optimality proof exceeded the 30-second limit in a test
  run. Use `--opt-mode ignore` for a quick feasibility check, `--time-limit` for
  a bound, `--progress` to see whether the search is advancing, and the
  showcase's scenario rule when you need a deterministic fast example.
- **GPA-needed values are clamped to zero.** `gpa_required_avg` is the
  mathematical target average on remaining GPA credits; non-positive targets
  are reported as `0` and flagged with `gpa_already_satisfied`. If even the
  cap-aware best case falls below the minimum, `gpa_requirement_impossible`
  is set and readiness is withheld. Text/Markdown output says
  `already met (no extra GPA needed)` or `impossible under current plan`;
  JSON keeps the target plus both flags.
- **`--fill` is opt-in.** Without it, optimized runs return only
  proven-optimal plans. If fewer distinct optimal plans exist than `--plans`,
  the report is shorter rather than padded with candidates.
