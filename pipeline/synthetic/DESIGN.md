# Synthetic pipeline: design (open loop)

**Status (23/11/2026):** implemented (steps 0–6, `README.md`); the closed-loop prototype was removed. Part B records the approved choices, the choices made during implementation (B6), and what is still open. Open items are config options with a stated default (`config.toml`).

**Idea:** synthesize students once, call the solver once per evaluated case, then evaluate from stored data. There is no simulation with the solver in the loop.

Part A lists the steps and what has to be chosen in each. Part B records the choices: approved ones, and open ones still to decide.

---

## Part A. The pipeline

```
Step 0  Inputs        curriculum, official plan, rules, fees, grade scale
Step 1  Population    student traits (and, optionally, per-student model parameters)
Step 2  Records       one run of each student through the program, NO solver -> transcripts
Step 3  Solve once    3a: one full plan per student from enrollment
                      3b: one remaining plan per cut record (a record truncated after k semesters)
                      results cached on disk by input
Step 4  Evaluate      4.1 full plans: solver vs agent record vs official plan vs baseline
                      4.2 solver on cut records
Step 5  Sensitivity   computed afterwards from the stored pool, with no new solves
Step 6  Checks        legality, determinism, score-model checks, recovery
```

Steps 1–2 cost about as much as the current baseline arm (200 students in about 24 s). Steps 4–6 only read stored data. Step 3 is the only expensive one, and it runs once.

### Step 0. Inputs

| Input | Source | To choose |
|---|---|---|
| Curriculum | `planner/fixtures/khmt2023.json` | – |
| Official plan | `synthetic/2023_MT_KHMT.pdf` (12/06/2025), transcribed to a JSON file and checked against the fixture by a script | How to place courses the PDF leaves open: free electives, group C split, internship |
| Attrition rules | QĐ 285, QĐ 1260 (`regulations.py`, README section 3) | – (already extracted) |
| Fees, grade scale | `engine/asp/policy.lp` | – |

### Step 1. Population

| Item | To choose |
|---|---|
| Traits | Which traits, and the distribution of each: ability, specialization, interests (tags), preferred load, early-finish preference, budget, summer willingness |
| Interests | How many tags per student; whether they depend on the specialization |
| Model parameters | Fixed at base values for everyone, or drawn per student from the stated ranges (needed for step 5) |
| Size | Number of students |

### Step 2. Records (one run, no solver)

Each student goes through the program once. Each semester the agent picks courses, the score model grades them, and the attrition rules apply. The run ends at graduation, withdrawal, or the 12-semester limit. The output is a full transcript per student.

| Item | To choose |
|---|---|
| Agent | Choice set and utility (`AGENT-MODEL.md`; redesign pending) |
| Reference plan the agent starts from | Official plan, or the current baseline rule |
| Score model | As now, plus possibly a load effect |
| Summer | Whether the agent can use summer, and under what rules |

### Step 3. Solve once

| Item | To choose |
|---|---|
| Solver | ASP and/or CP-SAT |
| Stopping rule | Time limit, or a reproducible limit; threads |
| Traits → scenario | Which traits the solver sees (load, summer opt-in, interests) |
| 3a cases | One per student, or one per distinct scenario |
| 3b cases | Which cut points (k = semesters finished) and in what mix |
| Cache | Key by solver input; reuse across reruns |

### Step 4. Evaluate

**4.1 Full plans, per student.** Compare up to four plans:

| Plan | What it is |
|---|---|
| Solver | Step 3a plan from enrollment |
| Agent record | The student's actual record from step 2 |
| Official | The PDF plan, adjusted to the student's electives |
| Baseline | The current "follow the curriculum" rule |

| Item | To choose |
|---|---|
| Plan metrics | For example: graduation semester, total credits, cost, summer use, load fit, interest match, legality |
| Grade comparison | Score every course appearing in any of the plans, for this student, and compare the plans' grade results |
| Failures in a plan | Main evaluation: first attempts only. Separate option: replay after a fail (measures the cost of failing) |

**4.2 Solver on cut records, per cut.**

| Item | To choose |
|---|---|
| Metrics | For example: legality, status and optimality, solve time, remaining semesters and cost against the official plan and baseline from the same state, retakes scheduled, graduation within 12 semesters |
| Breakdown | By record type: clean, one fail, several fails, warned; and by k |

### Step 5. Sensitivity

| Item | To choose |
|---|---|
| Design | Per-student parameter draws (one pool, solved once) or separate runs per setting |
| Method | A method that works on a given sample, e.g. SALib `delta` or `rbd_fast` with Latin hypercube draws, or a regression on the parameters |

### Step 6. Checks

Every plan and registration goes through `planner.validate`. Plus: reruns give identical output (for step 3 this depends on the ASP stopping rule, B2); the prior predictive check and parameter recovery for the score model (already built).

---

## Part B. Choices

| | Choice | Status |
|---|---|---|
| Approach | Open loop: synthesize once, solve once per case, evaluate from stored data; two evaluations (4.1 full plans, 4.2 solver on cut records) | Approved |
| B1 | Official plan from the PDF as a reference plan; the current baseline kept | Approved |
| B1 | Internship: ordinary course, usually semester 6; ASP `fills_next` | Approved |
| B2 | ASP only (the default); the pipeline itself is solver-agnostic (`solvers.py`, 23/11/2026), so CP-SAT or a modified solver can be evaluated on the same pool | Approved |
| B2 | ASP stopping rule; mapping the preferred load to ASP | Open (pilot first) |
| B3 | Cut-point mix | Approved |
| B4 | First attempts only as the main evaluation; replay after a fail as a separate option | Approved |
| B5 | Agent model changes | Accepted in principle, after the pipeline (`AGENT-MODEL.md` section 6) |
| B2 | Stopping rule default: 1 thread, 20 000 conflicts (`[solver]`); preferred load not passed (`load_mapping = "none"`). Pilot in `README.md` §6 | Open (default set) |
| – | Interests: 1–3 tags, weighted by the specialization's group-C courses (23/11/2026) | Approved |
| – | Population traits as in the prototype (`AGENT-MODEL.md` §2) | Kept |
| – | Sensitivity: one pool with per-student Latin-hypercube draws; method `src` (default) or SALib `delta` | Open (default set) |
| B6 | Choices made during implementation | See B6 |

### B1. Official plan (step 0)

- **Required courses:** the semesters in the PDF. They match the fixture's recommended semesters; five codes were spot-checked, a full check comes with the transcription script.
- **Free electives:** semesters 4, 6, 7 (PDF). The current baseline uses 6, 7, 8 and is kept as a separate plan.
- **Group C:** 2 courses in semester 7, 3 in semester 8 (PDF: 6 + 9 credits).
- **Groups A, B, D:** semesters 5, 6, 7.
- **Internship CO3335:** may go in any semester once its prerequisites and the accumulated-credit threshold are met. Semester 6 is the usual place (soft, not a rule); the official plan puts it there, with the internship carried out in the summer after.
  - **Credit threshold (65%, decided 23/11/2026):** counted as credits before the internship's term plus the other courses of that term, the internship excluded, since it is carried out after that term. The official plan as written has 82 credits before semester 6 (< 84) and 95 counting semester 6. The same counting applies to the specialized project and thesis thresholds. Implemented in the ASP engine (`milestone`) and `planner.validate`; CP-SAT is unchanged (stricter).
  - **ASP:** the adapter marks it `fills_next` (22/11/2026). Its credits and fee count in the term where it is placed, and the following term is kept empty. No placement restriction. Side effect: proving optimality got much slower on the fixture scenario (`planner/ASP-ADAPTER.md` §8).
  - **This pipeline:** the same rule for every plan and record, so they are comparable with ASP's plans. Credits and fee count in the term where it is registered, and the next term takes no other courses. A main semester kept empty this way is not "no registration" (QĐ 1260 withdrawal rule); the student is on the internship.

### B2. Solver (step 3): ASP only, for now

- **Engine:** `planner.solve_asp` (the product engine; supports interests). CP-SAT is not used and not changed.
- **What ASP sees from a student:**
  - specialization;
  - summer opt-in (`extra_sem`);
  - interests;
  - the state (passed, failed, current semester) for cuts.
- **What ASP does not see:** a preferred load band. ASP has no such objective, and its loads come from `policy.lp` (14–21 credits per main semester). Possible mapping: preferred maximum → `scenario.max_credits`. Not decided.
- **Stopping rule (open):** measured 22/11/2026 with 4 threads on a fresh KHMT student with summer opt-in: not proven optimal within 30 s with the adapter before `fills_next`, nor within 120 s with an earlier internship rule (since removed). Not yet measured with the current adapter; the pilot will do that. A wall-clock limit with several threads gives run-to-run differences. Candidate: 1 thread with a conflict limit (clasp `--solve-limit`), which is reproducible, and parallelism across cases instead of inside a solve. To be measured in a pilot before choosing.

### B3. Cut points (step 3b)

A cut after k finished main semesters (k counts semesters of study, not credits). Mix of cuts, from the proposal of 22/11/2026:

| k | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Share of cuts | 25% | 20% | 20% | 15% | 10% | 10% |

Year 1 is 45%, year 2 is 35%, year 3 is 20%.

The reason for the mix: students need the most support early, and years 1–2 are most of the active enrolment. The rationale cites about 72–76% first-year retention and 60–64% six-year graduation. The source of those figures is not recorded here, and they may not describe HCMUT, so they justify the shape of the mix, not exact values.

How a cut is drawn: sample (student, k) pairs among students still enrolled after k semesters, so the realized mix equals the table. Results are reported by k and by record type, so small groups (for example warned students) stay visible.

### B4. Grade comparison across plans (step 4.1)

For each student, every course that appears in any of the four plans gets a score from the score model. The noise is keyed on (seed, student, course, attempt), so the same course and attempt get the same noise in every plan (common random numbers). The deterministic parts still differ: a course taken in a later year gets the year effect, and a heavier semester would get the load effect if adopted. So differences between plans come from the plans, not from luck. The agent record's first attempts use the same draws, which serves as a consistency check.

**Main evaluation: first attempts only.** The goal is the quality of the plan itself, measured on synthetic students (there is no real data). Each plan's courses are scored once, at their planned semester, and the plans are compared on those results: expected and drawn failed credits, GPA, warnings the results would trigger, credits passed by semester.

**Separate option: replay after a fail.** This answers a different question, the cost of failing under each plan. The plan is replayed with a fixed repair rule: retake first, then the plan's next courses whose prerequisites are met, and push the rest later. It reports the extra semesters, extra cost and attrition caused by failures. It calls no solver and is reported apart from the main evaluation.

### B5. Agent model

The agent is only used in step 2, to produce the records. Its changes were accepted in principle and come after the pipeline (`AGENT-MODEL.md`, sections 5–7). Step 2 uses the section-3 utility without `trust` and without the section-6 changes (decided 23/11/2026).

---

### B6. Choices made during implementation (23/11/2026)

| Choice | Where |
|---|---|
| Step 2 reference plan: the official plan (`AGENT-MODEL.md` §7). The baseline rule is one of the four plans in step 4 | `agent.py`, `plans.py` |
| Agent option set: `plan`, `drop_hardest`, `plus_one`, `catch_up`, `all_left`; summer: `nothing` / `retakes` | `agent.py`, `AGENT-MODEL.md` §7 |
| Minimum load: options under 11 credits are dropped when another reaches 11; otherwise only "everything still registrable" is offered | `agent.py` |
| Suspension exemption: a sub-11 main semester is not a suspension reason when it holds every still-needed course that can be registered (`[rules] forced_underload_exempt`). The prototype exempted only the final semester | `simulate.py` |
| Internship placement (agent, baseline, replay): within semesters 1–8 only in a term followed by a summer; past semester 8, or as the last course, in any term; also when nothing else can be registered | `plans.internship_allowed` |
| A main semester kept empty by the internship counts toward the 12-semester limit and leaves the warning streak unchanged | `regulations.Standing.internship_semester` |
| Cuts: if the record's next main semester is a suspension, ASP gets it as `skip_semesters` | `solve.py` |
| Free electives in plans are named `ELECTIVE_j` (j-th in term order), the name of the j-th free-elective attempt in a record, so they share score draws | `plans.canonical` |

## Changes made to the existing code

| Kept | Replaced or removed |
|---|---|
| `regulations.py`, `curriculum.py`, `grades.py`, `population.py`, `checks.py`, `recovery.py`, legality via `planner.validate` | Closed-loop planner arm (`PlannerPolicy`, plan reuse), `policies.py`, `outputs.py`, OAT/Morris drivers |
| Baseline rule (as one of the four plans) | Baseline internship: registered at semester 6 with the `fills_next` rule, no longer forced into the summer |
