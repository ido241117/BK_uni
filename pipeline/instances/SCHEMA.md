# Canonical instance format (schema 3)

One folder per university. Every module (synthetic students, input profiling, solvers,
evaluation) reads this format; university-specific code lives only in importers.

```
instances/<university>/
  policy/grading.json             grade scale, GPA, retakes      (shared by curricula)
  policy/tuition.json             fees by program and term type  (shared by curricula)
  policy/standing.json            academic-standing thresholds   (optional; synthetic students)
  policy/external.json            requirements outside the course plan (optional)
  curricula/<id>/curriculum.json  courses, relations, groups, majors, planning bounds
  curricula/<id>/graduation.json  graduation requirements: groups, credits, GPA (optional)
  curricula/<id>/popularity.json  past enrollment per elective (optional)
  curricula/<id>/official_plan.json  the published term-by-term plan (optional)
  students/<set>.json             student histories as flat tables
  requests/<set>.json             planning requests / what-if scenarios
  catalog.json                    courses and relations of every program (optional)
```

Validate with `python -m instances.loader instances/<university>`.

`policy/*.json`, `graduation.json`, `popularity.json` and the student tables keep the
field definitions of the former `data/` format ([FIELDS-V1.md](FIELDS-V1.md)); the changes
are listed in their sections below. Its `curriculum.json` section is replaced by this file.

## Conventions

- **Terms** are `YYYY-P`: academic year in which the term starts, then the part
  (`1`, `2` = regular terms, `3` = summer). `2023-3` is the summer after `2023-2`.
- **IDs** are stable strings. Folder name = curriculum `id`.
- **Decimals** (GPA, grade points, money) are strings, as in `data/`. Credits and counts are integers.
- `null` means "unknown" or "not used", never "false".
- Keys starting with `_` (e.g. `_provenance`) are notes for people; code ignores them.

## curriculum.json

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | `3` | |
| `id`, `name` | string | |
| `program` | string, optional | Program name used to match tuition rules |
| `cohort` | int, optional | Intake year |
| `total_credits` | int, optional | Degree credit total, when not in `graduation.json` |
| `planning` | object | Calendar and load bounds, below |
| `courses` | list | Below |
| `relations` | list | Below |
| `groups` | list | Below |
| `majors` | list | Below |
| `default_major` | string or null | Label shown when the student declares no major |
| `milestones` | list | Below |
| `offerings` | object, optional | Known offering exceptions for future terms, below |
| `equivalents` | object, optional | Course equivalences (as in `data/`) |

### planning

| Field | Meaning |
|---|---|
| `horizon` | Number of terms that can be planned |
| `first_term` | First term of the horizon (`YYYY-P`), or omitted when the horizon is relative to the student's enrollment |
| `summer_terms` | Whether the calendar has summer terms |
| `duration_years` | Nominal program length |
| `min_load`, `max_load` | Credits per regular term (hard) |
| `summer_min_load`, `summer_max_load` | Credits per summer term (hard), null = no bound |
| `preferred_load`, `summer_preferred_load` | `[low, high]` soft target, null = none |
| `summer_always_allowed` | Courses that may be taken in summer without the student opting in (e.g. an internship) |
| `level_min_year` | `{"<level>": <earliest study year>}`; null = no level rule. Uses `courses[].level` |
| `year_credit_thresholds` | Optional, with `level_min_year`: accumulated credits that start study years 2, 3, 4, ... (e.g. `[28, 56, 84]`, QD 285 art. 24). Then the study year of a term is reached by credits earned before it, not by cohort year. Read by both solvers and the validator (`rules.year_by_credits`) |

### courses[]

| Field | Meaning |
|---|---|
| `id`, `name`, `credits` | Required |
| `kind` | `regular` (default) or `condition`: a non-credit requirement recorded as a course (e.g. a language certificate). Every 0-credit course must be `condition` (an external requirement, never planned) |
| `level` | Course level (int), optional |
| `typical_year`, `typical_part` | Term the official plan puts the course in; not a constraint |
| `allowed_terms` | Term parts where the rules allow the course (hard); omitted = all |
| `offered_terms` | Term parts where it has run in the past; omitted = unknown |
| `offered_in_summer` | Has run in a summer term in the past (bool); omitted = unknown |
| `note`, `fills_next_term` | As in `data/` |

`allowed_terms` is a rule; `offered_terms` / `offered_in_summer` are history, which a
solver may treat as hard or soft.

### relations[]

One row is one AND-clause; its `any_of` list is the OR alternatives.
`{"course": "C", "type": "prerequisite", "any_of": ["A", "B"]}` = C needs A or B.

| Field | Meaning |
|---|---|
| `course` | The course that has the requirement |
| `type` | `prerequisite` (passed before), `corequisite` (before or same term), `recommended` (soft), `prior` (an obsolete name of a prerequisite; the planner treats it as `prerequisite`) |
| `any_of` | Non-empty list of course ids |
| `source` | `curriculum` (from this program) or `inferred` (from other programs); optional |

### groups[]

| Field | Meaning |
|---|---|
| `id`, `name` | `name` is shown to users |
| `type` | `mandatory` (all listed courses) or `elective` |
| `course_ids` | Members |
| `min_courses`, `min_credits`, `max_courses` | Bounds; null = none |
| `scope` | `listed` (default) or `any`: any course of the university counts, planned as slots |
| `slot_credits` | Credits per slot when `scope` is `any` |

### majors[]

`{"id", "name", "rule": {"type": "required_courses", "min_courses", "min_credits"?, "course_ids"}, "refines_group"?}`.
`refines_group` names the elective group whose course list the major narrows (the
student takes the group's courses from the major's list).

### milestones[]

`{"course", "min_credit_percent", "kind"?}`: the course may be taken only after this share
of the degree credits is earned. `kind` is a label such as `internship` or `thesis`.

### offerings

`{"unknown_policy": "assume-open", "records": [{"course", "term", "status": "not-offered" | "confirmed"}]}`.
A term without a record follows `unknown_policy`.

## students/<set>.json

Flat tables, as in `data/student_history.json`:

- `students[]`: `student_id`, `curriculum_id`, `grading_policy`, `cohort`,
  `enrollment_term`, plus new optional fields `current_term`, `declared_major`, `source`
  (`synthetic`, `simulated`, `real`, …), `note`.
- `attempts[]`: `student_id`, `attempt_id`, `course`, `term` (may be null when the source
  has no term), `grade` and/or `result` (`passed`, `failed`, `in_progress`), `course_kind`.
- `external_progress[]`, `expected[]`: as in `data/` (`expected` = oracle answers for tests).

## requests/<set>.json

A list of planning requests. Each has `id`, `label`, `curriculum_id`, `student_id`, then
any of:

| Field | Meaning |
|---|---|
| `in_progress_results` | `{course: "pass" | "fail"}` assumed result of in-progress courses |
| `locked` | `[{course_code, term}]` course pinned to a term |
| `not_offered`, `offered` | `[{course_code, term}]` student-reported offering |
| `assumed_fail` | `[{course_code, term}]` taken in that term and failed |
| `graduate_by` | Latest finishing term |
| `max_credits` | Cap on every term |
| `semester_limits` | `{term: {"min"?, "max"?}}` |
| `semester_targets` | `{term: credits}` |
| `summer_opt_in` | Summer terms the student is willing to study |
| `preferences` | Soft-objective settings (solver-specific keys) |

## policy/external.json

Optional. Requirements a student must meet outside the course plan (language standard,
physical education, social work, ...). The ASP engine reports their state (`engine_report`:
`graduation_blocked`, `external_pending`, `external_missed`); no solver schedules them.

`{"schema_version": 1, "requirements": [...]}`, each requirement:

| Field | Meaning |
|---|---|
| `id`, `name` | `id` is what `students[].external_progress[].requirement` names |
| `unit` | What is counted: `days`, `courses`, `certificate`, `level`, ... |
| `enforcement` | `blocking` (graduation waits for it) or `warning` |
| `cohorts` | `{"from", "to"}` intake years it applies to; null = open |
| `satisfied_by_courses` | Optional: condition courses (`kind: condition`) whose pass counts 1 each |
| `milestones` | `[{"deadline": {"type": "end_of_year", "year": Y} or {"type": "graduation"}, "min": N}]`: at least N units by the deadline |
| `source`, `review` | Where the rule comes from; `review: true` = not yet checked against the regulation |

Progress = passed `satisfied_by_courses` + the student's `external_progress` amounts.

## How the solvers receive the policy

`planner.model.input.to_planner_fixture(..., policy=...)` copies `grading`, `tuition`,
`external` and the curriculum's `graduation` into the planner input (`fixture["policy"]`),
together with every attempt (term, grade) and the external progress of the student. The
solvers read nothing else, so the evaluation cache key (a hash of the input) covers the
policy. The ASP engine compiles it with `planner/solvers/asp/policy.py`; per-term load
bounds always come from `planning`, for every solver.

## policy/standing.json

Optional; read by the synthetic student model (`synthetic/regulations.py`), not by the
solvers. A warning is given at the end of a main term when a threshold is crossed; more
than N consecutive warnings or suspensions, or reaching `max_main_terms`, means withdrawal.

| Field | Meaning |
|---|---|
| `credits_per_year`, `max_year` | Year level = accumulated credits // `credits_per_year` + 1, capped |
| `max_main_terms` | Maximum number of main terms (suspended ones count) |
| `min_main_load` | A main term below this load leads to a suspension next term |
| `warning.failed_share_above` | Failed credits above this share of registered credits |
| `warning.outstanding_failed_credits_above` | Failed, never-passed credits above this |
| `warning.term_gpa_below` | `{"first", "later"}`: term GPA thresholds |
| `warning.cumulative_gpa_below_by_year` | `{"1": x, ..., "later": y}` by year level |
| `withdraw_after_consecutive` | `{"warnings", "suspensions"}` |
| `_sources` | Where each number comes from (free text) |

## curricula/<id>/official_plan.json

Optional; the plan the university publishes, used as the "follow the official plan"
baseline (synthetic, evaluation). `semesters[]`: `{"semester": k, "credits",
"required": [course ids], "slots": {group id: number of courses}}`, with `k` the main-term
index from 1. `total_credits` is the sum. Courses and group ids must exist in
`curriculum.json`.

## catalog.json

Optional; for analysis across programs (profiling), not read by the solvers. A list of
`{"id", "cohort", "course_ids", "relations"}`, one per program, with `relations` rows as
in `curriculum.json`. Every course in a relation must be in `course_ids`.
