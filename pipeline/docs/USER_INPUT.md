# User input

What a student gives the planner. Part 1 is the checklist: read it and you
know what to provide. Part 2 is the reference for each item.

The same information can be written two ways:

- **JSON**: one record in `pipeline/data/student_history.json`, run with
  `--student-json FILE --student-id ID`.
- **ASP facts**: a `.lp` file such as `pipeline/engine/asp/student.lp`, run
  with `--solve FILE`. (There is no file called `student_input.asp`; any
  `.lp` file of student facts works.)

---

## Part 1. Checklist

### Required

| # | Give | JSON field | Example |
|---|---|---|---|
| 1 | Your student id | `student_id` | `"S006"` |
| 2 | The term you enrolled | `enrollment_term` | `"2024-1"` (year-part: 1 = fall, 2 = spring, 3 = summer) |
| 3 | The term your record is complete up to | `expected.as_of_term` or `as_of_term` | `"2025-1"` |
| 4 | Every course attempt so far, retakes included, each with its term and its grade or pass/fail result. Leave both out for a course in progress. | `attempts[]` | `{"course": "CO3001", "term": "2024-2", "grade": "A"}` |

That is enough for a plan. Everything below is optional.

### Optional: shape the plan

| # | Give | JSON field | Effect | Hard or soft |
|---|---|---|---|---|
| 5 | Your major | `major` | The plan must earn it; matching electives are labelled "AI major course". | Hard |
| 6 | Maximum total future tuition | `budget` | Total future fees ≤ this amount (million VND). | Hard |
| 7 | Courses to put in a specific term | `pin[]` | `{"course": "CO3335", "term": "2027-2"}` | Hard |
| 8 | Courses you will not take, in the whole plan or in one term | `ban[]` | `["CO3101", {"course": "CO3119", "term": "2027-1"}]` | Hard |
| 9 | Topics or electives you like or dislike | `interests` | `{"AI": 4, "CYB": -3, "CO3133": 10}`: weights −10..10, no zero; a course id targets one elective | Soft (lowest but one) |
| 10 | Passed courses you want to retake to improve the grade | `request[]` | The retake is planned. | Hard |

### Optional: other information

| # | Give | JSON field | Effect |
|---|---|---|---|
| 11 | External progress (e.g. social work days) | `external_progress[]` | Readiness to graduate; missed deadlines are reported. |
| 12 | A tuition program different from the curriculum's | `program` | Selects the fee schedule. |
| 13 | A course offered or not offered in a given term, against the catalog | `offer[]`, `closed[]` | Overrides `offered_terms` for that term. |
| 14 | The kind of an attempt (`regular`, `transfer`, …) | `attempts[].course_kind` | Only included kinds count in GPA. Default `regular`. |

### Run options (command line, not part of the record)

| Want | Option | Default |
|---|---|---|
| Allow summer terms | `--summer` | off |
| Plan further ahead | `--future-terms N` or `--semesters N` | 15 future terms |
| Other load limits | `--min-load N`, `--max-load N` | 14–21 regular, 0–12 summer |
| A one-off tuition cap | `--max-budget MONEY` | none |
| Several alternative plans | `--plans N` | 1 |
| A longer search | `--time-limit SECONDS` | 30 |

### Minimal and full examples

Minimal (schema v2 tables, as in `student_history.json`):

```json
{
  "schema_version": 2,
  "students": [
    { "student_id": "S100", "curriculum_id": "cs_2023",
      "grading_policy": "policy_2020", "cohort": 2024,
      "enrollment_term": "2024-1" }
  ],
  "attempts": [
    { "student_id": "S100", "attempt_id": "S100-01", "course": "CO1005", "term": "2024-1", "grade": "B+" },
    { "student_id": "S100", "attempt_id": "S100-02", "course": "MT1003", "term": "2024-1", "grade": "F" },
    { "student_id": "S100", "attempt_id": "S100-03", "course": "CO1027", "term": "2024-2" }
  ],
  "expected": [ { "student_id": "S100", "as_of_term": "2024-2" } ]
}
```

`MT1003` failed, so the planner schedules a compulsory retake. `CO1027` has
no grade, so it is in progress and assumed passed.

With every optional planning field, the `students[]` row becomes:

```json
{
  "student_id": "S100", "curriculum_id": "cs_2023",
  "grading_policy": "policy_2020", "cohort": 2024,
  "enrollment_term": "2024-1",
  "major": "AI",
  "budget": "120",
  "program": "Computer Science",
  "pin": [ { "course": "CO3335", "term": "2027-2" } ],
  "ban": [ "CO3101", { "course": "CO3119", "term": "2027-1" } ],
  "interests": { "AI": 4, "IPCV": 2, "CYB": -3, "CO3133": 10, "CO3137": -10 },
  "request": [ "CO1005" ],
  "offer": [ { "course": "SA4001", "term": "2026-3" } ],
  "closed": [ { "course": "CO3001", "term": "2025-1" } ]
}
```

The same student as ASP facts (what the JSON is translated into):

```prolog
enroll_part_in(1).
taken(co1005, 1).  map(g, co1005, b_plus).
taken(mt1003, 1).  map(g, mt1003, f).
taken(co1027, 2).                       % in progress: no grade
attempt_count(co1005, 1). last_attempt(co1005, co1005).
attempt_count(mt1003, 1). last_attempt(mt1003, mt1003).
attempt_count(co1027, 1). last_attempt(co1027, co1027).
gpa_last(co1005, co1005). gpa_last(mt1003, mt1003).
student_major(ai).
budget(120000).                         % 120 million VND, 3 decimals
pin(co3335, 11).  ban(co3101).  ban(co3119, 10).
interest(ai, 4).  interest(ipcv, 2).  interest(cyb, -3).
interest(co3133, 10).  interest(co3137, -10).
request(co1005).
offer(sa4001, 9).  closed(co3001, 4).
```

---

## Part 2. Details

### Terms and term indices

A term is written `YYYY-P` with P = 1 (fall), 2 (spring) or 3 (summer).
Internally, terms are numbered from 1 = your enrollment term, three per
academic year, summers included. For enrollment `2024-1`: `2024-1` = 1,
`2024-2` = 2, `2024-3` = 3, `2025-1` = 4, …, `2027-2` = 11. In ASP facts you
write these indices. The JSON path converts them for you.

`t`, the number of studied terms, is the index of `as_of_term`. Terms `1..t`
are history and never change; the plan starts at `t + 1`.

### 4. Attempts

| Field | Required | Meaning |
|---|---|---|
| `course` | yes | Course id from `curriculum.json`. An old code listed in `equivalents` is replaced by its current code. |
| `term` | yes | Term of the attempt. Attempts after `as_of_term` are ignored. |
| `grade` | one of `grade`/`result`, or neither | Raw letter grade (`A+` … `F`), exactly as on the transcript. |
| `result` | | `passed` / `failed` for a pass/fail course with no letter grade (e.g. ENG_GC, SA4001). |
| `course_kind` | no | `regular` (default), `transfer`, `audit`, … Only kinds in `included_course_kinds` count in GPA. |
| `attempt_id` | no | Your own id for the attempt, used in test oracles. |

- List **every** attempt, failed ones too. The second attempt of a course
  becomes retake `rt(course, 1)`, the third `rt(course, 2)`, and so on.
- An attempt with neither grade nor result is **in progress**. The planner
  assumes it will pass and reports it under "Assumed passes".
- A failed course from a mandatory group must be retaken; the planner
  schedules it as early as it can (soft priority 6).
- Retake grades are capped at `B` by the grading policy before GPA. Credit is
  earned once and is not lost by a later failed retake.
- An unknown course or grade is an error, so a typo is not silently ignored.

ASP form: `taken(X, I)`, `map(g, X, Grade)` or `result(X, passed|failed)`,
`attempt_count(E, N)`, `last_attempt(E, X)`, `gpa_last(E, X)`, optional
`course_kind(X, K)` + `kind_known(X)`. Grade atoms are lowercase with `+`
written `_plus` (`B+` → `b_plus`).

### 5. Major

`major` is a major id from `curriculum.json`: `AI`, `ASE`, `CYB`, `DSE` or
`IPCV`. The plan must credit at least 5 courses from that major's list
(hard). Without a major, the planner reports every major the plan happens
to qualify for, and the default "Computer Science" otherwise. A declared
major also labels matching elective slots ("one B3.4 elective (3 credits),
AI major course").

ASP form: `student_major(ai).`

### 6. Budget

`budget` is the most you want to pay in total future tuition, in the policy's
money unit (million VND), as a decimal string or number. Past terms are not
counted. If no plan fits, the result is UNSAT; rerun with `--explain` to
check whether the budget is the cause. `--max-budget` adds a cap for one
run; the tighter cap wins.

ASP form: `budget(B).` in fixed-point units (`120` million → `120000`).

### 7. Pin

`pin` puts a course in an exact term. Use it when the plan places a course
somewhere you know is wrong, typically the special courses whose timing
depends on the faculty's rules for that term.

- The term must be after `as_of_term`.
- The course must still be needed (or requested). Pinning a course you have
  already passed, without a `request`, is unsatisfiable.
- A pin also makes the course available in that term even if the catalog
  does not offer it then. `closed` for the same course and term still wins
  (unsatisfiable).
- A pinned elective is shown by name, not as a slot.
- Pins are hard, so several pins can make the plan impossible (load limits,
  prerequisites, milestones). Remove one and retry.

ASP form: `pin(co3335, 11).`

### 8. Ban

`ban` lists courses the planner must not schedule. Each entry is either

- a course id, `"CO3101"`: the course is never planned. Use it for electives
  you will not take. Banning a mandatory course you have not passed, or a
  compulsory retake, is unsatisfiable, and so is banning a whole elective
  group's remaining options.
- `{"course": "CO3119", "term": "2027-1"}`: the course is not planned in that
  term only, e.g. a term you plan to be away or a term with a bad lecturer.
  The term must be after `as_of_term`. Banning a term the course is pinned to
  is unsatisfiable.

A term ban has the same effect on the plan as `closed` for that course and
term (section 13); use `ban` for your own choice and `closed` for a course the
school does not run.

ASP form: `ban(co3101).`, `ban(co3119, 10).`

### 9. Interests

`interests` maps a keyword to a weight from −10 to 10 (non-zero integer).
Every elective gets a score: the sum of the weights of its keywords that you
weighted. Among plans that are equally good on every higher priority, the
planner picks the one whose electives have the highest total score.

Keywords you can use today:

| Keyword | Matches |
|---|---|
| `AI`, `ASE`, `CYB`, `DSE`, `IPCV` | Courses in that major's list (automatic tags, no extra data needed) |
| A course id, e.g. `CO3057` | That course only. Use +10 / −10 for a course you want / do not want; a planned elective you weighted by id is shown by name, not as a slot |
| A course `tags` entry in `curriculum.json` | Courses with that tag (no tags are defined yet) |

A course in several lists gets several weights. For example, CO3049 is in AI,
CYB and IPCV, so `{"AI": 4, "CYB": -3}` scores it +1.

Interest is soft and ranked second-lowest, below graduation time, retakes,
cost, special-course timing, level order and balance, so it never delays
graduation or adds cost. An unknown keyword is an error.

ASP form: `interest(ai, 4).`

### 10. Request

`request` lists courses to retake even though they are not failed, usually to
improve the grade. The retake is then compulsory. The retake grade is capped
at `B`.

ASP form: `request(co1005).`

### 11. External progress

```json
{ "student_id": "S100", "requirement": "social_work_days", "term": "2024-2", "amount": 3 }
```

Amounts add up over time. They are compared with the deadlines in
`graduation_requirements.json` (3 days by the end of year 1, 6 by year 2,
15 at graduation). The planner reports missed and pending deadlines. It
cannot plan this activity for you.

ASP form: `external_progress(social_work_days, 2, 3).`

### 12. Program

Tuition program name, used only to choose the fee rule. Default: the
curriculum's program. `--program` overrides it for a run.

### 13. Offer and closed

`offer: [{"course", "term"}]` makes a course available in a term the catalog
does not list. `closed` removes it from one term. Both refer to specific
terms, not to every year.

ASP form: `offer(sa4001, 9).`, `closed(co3001, 4).`

### What you do not give

- Grades for future courses: the planner assumes every planned course passes.
- Course placement for every elective: unnamed electives are planned as
  **slots** ("term 8: one B3.4 elective (3 credits)"). The JSON report lists
  the fully interchangeable alternatives for each slot under `options`.
- Special-course timing: integration, multidisciplinary, internship,
  specialized and capstone projects are pulled toward their typical terms
  automatically. Use `pin` if you need something else.
