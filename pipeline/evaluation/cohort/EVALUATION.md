# Evaluation: techniques and metrics

What step 4 (`evaluate.py`), step 5 (`sensitivity.py`) and step 6 (`checks.py`) compute, how,
and how to read each number. Figures and tables of a run: `data/<pool>/solver-<label>/report.md`
(`visualize.py`). Design background: [DESIGN.md](DESIGN.md) Part A, B3, B4.

Everything here works for any solver (`solvers.py`): the solver's plan is read in the common
format (`{term: [courses]}` plus a common status), and every metric is computed by the
pipeline itself, not taken from the solver's own report.

## 1. Techniques

### 1.1 Open loop: synthesize once, solve once, evaluate from stored data

Students and their records are generated once (steps 1–2), each case is solved once (step 3,
cached), and all evaluation reads the stored files. Re-evaluating, changing a metric or
drawing figures never calls the solver again. A modified solver gets a new cache fingerprint
and its own output folder, so old and new results can be compared on the same students.

### 1.2 Four plans per student (4.1)

| Plan | What it is | Built by |
|---|---|---|
| **Solver** | The solver's full plan from enrollment (step 3a) | the solver |
| **Official** | The PDF plan (`official_plan.json`), electives from the student's own preference order | `plans.spec_plan` |
| **Baseline** | "Follow the curriculum" rule (`[baseline]`), every course assumed passed | `plans.allpass_plan` |
| **Agent record** | The courses the agent actually registered in step 2, at their **first** attempt | `evaluate.record_plan` |

The solver, official and baseline plans assume every course is passed. The agent record is
what the simulated student did, including the effect of fails (later courses pushed back,
some students withdrawn before finishing).

### 1.3 First attempts only (main evaluation, DESIGN.md B4)

Each course of a plan is scored **once**, at its planned term, as a first attempt. Nothing is
retaken. This measures the plan itself: given this student, how risky is this arrangement of
courses? The scores come from the score model (README §4):
`score = clip(mu + a(θ − b_c) + year_effect·(year−1) + ε)`.

### 1.4 Common random numbers (CRN)

The noise ε for (student, course, attempt) comes from a generator keyed on those ids. The
same course at the same attempt therefore gets the same noise in every plan and in the
agent's record. Differences between plans come from the plans (which courses, which year),
not from luck, which makes the paired differences far more precise than independent draws.
Free electives are named `ELECTIVE_j` (the j-th free elective in term order) in every plan,
so they share draws too. Check: the agent record's first-attempt scores recomputed in step 4
equal the transcript (`checks pool`, `crn_problems`).

### 1.5 Paired differences with bootstrap intervals

Comparisons are made **per student**: solver minus other plan for the same student, then
averaged. The 95% interval is a percentile bootstrap over students (2 000 resamples, seed 0,
`[evaluation] bootstrap`). An interval that excludes 0 means the difference is unlikely to be
sampling noise **for this synthetic population**; it says nothing about real students.

### 1.6 Replay after a fail (separate option, `--replay`)

A different question: what does failing cost under each plan? The plan is followed with real
(simulated) grades and the attrition rules, using a fixed repair rule each term: retakes
first, then the plan's overdue courses, then this term's courses, within
max(planned credits, preferred maximum) ≤ 25 in a main semester (summer: the plan's summer
courses and, for opted-in students, retakes, ≤ 12). Courses that do not fit or whose
prerequisites are not met are pushed later. No solver is called. Reported apart from 1.3.

### 1.7 Cut records (4.2)

A cut is a record truncated after k finished main semesters (B3 mix: k = 1..6 with shares
25/20/20/15/10/10%), sampled among students still enrolled after semester k. The solver plans
the rest from that state (passed, failed, current term). The official plan and the baseline
are followed from the same state with the repair rule of the baseline (retakes, overdue,
this semester; all passed). Results are reported by k and by record type:

| Record type | Definition (up to the cut) |
|---|---|
| clean | no failed attempt |
| one_fail | exactly one failed attempt |
| several_fails | two or more failed attempts |
| warned | at least one academic warning (takes precedence over the fail counts) |

### 1.8 Sensitivity from a pooled design (step 5)

Instead of re-running the pipeline per parameter setting, one pool is made with every ranged
parameter drawn **per student** (Latin hypercube over [low, high]). Each student is one
sample of (parameters → outputs).

| Method | What it measures | Read it as |
|---|---|---|
| `src` (default) | Standardized regression coefficient: OLS of the standardized output on all standardized parameters | Change of the output (in SDs) per SD of the parameter, others fixed. Valid when the effect is roughly linear and additive; R² says how much of the output's variance the linear fit explains |
| `delta` | SALib moment-independent δ (Plischke estimator), with its bootstrap confidence | How much knowing the parameter shifts the whole output distribution (0 = none). Captures non-linear effects; no sign |

Per-student outcomes are dominated by ability θ, which is not a parameter, so R² is low at
small n. Read coefficients only from large pools and with their R².

## 2. Metrics, 4.1 (per student and plan; `eval_full.csv`, one row each)

### 2.1 Plan structure

| Column | Definition | Notes |
|---|---|---|
| `legal` | No error from `planner.validate` (completeness ignored) and the term after an internship is empty (`fills_next`) | Summer opt-in as the student's |
| `n_errors`, `errors` | Number and text of those errors | |
| `complete` | Passed-in-plan courses satisfy every graduation requirement | Agent record: false for students who withdrew |
| `grad_term` | Last term holding a course | |
| `grad_k` | Main semesters from enrollment up to `grad_term`; a summer counts as the main semester before it | Record: the last first-attempt term, not the graduation semester (that is `record_main_semesters`) |
| `credits` | Total credits in the plan | > 128 means surplus courses |
| `cost` | Tuition: `policy.lp` fee per term (regular: flat for 13–18 credits, per credit outside; summer: per credit), summed, million VND | Computed by the pipeline for every plan |
| `summers` | Summer terms holding a course | |
| `load_dev` | Mean over main semesters with courses of \|credits − middle of the preferred band\| | Lower = closer to the load the student wants |
| `in_band` | Share of those main semesters with credits inside the preferred band | |
| `electives` | Number of planned courses from elective groups A–D | |
| `interest_match` | Share of those electives carrying at least one of the student's interest tags | Free electives excluded |

### 2.2 First-attempt grades (technique 1.3)

| Column | Definition |
|---|---|
| `exp_failed_credits` | Σ credits × P(score < pass mark) at the planned year, attempt 1 (analytic, no noise). Pass mark 4.0, 5.5 for graduation courses |
| `failed_credits` | Credits whose drawn first-attempt score is below the pass mark (CRN draws) |
| `gpa_first` | Credit-weighted grade points (4-point scale, `policy.lp`) over all first attempts |
| `warned_semesters` | Main semesters in which those results would trigger an academic warning (QD285 Điều 37.1: failed share, outstanding failed credits, semester GPA, CPA by year level), with no retakes |
| `passed_by_k4`, `passed_by_k8` | Credits passed at the first attempt by the end of main semester 4 and 8 |

Totals depend on how many courses a plan holds: the agent record of a student who withdrew
has fewer courses, so its failed credits are lower without being "safer". Compare the agent
record on these columns with care; solver, official and baseline cover the full program.

### 2.3 Replay (technique 1.6; only with `--replay`)

| Column | Definition |
|---|---|
| `replay_status`, `replay_reason` | graduated / withdrawn (and the rule: warned > 2 consecutive, suspended > 2 consecutive, max duration, no registration) |
| `replay_main_semesters` | Main semesters used, suspended and internship semesters included |
| `replay_cost` | Tuition paid in the replay |

### 2.4 Solver and record columns

| Column | Row | Definition |
|---|---|---|
| `status` | solver | Common status: OPTIMAL (proven), FEASIBLE (plan, not proven), INFEASIBLE (proven none), NO_PLAN (stopped before any plan) |
| `stopped_by` | solver | proven / time_limit / solve_limit (what ended the search) |
| `seconds` | solver | Wall time of the solve (cached results keep the original time) |
| `solver_violations` | solver | Violations the solver's own result reported (its built-in validator) |
| `record_status`, `record_main_semesters`, `record_cost` | record | The agent record's outcome (step 2) |

### 2.5 Summary (`summary.json` → `full`)

| Key | Definition |
|---|---|
| `by_plan.<plan>.<column>` | Mean of the column over students with that plan |
| `by_plan.<plan>.on_time_share` | Share of plans that are complete with `grad_k` ≤ 8 (`[evaluation] on_time_main_semesters`) |
| `replay_graduated`, `replay_withdrawn` | Share of replays ending in graduation / withdrawal |
| `replay_extra_semesters_graduates` | Among replays that graduate: replay main semesters − the plan's `grad_k` |
| `replay_extra_cost_graduates` | Among replays that graduate: replay cost − the plan's cost |
| `records` | Agent records: graduated and withdrawn shares, mean main semesters of graduates |
| `paired.solver_minus_<plan>.<column>` | Mean of the per-student difference, 95% bootstrap interval, n (technique 1.5) |

## 3. Metrics, 4.2 (per cut; `eval_cuts.csv`)

| Column | Definition |
|---|---|
| `k`, `record_type`, `n_failed_open` | Cut point, record type (§1.7), failed courses not yet passed |
| `status`, `stopped_by`, `seconds`, `solver_violations` | As in 2.4 |
| `<plan>_complete` | The remaining plan plus the passed courses complete the degree (`<plan>` = solver, official, baseline) |
| `<plan>_remaining` | Main semesters after the cut up to the plan's last term |
| `<plan>_grad_k` | Main semester of the plan's last term, counted from enrollment |
| `<plan>_cost`, `<plan>_summers` | Tuition and summers of the remaining plan |
| `solver_legal`, `solver_errors` | Validator + fills_next on the solver's plan, from the cut state |
| `n_failed_required` | Failed required courses (a failed elective may be replaced by another, so it is not counted) |
| `retakes_scheduled`, `retakes_all` | How many of those the solver schedules; whether all are |
| `first_retake_in` | Main semesters from the cut to the first scheduled retake (0 = the summer right after the cut) |
| `solver_within_12` | Solver plan complete and finishing by main semester 12 (QD1260 maximum) |
| `remaining_minus_official`, `remaining_minus_baseline` | Solver remaining semesters minus the reference's, same cut (negative = solver finishes sooner) |
| `cost_minus_official`, `cost_minus_baseline` | Same for tuition |

`summary.json` → `cuts`: means over all cuts, by k and by record type, `optimal_share` (share
with status OPTIMAL) and bootstrap intervals for the two `remaining_minus_*` columns.

## 4. Step 5 outputs (`sensitivity.csv`)

| Output | Definition |
|---|---|
| `record_graduated` | 1 if the agent record graduated |
| `record_main_semesters`, `record_cost` | Agent record main semesters (all students) and tuition |
| `solver_grad_k` | Solver plan graduation semester |
| `solver_minus_official_grad_k`, `solver_minus_record_grad_k` | Per-student differences of `grad_k` |
| `solver_minus_official_exp_failed` | Per-student difference of `exp_failed_credits` |

Columns: `src` and `r2` (method src) or `delta`, `delta_conf`, `S1` (method delta), and `n`.

## 5. Step 6 checks (`checks.py`)

| Check | Passes when |
|---|---|
| Record legality | Every registration of every record passes `planner.validate` from the record's own state; no course in the term after an internship; graduation status agrees with the validator |
| CRN consistency | First-attempt scores recomputed in step 4 equal the transcript |
| Record reproducibility | Re-running step 2 for the first students gives identical outcomes and transcripts |
| Solver reproducibility (`--resolve m`) | m cases re-solved without the cache give the same plan (expected only for a reproducible setting, e.g. ASP "conflicts") |
| Prior predictive (`checks predictive`) | First-attempt score summaries fall in `[targets]` |
| Parameter recovery (`recovery.py`) | The score model's parameters are recovered from step-2 transcripts |

## 6. Reading the results: caveats

- All numbers describe synthetic students under stated assumptions (README §3–4); none is
  evidence about real HCMUT students.
- A solver plan can be shorter partly because it is allowed heavier loads (`policy.lp`: up to
  21 credits) and summers; read `grad_k` together with `load_dev`, `summers` and `credits`.
- Illegal solver plans (`legal = False`) are still evaluated on every other metric; filter on
  `legal` when the comparison should count only plans a student could register.
- The agent record's `grad_k` and grade totals cover fewer courses for students who withdrew
  (§2.2).
