# User input

What the planner reads, at three levels:

1. **The canonical instance** a teammate edits (`instances/<uni>/`, full schema in
   [../instances/SCHEMA.md](../instances/SCHEMA.md)): the student record and the requests.
2. **The planner input** (the "fixture") that every solver and the validator read: built by
   `planner.model.input` from the instance, or sent by the web backend to `planner.cli`.
3. **The web backend request** a student's page sends.

Part 4 is the result. Which solver reads which field: [PLANNER-PARITY.md](PLANNER-PARITY.md)
section 2 (and each solver's `CAPABILITIES`); a field a solver does not implement gives a
warning, never a silent skip. Rules: [CONSTRAINTS.md](CONSTRAINTS.md); features:
[FEATURES.md](FEATURES.md).

---

## Part 1. What a student provides (canonical instance)

### Required

| Give | Where | Example |
|---|---|---|
| Student id, curriculum, cohort, enrollment term, current term | `students/<set>.json`, `students[]` | `"student_id": "S100"`, `"curriculum_id": "CS-2023-KHMT"`, `"current_term": "2025-1"` |
| Every attempt so far, retakes included, with its term and a grade or a result | `attempts[]` | `{"course": "CO3001", "term": "2024-2", "grade": "A"}` |

Terms are `YYYY-P` (P = 1, 2 regular, 3 summer). An attempt with `result: "in_progress"` is the
current term's course. Without a `result`, the grade decides pass or fail through
`policy/grading.json`. The term may be `null` when the source has none (the web database stores
no term per course); such attempts are placed in the current term.

### Optional

| Give | Where | Effect |
|---|---|---|
| Declared major | `students[].declared_major` | Electives of the refined group must come from that major (H15) |
| Progress on external requirements | `external_progress[]`: `{"requirement", "term", "amount"}` | Compared with `policy/external.json` (ASP report) |
| Planning requests | `requests/<set>.json` | Part 2.3; terms written `YYYY-P` (`term` instead of `semester_code`) |

A 0-credit course must be `kind: condition` in the curriculum: it is an external requirement,
never planned; list it under the requirement's `satisfied_by_courses` in `policy/external.json`.

---

## Part 2. The planner input (fixture)

One JSON object per case. Terms are HCMUT semester codes `YYS` (`241`, `242`, `243` = summer).

### 2.1 Curriculum and rules

| Field | Meaning |
|---|---|
| `curriculum` | `code`, `name`, `cohort`, `duration_years`, `min_semester_credits`, `max_semester_credits`, optional `program` (selects the tuition rule) |
| `rules` | Optional: `credits_min`, `credits_max` (override the curriculum bounds), `summer_credits_max` (default 12), `preferred_load` `[15, 18]` (S8), `summer_preferred_load` `[6, 9]` (S7), `summer_courses` (courses always allowed in summer: the external internship), `course_level` (H11 on), `year_by_credits` `[28, 56, 84]` (H11 by credits), `graduation_thresholds` `{"internship": 0.65, "specialized_project": 0.70, "thesis": 0.85}`, `offering_soft` (history is goal OH, not a rule), `pins_absolute` (web only) |
| `semesters` | Every term of the horizon, in order |
| `courses` | `{code, name, credits}` |
| `curriculum_courses` | `{course_code, recommended_year, recommended_term}` (the official plan's term; not a rule) |
| `course_relations` | `{course_code, related_course_code, type}`: `prerequisite`, `corequisite` (hard), `recommended` (S6), `prior` (an obsolete name of `prerequisite`, treated as one); optional `source`: `curriculum` or `inferred` |
| `course_groups` | `{name, kind: required/elective, required_count, required_credits, members, pool_scope: listed/any, pool_course_credits, parent, specialization, max_count}`. `pool_scope: any` is the free elective (slots); `parent` + `specialization` mark a major's list refining a group; `max_count` is carried but not enforced |
| `offerings` | `{unknown_policy: "assume-open", records: [{course_code, semester_code, status: confirmed/not-offered}]}` |
| `conditions` | Condition courses (external requirements); every 0-credit course is treated as one too |
| `summer_history` | Courses that ran in a summer before (absent = no filter) |
| `summer_excluded` | Courses never in summer (projects) |
| `offering_history` | `{course: ["1", "2", "3"]}` term parts where it has run (goal OH) |
| `graduation_courses` | `{kind: code or [codes]}` for the H12 thresholds |
| `policy` | Optional: `grading`, `tuition`, `external`, `graduation` documents (instances/SCHEMA.md). Read by the ASP engine (GPA, tuition, external requirements); part of the evaluation cache key |

### 2.2 Student

| Field | Meaning |
|---|---|
| `current_semester` | The term in progress; the plan starts after it |
| `student_courses` | `{course_code, status}`: `completed`, `in-progress`, `failed`, `not-started`; one row per course |
| `target_specialization` | Declared major (H15) |
| `attempts` | Optional full record: `{attempt_id, course_code, semester_code, grade, result, course_kind}` per attempt (the ASP engine uses it for retakes and GPA) |
| `external_progress` | Optional `{requirement, semester_code, amount}` |
| `block_overrides` | `{course: block name}`: the student's block choice (T46) |
| `free_choices` | Courses outside the program typed into the free elective (T62) |
| `scores` | Optional `{code, score, letter}` from a myBK file (ASP GPA when the grading policy is present) |
| `graduation_conditions` | Optional `{code, passed}` from a myBK file (`ENG_GC_600` maps to `ENG_GC`) |
| `flags` | Optional `english_grad_reading`, `mos` (false gives the thesis warnings) |
| `source` | Optional data origin (`synthetic`, `real`, …) |

### 2.3 Request (scenario)

| Field | Meaning | Hard / soft |
|---|---|---|
| `id`, `label` | Request name | — |
| `in_progress_results` | `{course: "pass" | "fail"}` for **exactly** the in-progress courses | Hard |
| `locked` | `[{course_code, semester_code}]` | Hard (H9) |
| `not_offered` | `[{course_code, semester_code}]` | Hard (H8) |
| `offered` | `[{course_code, semester_code}]`: lifts the summer-history rule and the OH warning for that pair | — |
| `assumed_fail` | `[{course_code, semester_code}]`: taken and failed there, retaken later; the course must be in the program and not passed | Hard (HA) |
| `graduate_by` | Latest finishing term | Hard (H10) |
| `max_credits` | Cap on every term | Hard |
| `semester_limits` | `{term: {"min"?, "max"?}}` | Hard |
| `semester_targets` | `{term: credits}`; load within ±2, may exceed the bounds (warning) | Soft, first (ST) |
| `summer_opt_in` | Summer terms the student will study | Hard (H14) |
| `skip_semesters` | Terms kept empty | Hard (HS) |
| `frozen_semesters` | Terms with pinned courses only | Hard (HF) |
| `preferences.wanted_courses` | Program courses the student wants | Soft (S4) |
| `preferences.balanced_load` | Turns S5 on | Soft |
| `preferences.recommendations_first` | S6 above S1 | Soft |
| `preferences.preferred_load` | `[low, high]` band, overrides `rules.preferred_load` | Soft (S8) |
| `preferences.order` | Goal ids in the student's order (S1, S6, S4, S5, S10, OH, S3, S2, S8, RT, FEE, LO, TA) | Soft |
| `preferences.disabled` | Goals turned off (S2, S8, RT, FEE, LO, TA) | Soft |
| `interests` | Tag names | Soft (TA) |
| `use_inferred_relations` | Use relations inferred from other programs (default false) | — |

Every term in a request must be a remaining term of the plan; `summer_opt_in` terms must be
summers. `previous_plan` (`{course: term}`, CLI only) feeds S3 and `diff_vs_previous`.

---

## Part 3. The web backend request (`POST /api/plans/solve`)

Owned by the web team (`Backend/src/planner/`); recorded here as of 23/11/2026.

```json
{
  "solver": "cpsat",
  "graduate_by": null,
  "in_progress_results": { "CO3005": "pass", "CO3117": "fail" },
  "locked": [ { "course_code": "CO3061", "semester_code": "262" } ],
  "not_offered": [ { "course_code": "CO3001", "semester_code": "262" } ],
  "offered": [], "assumed_fail": [], "summer_opt_in": [], "skip_semesters": [],
  "semester_targets": { "262": 15 },
  "preferences": { "wanted_courses": ["CO3117"], "order": ["S1", "S8", "S2"] },
  "previous_plan": { "CO3001": "262", "CO4337": "271" }
}
```

The student, the program and the course statuses are **not sent**: the backend reads them from
the logged-in account (`loadSource`) and builds the planner input (`buildPlannerInput`,
`planner-input.ts`): program courses, groups, relations, course statuses (from the imported myBK
file plus the student's adjustments), block choices, and the rules of `PLANNER_RULES` (11–25,
course levels, summer 12, 15–18, 6–9, 65/70/85 %). No name or student id goes to the solver.
The earlier fields `max_credits` (removed from the page 23/11) and `semester_limits`,
`student_flags` (H11, H12) are still accepted by the planner.

Flow:

```
Student's course statuses ◄── myBK progress file (PDF, or pasted page text) + the student's adjustments
Recommendation page (React)
   │  POST /api/plans/solve   (request + what-if settings)
   ▼
Backend NestJS, module planner
   │  reads the database: program, courses, groups, relations, course statuses
   │  builds the planner input (JSON), writes it to PLANNER_DUMP_DIR when set
   │  calls: python -m planner.cli --solver cpsat|clingo
   ▼
pipeline/planner: input checks -> solver -> validator -> result JSON
```

Backend decisions (18–24/11): the solver stays in Python and is called on the command line
(each layer tested on its own); the shared database schema is not changed by the planner work
(extra data lives in repo files until approved; exceptions approved by the reviewer: the
`student_progress_imports` table on 20/11 and `student_profiles.curriculum_id` set from the
imported file); students use CP-SAT, the ASP choice is hidden (Q13); the page state is stored
per account in `student_progress_imports.data.web.planner`.

Where each field comes from (web database, as analysed on 22/11):

| Source | Has | Lacks or differs | Use |
|---|---|---|---|
| myBK progress PDF or pasted text | Program code, blocks, block courses (also not taken), pass mark, grades, accumulated credits, graduation conditions | No "in progress"; "--" means both not taken and failed (default: not taken, the student corrects it, Q3); no term per course | Course statuses, rewritten on every import |
| Adjustment page (`student_courses`, `data.web`) | 4 statuses, current term, notes, block choices | Statuses are rewritten by the next import (term and notes kept) | The only status input of the solver (Q2) |
| `curricula` (132) | `source_code`, total credits, 11–24 credits per term | Differs from QĐ 285 (14–21) | Program lookup by myBK code; the solver does **not** use the database's credit bounds |
| `curriculum_courses` | Courses, recommended term | KHMT 2023: 37 of 96 courses have one | S6 / comparison; the group's term can fill in (Q10) |
| `course_groups` | Mandatory / elective, credits or course count, major child groups; recommended term per group | The free elective lists no courses | H3, H13, H15 |
| `course_categories` | "Tốt nghiệp" / "Học phần tốt nghiệp" / "Tốt nghiệp bậc cử nhân", "Điều kiện tốt nghiệp" | Project names vary ("Đồ án 2", "Đồ án ngành 1"…); 45 of 132 programs have no detected specialized project (Q11) | Graduation courses for 65/70/85 % (fixed for renamed groups on 21/11, T37) |
| `course_relations` | Prerequisite, prior, corequisite, recommended per program (KHMT 2023: 37) | Source unclear (syllabus or program); KHMT: 37 in the database vs 32 in the program PDF (31 shared; 6 added, 1 missing), to check (Q16) | H4, H5, S6; inferred relations not used |
| `course_opened_semesters` | Terms a course **has** run (KHMT 2023: 201–261, with summers) | Not an offering plan | Summer history (H14), offering history (OH) |
| `curriculum_regulations`, `student_regulation_statuses` | Military and physical education, English, student activities, self-declared | Overlaps the graduation conditions; page hidden 22/11 | Not read by the solver (conditions come from the adjustment page, Q12) |
| `student_profiles` | Program, intake year, target major | Target major rarely filled | Cohort (H11), H15 |

The myBK progress parser (`instances/importers/hcmut/mybk.py`, PDF or Excel on stdin, JSON on
stdout) gives the normalized data the backend stores:

```json
{
  "official_program_code": "DH_CQ_MT_KHM_2023",
  "specialization": "Khoa học Máy tính",
  "total_required": 128, "total_earned": 111,
  "blocks": [
    { "name": "Cơ sở ngành", "kind": "BB", "required_credits": 24, "earned_credits": 24,
      "courses": [ { "code": "CO2003", "credits": 4, "passed": true } ] }
  ],
  "graduation_conditions": [ { "code": "SA4001", "passed": false } ]
}
```

---

## Part 4. Result

```json
{
  "status": "OPTIMAL",
  "solver": "cp-sat",
  "solve_ms": 180,
  "semesters": [
    { "semester_code": "262", "credits": 17,
      "courses": [ { "code": "CO3001", "credits": 3, "reason": "required", "locked": false,
                     "block": null, "slot": false } ] }
  ],
  "graduation_semester": "271",
  "preferences_report": [ { "id": "S4", "detail": "...", "satisfied": true } ],
  "assumptions": ["..."],
  "warnings": ["..."],
  "warning_items": [ { "kind": "corequisite", "course": "...", "semester": "...", "rule": "QĐ 285 Điều 2.1",
                       "text": "...", "message": "..." } ],
  "requests": [ { "kind": "pin", "item": "CO3061 → 262", "status": "met", "detail": "..." } ],
  "unverified_prerequisites": ["CO3089"],
  "inferred_relations": [],
  "violations": [],
  "diff_vs_previous": ["~ CO4337 doi 271 -> 272"],
  "infeasible_reason": null,
  "infeasible_fixes": [],
  "course_facts": { "CO3001": { "prerequisites": [], "corequisites": [], "summer": true, "terms": null } },
  "credit_rules": { "main_max": 25, "summer_max": 12 },
  "engine_report": null
}
```

- `status`: `OPTIMAL`, `SAT_NOT_PROVEN_OPTIMAL`, `UNSAT`, `TIMEOUT`, `INPUT_ERROR` (then `error`
  gives the reason).
- `violations` non-empty means a solver bug; the page shows a red warning.
- `engine_report` (ASP only): objective per goal, GPA, tuition per term, majors, external
  requirements, recommendations broken, load deficits, offering misses, interests, stop reason.
- Texts shown to students are Vietnamese; internal validator messages are not accented.
