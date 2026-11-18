# Academic Advising Dataset

Language-neutral JSON data for testing academic advising and degree-audit
engines. Every engine (Python, SQL, Prolog/Datalog, ASP, etc.) reads the same
files, so results can be compared directly.

> **Status:** all files in this folder are **examples**. Values (course ids,
> thresholds, grades) are illustrative and should be replaced with verified
> data before production use.

## Files

| File | Describes | Scope |
|---|---|---|
| `curriculum.json` | Courses, groups, milestones, majors, planning bounds | One file per curriculum |
| `graduation_requirements.json` | What a student must achieve to graduate | One file per curriculum |
| `grading_policy.json` | Grade scale, GPA formula, retake rules | Shared by cohorts/curricula |
| `tuition_policy.json` | Fees by program, semester type and credit load | Shared by cohorts/programs |
| `student_history.json` | Student attempts, external progress, expected results | Test cases |

How they link:

```text
student_history.json --curriculum_id--------> curriculum.json
                     --grading_policy------> grading_policy.json
graduation_requirements.json --curriculum_id--> curriculum.json
                             --grading_policy--> grading_policy.json
tuition_policy.json --program / major-------> curriculum.json
```

`student_history.json` is the oracle: each student has an `expected` block that
every engine should reproduce.

## Conventions (all files)

- **`schema_version`**: integer at the top of each file. Bump it when the
  structure changes.
- **IDs** are stable strings (`"CO3001"`, `"B3.2"`). Never use row numbers.
- **Decimals** (GPA values, grade points, money amounts) are **strings** such as
  `"2.50"` to avoid float differences between engines. Credits and counts are
  integers.
- **Booleans** are real JSON `true` / `false`, never `"T"` / `"F"`.
- Optional features are expressed as `null` or an empty list rather than by
  silently omitting logic in code.

---

## `curriculum.json`

Top-level fields:

| Field | Description |
|---|---|
| `schema_version` | Schema version |
| `id` | Curriculum id (e.g. `cs_2023`), referenced by other files; also drives the generated ASP file name (`cs_2023` → `cs-2023.lp`) |
| `name` | Human-readable name |
| `file_stem` / `slug` | Optional override for the generated ASP file name when `id` is not filename-friendly |
| `program` | Program name used for tuition matching (e.g. `Computer Science`) |
| `total_credits` | Total credits required for the degree |
| `planning` | Optional default planning bounds (see below) |
| `milestones` | Optional credit thresholds for milestone courses |
| `equivalents` | Optional `{old_code: canonical_code}` map |
| `courses` | Course catalog |
| `groups` | Course groups (mandatory / elective) |
| `majors` | Major-determination rules (may be empty) |
| `default_major` | Major label used when no major rule applies |

### `courses[]`

| Field | Description |
|---|---|
| `id` | Course id |
| `name` | Course name |
| `credits` | Credit value |
| `level` | Optional course level for the level-order objective; defaults to the first digit of `id` |
| `prerequisites` | Courses that must be credited before enrolling |
| `corequisites` | Courses that must be credited before or with this one |
| `offered_terms` | Academic-year term parts in which the course runs |

`offered_terms` uses the three-part calendar:

- `1` = first regular term (fall)
- `2` = second regular term (spring)
- `3` = summer

`[1, 2]` means both regular terms; `[1, 2, 3]` means every term. A missing or
empty list means "offered in every part". All current example courses are
offered in all three parts.

**Prerequisite / corequisite format.** Both are lists of lists. A course with
no requirement uses `[]` or `[[]]`.

The **outer list is AND** and each **inner list is OR**:

- `[]` / `[[]]`: no requirement
- `[["CO1005"]]`: needs CO1005
- `[["CO3001"], ["CO1027"]]`: needs CO3001 **and** CO1027
- `[["A", "B"]]`: needs A **or** B

### `groups[]`

| Field | Description |
|---|---|
| `id` | Group id (e.g. `A1`, `B3.2`, `D`) |
| `type` | `mandatory` or `elective` |
| `course_ids` | Courses belonging to the group |
| `min_credits` | (elective) Minimum credits required from this group |
| `max_credits` | (elective, optional) Maximum credits that may count |
| `min_courses` | (elective, optional) Minimum number of courses |
| `max_courses` | (elective, optional) Maximum number of courses that may count |

- **Mandatory group:** the student must pass **every** course in it. The credit
  lower bound is the sum of its members.
- **Elective group:** the student must reach `min_credits` (and the course-count
  limits, if given). The group may also define an upper bound.
- Elective rules live here, not in `graduation_requirements.json`, because they
  are part of the curriculum's structure.
- A course may be listed in more than one elective group (for example the
  specialized-course pools `B3.4` and `C`). Each engine must pick one
  deterministic overlap rule. The ASP planner counts a passed course in at most
  one elective quota bucket; mandatory groups still count every member.

### `planning`

Optional defaults used by a planner. The ASP engine reads the load bounds from
this block; `horizon` is a suggested planning horizon. Other engines may use
their own scheduler settings.

| Field | Description |
|---|---|
| `min_load` | Minimum credits in a regular term |
| `max_load` | Maximum credits in any term |
| `summer_min_load` | Minimum credits in a used summer term |
| `summer_max_load` | Maximum credits in a summer term |
| `horizon` | Number of future terms to plan |

### `milestones[]`

Some courses (internship, specialized project, capstone) require a minimum
number of credits accumulated **strictly before** the course:

```json
{ "course": "CO3335", "min_credit_percent": 65 }
```

Each item has `course` and exactly one of:

- `min_credit_percent`: percentage of `total_credits` (rounded up to a whole
  credit), or
- `min_credits`: an absolute credit count.

### `equivalents`

An optional map from an old course code to the canonical course code:

```json
{ "equivalents": { "CO1023": "CO1024" } }
```

Equivalents are resolved before attempts are grouped and numbered. The old code
must not itself be a current curriculum course.

### `majors[]` and `default_major`

A major is earned by passing enough specialized courses:

```json
{
  "id": "AI",
  "name": "Applied Artificial Intelligence",
  "rule": {
    "type": "required_courses",
    "min_courses": 5,
    "course_ids": ["CO3029", "CO3035", "CO3037", "CO3041", "CO3043"]
  }
}
```

- `rule.type` currently supports `required_courses`.
- `min_courses` is **required** and says how many of `course_ids` must be
  earned. It is not "all courses".
- If no major rule matches, the student gets `default_major`.
- Curricula without major determination use `"majors": []`.

---

## `grading_policy.json`

Defines how grades turn into credits and GPA. Referenced by id (`policy_2020`).

| Field | Description |
|---|---|
| `id` | Policy id |
| `effective_for_cohorts` | `{from, to}` admission years (`to: null` = open-ended) |
| `grade_scale[]` | One row per grade (see below) |
| `gpa` | GPA formula and rounding |
| `retake` | Retake policy |
| `pipeline_order` | Order in which every engine must apply the steps |

### `grade_scale[]`

| Field | Description |
|---|---|
| `grade` | Grade symbol (`A+`, `A`, `B+`, ... `F`) |
| `min_score` | (optional) Inclusive lower bound on the 10-point score |
| `max_score` | (optional) Inclusive upper bound on the 10-point score |
| `points` | Grade points as a decimal string, or `null` if not numeric |
| `passing` | Whether the grade counts as passed |
| `in_gpa` | Whether the grade is included in GPA |
| `earns_credit` | Whether the course credits are earned |

Score bands are inclusive and must not overlap. The current policy is
numeric-only: every letter grade is final and, except `F`, earns credit.
Pass/fail courses without a letter grade are represented on the student
attempt with `result: "passed"` or `"failed"` instead of inventing a grade.

An engine may also declare named numeric scales explicitly with a `scales[]`
block:

```json
"scales": [
  { "id": "gpa_4",  "min": "0", "max": "4.00", "precision": 2,
    "role": "gpa", "default": true },
  { "id": "score_10", "min": "0", "max": "10", "precision": 2,
    "role": "score", "representative": "midpoint" }
]
```

Without a `scales` block, the ASP loader derives `gpa_4` from `gpa.scale_max`
and `gpa.rounding.decimals`, and derives `score_10` when score bands exist.

### `gpa`

| Field | Description |
|---|---|
| `formula` | `credit_weighted_mean` = sum(points x credits) / sum(credits) |
| `included_course_kinds` | Attempt `course_kind` values that count (e.g. `["regular"]`) |
| `scale_max` | Top of the default GPA scale |
| `rounding` | `mode` (`half_up`), `decimals`, `applied_to` (`final_only`) |

### `retake`

| Field | Description |
|---|---|
| `gpa_attempt_selection` | Which attempt counts for GPA: `latest` (default) or `best` (highest effective grade; `highest`/`highest_grade` are accepted aliases) |
| `grade_cap` | Optional cap on retake effective grades: `{ "applies_to": "retakes", "max_grade": "B" }` |
| `keep_old_attempts_on_transcript` | Old attempts stay visible but follow the selection rule |
| `equivalence` | `use_course_equivalents`: replaced course codes count as the same course |

The ASP implementation supports `gpa_attempt_selection: "latest"` and
`"best"` and `equivalence: "use_course_equivalents"`. It refuses other values
instead of silently using different semantics. There is no retake eligibility
threshold or attempt limit, but a retake can be capped at `max_grade` before
the GPA attempt is selected. A cap only lowers a better retake grade; first
attempts are never capped.

### `pipeline_order`

1. `resolve_equivalents`
2. `select_attempts`
3. `sum_credits_and_gpa`
4. `round`

Different orders can give different results, so all engines must follow this
one.

---

## `graduation_requirements.json`

| Field | Description |
|---|---|
| `schema_version` | Schema version |
| `curriculum_id` | Curriculum these requirements belong to |
| `grading_policy` | Grading policy used to compute credits and GPA |
| `requirements[]` | Course-based requirements |
| `external_requirements[]` | Requirements that do not depend on courses |

### `requirements[]`

Each item has `id`, `type`, and (where relevant) `value`.

| `type` | Meaning |
|---|---|
| `all_groups_satisfied` | Every mandatory group fully passed **and** every elective group meets its own bounds from `curriculum.json` |
| `min_total_credits` | Minimum total earned credits (`value`: integer) |
| `min_cumulative_gpa` | Minimum cumulative GPA (`value`: decimal string, e.g. `"2.50"`) |

New requirement types can be added without changing the file's shape. The ASP
loader rejects types it does not implement.

### `external_requirements[]`

Requirements measured outside courses, such as social work days.

| Field | Description |
|---|---|
| `id` | Requirement id (matched by `external_progress[].requirement`) |
| `unit` | Unit of measure (`days`, `hours`, ...) |
| `mode` | `cumulative`: milestone values are **totals so far**, not increments |
| `enforcement` | `blocking` (must be met) or a softer warning level |
| `milestones[]` | List of `{deadline, min}` |

`deadline` always has one shape, an object with a `type`:

- `{ "type": "end_of_year", "year": 1 }`: by the end of year 1
- `{ "type": "graduation" }`: by graduation

Example: at least 3 days by the end of year 1, 6 by the end of year 2, 15 at
graduation.

The ASP planner reports `ready_to_graduate` only when a blocking
**graduation** milestone and every blocking **past** end-of-year milestone are
met. A future deadline is reported as pending; it is not scheduled
automatically.

---

## `tuition_policy.json`

Fees are per semester, in a fixed money unit. The current file uses million VND
with three decimal places.

| Field | Description |
|---|---|
| `schema_version` | Schema version |
| `id` | Policy id |
| `effective_for_cohorts` | `{from, to}` admission years |
| `currency` | ISO-like currency code (`VND`) |
| `money_unit` | Display unit (`million`) |
| `precision` | Decimal places kept in fixed-point arithmetic (`3`) |
| `calculation_basis` | Currently `per_semester` |
| `tuition_rules[]` | Rules selected by program and semester type |

### `tuition_rules[]`

| Field | Description |
|---|---|
| `description` | Human-readable note |
| `programs` | Program names or major ids this rule applies to; `["*"]` = all |
| `semester_types` | `regular` and/or `summer` |
| `fee_model` | `piecewise` tier list or a single `per_credit` model |

A rule may list several programs (for example `Computer Science`, `DSE`, `ASE`,
...). The generated fee schedule must contain exactly one rule for every
semester type the planner can use; a missing type is an error, not a free term.

### Piecewise tiers

Tiers are contiguous, start at 0 credits, and the final tier is open-ended
(omit `max_credits`).

```json
{
  "condition": { "min_credits": 0, "max_credits": 6 },
  "fee_type": "flat",
  "percentage": 0.15,
  "flat_fee": 13.75
}
```

- `flat` + `percentage` is a discount off `flat_fee`: here the student pays
  85% of 13.75, i.e. 11.6875 million.
- A per-credit tier can charge every credit:

  ```json
  { "fee_type": "per_credit", "rate_per_credit": 1.23 }
  ```

- Or charge only credits above a covered load:

  ```json
  {
    "condition": { "min_credits": 19 },
    "fee_type": "per_credit",
    "applies_to": "excess_over",
    "excess_over": 18,
    "base_fee": 13.75,
    "rate_per_credit": 0.805
  }
  ```

  This means `13.75 + 0.805 x (credits - 18)` for 19 or more credits.

Engines should round once when converting to the policy's fixed-point money
unit (half-up). The ASP engine compiles the current regular schedule to
`fee_rule/6` facts with a base, rate and covered load.

---

## `student_history.json`

Test cases: a student's records plus the expected outcome, so each engine can
be checked against the same answers. The file is row-oriented
(`schema_version: 2`): each top-level array is one table, and `student_id`
links rows together.

```json
{
  "schema_version": 2,
  "students": [{ "student_id": "S001", "...": "..." }],
  "attempts": [{ "student_id": "S001", "attempt_id": "S001-01", "...": "..." }],
  "external_progress": [{ "student_id": "S001", "...": "..." }],
  "expected": [{ "student_id": "S001", "...": "..." }]
}
```

### `students[]`

One row per student; this table holds metadata and planner preferences only.

| Field | Description |
|---|---|
| `student_id` | Student id, referenced by every other table |
| `curriculum_id` | Curriculum the student follows |
| `grading_policy` | Grading policy that applies |
| `cohort` | Admission year |
| `enrollment_term` | First term (`YYYY-1/2/3`) |
| `note` | Optional explanation of the case |

The ASP translator additionally understands these optional planner fields:

| Field | Description |
|---|---|
| `as_of_term` | Override for the audit term; normally use `expected.as_of_term` |
| `program` | Tuition program override |
| `major` | Declared curriculum major id |
| `budget` | Maximum future tuition, in `money_unit` |
| `request[]` | Courses the student explicitly wants to retake |
| `avoid[]` / `prefer[]` | Elective taste used by the objective |
| `offer[]` / `closed[]` | `{course, term}` offering overrides |

### `attempts[]`

One row per attempt, never one row per course. Retakes are separate rows.

| Field | Description |
|---|---|
| `student_id` | Owning student |
| `attempt_id` | Unique attempt id |
| `course` | Course id from `curriculum.json` (or an equivalent old code) |
| `term` | Term taken (`YYYY-1/2/3`) |
| `grade` | **Raw** letter grade as on the transcript |
| `result` | `passed` / `failed` for a pass/fail course with no letter grade |
| `course_kind` | `regular`, `transfer`, `audit`, ... (filtered by `gpa.included_course_kinds`) |

An attempt has at most one of `grade` or `result`; neither means it is still in
progress. Attempt order is `(term, order in the file)`. The first attempt
of a course uses the course
atom itself; later attempts are numbered retakes (`rt(course, 1)`,
`rt(course, 2)`, ...).

- `last_attempt` is the latest attempt; it drives status and retake
  generation.
- `gpa_last` is the latest attempt with a final letter grade; an in-progress
  retake does not hide an earlier grade.
- An in-progress attempt (a row with no `grade` and no `result`) is treated
  optimistically by the ASP planner and reported as `assumed_pass`.
- Every attempt is kept. There is no eligibility or attempt-limit filter. The
  latest graded attempt (or the highest effective grade in `best` mode) counts
  for GPA, after applying the retake grade cap if configured. Credit is earned
  once per course and is not lost by a later failed retake.

### `external_progress[]`

```json
{ "student_id": "S001", "requirement": "social_work_days", "term": "2024-1", "amount": 2 }
```

Amounts are added up and compared to the milestones by deadline. A `term` after
`as_of_term` is ignored.

### `expected[]`

One result row per student.

| Field | Description |
|---|---|
| `student_id` | Student being checked |
| `as_of_term` | Term at which the audit is run |
| `counted_attempts` | Attempts that should count after selection (helps locate which engine step disagrees) |
| `effective_grades` | Effective (capped) grades of selected retake attempts, keyed by attempt id |
| `gpa_credits` | Credits included in GPA |
| `grade_points` | Sum of points x credits |
| `cgpa` | Final cumulative GPA (rounded) |
| `credits_earned` | Total credits earned |
| `external_totals` | Totals per external requirement |

Older `schema_version: 1` files with `attempts`, `external_progress` and
`expected` nested inside each student are still accepted by both loaders.

### Notes on the example

The current file uses real `cs_2023` course ids and covers:

- a pass/fail result, two retakes capped at `B`, and external progress;
- GPA exactly on a rounding boundary;
- a course with four attempts, where the latest attempt is capped at `B` and counts;
- a missed external milestone;
- a student matching a major rule and one falling back to the default major.

When changing the dataset, update `expected` in the same commit and run both the
Python auditor (`pipeline/data_tools`) and the ASP planner tests
(`pipeline/engine/asp/tests`).
