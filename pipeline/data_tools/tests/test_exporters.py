"""Exporter smoke tests."""

from __future__ import annotations

import pytest

from data_tools.exporters.asp_facts import export_asp_facts
from data_tools.exporters.chart_export import export_charts
from data_tools.exporters.csv_export import export_csv
from data_tools.exporters.table_export import export_tables


def test_csv_export_writes_all_tables(report, tmp_path):
    paths = export_csv(report, tmp_path)
    assert len(paths) == 9
    students_csv = tmp_path / "csv" / "students.csv"
    assert students_csv.is_file()
    text = students_csv.read_text(encoding="utf-8")
    assert "student_id" in text
    assert "S001" in text
    assert "3.27" in text


def test_table_export_writes_markdown_and_html(report, tmp_path):
    paths = export_tables(report, tmp_path)
    assert (tmp_path / "tables" / "students.md").is_file()
    assert (tmp_path / "tables" / "attempts.md").is_file()
    report_html = (tmp_path / "report.html").read_text(encoding="utf-8")
    assert "Academic Advising Report" in report_html
    assert "Student summary" in report_html
    assert "S001" in report_html
    assert len(paths) == 10


def test_chart_export_writes_pngs(report, tmp_path):
    paths = export_charts(report, tmp_path)
    assert len(paths) == 5
    for path in paths:
        assert path.is_file()
        assert path.stat().st_size > 0


def test_asp_facts_is_an_explicit_future_stub(bundle, tmp_path):
    with pytest.raises(NotImplementedError, match="planned"):
        export_asp_facts(bundle, tmp_path)
