# Guidelines for teammates: extending the pipeline

How to change the input data, add or change a solver, and add or run an evaluation.
Written 2026-11-28 against commit `11eed81` (`research-pipeline`). Overview of the packages:
[../README.md](../README.md).

Every command runs from `pipeline/`. Each section marks what **exists** and what is **not
built**, so you know whether you are using a feature or writing one.

## 0. Working together

| Rule | Why |
| --- | --- |
| Commit directly to `research-pipeline`; no feature branches | Two-person project, so branches and reviews cost more than they catch |
| Changing input data: add or update tests that check the data's format and content | With no review, a test is the only check on the data before the other person pulls it |
| Adding or deleting fields: add or update tests that cover the field being added or removed, and document the field | Code that reads the data breaks without warning when a field appears or disappears |
| Changing, adding or deleting a solver (planner): document it, and check that it still accepts the same input and returns the same output format | Everything downstream (validator, evaluation) depends on that contract |
| After every change, add an entry to `docs/CHANGELOG.md`: date and time, plus what changed in detail | Few people read `git log` or commit messages; the changelog is where the other person looks |
| Run the tests of every package you touched, plus `instances` (section 4) before you push | Nothing runs them for you |
| Don't edit `evaluation/cohort/config.toml` or `synthetic/config.toml` just to try something. Use `--solver`, `--label` and `--pool` instead | Both files are shared, and every edit is a merge conflict waiting to happen |
| Give every experiment its own `--pool` and `--label` | Outputs go to `evaluation/results/<pool>/solver-<label>/`, so names keep runs apart |
| Don't commit `synthetic/data/`, `evaluation/cache/` or `evaluation/results/` (git-ignored) | To share a result, share the command plus the pool's `n` and `seed`. The run reproduces exactly with ASP in `conflicts` mode, not with CP-SAT (wall-clock limit) |
| Write new code, docs and logs in English | Team convention |

Setup: see "Install" in [../README.md](../README.md): one venv with `planner/requirements.txt`
and `synthetic/requirements.txt` (it includes the planner's). `tag_classifier` has its own venv
(see its README).

## 1. Changing the input data (JSON)

### 1.1 Where each kind of data lives

All input is in `instances/<university>/`, described in [../instances/SCHEMA.md](../instances/SCHEMA.md).

| To change | Edit | Read by |
| --- | --- | --- |
| Courses, relations, groups, majors, load bounds, horizon | `curricula/<id>/curriculum.json` | `planner.model.input` (both solvers and the validator), `synthetic`, `profiling` |
| Graduation requirements (minimum GPA, total credits) | `curricula/<id>/graduation.json` | planner input (`fixture["policy"]["graduation"]`, the ASP GPA report), `profiling`. Graduation-course thresholds come from `milestones` in `curriculum.json` |
| Requirements outside the course plan | `policy/external.json` | planner input (`fixture["policy"]["external"]`), the ASP report |
| Published term-by-term plan | `curricula/<id>/official_plan.json` | `synthetic` (official plan), loader check |
| Grade scale, GPA, retakes | `policy/grading.json` | planner input (compiled for ASP by `planner/solvers/asp/policy.py`), `synthetic`, `instances.policy` |
| Fees | `policy/tuition.json` | same as grading; the curriculum's `program` selects the rule |
| Academic standing (attrition) | `policy/standing.json` | `synthetic` only |
| A student's history | `students/<set>.json` | planner input (statuses, and every attempt with term and grade), `profiling` |
| A planning request or what-if scenario | `requests/<set>.json` | `planner.model.input.load_fixture`, `evaluation.run_scenarios` |
| Course tags | `instances/hcmut/course-tags.json` (written by `tag_classifier export`) | ASP adapter (interest objective), `synthetic` |

**A 0-credit course is an external requirement.** Give it `kind: condition` (the loader
rejects it otherwise) and, if it counts toward a requirement, list it in that requirement's
`satisfied_by_courses` in `policy/external.json`. The planner never schedules it.

**One copy of the policy (since 2026-11-28).** The policy JSON travels in the planner input
(`to_planner_fixture(..., policy=...)`, which `load_fixture` fills from the instance). Per-term
load bounds always come from `planning` in `curriculum.json`, for every solver. Edit the JSON
only; there is no solver copy to keep in step ([PLANNER-PARITY.md](PLANNER-PARITY.md)).

### 1.2 How a change flows

```
instances/<uni>/*.json
   │  instances.loader          validates the folder (schema 3)
   ▼
planner.model.input.to_planner_fixture / load_fixture
   │                            canonical -> the solvers' internal "fixture" dict
   ▼
planner.model.normalize         reshapes only, no rules
   ├─► planner.solvers.cpsat
   ├─► planner.solvers.asp.adapter ─► clingo (core/*.lp + facts from the input and policy.py)
   └─► evaluation.validate      independent check of every plan
```

`synthetic.curriculum.Curriculum` builds its fixture with the same `to_planner_fixture`,
passing the policy files of `[run] policy`.

### 1.3 Editing values (no new fields)

1. Edit the JSON.
2. `python -m instances.loader instances/<uni>` must print a summary with no errors.
3. `python -m pytest instances -q`. `test_khmt_instance_counts` pins course and relation
   counts for CS-2023-KHMT; update it if you changed those counts on purpose.
4. `python -m evaluation.run_scenarios` (toy instance) or `--fixture instances/<uni>/requests/<set>.json`:
   every plan must show no validator violations, unless the case is meant to be infeasible.
5. `python -m profiling instances/<uni>` refreshes `profiling/reports/<uni>/`. Commit the
   report so reviewers see what changed.

### 1.4 Adding a field

A new field is used only if every layer knows about it:

1. Document it in `instances/SCHEMA.md` (the table for its file).
2. Validate it in `instances/loader.py` (`validate_curriculum`, `validate_students`,
   `validate_requests`, ...). Add a failing case to `test_validator_rejects_broken_*`.
3. Map it in `planner/model/input.py` (`to_planner_fixture`) if solvers need it.
4. Use it in each solver that should honour it. For ASP, that means a fact in
   `planner/solvers/asp/adapter.py` plus a rule in `core/*.lp`. For CP-SAT, it means
   `planner/solvers/cpsat.py`. Shared rules go in `planner/model/facts.py`.
5. Check it in `evaluation/validate.py` if it is a hard rule. The validator must not import
   solver rules, so write the check again there.
6. Look for other readers: `grep -rn "<field>" --include=*.py .`

### 1.5 Adding a university

1. Create `instances/<uni>/` following SCHEMA.md: `policy/`, `curricula/<id>/`, `students/`, `requests/`.
2. Put any converter in `instances/importers/<uni>/`. University-specific code goes nowhere else.
3. Validate, profile, and add the folder to `test_committed_instances_validate`.
4. Note: `synthetic` and `evaluation.cohort` are tied to CS-2023-KHMT through
   `synthetic/config.toml` (`[run]`). The ASP adapter reads tags from
   `instances/hcmut/course-tags.json` (`TAGS_FILE`), and `planner/solvers/asp/policy.py`
   has the HCMUT calendar (2 regular terms and a summer). A second university needs those
   three made configurable first.

## 2. Adding or changing a solver

### 2.1 The interface (exists)

`planner/solvers/registry.py` is the only place that knows which solver runs. A solver is an
object with a `name` attribute and four methods:

| Method | Returns | Notes |
| --- | --- | --- |
| `settings(s)` | dict | `s` is the `[solver.<name>]` table of `evaluation/cohort/config.toml` (or `{}`). The result is part of the cache key |
| `fingerprint()` | str | Hash of the solver's source files (`hash_files(...)`). Change any listed file and cached results are not reused |
| `solve(fx, sc, settings)` | planner result | Build it with `planner.model.result.make_result(fixture, scenario, solver, status, takes, ...)` |
| `stopped_by(result, settings)` | str | `"proven"`, `"time_limit"`, `"solve_limit"`, ... |

What the pipeline reads from your result (`registry.common_result`):

- `status`: one of `OPTIMAL`, `SAT_NOT_PROVEN_OPTIMAL`, `UNSAT`, `TIMEOUT` (or already `FEASIBLE`,
  `INFEASIBLE`, `NO_PLAN`). Mapped to OPTIMAL / FEASIBLE / INFEASIBLE / NO_PLAN.
- `semesters`: `[{"semester_code": ..., "courses": [...]}]`. `make_result` builds this from
  `takes = [(course, term_index 1..n)]`.
- `graduation_semester`, `violations`, `warnings`, and `engine_report.objective` or `objective`.

The pipeline times `solve` itself (`seconds`) and computes every evaluation metric from the
plan, never from your solver's own report.

### 2.2 Plugging in a new solver (no registry edit)

Put a module anywhere on the Python path. Tested example (`my_solver.py`): the ASP engine with
a smaller conflict budget.

```python
"""Example plug-in solver: the ASP engine with a fixed conflict budget."""
from planner.solvers.registry import hash_files


class MySolver:
    name = "asp-small"                     # cache folder: evaluation/cache/asp-small/

    def settings(self, s: dict) -> dict:   # s = the [solver.asp-small] table, or {}
        return {"solve_limit": int(s.get("solve_limit", 2000)), "time_limit": float(s.get("time_limit", 60))}

    def fingerprint(self) -> str:          # change these files -> old cache entries are not reused
        from planner.solvers.asp import adapter as A, policy as P
        from planner.solvers.registry import shared_model_files
        return hash_files((__file__, A.__file__, P.__file__, *A.SOURCES_BEFORE, *A.SOURCES_AFTER,
                           *shared_model_files()))

    def solve(self, fx: dict, sc: dict, st: dict) -> dict:
        from planner.solvers.asp.adapter import solve_asp
        return solve_asp(fx, sc, None, st["time_limit"], threads=1, solve_limit=st["solve_limit"])

    def stopped_by(self, r: dict, st: dict) -> str:
        return (r.get("engine_report") or {}).get("stopped_by") or "unknown"


def factory():
    return MySolver()
```

Try it on one case before a cohort:

```python
import time
from planner.model.input import TOY, load_fixture
from planner.solvers.registry import get_solver, common_result
from evaluation.validate import validate_plan

fx = load_fixture(TOY)
ad = get_solver("my_solver:factory")
st = ad.settings({})
for sc in fx["scenarios"]:
    t = time.perf_counter(); r = ad.solve(fx, sc, st)
    c = common_result(r, time.perf_counter() - t, ad.stopped_by(r, st), ad.name)
    print(sc["id"], c["status"], c["stopped_by"], c["seconds"],
          len(validate_plan(fx, sc, r.get("semesters") or [])), "violations")
```

Then run it on a cohort, with results kept apart from the built-in solvers:

```
python -m evaluation.cohort.run --pool base --solver my_solver:factory --label asp-small --workers 8
```

When a plug-in becomes permanent, add it to `BUILTIN` in `registry.py`.

### 2.3 Changing an existing solver

| Solver | Files | Fingerprint covers |
| --- | --- | --- |
| ASP | `planner/solvers/asp/adapter.py`, `policy.py`, `core/*.lp` | those files, `course-tags.json`, the myBK aliases file, and the shared model files |
| CP-SAT | `planner/solvers/cpsat.py` | `cpsat.py` and the shared model files |

The shared model files (`registry.shared_model_files`) are `facts.py`, `normalize.py`,
`report.py`, `result.py` and `student_requests.py`: a change there invalidates the cache of
both solvers. `input.py` is not listed because it only builds the input, which is itself
part of the cache key.

Each solver declares what it implements in `CAPABILITIES` (input fields and goal ids). When
you add a field or goal to one solver, update its `CAPABILITIES`; a request that uses
something a solver lacks gets a warning, or an error with `strict=True`.

After any solver change:

1. `python -m pytest planner planner/solvers/asp evaluation -q`
2. `python -m evaluation.run_scenarios --solver clingo` and `--solver cpsat` (no new violations)
3. `python -m evaluation.compare` (ASP vs CP-SAT on the toy requests)
4. A small cohort run under a new `--label`, compared with the old label (section 3.3)

## 3. Evaluation methods

### 3.1 What exists and what doesn't

| Method | Status | How to run / where it lives |
| --- | --- | --- |
| Plan legality (independent validator) | exists | `evaluation/validate.py`; run on every plan by `run_scenarios`, `compare` and cohort step 4 (`legal`, `n_errors`) |
| Solve time | exists | `seconds` in `solver_full.json` (timed by the pipeline); ASP also reports `engine_report.ground_and_solve_ms`; `evaluation.compare` times both solvers on the toy requests, `--benchmark` on random data |
| How the solver stopped | exists | `stopped_by` and `status` in `solver_full.json` |
| Search statistics (conflicts, choices, branches) | **not built** | Not recorded by either solver (section 3.4) |
| Compare plans per student (solver, official, baseline, agent record) | exists | Cohort step 4, `eval_full.csv`; metrics defined in [../evaluation/cohort/EVALUATION.md](../evaluation/cohort/EVALUATION.md) |
| Paired differences with bootstrap intervals | partial | Only "solver minus X" (`summarize_full` in `evaluate.py`) |
| Plans from mid-program states (cuts) | exists | Cohort step 3b + 4, `eval_cuts.csv` |
| Replay a plan after a fail | exists | `--replay` |
| Sensitivity to model parameters | exists | Pool made with `--per-student-params`, then cohort step 5 |
| Solver reproducibility | exists | `evaluation.cohort.run --pool P --resolve m` |
| Cross-solver report, side by side | **not built** | Recipe in section 3.3 |
| What-if comparison on real student requests | partial | `run_scenarios --fixture <requests file>` prints plans and diffs, with no metrics |

### 3.2 Adding a plan or a metric to the cohort comparison

All plans use one shape, `{term: [courses]}`, and every metric is computed from it.

- **New plan** (e.g. a greedy heuristic): return it from `student_plans()` in
  `evaluation/cohort/evaluate.py` and add its name to `PLANS`. It then gets every metric and
  shares the common random numbers.
- **New metric**: add a key to `plan_metrics()` (plan structure) or `first_attempt_grades()`
  (grades). Define it in `EVALUATION.md`. Re-evaluating needs no solver call:
  `python -m evaluation.cohort.run --pool P --steps 4,viz`.
- **Other pairs** (official minus baseline, solver A minus solver B): `summarize_full` (and the
  `*_minus_*` columns in `evaluate_cuts`) hardcode `"solver"` as the left side. Generalize
  them to a list of pairs.

### 3.3 Cross-solver report (recipe; not built)

The data already supports a paired comparison: the same pool means the same students, seeds
and score noise.

1. Run both solvers on one pool:
   ```
   python -m evaluation.cohort.run --pool base --solver asp   --workers 8
   python -m evaluation.cohort.run --pool base --solver cpsat --workers 8
   ```
2. Load `evaluation/results/base/solver-asp/eval_full.csv` and `.../solver-cpsat/eval_full.csv`,
   keep rows with `plan == "solver"`, and join on `student`.
3. Per metric, take the difference per student and summarize with `bootstrap_mean` from
   `evaluate.py`. Add `status`, `stopped_by` and `seconds` from each `solver_full.json`.
4. Put it in a new module such as `evaluation/cohort/cross.py` that writes
   `evaluation/results/<pool>/cross-<labelA>-vs-<labelB>/`.

Caveats:
- Compare the pipeline's metrics, not `objective`. The two solvers encode their objectives
  separately (ASP: priority levels in `core/optimize.lp`; CP-SAT: one weighted sum that
  emulates priority levels in `cpsat.py`). Their levels and values are not guaranteed to match.
- CP-SAT results under a wall-clock limit depend on the machine. Report how many cases each
  solver proved optimal.

### 3.4 Recording search statistics (not built)

Neither solver returns search statistics today. Where to add them:

- ASP: in `solve_asp` (`planner/solvers/asp/adapter.py`), after the solve, read
  `ctl.statistics["solving"]["solvers"]` (choices, conflicts) into `report` (the `engine_report`).
- CP-SAT: in `solve_cpsat` (`planner/solvers/cpsat.py`), after `solver.solve(model)`, read
  `solver.num_branches`, `solver.num_conflicts` and `solver.wall_time`, and attach them to the result.
- Copy the new fields into `registry.common_result` so they reach `solver_full.json`.

Editing the adapters changes their fingerprints, so the next cohort run solves again. That
is correct, because old cache entries do not have the new fields.

## 4. Tests by package

| Package | Command | Last result (2026-11-28) |
| --- | --- | --- |
| instances | `python -m pytest instances -q` | 42 passed |
| planner | `python -m pytest planner -q` | 177 passed (about 2 minutes) |
| evaluation | `python -m pytest evaluation -q` | 8 passed |
| synthetic | `python -m pytest synthetic -q` | 37 passed |
| profiling | `python -m pytest profiling -q` | 7 passed |
| tag_classifier | `python -m pytest tag_classifier -q` | 80 passed |
