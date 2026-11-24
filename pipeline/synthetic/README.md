# Synthetic students (CS K2023): open-loop pipeline

Generates synthetic students for one curriculum (`planner/fixtures/khmt2023.json`,
CS-2023-KHMT), runs each through the program once with a student agent (no solver),
solves once per case with a planner solver, and evaluates the solver's plans against
the official plan, a curriculum baseline and the students' own records.

**Solver-agnostic** (`solvers.py`): the solver is `[solver] name` or `--solver`: `asp`
(default, `planner.solve_asp`), `cpsat` (`planner.solve_cpsat`), or any
`package.module:factory` returning an adapter. Each solver's results live in their own
folder and cache, so a modified solver can be compared with the old one on the same
students. Metric definitions: [EVALUATION.md](EVALUATION.md).

**Status (23/11/2026):** implemented per [DESIGN.md](DESIGN.md) (steps 0–6). The
closed-loop prototype (planner called every semester) was removed. Agent model:
[AGENT-MODEL.md](AGENT-MODEL.md). Runs so far are pilots (20 students end to end,
200 students for steps 1–2, 100 for step 5); no result below is a finding about
the planner yet.

**What it can claim:** the generator is built correctly (tests, checks, recovery),
states its assumptions (`config.toml`, this file, DESIGN.md B6), and its conclusions
can be checked across the stated parameter ranges. It does not show that the data
match real students.

## 1. Pipeline

```
Step 0  official_plan.json (from 2023_MT_KHMT.pdf), checked by official_plan.py
Step 1  population.py   traits, interests, optional per-student parameters
Step 2  agent.py + simulate.py   one record per student, no solver -> transcripts
Step 3  solve.py        3a: solver plan per student from enrollment
        solvers.py      3b: solver plan per cut record (truncated after k semesters)
                        cached in data/cache/<solver>/ by solver input + fingerprint
Step 4  evaluate.py     4.1 solver vs record vs official vs baseline (per student)
                        4.2 solver on cuts vs official/baseline from the same state
Step 5  sensitivity.py  from a pool with per-student parameter draws
Step 6  checks.py       legality, determinism, common random numbers, prior predictive
        recovery.py     parameter recovery of the score model
viz     visualize.py    figures + report.md from stored data
```

| File | Role |
|---|---|
| `config.toml` | Every parameter, with base/low/high (the sensitivity range) |
| `official_plan.json`, `official_plan.py` | Official plan transcribed from the PDF; check against the fixture |
| `regulations.py` | Attrition rules with their sources (section 3) |
| `curriculum.py` | Fixture, grade scale and fees (`engine/asp/policy.lp`), tags; legality and graduation via `planner.validate` |
| `population.py` | Traits, interests, Latin-hypercube parameter draws |
| `grades.py` | Score model, pass marks, keyed noise |
| `plans.py` | Official and baseline plan specs, plan following, internship placement, plan legality |
| `agent.py`, `simulate.py` | Agent options and utility; semester loop with grading and attrition |
| `solvers.py` | Solver adapters (`asp`, `cpsat`, plug-ins), common result and status |
| `solve.py` | Solves through the adapter, disk cache, cut selection |
| `evaluate.py` | Plan metrics, first-attempt grades, replay after a fail, cut metrics, summaries |
| `sensitivity.py` | Standardized regression coefficients or SALib delta |
| `visualize.py` | Figures (`figures/*.png`) and `report.md` with the numbers behind them |
| `run.py` | Driver; writes `data/<pool>/` |
| `EVALUATION.md` | Every evaluation technique and metric, defined |

## 2. How to run

```
cd pipeline
.venv/Scripts/python -m pip install -r synthetic/requirements.txt
.venv/Scripts/python -m pytest synthetic/tests -q
.venv/Scripts/python -m synthetic.official_plan                     # step 0 check
.venv/Scripts/python -m synthetic.run --pool base --n 200 --seed 1 --workers 8 [--replay]
.venv/Scripts/python -m synthetic.run --pool base --steps 4,viz --replay  # re-evaluate, redraw
.venv/Scripts/python -m synthetic.run --pool base --steps 3a,3b,4,viz --solver cpsat --workers 8
.venv/Scripts/python -m synthetic.visualize --pool base --solver asp
.venv/Scripts/python -m synthetic.run --pool sens --n 1000 --seed 2 --workers 8 --per-student-params
.venv/Scripts/python -m synthetic.checks pool --pool base --resolve 5
.venv/Scripts/python -m synthetic.checks predictive --n 2000
.venv/Scripts/python -m synthetic.recovery --n 500 --seed 1 --workers 8 --set noise_sd=0.9
```

`--steps` takes any of `1,2,3a,3b,4,5,viz` (default `1,2,3a,3b,4,viz`). Step 1 refuses an
existing pool. Steps 1–2 use the config stored in `pool.json`; later steps read
`[baseline]`, `[solver]`, `[cuts]`, `[evaluation]` and `[sensitivity]` from the current
`config.toml`. Outputs go to `synthetic/data/` (ignored by git).

**Pool layout:**

```
data/<pool>/                pool.json, students.csv, outcomes.csv, semesters.csv,
                            transcripts.csv (steps 1-2), cuts.csv (3b)   solver-independent
data/<pool>/solver-<label>/ solver_full.json, solver_cuts.json (3), eval_full.csv (one row
                            per student and plan), eval_cuts.csv, summary.json (4),
                            sensitivity.csv (5), figures/*.png, report.md (viz)
data/cache/<solver>/        one JSON per solved input
```

**Adding a solver.** Write an object with `name`, `settings(cfg_section)`,
`fingerprint()`, `solve(fixture, scenario, settings)` (returning a planner result as
`planner.result.make_result` builds it) and `stopped_by(result, settings)`; pass
`--solver package.module:factory` (settings from `[solver.<name>]`). Input is the planner
JSON contract. Every metric is computed by the pipeline from the returned plan, so
solvers are compared on equal terms.

**Cost** (development laptop, 4 cores, 8 workers): steps 1–2 for 200 students in about
25 s; ASP at 20 000 conflicts about 6 s per case alone, 127 s for 20 full plans and
about 420 s for 112 cuts in parallel. A 200-student pool with 200 cuts is therefore
about 20 + 15 minutes of solving, once; reruns hit the cache.

## 3. Attrition rules and sources

Sources are the two PDFs in the repo root:
- **[QD285]**: "Quy định về học vụ và đào tạo - Phiên bản hợp nhất", 285/ĐHBK-ĐT, 28/7/2022 (scanned; page images read).
- **[QD1260]**: "1260 QĐ điều chỉnh_HVu Đại học_2933_2026" (2026). It amends Quy định 2933/QĐ-ĐHBK ("HVu_ĐH"). QD285's Điều 37 comes from HVu_ĐH Điều 14.

| Rule (as modelled) | Source |
|---|---|
| **Academic warning** at the end of each main semester if any of: failed credits > 50% of registered credits; outstanding failed credits since the start > 24; semester GPA < 0.8 (first semester) or < 1.0 (later); CPA < 1.2 / 1.4 / 1.6 / 1.8 for year level 1 / 2 / 3 / ≥4 | QD285 Điều 37.1, p.24 |
| **Year level** N from accumulated credits: year k if 33(k−1) ≤ credits < 33k (M = 33, "Kế hoạch" column; 28 is only for course registration) | QD285 Điều 24, p.17 |
| **Forced suspension** for one main semester if a main semester is registered below the minimum (11 credits for regular students) | QD285 Điều 37.2, p.24; minimum from QD1260 Điều 1.2b, p.3 |
| **Forced withdrawal** if: warned in more than 2 consecutive main semesters; suspended for more than 2 consecutive main semesters; past the maximum duration; no registration in a main semester | QD1260 Điều 1.7, p.5 (new text of HVu_ĐH 14.3) |
| **Maximum duration** of a regular program: 12 main semesters | QD1260 Điều 1.1, p.2 |
| **Internship threshold** (65% of program credits): counted as credits before its term plus the other courses of that term, the internship excluded (decided 23/11/2026, same for the specialized project and thesis thresholds; also in the ASP engine and `planner.validate`) | QD285 Điều 15.5, p.12 |

Other rules the simulator needs but that were not re-extracted: pass marks (D = 4.0; C = 5.5 for graduation courses, from `docs/04-luat-qd285.md` §2), the grade scale and fees (`policy.lp`), and everything `planner.validate` checks.

**Simplifications (assumptions, not rules):**
- Year level ignores the foreign-language and GDQP/GDTC conditions of Điều 24.
- "Outstanding failed credits" = courses whose latest attempt failed and that were never passed. A failed free elective is not owed, because the student takes another one.
- GPA: a failed attempt counts as 0 until the course is passed; the best attempt counts. The retake rules (Điều 22) are not modelled.
- Suspension is not triggered when a sub-11-credit main semester completes the degree or holds every still-needed course that can be registered (`[rules] forced_underload_exempt`; the prototype had only the first exemption).
- Suspended semesters, and main semesters kept empty by the internship, count toward the 12-semester limit. An internship semester leaves the warning streak unchanged.
- Not modelled: discipline, voluntary leave, the rector's deferral, extensions, the GPA ≥ 2.0 condition for graduation courses (QD1260 Điều 1.2c), the graduation CPA condition, language and other non-course conditions (assumed met).

## 4. Model

**Scores.** `score = clip(mu + a(θ − b_c) + year_effect·(year−1) + retake_effect·[attempt>1] + ε, 0, 10)`, rounded to 0.1.
- θ ~ N(0,1); b_c = difficulty_sd · z_c with z_c ~ N(0,1) shared by all students; ε ~ N(0, noise_sd).
- The noise for (student, course, attempt) comes from a generator keyed on those ids, so the same attempt gets the same draw in a record and in every evaluated plan (common random numbers).

**Students** (step 1). θ; one of the 5 group-C specializations (uniform); preferred load `[max−3, max]` with max ~ N(18, 1.5) clipped to [14, 22]; early-finish preference U(0,1); cost sensitivity U(0,1); summer opt-in if early preference > 0.5; 1–3 interest tags drawn with weight = number of the specialization's group-C courses carrying the tag (`planner/data/course-tags.json`, CS-KHMT family). With `--per-student-params`, every ranged parameter of `[grades]`, `[population]` and `[agent]` is drawn per student by Latin hypercube; the random draws behind the traits stay the same.

**Official plan** (step 0). The PDF's required courses by semester, plus slots: free electives in semesters 4, 6, 7; group A in 5, B in 6, C 2 in 7 and 3 in 8, D in 7. A student's electives fill the slots in their preference order (interest matches first). The check script confirms the required set, every course's semester against the fixture, the semester totals (16, 17, 16, 17, 16, 15, 16, 15 = 128) and full legality for all five specializations.

**Records** (step 2): the agent in [AGENT-MODEL.md](AGENT-MODEL.md) §7 picks one of `plan`, `drop_hardest`, `plus_one`, `catch_up`, `all_left` (summer: `nothing` / `retakes`) by utility plus Gumbel noise. The internship fills the next term.

**Baseline** ("follow the curriculum"): required courses at their recommended semester, electives at the semester in the group name (A 5, B 6, C 7,7,7,8,8, D 7), free electives in 6, 7, 8; retakes and overdue courses first; load cap max(preferred max, on-schedule credits) ≤ 25; internship at semester 6, no summer courses. In step 4 it is the all-passed plan from enrollment.

**Internship placement** (agent, baseline, replay; assumption): within semesters 1–8 only in a term followed by a summer; past semester 8, as the last course, or when nothing else can be registered, in any term.

**Solver** (step 3). Any adapter in `solvers.py` receives the planner JSON: specialization, summer opt-in (every summer from the cut on), interests and the state; for a cut followed by a suspension in the record, that semester as `skip_semesters`. ASP (default) stopping rule (`[solver.asp]`, open): 1 thread with 20 000 conflicts (reproducible); `mode = "time"` uses threads and a wall-clock limit. CP-SAT: `[solver.cpsat] time_limit`, 1 worker.

**Evaluation** (step 4).
- 4.1, per student and plan: legality (`planner.validate` + fills_next), completeness, graduation main semester, credits, cost, summers, load deviation from the preferred middle and share of main semesters in the band, share of planned electives matching an interest; first-attempt grades (expected and drawn failed credits, GPA, semesters that would be warned, credits passed by semester 4 and 8). Paired solver-minus-other differences with bootstrap 95% CIs.
- Replay after a fail (`--replay`, reported apart): each plan is followed with real grades (retakes, overdue, this term's courses; the rest pushed later); graduation share, withdrawal share, extra semesters and cost among replays that graduate.
- 4.2, per cut: solver status, time, legality, completeness, remaining semesters and cost against the official plan and the baseline followed from the same state (all passed), retakes of failed required courses, graduation within 12 semesters; by k and by record type (clean, one fail, several fails, warned).

**Sensitivity** (step 5). Outputs per student (record graduated, record semesters and cost, solver graduation semester, solver-minus-official and solver-minus-record differences) against the per-student parameters, by standardized regression coefficients (default) or SALib delta.

## 5. Checks run (23/11/2026)

| Check | Result |
|---|---|
| Tests (`synthetic/tests`, 44) | Pass: rule thresholds, standing counters, score model, fees, official plan check (and that it catches a moved course), interests, Latin hypercube, utility known answer, option set, internship rule, record determinism, legality of every registration (and that an illegal one is caught), fills_next in records, common random numbers (and that a changed score is caught), plan naming, official/baseline plans legal in 8 semesters, cut mix, solver cache and reproducibility, SRC known answer, recovery on known data |
| Planner tests (`planner/tests`) | 129 pass, 7 xfail, 1 xpass, including the 2 new graduation-threshold tests; `test_khmt_real_size_is_optimal_and_valid` still fails as before (ASP-ADAPTER §8) |
| `official_plan.py` | No problems |
| `checks pool` on the 20-student pilot | No legality or CRN problems; records reproducible; 3/3 solver cases re-solved without the cache gave the same plan |
| Solver adapter (23/11/2026) | Tests: a plugged-in stub solver runs through steps 3–4 with the known answer; statuses mapped. The 200-student ASP cache was reused unchanged after the refactor (161/161 hits, identical plans). CP-SAT ran through steps 3a, 4, viz on the 20-student pilot: 20/20 proven optimal, about 11 s each; every plan breaks the internship `fills_next` rule, which CP-SAT does not model (ASP-ADAPTER §7), so `legal` is 0 |
| Prior predictive, parameter recovery | Not rerun on the new records; prototype results: README of 22/11 (prior predictive fails the course-mean target, needs expert input) |

## 6. Pilot results (not findings)

**ASP stopping rule** (DESIGN.md B2; two fresh students, TTNT with summer and CNPM without):

| Setting | Time (s) | Proven | Graduation | Cost (TTNT / CNPM, thousand VND) |
|---|---|---|---|---|
| 4 threads, 30 s | 31 / 31 | no | 261 / 261 | 105 645 / 100 275 |
| 1 thread, 2 000 conflicts | 2.9 / 2.1 | no | 261 / 261 | 116 238 / 103 495 |
| 1 thread, 10 000 conflicts | 7.1 / 4.9 | no | 261 / 261 | 110 830 / 102 690 |
| 1 thread, 50 000 conflicts | 53 / 19 | no | 261 / 261 | 109 000 / 102 690 |

No setting proved optimality. All reach the top objective (graduation term). The reproducible setting costs 0.6–3% more than 4 threads × 30 s at 10k–50k conflicts. The default (20 000) is a placeholder; choosing the rule is still open.

**Steps 1–2, 200 students (seed 1):** 72.5% graduate, 27.5% withdraw (46 warnings > 2 consecutive, 9 max duration, 0 suspensions); graduates take 8–12 main semesters (8: 39, 9: 63, 10: 21, 11: 14, 12: 8), 19.5% of all students graduate within 8; graduation by ability tercile 0.19 / 0.98 / 1.00; 40% are warned at least once. Option picks: plan 563, drop_hardest 417, plus_one 301, catch_up 245, all_left 170, retakes 44. The prototype's baseline arm (40 students) had 80% graduating and 47.5% on time.

**Full pipeline, 20 students (seed 1), means:**

| Plan | Legal | Grad. semester | Credits | Cost (M VND) | Summers | Interest match | Exp. failed credits (1st attempts) | Replay: graduated |
|---|---|---|---|---|---|---|---|---|
| Solver | 0.85 | 7.0 | 134.4 | 106.5 | 0.9 | 0.51 | 18.4 | 0.65 |
| Official | 1.00 | 8.0 | 128.0 | 110.0 | 0 | 0.71 | 18.0 | 0.75 |
| Baseline | 1.00 | 8.0 | 128.0 | 110.8 | 0 | 0.71 | 18.0 | 0.75 |
| Record (first attempts) | 1.00 | 8.1 | 116.6 | 106.5 | 0 | 0.74 | 11.7 | 0.65 |

Cuts (112 of 200 wanted: too few eligible students at n = 20): solver legal 0.79, complete 1.00, every failed required course rescheduled, 9.8% proven optimal, mean 28 s per solve; remaining main semesters solver minus official −0.60 (by k: −0.40, −1.00, −0.83, −0.83, −0.28, −0.22).

## 7. Known issues

- **ASP plans break the summer rules of `planner.validate`.** With summer opt-in, the engine opens every course in summer (`extra_sem`, ASP-ADAPTER §7), so it places courses with no summer history and project courses in summer. 3 of 20 full plans and 24 of 112 cut plans are illegal for this reason only. Reported as `legal = False`; not fixed here.
- **ASP plans carry surplus credits** (pilot mean 134 of 128): extra electives in groups B and D. The regular fee is flat for 13–18 credits and no objective penalises extra credits.
- **The solver graduates in 7 semesters**: `policy.lp` allows 14–21 credits per main semester, and the preferred load is not passed to ASP (`load_mapping = "none"`); the deviation from the preferred middle load is 2.5 credits per main semester larger than for the official plan.
- **Records graduate late** (19.5% within 8 semesters): the agent picks `drop_hardest` in about a quarter of the terms. This follows from the guessed utility weights (AGENT-MODEL.md flaw 6) and is not calibrated.
- **Cut states put every passed course at the current term** (adapter rule), so a passed internship makes ASP keep the summer right after the cut empty.
- **Step 5 at n = 100**: R² of the linear fit is 0.09–0.12, because ability θ (not a parameter) dominates each student's outcome. Larger pools are needed before reading the coefficients.
- **Agent flaws 1–3, 5** (AGENT-MODEL.md §5) still apply; the section 6 changes are not implemented.
