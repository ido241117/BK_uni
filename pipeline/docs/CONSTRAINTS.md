# Constraints

This file lists every rule the ASP planner (`pipeline/engine/asp`) enforces
(**hard constraints**) and every preference it optimizes (**soft
constraints**). Values quoted are those of the current dataset
(`pipeline/data`, curriculum `cs_2023`); they come from the JSON files, not
from the ASP code, so changing the JSON changes them.

- **Hard constraint**: a plan that breaks it is never returned. If no plan
  satisfies all of them, the result is `UNSATISFIABLE` (CLI exit code 2).
- **Soft constraint**: a cost the solver minimizes. Soft constraints are
  ranked lexicographically: a higher priority is never traded for any amount
  of a lower one.
- **Report**: something the planner computes and shows but does not enforce.

Where a rule is written: `extension.lp` (semantics), `optimize.lp`
(objectives), `translate.lp` (student history), `encoding.lp` (generic set
constraints). Section numbers (`§`) refer to `core/extension.lp`.

---

## 1. Hard constraints

### 1.1 Calendar and terms

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H1 | History is fixed: attempts in terms `1..t` are input, never moved. A `taken/2` fact after term `t` makes the instance unsatisfiable. | All history attempts | `t` = studied terms (`--t`, inferred) | `translate.lp` |
| H2 | An attempt is scheduled in at most one term. | Every course and retake | — | §1 |
| H3 | Extra terms (summer) stay empty unless summer planning is turned on. | Future summer terms | `extra_semester_type(summer)`; `--summer` sets `extra_sem=1` | §1 |
| H4 | Regular (core) terms form one contiguous block: a regular term cannot be skipped and then resumed. Summers may be skipped. | Future regular terms | `term_part_type/2` | §9 |
| H5 | Every planned term stays within its maximum load. | Every future term | regular ≤ 21, summer ≤ 12 credits (`curriculum.planning`, `--max-load`) | §9 |
| H6 | Every used term before the last one meets its minimum load. The last term may be lighter. | Every used future term except the last | regular ≥ 14, summer ≥ 0 credits (`--min-load`) | §9 |
| H7 | A term **reserved** by a fills-next course stays empty: if course E has `fills_next_term` and is registered in term I, term I+1 gets no course. E's credits and fee stay in term I. A history attempt in term `t` reserves term `t+1`. | Courses with `fills_next_term: true` (currently CO3335 Internship) | `fills_next/1` | §17 |

Because H4 forbids skipping a regular term, H7 has a side effect. A fills-next
course registered in a **fall** term reserves the following **spring**, so the
plan cannot use any later regular term. In practice the internship is
registered in the term before a summer (spring), as at the school. The
exception is a plan that can finish in the summer right after that spring;
see [FEATURES.md](FEATURES.md#f-12).

### 1.2 Degree requirements

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H8 | Every course of a mandatory group ends up credited (passed in history, in progress, or planned). | Groups A1–A5, B3.1, D, E | `groups[].type = "mandatory"` | §2 |
| H9 | Each group's counted credits are within its bounds. | Every group | e.g. B3.4 ≥ 15, C ≥ 9, B3.5 = 3 credits | §4 |
| H10 | Each group's counted course count is within its bounds (when not already implied by credits). | Groups with `min_courses`/`max_courses` | B3.2, B3.3: exactly 1 course | §4 |
| H11 | Total counted credits equal the degree requirement (lower = upper bound). | Whole degree | 128 credits (`min_total_credits`) | §4 |
| H12 | An elective counts toward at most one elective group (bucket). | Courses in several elective groups (B3.4 and C share 44 courses) | `elective_group/1` | §4 |
| H13 | A planned course must count toward some group: no "extra" courses beyond the 128 counted credits. | Every planned first attempt | — | §4 |
| H14 | A declared major must be earned: at least K courses from the major list are credited. | Students with `major` | K = 5 for AI, ASE, CYB, DSE, IPCV | §5 |

### 1.3 Course order and availability

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H15 | Prerequisites are credited in an **earlier** term. OR-groups need one option. | Courses with `prerequisites` | e.g. CO4337 needs CO3335, CO4029 and ENG_GC | §6 |
| H16 | Co-requisites are credited in the **same or an earlier** term. | Courses with `corequisites` | CO4029 with CO3335 | §6 |
| H17 | A course is only scheduled in a term where it is available: offered in that term part (`offered_terms`), or forced by `offer`, or by `pin`, and not `closed`. | Every planned course | `offered_slot/2`, `offer/2`, `closed/2`, `pin/2` | §7, §16 |
| H18 | Milestone: the credits accumulated **strictly before** the milestone course's term reach its threshold. | CO3335, CO4029, CO4337 | 65 % → 84, 70 % → 90, 85 % → 109 credits | §8 |

### 1.4 Retakes

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H19 | A failed compulsory course without earned credit must be retaken. | Mandatory-group courses whose latest attempt failed | grades from `grading_policy.json` | §2 |
| H20 | A requested retake must be scheduled. | Courses in `request` | `request/1` | §2 |
| H21 | Retakes are only generated with a reason (failed latest attempt, or a request), and at most one future retake per course is modelled. | All courses | — | §2 |

H19–H21 fix the *set* of mandatory retakes and put no limit on how many
retakes a student takes. When the mandatory retakes happen, and whether
optional retakes are taken, is decided by soft priority 6 (`retakes`).

### 1.5 Cost

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H22 | Every billed term matches exactly one fee rule, so no term is silently free. | Future terms with load | `fee_rule/6` from `tuition_policy.json` | §13 |
| H23 | Total future tuition does not exceed the budget. | Students with `budget` or `--max-budget` | money units (million VND) | §13 |

### 1.6 Student-stated rules

| ID | Constraint | Applies to | Data / parameter | Where |
|---|---|---|---|---|
| H24 | **Pin**: course E is scheduled in term I (first attempt or retake). A pin also makes E available in I; `closed(E, I)` still wins, so pinning a closed term is unsatisfiable. | Courses in `pin` | `pin/2` (term must be after `as_of_term`) | §16 |
| H25 | **Ban**: `ban(E)`: course E is not scheduled in any future term; banning a course the degree needs is unsatisfiable. `ban(E, I)`: E is not scheduled in future term I (same effect as `closed(E, I)`, but stated by the student); banning a pinned term is unsatisfiable. | Courses in `ban` | `ban/1`, `ban/2` (term must be after `as_of_term`) | §16 |

### 1.7 Redundant constraints (speed only, never change the best plan)

| ID | Constraint | Purpose | Where |
|---|---|---|---|
| R1 | Implied credit bound: the future terms together must carry at least the credits still missing (degree minimum − history credits + required retakes of credited courses). | Lets the solver do the arithmetic once instead of course by course. | §9 |
| R2 | Elective symmetry breaking. Interchangeable electives (`elective_class/3`: same credits, groups, majors, tags, requisites in both directions, offering, level, typical term, fills-next flag, note and popularity) are used in rank order and in non-decreasing term order. Courses the student singled out (pinned, banned in the plan or a term, interest by course id, requested, offered/closed, or in history) are exempt. | Removes plans that differ only by renaming identical electives; at least one best plan is always kept. | §20 |

---

## 2. Soft constraints

Ranked from highest to lowest priority. The number is clingo's priority
(`@N`) and the label is what the CLI and JSON show under `objective`.

| Priority | Label | Minimizes | Applies to | Data | Where |
|---:|---|---|---|---|---|
| 7 | `last_semester` | Index of the last used term (earliest graduation; with H4 this also minimizes the number of planned terms). | Whole plan | — | `optimize.lp` |
| 6 | `retakes` | (a) **Timing of required retakes.** H19/H20 fix which retakes must happen, but not when. This term adds up the term numbers of those retakes, so the solver schedules them as early as it can. (b) **Optional retakes.** A failed elective, or a failed course whose credit was already earned, may be retaken but doesn't have to be. Each such retake costs 1, so the solver prefers a new elective and skips pointless retakes. Cost (@5) alone doesn't stop them, because tuition is flat up to the credit threshold, so an extra course can be free. (a) and (b) share one level: one optional retake weighs the same as moving one required retake one term later. | Retakes | `must/1` | `optimize.lp` |
| 5 | `cost` | Total future tuition. | Billed future terms | `fee_rule/6` | `optimize.lp` |
| 4 | `typical_term` | Distance between each special course's term and its typical regular term, counted in half steps: the K-th regular term is position 2K, and a summer after the K-th regular term is 2K+1. | Courses with `typical_regular_term` (see table below) | `typical_term/2` | §18, `optimize.lp` |
| 3 | `level_order` | Sum of the term indices of planned level-1 and level-2 courses (lower-level courses earlier). | Courses whose level ≤ 2 | `course_level/2` (first digit of the id) | `optimize.lp` |
| 2 | `balance` | Load of the heaviest future term. | Future terms | — | `optimize.lp` |
| 1 | `taste` | Minus the total interest score of planned electives. Score of an elective = sum of the weights of its tags that the student weighted. A course-id interest (e.g. +10 / −10) targets one elective. | Elective courses | `interest/2`, `tag/2`, major lists | §19, `optimize.lp` |
| 0 | `popularity` | Sum over planned electives of (highest count − course count). An elective without a count counts as 0 once any count is known. **Inactive** while `elective_popularity.json` is all `null` (current placeholder). | Elective courses | `popularity/2` | §19, `optimize.lp` |

Typical regular terms in the current data (from the school's usual sequence
on an 8-regular-term plan):

| Course(s) | Kind | Typical regular term |
|---|---|---:|
| CO3101, CO3103, CO3105, CO3119, CO3127 (group B3.2) | Integration project | 5 |
| CO3107, CO3109, CO3111 (group B3.3) | Multidisciplinary project | 6 |
| CO3335 | Internship (registered; carried out in the following summer) | 6 |
| CO4029 | Specialized project | 7 |
| CO4337 | Capstone project | 8 |

Why `typical_term` exists (measured): integration and multidisciplinary
projects have no prerequisite and no milestone. Without this objective, the
sample student's best plans found in 60 s put both in the first summer
(term 3), or in the same term as the internship and the specialized project.
With it, they move to the 5th and 6th regular terms, and every
higher-priority value stays the same. See
[FEATURES.md](FEATURES.md#f-11) for the runs.

Not active: `extension.lp` §14–15 define a generic `soft_order/1`
"soft prerequisite" (`order_violation/3`), but no policy fact enables it and no
objective uses it.

---

## 3. Reports (computed, not enforced)

| Report | Meaning |
|---|---|
| Minimum GPA (2.50) | Not a per-term constraint. The planner reports the current GPA, the best reachable GPA (`gpa_best_case`), the average needed on the remaining credits (`gpa_required_avg`), and whether the target is already met or impossible. An impossible target withholds `ready_to_graduate`. |
| External requirements (social work days: 3 by end of year 1, 6 by year 2, 15 at graduation) | A missed past deadline or an unmet graduation minimum withholds `ready_to_graduate`; a future deadline is reported as pending. The planner cannot schedule external progress. |
| Course notes | `note` text of every planned course (e.g. the internship needs faculty information). |
| Reserved terms | Terms kept empty by H7. |
