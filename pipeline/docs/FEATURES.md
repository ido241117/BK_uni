# Features

Functional requirements the ASP planner (`pipeline/engine/asp`) currently
meets. Each feature lists what it does, what it reads, what it produces and
where it is implemented. Rule IDs (H…, R…) and priorities refer to
[CONSTRAINTS.md](CONSTRAINTS.md); input fields refer to
[USER_INPUT.md](USER_INPUT.md).

Status legend: **Supported**: implemented and tested. **Placeholder**:
implemented, but waiting for data. **Not supported**: see the last section.

| ID | Feature | Status |
|---|---|---|
| F-01 | Generate ASP facts from the JSON dataset | Supported |
| F-02 | Read a student record (JSON or ASP facts) | Supported |
| F-03 | Plan the remaining courses term by term | Supported |
| F-04 | Degree audit: groups, credits, majors | Supported |
| F-05 | Prerequisites, co-requisites, offering, milestones | Supported |
| F-06 | Retake planning | Supported |
| F-07 | Load bounds, summer terms, calendar | Supported |
| F-08 | Tuition and budget | Supported |
| F-09 | GPA report and target | Supported |
| F-10 | External requirements and readiness | Supported |
| F-11 | Typical term of special courses | Supported |
| F-12 | Courses that fill the following term | Supported |
| F-13 | Course notes | Supported |
| F-14 | Pin and ban courses | Supported |
| F-15 | Elective slots | Supported |
| F-16 | Interest keywords (tags) | Supported |
| F-17 | Popularity tie-breaker | Placeholder |
| F-18 | Elective symmetry breaking | Supported |
| F-19 | Ranked optimization and alternative plans | Supported |
| F-20 | Reports (text, Markdown, JSON, raw) and exit codes | Supported |

---

<a id="f-01"></a>
### F-01. Generate ASP facts from the JSON dataset

- **Does**: validates `curriculum.json`, `grading_policy.json`,
  `graduation_requirements.json`, `tuition_policy.json` and the optional
  `elective_popularity.json`, then writes `<curriculum-id>.lp`
  (`cs-2023.lp`) and `policy.lp`. Generated files contain facts only.
- **Run**: `python -m pipeline.engine.asp.cli` (no `--solve`). When solving,
  the facts go to a temporary directory.
- **Code**: `data.py` (validation), `translation.py` (`build_curriculum`,
  `build_policy`, `build_tuition`, `elective_classes`).

<a id="f-02"></a>
### F-02. Read a student record

- **Does**: `--student-json` reads one record from `student_history.json`
  (schema v2 tables or legacy v1). It resolves course equivalents, validates
  courses, grades, terms, pins, bans and interest keywords, numbers retakes,
  and converts terms to indices and budgets to fixed-point money.
  `--solve` reads ready-made ASP facts. `t` comes from `as_of_term`, or from
  the last `taken/2` term.
- **Code**: `translation.student_to_facts`, `core/translate.lp`.

<a id="f-03"></a>
### F-03. Plan the remaining courses

- **Does**: chooses a future term for every course still needed so that all
  hard constraints hold. Each planned course is assumed to pass, and an
  in-progress history course is assumed to pass ("Assumed passes").
- **Output**: per term: type, attempted and earned credits, fee, cumulative
  credits, courses (or slots, F-15), notes (F-13). Plus totals.

<a id="f-04"></a>
### F-04. Degree audit

- **Does**: counts credits per group (mandatory groups count every member;
  an elective counts in at most one elective group), checks the total
  (128), and checks the declared major (≥ 5 courses of its list). Reports
  every major the plan qualifies for. Rules H8–H14.
- **Output**: `degree_complete`, `major_earned`, `major_count`,
  `credited`, `passed_course`.

<a id="f-05"></a>
### F-05. Prerequisites, co-requisites, offering, milestones

- **Does**: H15–H18. Prerequisites in an earlier term (AND of OR-groups),
  co-requisites in the same or an earlier term, availability by
  `offered_terms` with `offer`/`closed`/`pin` overrides, and milestone credit
  thresholds before the internship (84), specialized project (90) and
  capstone (109).

<a id="f-06"></a>
### F-06. Retake planning

- **Does**: a failed compulsory course must be retaken; a `request` forces an
  improvement retake. One future retake per course; no attempt limit.
  Required retakes are scheduled as early as possible (soft priority 6);
  optional ones are discouraged. Retake grades are capped at `B` for GPA.
- **Output**: `must`, plan rows marked "(retake N)".

<a id="f-07"></a>
### F-07. Load bounds, summer terms, calendar

- **Does**: three parts per academic year (fall, spring, summer), computed
  from the enrollment part. Regular terms 14–21 credits (last term may be
  lighter), summer 0–12, summer only with `--summer`, regular terms
  contiguous. H3–H6.

<a id="f-08"></a>
### F-08. Tuition and budget

- **Does**: piecewise per-term fee schedule (flat tiers, per-credit excess
  over 18; summer per credit). Every billed term must match a rule.
  `budget`/`--max-budget` caps total future tuition (H23). Tuition is
  minimized at priority 5.
- **Output**: `semester_fee`, `total_cost`.

<a id="f-09"></a>
### F-09. GPA report and target

- **Does**: credit-weighted GPA with latest or best attempt selection,
  retake cap, half-up rounding once at the end. Reports the best reachable
  GPA and the average the remaining credits need for 2.50. The GPA is a
  report, not a constraint; an impossible target withholds
  `ready_to_graduate`.

<a id="f-10"></a>
### F-10. External requirements and readiness

- **Does**: cumulative external progress (social work days) against
  end-of-year and graduation deadlines. Reports missed and pending
  deadlines. `ready_to_graduate` = degree complete, no blocking external
  failure, GPA target not impossible.

<a id="f-11"></a>
### F-11. Typical term of special courses

- **Does**: pulls each course that has `typical_regular_term` toward that
  regular term (soft priority 4). Distance is counted in half steps: the
  K-th regular term is position 2K and a summer after it is 2K+1. Regular
  terms are counted from enrollment, history included, so "the 5th regular
  term" adapts to students who start in spring or take summers.
- **Data** (`curriculum.json`): integration projects (B3.2) 5, multidisciplinary
  (B3.3) 6, internship 6, specialized project 7, capstone 8.
- **Ordering**: there is no separate "integration → multidisciplinary →
  internship → specialized → capstone" rule. The increasing typical terms
  give that order softly. Internship → capstone and specialized → capstone
  are hard prerequisites, and specialized ↔ internship is a co-requisite (the
  same term is allowed, but not typical).
- **Evidence that it is needed** (sample `student.lp`, `--semesters 12`,
  best plan found in 60 s; neither run proved optimal):

  | Run | Without typical terms | With typical terms |
  |---|---|---|
  | no summer | integration term 5 (3rd regular), multidisciplinary term 7 (5th) | integration term 7 (5th), multidisciplinary term 8 (6th) |
  | with summer | integration, multidisciplinary, internship, specialized all in term 7 | integration term 7 (5th), multidisciplinary term 9 |

  Before this release, the same sample even placed integration and
  multidisciplinary in the first summer (term 3). The `last_semester` and
  `cost` values were the same with and without the objective.
- **Output**: objective value `typical_term`.
- **Code**: `extension.lp` §18, `optimize.lp`.

<a id="f-12"></a>
### F-12. Courses that fill the following term

- **Does**: a course with `fills_next_term: true` is registered in term I
  (credits and fee there) and keeps term I+1 empty (H7). This applies to an
  in-progress history attempt in term `t` too. Today only the internship
  (CO3335) has it: it is registered in spring and carried out in the
  following summer.
- **Output**: `reserved(Term, Course)`; text row "Reserved terms: semester 9
  kept empty for CO3335"; JSON `reserved_terms`.
- **Side effect**: the reserved term may be a regular term. Because regular
  terms must be contiguous, an internship registered in fall blocks every
  later regular term. With summers on, a plan can therefore register the
  internship in fall, leave spring empty and finish in the next summer. The
  sample student did exactly this (internship term 7, term 8 empty, capstone
  in summer term 9). If the internship can only be registered in spring,
  set its `offered_terms` to `[2]`; the catalog currently says `[1, 2, 3]`.
- **Milestone assumption**: the 65 % milestone is checked against credits
  earned before the **registration** term, not before the summer in which
  the internship is carried out.
- **Code**: `extension.lp` §17.

<a id="f-13"></a>
### F-13. Course notes

- **Does**: any course may carry a `note` in `curriculum.json`; it is shown
  whenever that course is planned. Current notes: the internship "needs
  faculty information" (registered here, carried out in the following
  summer); the other special projects warn that faculty regulations for the
  term may add requirements.
- **Output**: `course_note(Course, Text)`; text "note: …" under the course,
  Markdown italic, JSON `note`.

<a id="f-14"></a>
### F-14. Pin and ban courses

- **Does**: `pin` puts a course (first attempt or retake) in an exact future
  term and makes it available there; `ban` keeps a course out of the whole
  plan, or out of one term only.
  Both are hard (H24, H25). This is how a student corrects an untypical
  choice, e.g. pinning the internship to the term the faculty announces.
- **Input**: `pin: [{course, term}]`, `ban: [course | {course, term}]`; ASP
  `pin(E, I)`, `ban(E)`, `ban(E, I)`.
- **Validation**: unknown course, or a pin or term ban not after
  `as_of_term`, is an error before solving.

<a id="f-15"></a>
### F-15. Elective slots

- **Does**: an elective the student did not name (by pin or a course-id
  interest) is reported as a slot of the group it counts toward,
  not by course name: "one B3.4 elective (3 credits)". With a declared major,
  a matching elective reads "one B3.4 elective (3 credits), AI major course".
  Interest tags that matched are listed under the slot.
- **Output**: text code column `slot`. JSON `courses[].slot` = `{label, group,
  major, interests, representative, options}`. `representative` is the course
  the solver used. `options` are the other unplanned courses that are fully
  interchangeable with it (same class, F-18), so any of them can replace it
  without changing anything else in the plan.
- **Code**: `extension.lp` §20 (`elective_slot/2`, `slot_option/2`,
  `interest_match/2`), `engine.ElectiveSlot`.

<a id="f-16"></a>
### F-16. Interest keywords

- **Does**: `tag(E, K)` from `curriculum.json` course `tags`, plus automatic
  tags: each major list (AI, ASE, CYB, DSE, IPCV) and each elective's own id.
  The student gives `interest(K, W)` with W in −10..10. Each elective's score
  is the sum of the weights of its matching tags, and the planner maximizes
  the total score of the planned electives at soft priority 1. A course id
  as keyword (e.g. `{"CO3133": 10}`) targets one elective, so nobody has to
  rate every elective. The old `prefer` / `avoid` fields are removed; the
  JSON loader rejects them with a message pointing to `interests`.
- **Data**: no course `tags` are defined yet; the five major lists work with
  no new data.

<a id="f-17"></a>
### F-17. Popularity tie-breaker (placeholder)

- **Does**: at the lowest priority (0), prefers electives that more students
  have historically taken: cost = (highest count − course count) per planned
  elective; a course without a count counts as 0 once any count is known.
- **Data**: `pipeline/data/elective_popularity.json` lists all 57 elective
  courses with `"count": null`. Null counts are skipped, so the objective is
  inactive and always 0 today. Fill in counts (the number of students who
  took each course, from one comparable population, e.g. the same cohorts)
  and set `source` and `period`; no code change is needed. `--popularity
  PATH` selects another file.
- **Code**: `data.parse_popularity`, `translation.build_curriculum`,
  `extension.lp` §19, `optimize.lp`.

<a id="f-18"></a>
### F-18. Elective symmetry breaking

- **Does**: groups electives with identical curriculum facts into classes
  (`elective_class/3`) and keeps only the plan that uses the lowest-ranked
  members, in non-decreasing term order (R2). The current curriculum has 14
  classes of 2–5 courses (e.g. five CYB-only courses, five integration
  projects). Courses the student singled out are exempt.
- **Effect**: no change to the best objective value (tested); fewer
  equivalent models to search; `--plans N` alternatives differ in substance,
  not by renamed electives.

<a id="f-19"></a>
### F-19. Ranked optimization and alternative plans

- **Does**: eight lexicographic objectives: `last_semester`, `retakes`,
  `cost`, `typical_term`, `level_order`, `balance`, `taste`, `popularity`
  (CONSTRAINTS.md §2). `--opt-mode optN` proves optimality and returns up
  to `--plans` optimal plans; `ignore` returns feasible plans quickly;
  `--time-limit` bounds the search (default 30 s) and labels results "not
  proven optimal"; `--fill` pads with non-optimal plans.

<a id="f-20"></a>
### F-20. Reports and exit codes

- **Does**: `--format text|markdown|json|raw`, written to
  `reports/<student>-plan.<ext>` unless `--no-report`. `--explain` retries an
  UNSAT instance without the budget and with more terms. Exit codes: 0
  success, 1 input error, 2 UNSAT, 3 not proven optimal with
  `--require-optimal`, 4 no model before the time limit.

---

## Not supported

- Faculty rules for special courses that change each term are not modelled.
  The planner tracks typical timing (F-11), the hard prerequisites and
  milestones, and shows notes (F-13); use `pin` for the rest.
- Planning external activities (social work days): reported only.
- Grade prediction: every planned course is assumed to pass.
- Per-term elective offerings beyond `offered_terms` + `offer`/`closed`.
- Program-specific tuition inside one run: one fee schedule per run
  (`--program`).
- `soft_order/1` (generic soft prerequisites, `extension.lp` §15) is
  defined but not used by any objective.
- Proving optimality on large free instances: a student early in the
  program with the full elective pool usually ends at the time limit with a
  "not proven optimal" plan (e.g. the sample `student.lp`, 60 s).
