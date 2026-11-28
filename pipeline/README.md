# BK_uni research pipeline: current state

As of 2026-11-28, branch `research-pipeline` (commit `53a6370` "Resolve solver parity", plus the
documentation work of the same day).

**Working on the pipeline?** Read [docs/GUIDELINES.md](docs/GUIDELINES.md) first: how to change
the input data, add or change a solver, and add an evaluation, and how to work on the repo
with others.

**Planner reference** (both solvers, one rule set):
[docs/CONSTRAINTS.md](docs/CONSTRAINTS.md) (hard rules, soft goals, assumptions, the QĐ 285
regulation summary), [docs/FEATURES.md](docs/FEATURES.md) (what the planner does, hand-checked
cases), [docs/USER-INPUT.md](docs/USER-INPUT.md) (instance, planner input, web request, result),
[docs/PLANNER-PARITY.md](docs/PLANNER-PARITY.md) (where the solvers still differ and how to close it).

## Overview

The pipeline plans a student's course schedule with two solvers (ASP/Clingo and OR-Tools
CP-SAT), checks every plan with an independent validator, and tests the solvers on synthetic
student cohorts. Every module reads one canonical data format in `instances/`;
university-specific code lives only in the importers.

1. **Import.** HCMUT importers pull curricula, course relations and student progress (myBK
   PDF/Excel) into `instances/hcmut/`.
2. **Profile.** `profiling` describes an instance: curriculum shape, catalog relations,
   student-data coverage, plus automatic remarks.
3. **Plan.** `planner` turns one curriculum plus one student request into a term-by-term
   plan, with either solver behind a shared adapter interface.
4. **Validate.** `evaluation/validate.py` re-checks every plan in plain Python and shares no
   rule code with the solvers.
5. **Simulate.** `synthetic` generates students and runs each through the program with an
   agent, without a solver (steps 1-2).
6. **Evaluate.** `evaluation.cohort` solves each synthetic student, compares the solver plan
   with the official plan, a baseline and the agent's record, and runs sensitivity analysis
   (steps 3-5).

One side tool sits next to this flow: `tag_classifier` derives course tags from syllabi for
the ASP interest objective.

```
 Sources                    instances/importers/hcmut        tag_classifier/
 web database (read-only) ─► fetch_curriculum, convert        syllabi from web database
 myBK files, curriculum PDF  mybk, relations                  tags reviewed in Excel
                                   │ writes                        │ course-tags.json
                                   ▼                               ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ instances/  canonical data, schema 3                                         │
 │ curricula, policy, students, requests, catalog, course tags                  │
 └──────────────────────────────────────────────────────────────────────────────┘
        │                                       │                     │
        ▼                                       ▼                     ▼
   profiling/                               planner/              synthetic/
   instance metrics                         ASP and CP-SAT        steps 0-2 and 6
   automatic remarks                        one input, one        agent, no solver
   reports/<uni>/                           rule set, one goal    data/<pool>/
                                            list; cli: JSON       │ pools
                                                │ solves each case    │
                                                ▼                     ▼
                                           evaluation/
                                           validate.py: independent plan check
                                           cohort: steps 3-5, solve, compare, sensitivity
                                           results/<pool>/solver-<label>/
```

## Directory layout

All packages are run from `pipeline/` as `python -m <package>...`.

| Package | Job | Main entry points | Reads | Writes |
| --- | --- | --- | --- | --- |
| `instances/` | Canonical data format (schema 3), loader, HCMUT importers | `python -m instances.loader instances/<uni>` | its own JSON | nothing (importers write `instances/hcmut/`) |
| `planner/` | Plan model and solvers (ASP, CP-SAT) behind one adapter registry | `planner.cli` (JSON stdin to stdout) | planner input built from `instances/` | plan JSON |
| `evaluation/` | Independent validator, solver comparison, cohort evaluation | `evaluation.run_scenarios`, `evaluation.compare`, `evaluation.cohort.run` | `instances/`, `synthetic/data/<pool>/` | `evaluation/results/<pool>/`, `evaluation/cache/<solver>/` |
| `synthetic/` | Synthetic cohort: population, agent records, checks, parameter recovery | `synthetic.run`, `synthetic.checks`, `synthetic.official_plan` | `instances/hcmut/` curriculum and policy | `synthetic/data/<pool>/` (git-ignored) |
| `profiling/` | Metrics and automatic remarks for one university instance | `python -m profiling instances/<uni>` | `instances/<uni>/` | `profiling/reports/<uni>/profile.json`, `report.md` |
| `tag_classifier/` | Course tags from syllabi (NLI scoring, review workbooks) | `tag_classifier.extract` ... `export` (6 steps) | web database (read-only) | `data/`, `reports/`, `review/*.xlsx`, `instances/hcmut/course-tags.json` |
| `docs/` | `GUIDELINES.md` (teammate guide); planner reference `CONSTRAINTS.md`, `FEATURES.md`, `USER-INPUT.md`; `PLANNER-PARITY.md` (solver differences) | | | |

## instances/: the canonical data

One folder per university in schema 3 ([instances/SCHEMA.md](instances/SCHEMA.md)); field
definitions inherited from the former `data/` format are in
[instances/FIELDS-V1.md](instances/FIELDS-V1.md). `python -m instances.loader instances/<uni>`
validates a folder and prints a summary. Both instances validate.

| Instance | Content (loader summary) |
| --- | --- |
| `hcmut` / `CS-2023-KHMT` | 96 courses (5 condition courses: ENG_GC, SA4001, PE1003, PE1005, MI1003), 32 relations, 6 groups, 5 majors; `graduation.json`, `official_plan.json`. The only HCMUT curriculum: `cs_2023` was merged into it and deleted on 2026-11-28 |
| `hcmut` students | `khmt2023-oracle`: 7 students, 25 attempts, hand-computed CGPAs (`expected`); `khmt2023-demo`: 1 student, 32 attempts |
| `hcmut` requests, catalog | `khmt2023-demo`: 1 request; `catalog.json`: 96 programs |
| `toy` / `TOY-2025` | 14 courses, 14 relations, 2 groups, 0 majors; 1 student (6 attempts); 5 requests |

Shared policy lives in `instances/hcmut/policy/`: `grading.json` (grade scale, GPA,
retakes), `tuition.json` (fees by program and term type), `external.json` (requirements
outside the course plan: language, physical and military education, social work...),
`standing.json` (academic-standing thresholds, used by `synthetic`). `instances/policy.py`
reads grading and tuition into plain numbers. The policy reaches the solvers inside the
planner input (`fixture["policy"]`); there is no hand-edited solver copy any more.

**Conventions.** Terms are `YYYY-P` (P = 1, 2 regular, 3 summer). Decimals (GPA, money) are
strings. `null` means unknown, never false. Keys starting with `_` are notes for people. A
course of 0 credits is an external requirement (`kind: condition`), never planned: the loader
rejects one that is not marked so, and the planner treats any 0-credit course as a condition.

**Importers** (`instances/importers/hcmut/`):

- `fetch_curriculum.py`: builds one program from the backend's public read API (GET only)
  and writes curriculum, students and requests through `convert.py`. The student is a
  made-up one.
- `convert.py`: web-database layout to canonical format.
- `mybk.py`: parses a student's myBK progress file (PDF or Excel) from stdin to JSON on
  stdout; nothing is written to disk.
- `relations.py`: snapshots course relations across all programs, reports consistency,
  builds `catalog.json`, and infers missing prerequisites from other programs (labelled
  `source: inferred`).

Raw inputs are kept in `instances/hcmut/raw/`: the curriculum PDF `2023_MT_KHMT.pdf` and
`relations-snapshot.json`.

## planner/: model and solvers

The planner takes one case (a curriculum plus a student request) and returns a term-by-term
plan. `planner/model/input.py` is the only code that builds a case, always from
`instances/`.

**Model** (`planner/model/`):

| File | Role |
| --- | --- |
| `input.py` | Builds the internal case dict (shaped like the former web fixtures) from an instance request file, with the policy and the full student record (attempts, grades, external progress) |
| `normalize.py` | Reshapes data before solving, no rules; idempotent, called by both solvers, the validator and reports |
| `facts.py` | Input checks and the rules both solvers share: credits per term, summers, levels, graduation thresholds, the goal order (`preference_order`), solver capability checks |
| `result.py` | Common result for every solver; diff between two plans |
| `report.py` | Recomputes soft-goal scores and warnings from a finished plan |
| `student_requests.py` | Reports how far each student request was met (`met`, ...); requests are never silently dropped |

**Solvers** (`planner/solvers/`):

- **ASP** (`asp/`). `adapter.py` turns the planner input into facts and runs clingo on
  `core/encoding.lp`, `extension.lp`, `translate.lp`, `optimize.lp`. `policy.py` compiles the
  policy in the input (grading, tuition, graduation GPA, external requirements) to facts.
  Load bounds, summer rules and goal priorities come from the input and `facts.py`, as for
  CP-SAT. The former standalone ASP command (`cli.py`, `data.py`, `translation.py`,
  `engine.py`) was deleted on 2026-11-28.
- **CP-SAT** (`cpsat.py`). Written independently of the ASP solver: reads the JSON
  directly, decision variables x[c, i] (course c in term i), shares only `facts.py`, so the
  two solvers can check each other.
- **Parity.** Both solvers read the same input, enforce the same hard rules and rank plans by
  one goal list; each declares the input fields and goals it implements (`CAPABILITIES`), and
  anything else in a request gives a warning (or an error with `strict=True`). Details and
  measured results: [docs/PLANNER-PARITY.md](docs/PLANNER-PARITY.md).
- **Registry** (`registry.py`). The only place that knows which solver runs. Each adapter
  exposes `settings`, `fingerprint` (hash of its sources, part of the cache key), `solve` and
  `stopped_by`. Statuses map to OPTIMAL, FEASIBLE, INFEASIBLE, NO_PLAN. A plug-in loads with
  `[solver] name = "package.module:factory"`.

**Backend entry point.** `planner.cli --solver cpsat|asp` reads one JSON case on stdin and
writes the result on stdout. Bad input gives status `INPUT_ERROR`; the exit code is 0 once
JSON is printed. `scenario.use_inferred_relations` adds inferred prerequisites from the
relations snapshot.

## synthetic/: the synthetic cohort

Generates students for one curriculum (CS-2023-KHMT) and runs each once through the program
with a rule-based agent, with no solver. Solving and evaluating them is `evaluation.cohort`.
Design: [synthetic/DESIGN.md](synthetic/DESIGN.md); agent:
[synthetic/AGENT-MODEL.md](synthetic/AGENT-MODEL.md).

| Step | Module | What it does |
| --- | --- | --- |
| 0 | `official_plan.py` | Checks the transcribed official plan (`official_plan.json`, from the PDF) against the curriculum |
| 1 | `population.py` | Student traits, interests, optional per-student model parameters (Latin hypercube); one random stream per kind of draw |
| 2 | `agent.py`, `simulate.py` | Agent picks a course bundle each term from the official plan; semester loop with grading and attrition |
| 6 | `checks.py` | `predictive`: prior predictive check of the score model against `[targets]`. `pool`: registration legality, graduation agreement, common random numbers, rerun reproducibility |
| 6 | `recovery.py` | Fits the score model to simulated transcripts and compares with the true parameters |

Supporting modules: `curriculum.py` (curriculum, policy files, legality via the validator),
`grades.py` (score model), `plans.py` (official and baseline plans, internship placement),
`regulations.py` (attrition rules from `policy/standing.json`).

**Score model** (`grades.py`):

```
score = clip(mu + a*(theta - b_c) + year_effect*(year - 1)
             + retake_effect*[attempt > 1] + eps, 0, 10),   eps ~ N(0, noise_sd)
```

Every parameter in `synthetic/config.toml` has base/low/high; low/high are the sensitivity
range. The file states these are modelling assumptions, not estimates from data. Base
values: mu 6.3, a 1.2, difficulty_sd 0.5, noise_sd 1.2, year_effect 0.0, retake_effect 0.5.

**Pools.** `python -m synthetic.run --pool <name> --n N --seed S` writes
`synthetic/data/<pool>/` (git-ignored): `pool.json` (n, seed, config used), `students.csv`,
`outcomes.csv`, `semesters.csv`, `transcripts.csv`. Three pools exist: `pilot-before`,
`pilot-after`, `pilot-split`, each n = 12, seed = 7. All runs so far are pilots; no result is
yet a finding about the planner.

## evaluation/: validation and cohort evaluation

**Single-case tools:**

- `validate.py`: independent plan validator in plain Python. It does not use `facts.py`,
  the solvers or clingo, so a solver bug cannot confirm itself. It checks legality, not
  optimality. The only shared code is `normalize.py` (reshaping, no rules).
- `run_scenarios.py`: runs every request in a case file (default: the toy instance),
  validates each plan and prints the diffs.
- `compare.py`: ASP vs CP-SAT on the same input: status, objective, time. It compares last
  term, total credits and number of changes, not individual courses, because two correct
  solvers can return different optimal plans. `--benchmark` uses random data.

**Cohort evaluation** (`evaluation/cohort/`, `python -m evaluation.cohort.run --pool <name> --solver asp|cpsat`):

| Step | Module | Output in `evaluation/results/<pool>/solver-<label>/` |
| --- | --- | --- |
| 3a | `solve.py` | `solver_full.json`: one full plan per student, from enrollment |
| 3b | `solve.py` | `cuts.csv` (solver-independent) and `solver_cuts.json`: plans from records cut after k semesters |
| 4 | `evaluate.py` | `eval_full.csv`, `eval_cuts.csv`, `summary.json` |
| 5 | `sensitivity.py` | `sensitivity.csv` (standardized regression coefficients or SALib delta); needs a pool with per-student parameters |
| viz | `visualize.py` | `figures/*.png`, `report.md` |

`--resolve m` re-solves m cases without the cache to test whether the solver reproduces its
plans. Solver results are cached in `evaluation/cache/<solver>/`, keyed by solver input plus
fingerprint, so a changed solver never reuses old results. Settings:
`evaluation/cohort/config.toml`. ASP defaults to mode `conflicts` (1 thread, 20,000-conflict
limit, reproducible). CP-SAT uses a 30 s wall-clock limit, 1 worker (not reproducible). Since
2026-11-28 the solver fingerprints cover the shared planner code too, so every cached result
from before that day is recomputed.

**Method** ([evaluation/cohort/EVALUATION.md](evaluation/cohort/EVALUATION.md)). Four plans
per student: solver, official, a follow-the-curriculum baseline, and the agent's record.
Every course is scored once as a first attempt. Common random numbers give the same noise to
the same (student, course, attempt) in every plan. Paired differences come with 2,000-sample
bootstrap intervals. An optional replay re-runs a plan after a fail.

**Results so far.** Only `results/pilot-split/solver-cpsat/` exists, on 12 students. Example:
the solver plan graduates in 6.00 terms vs 8.00 for the official plan, with interest match
0.45 vs 0.79. At n = 12 this is a pipeline check, not a finding.

## profiling/

Reads a whole instance (every curriculum, `catalog.json`, every student file) and writes
`profiling/reports/<uni>/profile.json` and `report.md` with automatic remarks; plain Python,
about 540 lines. `python -m profiling instances/hcmut`. The former `data_tools/` package
(per-student GPA audit and exports) was deleted on 2026-11-28; its oracle check (the
hand-computed CGPAs) is now a planner test against the ASP engine
(`planner/tests/test_parity.py`).

## tag_classifier/ and docs/

**tag_classifier/** proposes course tags from syllabi; the team chooses the final tags in
Excel workbooks. Kept tags are exported to `instances/hcmut/course-tags.json`
(`tag_classifier/config.toml`, `export_file`), which the ASP adapter reads for the interest
objective, as does `synthetic/curriculum.py`. It never runs during solving and has its own
venv (the NLI models are heavy). Details: [tag_classifier/README.md](tag_classifier/README.md).

1. `extract`: read-only snapshot of the web database.
2. `preprocess`, `eda`: course text and a data report.
3. `candidates`: candidate tags per program family (cohorts of one program; 47 of 55
   families qualify). Run on CS-KHMT only so far.
4. `classify`: scores per (course, section, tag, model). NLI models ran on a Colab T4 on
   2026-11-22 (`bundle`, `notebooks/colab_classify.ipynb`, `merge_cache`).
5. `aggregate`, `evaluate`: course tags by rule, automatic evaluation report.
6. `review`, then `export`: workbooks in `review/`, then the tag file.

**docs/**: `GUIDELINES.md` (how to change the input, add a solver, add an evaluation);
`CONSTRAINTS.md`, `FEATURES.md`, `USER-INPUT.md` (the planner reference, for every solver);
`PLANNER-PARITY.md` (where the solvers differ, and recommendations to close each gap). A
solver's own documentation goes next to its code (`planner/solvers/<solver>/` or a README there).

## Install

Python 3.12. One virtual environment in `pipeline/` serves every package except
`tag_classifier`:

```
cd pipeline
python -m venv .venv
.venv\Scripts\activate              # Windows; on Linux/macOS: source .venv/bin/activate
pip install -r planner/requirements.txt      # clingo (ASP), ortools (CP-SAT), pytest, openpyxl and pymupdf (myBK files)
pip install -r synthetic/requirements.txt    # numpy, pandas, SALib, matplotlib (synthetic/ and evaluation/); includes planner's
```

- Both solvers are needed for the planner tests: without `ortools`, 4 planner test modules
  fail to import; without `clingo`, every ASP test does.
- `instances/` and `profiling/` need only the standard library (and `pytest` for tests).
- `tag_classifier/` has its own venv because of the NLI models (PyTorch, transformers):
  see [tag_classifier/README.md](tag_classifier/README.md).
- The requirement files set lower bounds only (`>=`), not pinned versions. Versions used for
  the test results below: clingo 5.8.2, ortools 9.15.6755.

## How to run

From `pipeline/`, with the venv active.

```
python -m instances.loader instances/hcmut                    # validate an instance
python -m profiling instances/hcmut                           # profile it
python -m planner.cli --solver cpsat < case.json              # solve one case (JSON in, JSON out)
python -m evaluation.run_scenarios                            # all toy requests, validated
python -m evaluation.compare                                  # ASP vs CP-SAT
python -m synthetic.official_plan                             # step 0
python -m synthetic.run --pool base --n 200 --seed 1 --workers 8          # steps 1-2
python -m evaluation.cohort.run --pool base --solver cpsat --workers 8    # steps 3-5, figures
python -m synthetic.checks predictive --n 2000 --seed 1       # step 6
python -m synthetic.checks pool --pool base
```

Tests, run 2026-11-28 with `python -m pytest <package> -q` (system Python 3.12, clingo
5.8.2, ortools 9.15.6755):

| Package | Result |
| --- | --- |
| `instances` | 42 passed |
| `planner` | 177 passed (about 2 minutes) |
| `evaluation` | 8 passed |
| `synthetic` | 37 passed |
| `profiling` | 7 passed |
| `tag_classifier` | 80 passed |

## Known issues and open decisions

Checked 2026-11-28. Resolved the same day by the solver-parity work: the two pass/fail
rules (`data_tools` deleted), the policy kept in two places (`policy.lp` deleted, compiled
from the JSON), the two curricula for one program (`cs_2023` merged and deleted), and the
planner tests not running (`ortools` installed).

| Issue | Evidence | Options |
| --- | --- | --- |
| `synthetic/` and `tag_classifier/` not complete | Separate pipelines (synthetic data for evaluation; course tags) | Their open problems are listed in [synthetic/README.md](synthetic/README.md) (section 7) and [tag_classifier/README.md](tag_classifier/README.md) |
| ASP no longer proves optimality on KHMT-size cases | Not proven after 180 s (1 thread) since it plans under the input's 11–25 TC with the soft minimum and the shared goals; its plans reached the CP-SAT optimal values of every shared goal | docs/PLANNER-PARITY.md, P1 |
| `year_credit_thresholds` not set for KHMT | With `[28, 56, 84]` CP-SAT needs more than 60 s on a plan from enrollment (2.9 s without) | docs/PLANNER-PARITY.md, P4 |
| Elective surplus and `max_courses` differ between solvers | docs/PLANNER-PARITY.md, P2 and P3 | Decide the rule, then align |
| `military_education` in `external.json` not yet reviewed | Added 2026-11-28 with MI1003 (0 credits), `review: true`; the other entries are reviewed | Review |
| Merged curriculum fields lost on re-fetch | `fetch_curriculum` does not produce `program`, `offered_terms`, `max_courses`, the PE and MI1003 conditions | Add them to the importer, or keep a hand-maintained overlay |
| Stale docs | `planner/README.md` (`fixtures/toy.json`, `solve_asp.py`), `planner/solvers/asp/README.md` and `ADAPTER.md` (`policy.lp`, deleted command), `instances/FIELDS-V1.md` (deleted standalone ASP command, `cs_2023`), generated `report.md` header | Update when docs are next in scope |
