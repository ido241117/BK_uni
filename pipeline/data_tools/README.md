# Academic Advising Python Engine

A small Python pipeline that reads the JSON files in `../data/`, validates their
cross-references, reproduces the expected GPA/credit results, and exports CSV
tables, Markdown/HTML statistics, and charts.

The JSON dataset remains the source of truth. The engine never modifies it.

## Requirements

- Python 3.11+
- `pandas`
- `matplotlib`
- `jinja2`
- `pytest` (tests only)

Install from this folder:

```powershell
python -m pip install -r requirements.txt
```

## Quick start

Run from `asp-test-2/`:

```powershell
python engine/main.py validate
python engine/main.py report
```

The package form also works:

```powershell
python -m engine.main validate
python -m engine.main report
```

Defaults:

- input: `asp-test-2/data/`
- output: `asp-test-2/output/`

Override them explicitly:

```powershell
python engine/main.py report --data data --out output --formats csv,tables,charts,html
```

`--formats` accepts any combination of `csv`, `tables`, `charts`, `html`, or
`all`. Using `tables` also writes the HTML report by default.

## Outputs

```text
output/
├─ csv/
│  ├─ students.csv
│  ├─ attempts.csv
│  ├─ course_stats.csv
│  ├─ grade_distribution.csv
│  ├─ gpa_distribution.csv
│  ├─ external_progress.csv
│  ├─ external_milestones.csv
│  ├─ expected_mismatches.csv
│  └─ overview.csv
├─ charts/
│  ├─ grade_distribution.png
│  ├─ cgpa_distribution.png
│  ├─ credits_earned.png
│  ├─ attempts_per_course.png
│  └─ external_social_work_days.png
├─ tables/
│  ├─ overview.md
│  ├─ students.md
│  ├─ course_stats.md
│  ├─ grade_distribution.md
│  ├─ gpa_distribution.md
│  ├─ external_progress.md
│  ├─ external_milestones.md
│  ├─ attempts.md
│  └─ expected_mismatches.md
└─ report.html
```

`output/` is generated and should not be committed.

## Pipeline

1. `loader.py` reads the four JSON files and validates:
   - schema-level field types,
   - curriculum/policy/requirement links,
   - course, group and major references,
   - attempt ids and grades,
   - external requirement references,
   - expected-result references.
2. `policy.py` applies the grading policy:
   - latest valid attempt per course,
   - retake eligibility and `max_attempts`,
   - retake grade cap,
   - GPA filtering by `course_kind`,
   - credit-weighted GPA with half-up rounding,
   - credits earned once per course,
   - cumulative external totals and milestone status,
   - major determination and default major.
3. `stats.py` aggregates the audit results into pandas tables.
4. `exporters/` writes CSV, Markdown, HTML and chart files.

The validation command checks every student's computed result against the
`expected` block in `student_history.json`. A mismatch returns a non-zero exit
code and prints the differing fields.

## Policy assumptions

These match the current dataset and README:

- Attempts after `expected.as_of_term` are ignored.
- The latest valid attempt per course is the one used for GPA.
- A retake is allowed only when the previous valid grade is at or below
  `retake.eligibility.only_if_grade_at_most`.
- No more than `retake.max_attempts` valid attempts are considered.
- Retake grades above `retake.grade_cap.max_grade` are capped using the grade
  scale.
- `effective_grades` contains selected retake attempts, including retakes whose
  grade was already below the cap.
- Credits are earned once per course and are not lost if a later retake is
  selected.
- `end_of_year` external deadlines are mapped to term `(cohort + year - 1)-2`;
  `graduation` deadlines are reported as pending unless the milestone is already
  met.

## ASP facts

`exporters/asp_facts.py` is an explicit design stub for the next stage. The
intended architecture is:

- reuse `loader.py`, `model.py` and validation,
- add a separate raw-facts exporter,
- keep ASP predicates stable and sorted,
- let the ASP engine perform its own retake/GPA reasoning,
- keep ASP rules and solver scripts in a future sibling folder
  `asp-test-2/asp/`, not inside the Python loader.

The planned predicates are documented in that module.

## Tests

```powershell
python -m pytest engine/tests -q
```

The tests cover loading, cross-reference rejection, all seven expected student
results, retake/cap/rounding/major edge cases, and exporter smoke tests.
