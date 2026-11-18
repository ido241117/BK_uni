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

Run from `pipeline/`:

```powershell
python data_tools/main.py validate
python data_tools/main.py report
```

The package form also works:

```powershell
python -m data_tools.main validate
python -m data_tools.main report
```

Defaults:

- input: `pipeline/data/`
- output: `pipeline/output/`

Override them explicitly:

```powershell
python data_tools/main.py report --data data --out output --formats csv,tables,charts,html
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
   - cap each retake at `retake.grade_cap.max_grade` when configured,
   - select the latest attempt or the highest effective grade
     (`gpa_attempt_selection`),
   - GPA filtering by `course_kind`,
   - credit-weighted GPA with half-up rounding,
   - credits earned once per course,
   - cumulative external totals and milestone status,
   - major determination and default major.
3. `stats.py` aggregates the audit results into pandas tables.
4. `exporters/` writes CSV, Markdown, HTML and chart files.

The loader accepts both the row-oriented `schema_version: 2` file and legacy
nested `schema_version: 1` records. The validation command checks every
student's computed result against the matching row in the `expected[]` table
of `student_history.json`. A mismatch returns a non-zero exit code and prints
the differing fields.

## Policy assumptions

These match the current dataset and README:

- Attempts after `expected.as_of_term` are ignored.
- Every recorded attempt is kept. `gpa_attempt_selection` chooses `latest`
  (default) or `best` (highest effective grade, later attempt on ties).
- There is no retake eligibility threshold or attempt limit. A configured
  `retake.grade_cap` caps each retake attempt before selection; first attempts
  are never capped.
- `effective_grades` contains the effective (capped) grades of selected retake
  attempts. Pass/fail attempts have no effective letter grade.
- A `result: passed` attempt earns credit without entering the GPA; `failed`
  earns no credit. Credit is earned once per course and is not lost if a later
  retake is selected.
- `end_of_year` external deadlines are mapped to term `(cohort + year - 1)-2`;
  `graduation` deadlines are reported as pending unless the milestone is already
  met.

## ASP planning

The ASP curriculum and planning pipeline lives separately in
`pipeline/engine/asp/`. This Python package is limited to validation, policy
checks, statistics, and report exporters.

## Tests

```powershell
python -m pytest data_tools/tests -q
```

The tests cover loading, cross-reference rejection, all seven expected student
results, retake/cap/selection/rounding/major edge cases, and exporter smoke
tests.
