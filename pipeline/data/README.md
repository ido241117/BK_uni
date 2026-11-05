# Academic Advising Dataset

Language-neutral JSON data for testing academic advising and degree-audit engines. Every engine (Python, SQL, Prolog/Datalog, ASP, etc.) reads the same files, so results can be compared directly.

> **Status:** all files in this folder are **examples**. Values (course ids, thresholds, grades) are illustrative and should be replaced with real data.

## Files

| File | Describes | Scope |
|---|---|---|
| `curriculum.json` | Courses, course groups, majors | One file per curriculum |
| `graduation_requirements.json` | What a student must achieve to graduate | One file per curriculum |
| `grading_policy.json` | Grade scale, GPA formula, retake rules | Shared by cohorts/curricula |
| `student_history.json` | Student attempts, external progress, expected results | Test cases |

How they link:

```
student_history.json --curriculum_id--------> curriculum.json
                     --grading_policy------> grading_policy.json
graduation_requirements.json --curriculum_id--> curriculum.json
                             --grading_policy--> grading_policy.json
```

## Conventions (all files)

- **`schema_version`**: integer at the top of each file. Bump it when the structure changes.
- **IDs** are stable strings (`"CO3001"`, `"B3.2"`). Never use row numbers.
- **Decimals** (GPA values, grade points) are **strings** such as `"2.50"` to avoid float differences between engines. Credits and counts are integers.
- **Booleans** are real JSON `true` / `false`, never `"T"` / `"F"`.
- Optional features are expressed as `null` or an empty list, not by omitting logic in code.

---

## `curriculum.json`

Top-level fields:

| Field | Description |
|---|---|
| `schema_version` | Schema version |
| `id` | Curriculum id (e.g. `cs_2023`), referenced by other files |
| `name` | Human-readable name |
| `total_credits` | Total credits of the program (see note below) |
| `courses` | Course catalog |
| `groups` | Course groups (mandatory / elective) |
| `majors` | Major-determination rules (may be empty if the curriculum has no majors) |
| `default_major` | Major assigned when no rule in `majors` matches |

### `courses[]`

| Field | Description |
|---|---|
| `id` | Course id |
| `name` | Course name |
| `credits` | Credit value |
| `prerequisites` | Courses that must be completed before enrolling |
| `corequisites` | Courses that must be taken before or together with this one |
| `offered_terms` | Terms of the academic year in which the course is offered (`[1, 2]` = both semesters) |

**Prerequisite / corequisite format.** Both are lists of lists. A course with no requirement uses `[[]]`.

Intended reading (please confirm and keep consistent): the **outer list is AND** and each **inner list is OR**.

- `[[]]`: no requirement
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
| `min_courses` | (elective, optional) Minimum number of courses |
| `max_courses` | (elective, optional) Maximum number of courses that may count |

- **Mandatory group:** used for semantics only. The student must pass **every** course in it.
- **Elective group:** the student must reach `min_credits` (and the course-count limits, if given).
- Elective rules live here, not in `graduation_requirements.json`, because they are part of the curriculum's structure.

### `majors[]` and `default_major`

A student's major is determined by the elective specialized courses they have taken.

```json
{ "id": "AI", "name": "Artificial Intelligence",
  "rule": { "type": "required_courses", "course_ids": ["CO3021"] } }
```

- `rule.type` currently supports `required_courses` (all listed courses must be passed).
- If no major rule matches, the student gets `default_major`.
- Curricula without major determination use `"majors": []`.

### Known points to resolve in the example

- **Group overlap:** `B3.4` and `C` both contain `CO3011, CO3013, CO3015, CO3017, CO3031, CO3041, CO3061, CO3069`. Decide a rule for a course that fits two groups (counts once, in which group first) and implement it identically in every engine.
- **`total_credits` vs. group sums:** mandatory groups total 99 credits and elective minimums total 33, i.e. 132, while `total_credits` is 128. Verify the numbers. Also, the 128 appears again in `graduation_requirements.json`; keep only one source of truth.
- **`default_major`** is a display name (`"Computer Science"`) while `majors[].id` are ids. Consider giving the default major an id as well.
- **`[[]]`** for "no prerequisite" works, but plain `[]` is simpler if you prefer.

---

## `grading_policy.json`

Defines how grades turn into credits and GPA. Referenced by id (`policy_2024`).

| Field | Description |
|---|---|
| `id` | Policy id |
| `effective_for_cohorts` | `{from, to}` admission years the policy applies to (`to: null` = open-ended) |
| `grade_scale[]` | One row per grade (see below) |
| `gpa` | GPA formula and rounding |
| `retake` | Retake policy |
| `pipeline_order` | Order in which every engine must apply the steps |

### `grade_scale[]`

| Field | Description |
|---|---|
| `grade` | Grade symbol (`A`, `B+`, `P`, `W`, `I`, ...) |
| `points` | Grade points as a decimal string, or `null` if not numeric |
| `passing` | Whether the grade counts as passed |
| `in_gpa` | Whether the grade is included in GPA |
| `earns_credit` | Whether the course credits are earned |
| `provisional` | (optional) Grade is temporary, e.g. incomplete `I` |

### `gpa`

| Field | Description |
|---|---|
| `formula` | `credit_weighted_mean` = sum(points x credits) / sum(credits) |
| `included_course_kinds` | Which attempt `course_kind` values count (e.g. `["regular"]`) |
| `scale_max` | Top of the scale |
| `rounding` | `mode` (`half_up`), `decimals`, `applied_to` (`final_only`) |

### `retake`

| Field | Description |
|---|---|
| `gpa_attempt_selection` | Which attempt counts for GPA: `latest`, `best`, `average`, `all_count` |
| `credit_counting` | `once_per_course`: credits for a course are earned once |
| `eligibility` | `{only_if_grade_at_most}`: retake allowed only up to this grade (`null` = always) |
| `max_attempts` | Maximum attempts per course |
| `grade_cap` | `{applies_to, max_grade}`: retake grades are capped (`null` = no cap) |
| `keep_old_attempts_on_transcript` | Old attempts stay visible but follow the selection rule |
| `equivalence` | `use_course_equivalents`: replaced course codes count as the same course |

### `pipeline_order`

1. `resolve_equivalents`
2. `select_attempts`
3. `apply_grade_cap`
4. `filter_by_flags`
5. `sum_credits_and_gpa`
6. `round`

Different orders can give different results, so all engines must follow this one.

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
| `all_groups_satisfied` | Every mandatory group fully passed **and** every elective group meets its own `min_credits` (and course limits) from `curriculum.json` |
| `min_total_credits` | Minimum total earned credits (`value`: integer) |
| `min_cumulative_gpa` | Minimum cumulative GPA (`value`: decimal string, e.g. `"2.50"`) |

New requirement types can be added to this list without changing the file's shape.

### `external_requirements[]`

Requirements measured outside courses, such as social work days.

| Field | Description |
|---|---|
| `id` | Requirement id (matched by `external_progress[].requirement` in student history) |
| `unit` | Unit of measure (`days`, `hours`, ...) |
| `mode` | `cumulative`: milestone values are **totals so far**, not increments |
| `enforcement` | `blocking` (must be met) or a softer level such as a warning/at-risk flag |
| `milestones[]` | List of `{deadline, min}` |

`deadline` always has one shape, an object with a `type`:

- `{ "type": "end_of_year", "year": 1 }`: by the end of year 1
- `{ "type": "graduation" }`: by graduation

Example: at least 3 days by the end of year 1, 6 by the end of year 2, 15 at graduation.

---

## `student_history.json`

Test cases: a student's records plus the expected outcome, so each engine can be checked against the same answers.

Top level: `schema_version`, `students[]`.

### `students[]`

| Field | Description |
|---|---|
| `student_id` | Student id |
| `curriculum_id` | Curriculum the student follows |
| `grading_policy` | Grading policy that applies |
| `cohort` | Admission year |
| `enrollment_term` | First term (e.g. `2024-1`) |
| `attempts[]` | Every course attempt |
| `external_progress[]` | Dated progress toward external requirements |
| `expected` | Hand-verified expected results |

### `attempts[]`

One record per attempt, never one row per course. Retakes are separate records.

| Field | Description |
|---|---|
| `attempt_id` | Unique attempt id |
| `course` | Course id from `curriculum.json` |
| `term` | Term taken (`YYYY-T`) |
| `grade` | **Raw** grade as on the transcript (the cap is applied by the engine) |
| `course_kind` | `regular`, `transfer`, `audit`, ... (filtered by `gpa.included_course_kinds`) |

### `external_progress[]`

`{ "requirement": "social_work_days", "term": "2024-1", "amount": 2 }`. Amounts are added up and compared to the milestones by deadline.

### `expected`

| Field | Description |
|---|---|
| `as_of_term` | Term at which the audit is run |
| `counted_attempts` | Attempts that should count after selection (helps locate which engine step disagrees) |
| `effective_grades` | Grades after the cap, keyed by attempt id |
| `gpa_credits` | Credits included in GPA |
| `grade_points` | Sum of points x credits |
| `cgpa` | Final cumulative GPA (rounded) |
| `credits_earned` | Total credits earned |
| `external_totals` | Totals per external requirement |

### Notes on the example

- The example student uses placeholder course ids (`CS101`, `MA101`, ...) and `curriculum_id: "cs_2024"`. They do not exist in `curriculum.json` (`cs_2023`, ids like `CO1005`). Update them to real ids before running any engine.
- Suggested extra test cases: GPA exactly on a rounding boundary, exceeding `max_attempts`, retaking a course that was already passed (ineligible), a missed milestone for an external requirement, a student matching a major rule, and a student matching none (default major).