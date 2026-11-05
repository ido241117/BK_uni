"""CSV exporter for the aggregated report tables."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from data_tools.model import Report


def _write_frame(frame: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8", lineterminator="\n")
    return path


def export_csv(report: Report, out_dir: str | Path) -> list[Path]:
    """Write every report table as a separate CSV file."""

    root = Path(out_dir).resolve() / "csv"
    frames: dict[str, pd.DataFrame] = {
        "students.csv": report.students,
        "attempts.csv": report.attempts,
        "course_stats.csv": report.courses,
        "grade_distribution.csv": report.grades,
        "gpa_distribution.csv": report.gpa_distribution,
        "external_progress.csv": report.external_progress,
        "external_milestones.csv": report.external_milestones,
        "expected_mismatches.csv": report.expected_mismatches,
    }
    overview = pd.DataFrame(
        [{"metric": key, "value": value} for key, value in report.overview.items()]
    )
    frames["overview.csv"] = overview
    return [_write_frame(frame, root / name) for name, frame in frames.items()]
