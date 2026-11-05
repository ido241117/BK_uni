"""Markdown tables and a single self-contained HTML report."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd
from jinja2 import Environment

from data_tools.model import Report

HTML_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Academic Advising Report - {{ overview.curriculum_id }}</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --panel: #ffffff;
      --ink: #1f2937;
      --muted: #667085;
      --line: #d8dee9;
      --accent: #2457a6;
      --good: #177245;
      --bad: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", Arial, sans-serif;
      line-height: 1.45;
    }
    h1, h2 { margin: 0 0 12px; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; margin-top: 28px; }
    p.subtitle { color: var(--muted); margin: 0 0 24px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .card .value { font-size: 22px; font-weight: 650; margin-top: 4px; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 16px;
      overflow-x: auto;
      margin-bottom: 16px;
    }
    table.data {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
    }
    table.data th, table.data td {
      border-bottom: 1px solid var(--line);
      padding: 7px 9px;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }
    table.data th {
      background: #eef3fb;
      color: #243b63;
      position: sticky;
      top: 0;
    }
    table.data tr:hover td { background: #f8fafc; }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 16px;
    }
    .chart {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
    }
    .chart img { width: 100%; height: auto; display: block; }
    .note { color: var(--muted); font-size: 13px; }
    .ok { color: var(--good); font-weight: 600; }
    .bad { color: var(--bad); font-weight: 600; }
  </style>
</head>
<body>
  <h1>Academic Advising Report</h1>
  <p class="subtitle">
    {{ overview.curriculum_name }} ({{ overview.curriculum_id }}), policy {{ overview.policy_id }}.
    Source: {{ overview.data_dir }}
  </p>

  <div class="cards">
    {% for card in cards %}
    <div class="card">
      <div class="label">{{ card.label }}</div>
      <div class="value">{{ card.value }}</div>
    </div>
    {% endfor %}
  </div>

  {% if chart_items %}
  <h2>Charts</h2>
  <div class="charts">
    {% for chart in chart_items %}
    <div class="chart"><img src="{{ chart.src }}" alt="{{ chart.title }}"></div>
    {% endfor %}
  </div>
  {% endif %}

  {% for section in sections %}
  <h2>{{ section.title }}</h2>
  <div class="panel">
    {{ section.html|safe }}
  </div>
  {% endfor %}
</body>
</html>
"""


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    text = str(value).replace("|", "\\|").replace("\n", " ").strip()
    return text


def to_markdown(frame: pd.DataFrame) -> str:
    if frame.empty:
        return "_No rows._"
    headers = [str(column) for column in frame.columns]
    lines = [
        "| " + " | ".join(_cell(header) for header in headers) + " |",
        "|" + "|".join("---" for _ in headers) + "|",
    ]
    for row in frame.itertuples(index=False, name=None):
        lines.append("| " + " | ".join(_cell(value) for value in row) + " |")
    return "\n".join(lines)


def _overview_markdown(overview: dict[str, Any]) -> str:
    frame = pd.DataFrame(
        [{"metric": key, "value": value} for key, value in overview.items()]
    )
    return to_markdown(frame)


def _table_sections(report: Report) -> list[dict[str, Any]]:
    return [
        {"title": "Student summary", "filename": "students.md", "frame": report.students},
        {"title": "Course statistics", "filename": "course_stats.md", "frame": report.courses},
        {
            "title": "Grade distribution",
            "filename": "grade_distribution.md",
            "frame": report.grades,
        },
        {
            "title": "CGPA distribution",
            "filename": "gpa_distribution.md",
            "frame": report.gpa_distribution,
        },
        {
            "title": "External requirement progress",
            "filename": "external_progress.md",
            "frame": report.external_progress,
        },
        {
            "title": "External milestone detail",
            "filename": "external_milestones.md",
            "frame": report.external_milestones,
        },
        {
            "title": "Attempt detail",
            "filename": "attempts.md",
            "frame": report.attempts,
        },
        {
            "title": "Expected mismatches",
            "filename": "expected_mismatches.md",
            "frame": report.expected_mismatches,
        },
    ]


def export_tables(
    report: Report,
    out_dir: str | Path,
    chart_paths: list[Path] | None = None,
    write_markdown: bool = True,
    write_html: bool = True,
) -> list[Path]:
    """Write Markdown tables and/or the combined HTML report."""

    root = Path(out_dir).resolve()
    tables_dir = root / "tables"
    written: list[Path] = []
    sections: list[dict[str, Any]] = []
    table_sections = _table_sections(report)

    if write_markdown:
        tables_dir.mkdir(parents=True, exist_ok=True)
        overview_path = tables_dir / "overview.md"
        overview_path.write_text(
            "# Overview\n\n" + _overview_markdown(report.overview) + "\n",
            encoding="utf-8",
        )
        written.append(overview_path)

        for section in table_sections:
            markdown_path = tables_dir / section["filename"]
            markdown_path.write_text(
                f"# {section['title']}\n\n{to_markdown(section['frame'])}\n",
                encoding="utf-8",
            )
            written.append(markdown_path)

    if not write_html:
        return written

    for section in table_sections:
        if not section["frame"].empty:
            sections.append(
                {
                    "title": section["title"],
                    "html": section["frame"].to_html(
                        index=False, border=0, classes="data", escape=True, na_rep=""
                    ),
                }
            )

    cards = [
        {"label": "Students", "value": report.overview["students"]},
        {"label": "Courses", "value": report.overview["courses"]},
        {"label": "Attempts", "value": report.overview["attempts"]},
        {"label": "Average CGPA", "value": report.overview["average_cgpa"]},
        {
            "label": "Expected checks",
            "value": f"{report.overview['expected_matches']} / {report.overview['expected_total']}",
        },
        {"label": "External missed", "value": report.overview["external_missed"]},
    ]

    chart_items = []
    for path in chart_paths or []:
        try:
            source = path.relative_to(root).as_posix()
        except ValueError:
            source = path.name
        chart_items.append({"title": path.stem.replace("_", " ").title(), "src": source})

    environment = Environment(autoescape=True)
    template = environment.from_string(HTML_TEMPLATE)
    html = template.render(
        overview=report.overview,
        cards=cards,
        sections=sections,
        chart_items=chart_items,
    )
    report_path = root / "report.html"
    report_path.write_text(html, encoding="utf-8")
    written.append(report_path)
    return written
