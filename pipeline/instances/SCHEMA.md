# Canonical instance format (schema 3)

One folder per university. Every module (synthetic students, input profiling, solvers,
evaluation) reads this format; university-specific code lives only in importers.

```
instances/<university>/
  policy/grading.json             grade scale, GPA, retakes      (shared by curricula)
  policy/tuition.json             fees by program and term type  (shared by curricula)
  curricula/<id>/curriculum.json  courses, relations, groups, majors, planning bounds
  curricula/<id>/graduation.json  graduation and external requirements (optional)
  curricula/<id>/popularity.json  past enrollment per elective (optional)
  students/<set>.json             student histories as flat tables
  requests/<set>.json             planning requests / what-if scenarios
```

Validate with `python -m instances.loader instances/<university>`.

`policy/*.json`, `graduation.json`, `popularity.json` and the student tables keep the
field definitions of the former `data/` format (`data/README.md`); the changes are
listed in their sections below.

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

### courses[]

| Field | Meaning |
|---|---|
| `id`, `name`, `credits` | Required |
| `kind` | `regular` (default) or `condition`: a non-credit requirement recorded as a course (e.g. a language certificate) |
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
| `type` | `prerequisite` (passed before), `corequisite` (before or same term), `recommended` (soft), `prior` (attempted before; currently ignored by the solvers) |
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
