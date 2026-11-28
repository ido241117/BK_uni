# Constraints

Every rule the planner enforces (**hard constraints**), every preference it ranks plans by
(**soft goals**), the assumptions behind a plan, and what it only reports. The rules are the
planner's, not one solver's: CP-SAT (`planner/solvers/cpsat.py`) and the ASP engine
(`planner/solvers/asp/`) implement the same list, and the validator (`evaluation/validate.py`)
re-checks the hard ones independently. Where a solver does not implement a rule, the table
says so; the details and the plan to close each gap are in
[PLANNER-PARITY.md](PLANNER-PARITY.md).

Rule values (credit bounds, thresholds, bands) come from the input, not from solver code:
the curriculum (`instances/<uni>/curricula/<id>/curriculum.json`), the policy files and the
request ([USER-INPUT.md](USER-INPUT.md)). Values quoted below are those of HCMUT, CS-2023-KHMT.
Shared rule code lives in `planner/model/facts.py` (input checks, credit limits, summer rule,
goal order) and `planner/model/normalize.py` (reshaping, no rules).

- **Hard constraint**: a plan that breaks it is never returned. If no plan satisfies them all,
  the status is `UNSAT` and the planner explains what blocks it (FEATURES.md F-07).
- **Soft goal**: a quantity the solver minimizes. Goals are ranked lexicographically: a higher
  goal is never traded for any amount of a lower one.
- **Report**: computed and shown, not enforced.

Principle (reviewer, 18/11/2026): **what the student says "must" is hard, what the student
"wants" is soft**, and every soft goal is reported back as met or not.

Sources: "QĐ 285" is the university's consolidated academic regulation (*Quy định về học vụ
và đào tạo, phiên bản hợp nhất*, 58 pages, read in full on 18/11/2026); article (Đ) and page
numbers are those printed on the page. Section 5 summarises its planning rules. "Team" marks a
rule the team set where the regulation is silent or was overridden on purpose.

---

## 1. Hard constraints

IDs H1–H15 are used in code, tests and warnings. ✓ = implemented.

| ID | Constraint | Source | CP-SAT | ASP | Validator |
|---|---|---|---|---|---|
| H1 | Each course is planned in at most one term | Obvious | ✓ | ✓ | ✓ |
| H2 | Every mandatory course is completed (passed, in progress and assumed passed, or planned) | Curriculum | ✓ | ✓ | ✓ |
| H3 | Each elective group reaches its credits and/or course count | Curriculum | ✓ | ✓ | ✓ |
| H4 | Prerequisite: the related course is **passed** in an earlier term. An in-progress course assumed passed counts; a failed one does not | QĐ 285 Đ2.1, p.2 | ✓ | ✓ | ✓ |
| H5 | Corequisite: the related course is passed earlier **or** taken in the same term. Same term is allowed with a warning: the course is only credited once the corequisite passes (reviewer, 19/11) | QĐ 285 Đ2.1, p.2 | ✓ | ✓ | ✓ |
| H6 | Prior relation (học trước): an obsolete name of a prerequisite, enforced as H4 (`normalize` turns `prior` into `prerequisite`). The database has 50 such relations over 96 programs, 2 in KHMT 2023 (CO3031 after CO2003; PE1005 after PE1003, which no longer matters since PE courses are condition courses). Before 28/11 it was ignored (reviewer, 18/11) | Team, 28/11 | ✓ | ✓ | ✓ |
| H7 | Credits per term within bounds (details in 1.1) | Team (11–25), QĐ 285 Đ15.3 says 14–21 | ✓ | ✓ | ✓ |
| H8 | A course is not planned in a term where it is not offered (`offerings` records, request `not_offered`) | Request | ✓ | ✓ | ✓ |
| H9 | A locked course is in its locked term (request `locked`) | Request | ✓ | ✓ | ✓ |
| H10 | Everything is finished by a given term (request `graduate_by`) | Request | ✓ | ✓ (horizon) | ✓ |
| H11 | Course level: level 1 for everyone, level 2 from study year 2, level 3 and above from study year 3. The level is the first digit of the course code. The study year is the cohort year (term `YYS` is year `YY − cohort mod 100 + 1`), or, with `planning.year_credit_thresholds`, the year reached by credits accumulated before the term (e.g. 28/56/84 for years 2/3/4). Active only with `planning.level_min_year` | QĐ 285 Đ15.4, p.12; PL1, p.27; Đ24, p.17 | ✓ | ✓ | ✓ |
| H12 | Graduation courses: internship ≥ 65 %, specialized project ≥ 70 %, thesis ≥ 85 % of the program's total credits, counted **through the course's own term, the course itself excluded** (decided 23/11, applied to every solver 28/11). In-progress courses count as passed | QĐ 285 Đ15.5, p.12; PL7, p.36; PL9, p.40 | ✓ | ✓ | ✓ |
| H13 | The free-elective block is planned as empty slots `FREE_k` of `slot_credits` (3) each, with no prerequisites | Curriculum | ✓ | ✓ | ✓ |
| H14 | Summer terms (details in 1.2) | QĐ 285 Đ14.1, p.10; Đ5.2, p.4; team | ✓ | ✓ | ✓ |
| H15 | Specialization: when the student declares a target major, electives of the parent group (e.g. elective group C) must come from that major's list; without a declared major the child lists are ignored | Curriculum (KHMT 2023 majors) | ✓ | ✓ | (normalize) |
| HC | Condition courses are never planned: `kind: condition` and **every 0-credit course** (ENG_GC, SA4001, PE1003, PE1005, MI1003 in KHMT) are external requirements (section 4) | Team, 21/11 and 28/11 | ✓ | ✓ | — (synthetic records include PE and military classes) |
| HS | Skipped terms (request `skip_semesters`) stay empty. Two consecutive skipped regular terms give a warning (leave of absence needs a request to the training office; at most 4 terms, QĐ 285 Đ32.1) | Request | ✓ | ✓ | — |
| HF | Frozen terms (request `frozen_semesters`): no course except pinned ones | Request | ✓ | not implemented | — |
| HA | Assumed failure (request `assumed_fail`): the course is taken in that term (its credits count in the term's load) but not passed, and must be retaken later; courses that need it move with it | Request (W1, 23/11) | ✓ | not implemented | — |
| HP | Absolute pins (`rules.pins_absolute`, web only): a pinned course stays in its term even where it breaks another school rule (the validator and the request report flag it). Pinning an already passed course plans an improvement retake: it counts in the term's load, not in accumulated credits (Q20, 22/11) | Request (sprint 11) | ✓ | not implemented | — |
| HM | A student-set minimum for a term (`semester_limits[term].min`) is hard | Request | ✓ | ✓ | ✓ |

### 1.1 Credits per term (H7)

The solver plans **all remaining terms at once**, not one after the other. When one term is
limited, its credits move to the other terms as long as no term exceeds its maximum. Example:
4 terms and 60 credits left, the student caps term 262 at 11: the other three carry 49
(16.3 on average, under 25), so graduation is on time. If they cannot, or prerequisites force a
sequence, graduation moves later and the result says so.

| Situation | Bound | Decided by |
|---|---|---|
| Default regular term | **11–25** (`planning.min_load`, `max_load`) | Reviewer, 18/11. QĐ 285 Đ15.3 says 14–21; 11 and 25 are conditional exceptions there |
| Regular term below 11, not the last | **Allowed**, never padded with extra courses; soft goal S11 tries to reach 11, below S2 (no surplus); a warning advises talking to the training office | Reviewer, 19/11 |
| Last term below 11 | **Allowed without a warning**: the university lets a student take few credits in the last term | Team, 28/11 |
| Summer term | ≤ **12** (`summer_max_load`), no minimum | Reviewer, 19/11 (QĐ 285 sets no summer limit) |
| Student wants less | `max_credits` (every term) or `semester_limits[term].max` | Student |
| Student sets a minimum for a term | `semester_limits[term].min`, hard | Student |
| Student wants N credits in a term (`semester_targets`, goal ST) | Load may deviate ±2; the target may exceed 25 / 12, with a warning (CP-SAT only) | Student (sprint 11, fix 23/11) |

Shown to the student: "The 11–25 range is wider than QĐ 285 (14–21). 11 and 25 are only
allowed under the conditions of article 15.3."

### 1.2 Summer terms (H14)

- A summer term is used only if the student opted into it (`summer_opt_in`, a list of terms;
  reviewer, 19/11). Before 19/11 only the external internship could go in summer.
- In an opted-in summer, only courses that ran in a summer before (`offered_in_summer`
  history), unless the history is soft (`rules.offering_soft`, Q9, 22/11) or the student
  reports the course as offered that summer (`offered`, W2, CP-SAT only).
- The external internship (`summer_always_allowed`, CO3335) may always go in summer.
- Projects never go in summer (`allowed_terms` without 3; courses with "đồ án" in the name:
  CO3101–CO3111, CO3119, CO3127, CO4029, CO4337; reviewer, 19/11).
- At most 12 regular terms from enrollment (QĐ 285 Đ5.2): the planning horizon. A skip that
  pushes past it gives UNSAT with the fix "do not skip term X"; a dedicated message is not done.

---

## 2. Soft goals

Goal ids are shared by every solver (`facts.py`). Definitions are those of `cpsat.py`; the ASP
engine implements the same definitions in `core/optimize.lp`.

| ID | Minimizes | Active | Reported back as | CP-SAT | ASP |
|---|---|---|---|---|---|
| ST | Deviation from the credits the student wants per term (`semester_targets`) | When targets are set; always first | Credits per term vs target | ✓ | — |
| S1 | Index of the last used term (earliest graduation) | Always | Expected graduation term | ✓ | ✓ |
| S6 | Number of recommended relations (`recommended`, KN) broken: the course is planned while the recommended course is neither passed nor planned earlier | Always | Broken pairs, "this plan does not follow recommendation X before Y" | ✓ | ✓ |
| S4 | Wanted courses (`preferences.wanted_courses`, not passed) left out | When wanted courses are given | Met / not met per course | ✓ | ✓ |
| S9 | Credits of level-3+ courses (not the internship) planned in summer: summer prefers general and foundation courses | With a summer opt-in | Level-3+ courses placed in summer | ✓ | ✓ |
| S7 | Per summer with study: credits outside the 6–9 band (`summer_preferred_load`; internship excluded) | With a summer opt-in | Credits of each summer and the deviation | ✓ | ✓ |
| S2 | Total planned credits (no surplus electives) | Always (may be disabled) | Total credits | ✓ | ✓ |
| S11 | Shortfall below 11 credits in regular terms before the last used one (an empty term counts fully) | Always | Total missing credits vs 11 | ✓ | ✓ |
| S8 | Regular-term credits above 15–18 (`preferred_load`), and below it except in the last term | When the curriculum or request has a band (may be disabled) | Total deviation | ✓ | ✓ |
| S5 | Load of the heaviest term (balanced load) | `preferences.balanced_load` | Heaviest and lightest term | ✓ | ✓ |
| S3 | Courses moved compared with the previous plan (`previous_plan`) | In what-if runs | Moved courses | ✓ | ✓ |
| S10 | Summer credits (internship excluded): regular terms before summers | With a summer opt-in | Total summer credits | ✓ | ✓ |
| OH | Placements in a term part where the course has not run in the recorded history (`offered_terms`), except pinned or reported-offered pairs | Only with `rules.offering_soft` | Warning per placement, with an "it is offered" confirm button | ✓ | ✓ |
| RT | Retakes of failed courses as early as possible; no unneeded retakes | Always | — | — | ✓ |
| FEE | Total future tuition | When the tuition policy is in the input | Fee per term | — | ✓ |
| LO | Term index of planned level-1/2 courses (lower levels first) | Always | — | — | ✓ |
| TA | Minus the interest score of planned electives (`interests`, course tags) | When interests are given | Planned courses per interest | — | ✓ |

### 2.1 Order

- **Default** (reviewer 18/11, S7–S11 added 19/11, S9 above S7 on 19/11):
  S1 > S6 > S4 > S9 > S7 > S2 > S11 > S8 > S5 > S3 > S10. Graduate earliest first; among
  those plans, break the fewest recommendations. With `rules.offering_soft`, OH sits just above S2.
- **Recommendations first** (`preferences.recommendations_first: true`): S6 > S1 > … The
  solver accepts a later graduation to keep recommendations; the result states the graduation
  term before and after ("keeping every recommendation finishes in 272, one term later").
- **Student order** (`preferences.order`, sprint 11 and stage 12): the student ranks the goals of
  `USER_PRIORITIES` (S1, S6, S4, S5, S10, OH, S3, S2, S8); the internal goals S9, S7, S2, S11, S8
  keep a fixed place after them; S2 and S8 are on by default and can be turned off with
  `preferences.disabled`. ST is always first when targets are set. The web page shows three
  goals (S1 graduate early, S8 15–18 credits, S2 no surplus), then sends the hidden ones in a fixed
  order (S6, S4, OH, S3, then S9, S7, S11); their final order (W12) is not decided.
- **Solver-specific goals** RT, FEE, LO, TA come after every shared goal, in that order; a request
  may move or disable them too.
- Each result lists the goals that ranked the plan ("Goals used by …, highest priority first").

Earlier orders, for the record: S1 > S4 > S2 > S5 > S3 (proposal, 18/11); S1 > S6 > S4 > S7 >
S9 > S2 > S8 > S5 > S3 (proposal, 19/11).

The reviewer's view on recommendations (18/11): a recommendation is advice; when no plan keeps
it, break it, but tell the student which pair and offer "keep recommendations first". KHMT 2023
has 18 recommended relations.

---

## 3. Assumptions shown with every plan

- Every course planned in the future is assumed passed.
- An in-progress course is assumed passed unless the request says it fails (matches QĐ 285
  Đ15.1).
- A course without offering information is assumed offered.
- The prior relation (HT) is a prerequisite; recommendations (KN) are wishes, not rules.
- Recommended terms in the curriculum are not binding.
- Regular terms try to reach 11 credits but are never padded; a term below 11 gets a note.
- With course levels on: the study year is the cohort year (or accumulated credits, H11); the
  level is the first digit of the course code. Levels 3, 4 and 5 are allowed from year 3
  (Đ15.4, followed where PL1 says level 4 from year 4; team, 28/11).
- Summers: only opted-in summers, only courses with a summer history, no projects, at most 12
  credits; without an opt-in, no regular course goes in summer.
- Language standard, MOS, military and physical education not declared by the student are
  assumed met for warnings (the thesis warnings use `student.flags`).
- The last regular term may hold fewer credits than the minimum (university practice; team,
  28/11), although QĐ 285 states no such exception (Đ15.3, Đ37.2).

---

## 4. Reports (computed, not enforced)

| Report | Content | Solver |
|---|---|---|
| External requirements | Requirements of `policy/external.json` (language standards, physical and military education, social work, MOS, basic IT, student activities) against the student's progress: missed past deadlines, pending ones, blocking at graduation | ASP |
| GPA | Credit-weighted GPA of the selected attempts (retake grade cap B), best reachable GPA, average needed for 2.50 | ASP |
| Tuition | Fee per planned term from `policy/tuition.json` | ASP |
| Majors | Majors the plan qualifies for (≥ 5 courses of a major list) | ASP |
| Warnings | `warning_items`, each with a rule reference (FEATURES.md F-08) | Both |
| Request report | Each student request met / warning / partial / unmet, with the reason | Both |
| Infeasibility | Which student choice or school rule blocks a plan, with one-click fixes | Both (explained with CP-SAT) |

---

## 5. Regulation reference: QĐ 285 rules that affect planning

### 5.1 Course relations

| Rule | Article, page | Planner |
|---|---|---|
| **Prerequisite** A of B: A must be accumulated before registering B; may require a minimum grade in A | Đ2.1, p.2 | H4 |
| **Corequisite** A of B: A accumulated earlier, **or** both in the same term; B is credited only once A is accumulated | Đ2.1, p.2 | H5; a failed A does not satisfy it |
| **Recommended**: advice only, does not block registration | Đ2.1, p.2 | S6 (reviewer, 18/11) |
| **Prior** (học trước): not defined by Đ2; "học phần trước" appears only in the special grade table (VP, HT grades count as "not passed, prior-course condition met") | PL14, p.55 | An obsolete name of a prerequisite: H6 = H4 (team, 28/11) |
| Equivalent or replacement course: taking it exempts the original course and earns its credits | Đ2.1, p.2; Đ19.1, p.14 | Not supported |
| English 1–4 form a prerequisite chain: basic English, then English 1, 2, 3 | PL7, p.35 | In the relation data when the program lists it |

### 5.2 Failing a course

| Rule | Article, page | Planner |
|---|---|---|
| A failed mandatory course must be retaken, or replaced by an equivalent when no longer taught | Đ3, p.3 | Hard: still planned |
| A failed elective may be retaken **or replaced by another elective** | Đ3, p.3 | Not forced back; the group only needs its threshold |
| Pass is grade D (4.0) or above; graduation courses need C (5.5) | Đ17.2, p.13; Đ18.3, p.14 | Outside the solver (pass/fail only) |
| Electives beyond a group's requirement count only up to the requirement | Đ20.1, p.15 | S2 (no surplus) |

### 5.3 Terms and duration

| Rule | Article, page | Planner |
|---|---|---|
| Two regular terms (15 weeks of classes, 2–3 of exams) and one summer term (6–13 weeks) a year | Đ6.1, p.5 | Input: term list |
| Term code `HKYYS`: 211, 212 are terms 1, 2 of 2021–2022; 213 is its summer | Đ6.1, p.5 | Input |
| Regular classes run in regular terms; the **external internship usually runs in summer**; summer classes are mostly audit classes | Đ14.1, p.10; Đ29.1, p.19; PL13, p.52 | H14 |
| Full-time: 8 planned terms, **at most 12 regular terms**; PFIEV 10 (max 14); part-time max 16 | Đ5.2, p.4 | Horizon |
| One extra term for priority students or by special decision | Đ5.3, pp.4–5 | Outside |
| Leave of absence: at most 4 terms, counted in the study time | Đ32.1, p.21 | Skip terms; warning for 2 consecutive regular terms |

No article sets a credit limit for summer terms; the planner uses the team's 12 (reviewer, 19/11).

### 5.4 Credits per term

| Rule | Article, page | Planner |
|---|---|---|
| Full-time: average 17 credits; **minimum 14, maximum 21** | Đ15.3, pp.11–12 | Team uses 11–25 (18/11); the page shows the regulation range |
| Minimum lowered to **11** for weak academic standing or health reasons, **at most 2 terms** | Đ15.3 | Needs the student's declaration |
| Maximum raised to **25** for excellent standing **and** faculty approval | Đ15.3 | Needs the student's declaration |
| Audit registration: up to 10 more credits, 28 in total | Đ15.3, p.12 | Outside |
| Part-time: 11–17 (9 for up to 3 terms; 19 if excellent) | Đ15.3 | Only for part-time programs |
| Registering below the minimum in a regular term **suspends the student for one term** | Đ37.2, p.24 | Why no term should be under the minimum |
| Dropping a course must keep the minimum | Đ16, p.13 | Outside |
| **Last-term exception**: only in the transition rules for cohorts ≤ 2020 (minimum 14, "except terms after the planned study time", which need one course); expired from term 2 of 2021–2022 | PL14, p.54 | Not in the current text, but the university allows a lighter last term in practice: planned without a warning (team, 28/11) |

### 5.5 Study year and course level

| Rule | Article, page | Planner |
|---|---|---|
| The study year depends on **N = credits accumulated since enrollment**, not the intake year | Đ24, p.17 | H11 with `year_credit_thresholds` |
| Registration threshold for full-time: **M = 28 credits** (85 % of 33 planned per year); part-time M = 22 | Đ24, p.17 | One value for every full-time program of the university, whatever its credits per year (team, 28/11): `year_credit_thresholds` = [28, 56, 84] |
| Year 1: N < M. Year 2: M ≤ N < 2M **and** year-2 language standard. Year 3: 2M ≤ N < 3M and year-3 standard. Year 4: 3M ≤ N < 4M and year-4 standard. Year 5: 4M ≤ N < 5M and year-4 standard | Đ24, p.17 | Credits only; language standards are external requirements |
| Military and physical education must be completed to be placed in year 3 | Đ24, p.17 | External requirements (end of year 2) |
| From cohort 2021: basic IT standard after year 1 to be placed in year 2 | PL9, p.40 | External requirement |
| Language standard per year (Vietnamese-taught programs): year 2 English 1; year 3 English 1–3; year 4 English 1–4. Not for the Japanese high-quality, part-time and distance programs | PL7, p.35 | External requirement |
| An in-progress course counts as passed when registering the next term | Đ15.1, p.11 | Assumption |
| Course level: level 1 for all; level 2 from year 2; **levels 3, 4, 5 from year 3** | Đ15.4, p.12 | H11 |
| Course code `MMLXXX[T]`: MM faculty or field, **L the level**, XXX a number | PL1, p.27 | Level = first digit |
| PL1 says level 4 is for year 4, levels 5–9 for year 5 | PL1, p.27 | Conflicts with Đ15.4; the planner follows Đ15.4 (team, 28/11) |

The reviewer first chose the cohort year for simplicity (18/11); from 22/11 (Q6) the web planner
uses accumulated credits 28/56/84. Consequence: the study year depends on the plan itself; a
level-3 course needs ≥ 56 credits before its term, and a failure can delay a whole chain.

### 5.6 Graduation courses

| Rule | Article, page | Planner |
|---|---|---|
| External internship, specialized project and thesis close the program; they need the language standard and accumulated credits | Đ15.5, p.12 | H12 |
| Internship: ≥ **65 %** of the program's total credits | Đ15.5 | H12 |
| Specialized project: ≥ **70 %** | Đ15.5 | H12 |
| Thesis: ≥ **85 %**, plus ≥ 70 % of the training (rèn luyện) program, plus the graduation language standard | Đ15.5 | H12; the rest are external requirements |
| To register the thesis only **Listening–Reading** of the graduation English standard is needed | PL7, p.36 | Thesis warning (`flags.english_grad_reading`) |
| From cohort 2021: **MOS** certificate (Excel and PowerPoint) to register the thesis | PL9, p.40 | Thesis warning (`flags.mos`); external requirement |
| Internship is a **corequisite** of the specialized project; both are **prerequisites** of the thesis | Đ15.5 | From the relation data (add relations if a program lacks them) |
| In-progress courses count as passed for accumulated credits | Đ15.1, p.11 | Matches |
| PFIEV: technical internship ≥ 55 %, engineering internship ≥ 75 %, thesis ≥ 85 %; chain worker → technical → engineering internship → thesis | PL10, pp.43–44 | Only if PFIEV is supported |

"Total program credits" is the denominator: for KHMT 2023 (128 credits) the internship needs
84, the specialized project 90, the thesis 109 (rounded up). The planner computes it as the
mandatory credits plus each top-level elective group's threshold (`normalize._total_credits`).

### 5.7 Graduation language standard

| Program | Listening–Reading (TOEIC) | Speaking–Writing | Page |
|---|---|---|---|
| Standard | 500 (cohort ≤ 2018), 550 (2019), 600 (from 2020) | 200 | PL7, p.35 |
| Talented engineers | 600, 650, 700 (same cohorts) | 245 | PL7, p.35 |
| PFIEV | as Talented, plus DELF B1 | 245 | PL7, p.35 |
| Part-time | 400–600 by cohort | 200 (from 2021) | PL7, p.35 |
| High-quality, Advanced (taught in English) | IELTS 6.0 or TOEIC 730 | 280 | PL8, p.38 |

TOEIC to English exemption: 400 exempts basic English; 450 also English 1; 500 also English 2;
550 also English 3; 600 also English 4 (PL7, p.36). Certificates are valid 2 years. The solver
does not derive language standards; it reads what the student declares.

### 5.8 The plan's assumptions against the regulation

| Assumption | Verdict | Basis |
|---|---|---|
| Future planned courses are assumed passed | Kept (a solver assumption; the regulation is silent) | — |
| An in-progress course is assumed passed unless stated otherwise | **Confirmed** | Đ15.1, p.11 |
| A course without offering information is assumed offered | Kept (assumption) | — |
| The last term may fall below the minimum | Not in the current text (only the expired transition rules), but **allowed in practice** (team, 28/11) | Đ15.3; PL14, p.54; Đ37.2 |
| Course level from the first digit of the code | **Confirmed** | PL1, p.27 |
| Study year from the cohort | **Rejected** by the text (credits plus language standard); chosen for simplicity on 18/11, replaced by credits on 22/11 in the web planner | Đ24, p.17 |
| No regular courses in summer | Kept for regular courses (18/11), replaced by the student's summer opt-in (19/11); the external internship usually runs in summer; no summer credit limit in the text | Đ14.1; Đ29.1 |
| H6 "prior" | Undefined in the text; an obsolete name of a prerequisite (team, 28/11) | Đ2, p.2; PL14, p.55 |
| H12 thresholds plus English | **Confirmed and extended**: the denominator is the total program credits; the thesis also needs 70 % of the training program and MOS (cohort ≥ 2021), and only Listening–Reading | Đ15.5; PL7, p.36; PL9, p.40 |
