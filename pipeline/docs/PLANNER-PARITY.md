# Planner parity

The planner (`pipeline/planner/`) has more than one solver. Parity means every solver reads
**the same input**, enforces **the same hard constraints**, accepts **the same request fields**
and ranks plans by **the same soft goals**, so that comparing solvers measures the solvers, not
their inputs. This file tracks where the solvers still differ, why, and how to close each gap.
The rules themselves are in [CONSTRAINTS.md](CONSTRAINTS.md), the features in
[FEATURES.md](FEATURES.md), the inputs in [USER-INPUT.md](USER-INPUT.md).

Solvers today: **CP-SAT** (`planner/solvers/cpsat.py`, the one students use) and the **ASP
engine** (`planner/solvers/asp/`). Every claim below was read from the code or measured on
2026-11-28, unless marked *reasoning*.

---

## 1. How parity is kept

| Mechanism | Where | What it guarantees |
|---|---|---|
| One input | `planner.model.input.to_planner_fixture` / `load_fixture`; the web backend sends the same shape | Same curriculum, student record, request and policy for every solver |
| One normalization | `planner/model/normalize.py` | Same condition courses, specialization lists, free-elective slots, total credits |
| Shared rule functions | `planner/model/facts.py`: `credit_limits`, `summer_allowed`, `graduation_needs`, `year_thresholds`, `preference_order`, … | Same bounds, summer rule, thresholds and goal order; no solver keeps its own rule values |
| One goal list | `facts.preference_order`, shared goal ids (CONSTRAINTS.md 2) | Same goals in the same order; solver-specific goals come after the shared ones |
| Capability declarations | `CAPABILITIES` in each solver, `facts.check_capabilities` | A request field or goal a solver lacks gives a warning (or an error with `strict=True`), never a silent skip; each result lists the goals used |
| Independent referee | `evaluation/validate.py` | Every plan of every solver is checked against the hard rules with code no solver shares |
| Cache fingerprints | `registry.shared_model_files` in every solver fingerprint | A change in shared planner code invalidates every solver's cached results |

---

## 2. Capability matrix

### 2.1 Request fields

| Field | CP-SAT | ASP | Note |
|---|---|---|---|
| `in_progress_results`, `locked`, `not_offered`, `graduate_by`, `max_credits`, `semester_limits`, `summer_opt_in`, `skip_semesters` | ✓ | ✓ | |
| `offered` | ✓ | — | CP-SAT only (team decision, 28/11) |
| `assumed_fail` | ✓ | — | CP-SAT only (28/11) |
| `frozen_semesters` | ✓ | — | CP-SAT only (28/11); removed from the web page |
| `semester_targets` (goal ST) | ✓ | — | CP-SAT only (28/11) |
| `rules.pins_absolute` | ✓ | — | Web only (28/11) |
| `interests` (goal TA) | — | ✓ | ASP only |

### 2.2 Goals

| Goal | CP-SAT | ASP |
|---|---|---|
| S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, OH | ✓ | ✓ (same definitions) |
| ST | ✓ | — |
| RT, FEE, LO, TA (`facts.SOLVER_GOALS`) | — | ✓ |

### 2.3 Rules and reports only one solver has

| Item | Only in | Status |
|---|---|---|
| Frozen terms, assumed failure, absolute pins (CONSTRAINTS.md HF, HA, HP) | CP-SAT | Kept CP-SAT only (decided) |
| GPA, tuition, external requirements, majors (reports) | ASP | See 4 (recommendation for CP-SAT) |

---

## 3. Open parity issues

| # | Issue | Evidence | Recommendation |
|---|---|---|---|
| P1 | **ASP does not prove optimality on real-size cases** | KHMT demo student: not proven after 180 s with 1 thread (about 30 s before 28/11, when ASP planned under the hard 14–21 credits of the former `policy.lp`). Its best plan had the optimal CP-SAT values of every shared goal in every case measured (toy, KHMT, two synthetic students) | Compare at a fixed budget (the evaluation's conflict limit) and report "not proven" honestly; or profile the encoding first, then tune (grounding of the credit sums, symmetry) |
| P2 | **Elective surplus** | CP-SAT may plan electives beyond a group's need (penalised by S2; the surplus counts toward the free elective, myBK rule). ASP only plans courses that count toward some group (`extension.lp` §4) | Decide which rule is right (myBK counting suggests CP-SAT's), then change the other solver and add a hand-checked case |
| P3 | **`max_courses` not enforced** | G2, G3, G5 of CS-2023-KHMT carry `max_courses = 1` (planner input `max_count`); neither solver enforces it; it contradicts the surplus rule of P2 | Decide together with P2 |
| P4 | **`year_credit_thresholds` slows CP-SAT** | Supported by both solvers and the validator but not set in CS-2023-KHMT: with `[28, 56, 84]` CP-SAT is not proven within 60 s on a plan from enrollment (graduation 271, unproven) against 2.9 s without (252). Late-stage students (the web) are fast | Before setting it in the research data, reformulate the CP-SAT constraint (one accumulated-credit variable per term with `only_enforce_if`, instead of a sum per course and term); measure on a synthetic pool |
| P5 | **Raw objective values differ** | S1 is a term index in ASP, a plan position in CP-SAT (constant offset) | Always compare through `planner.model.report.objective` (recomputed from the plan), as the tests do |

---

## 4. Recommendations for CP-SAT

Only the ASP engine computes GPA, tuition and external requirements. For a full comparison,
CP-SAT should add them as reports, and tuition as goal FEE. *Reasoning, not built:*

- **GPA.** It depends on the history only, not on the plan: compute it once in Python from
  `fixture["student"]["attempts"]` and `fixture["policy"]["grading"]`, as a shared function both
  solvers report; the ASP value becomes a cross-check. Known answers: the 7 oracle students of
  `instances/hcmut/students/khmt2023-oracle.json` (test `test_engine_gpa_matches_the_oracle`).
- **Tuition (goal FEE).** Fee per term = tier(load): one Boolean per (term, tier) with the load
  inside the tier bounds, and a linear fee expression. `instances.policy.fee_tiers` gives the
  tiers; the ASP test `test_tuition_is_computed_from_the_policy` gives a hand-computed answer.
- **External requirements.** Plan-independent like GPA, except the end-of-year deadlines: a
  shared Python report from `fixture["policy"]["external"]` and the progress covers both solvers.
- **Interests (goal TA).** `instances/hcmut/course-tags.json` gives each course's tags; the goal
  is a weighted sum over planned electives.
- **New solver fields.** When a solver gains a field or goal, update its `CAPABILITIES`, add the
  same-answer case to `planner/tests/test_parity.py`, and move the row in section 2.

---

## 5. How parity is checked

| Check | Test |
|---|---|
| Same status, graduation term and shared-goal values on every toy request; every plan valid | `test_parity.py::test_both_solvers_agree_on_the_toy_requests` |
| Hand-checked cases K1–K8d on both solvers | `test_cases_k.py`, `test_real_khmt.py` |
| Same rule on both solvers: course level by credits, 0-credit courses never planned | `test_parity.py` |
| Unsupported input warned, or rejected in strict mode; goals used stated | `test_parity.py` |
| Policy compiled for ASP equals the former hand-kept policy | `test_parity.py::test_policy_compiler_reproduces_the_former_policy_lp` |
| Validator as referee | every solver test calls `validate_plan` |

Measured on 2026-11-28: toy (5 requests) identical shared-goal values, all plans valid; KHMT
demo both graduate in 262 with the same shared-goal values; two synthetic students from
enrollment both graduate in 252 with the same shared-goal values.

---

## 6. Resolved (2026-11-28)

What differed before, and how it was resolved.

| Issue | Was | Resolution |
|---|---|---|
| Two curriculum files for one program | `cs_2023` (ASP command) vs `CS-2023-KHMT`; 18 relations hard in one, recommended in the other | `cs_2023` merged into `CS-2023-KHMT` and deleted; recommended relations are soft prerequisites (S6) in both solvers |
| Rule values | ASP read 14–21 credits from a hand-kept `policy.lp` | Every bound from the input; `policy.lp` replaced by `planner/solvers/asp/policy.py` (compiles grading, tuition, graduation GPA, external requirements from the JSON) |
| Regular-term minimum | Hard 14 in ASP, soft 11 (S11) in CP-SAT | Soft in both |
| Graduation-course thresholds | CP-SAT counted strictly before the term; ASP and validator through the term | Through the course's own term, the course excluded, everywhere (also in the request report) |
| Summer rule | ASP opened every summer to every course once any summer was opted in | Per-term opt-in, summer history and project exclusion from `facts.summer_allowed` in both |
| Internship fills the next term; no-gap goal | ASP only | Removed |
| Course level by credits | CP-SAT only, no canonical field | `planning.year_credit_thresholds`, both solvers and the validator |
| Goals | Different lists; only S1 shared | One goal list; ASP implements every shared goal but ST |
| Student record | Grades, attempt terms and external progress never reached the solvers; ASP read keys nothing wrote | Carried in the planner input; ASP retakes, GPA and progress from it |
| Unsupported request fields | Silently ignored by ASP | Capability declarations, warning or strict error |
| Offering history | ASP read a key nothing wrote | Goal OH from `offering_history`, as CP-SAT |
| Standalone ASP command | A second ASP path with its own loaders | Deleted; only the policy compiler kept |
| 0-credit courses | Military training (MI1003) still planned | Every 0-credit course is an external requirement, never planned by either solver |

---

## 7. Files

| File | Role |
|---|---|
| `planner/model/input.py`, `normalize.py`, `facts.py` | Shared input, reshaping, rules, goal order, capability check |
| `planner/solvers/cpsat.py` | CP-SAT and its `CAPABILITIES` |
| `planner/solvers/asp/adapter.py`, `policy.py`, `core/*.lp` | ASP engine, policy compiler, `CAPABILITIES` |
| `planner/solvers/registry.py` | Adapters, fingerprints |
| `evaluation/validate.py` | Referee |
| `planner/tests/test_parity.py` | Parity tests |
