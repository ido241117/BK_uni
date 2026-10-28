"""Static chart exporter built on matplotlib."""

from __future__ import annotations

import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np

from data_tools.model import Report

plt.rcParams.update(
    {
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "axes.edgecolor": "#c9d2e3",
        "axes.grid": True,
        "grid.color": "#e6eaf0",
        "grid.linewidth": 0.7,
        "font.size": 9.5,
        "axes.titlesize": 11,
        "axes.titleweight": "bold",
        "axes.labelsize": 9.5,
        "legend.fontsize": 8.5,
    }
)


def _save(fig, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=160, bbox_inches="tight")
    plt.close(fig)
    return path


def _slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()


def _annotate_bars(ax, bars, values) -> None:
    for bar, value in zip(bars, values):
        if value:
            ax.annotate(
                str(value),
                xy=(bar.get_x() + bar.get_width() / 2, bar.get_height()),
                xytext=(0, 3),
                textcoords="offset points",
                ha="center",
                va="bottom",
                fontsize=8,
            )


def _grade_distribution(report: Report, out_dir: Path) -> Path:
    frame = report.grades
    x = np.arange(len(frame))
    width = 0.38
    fig, ax = plt.subplots(figsize=(9.5, 4.4))
    raw = frame["raw_count"].to_numpy()
    selected = frame["selected_count"].to_numpy()
    bars_raw = ax.bar(x - width / 2, raw, width, label="All attempts", color="#8fb3e2")
    bars_selected = ax.bar(
        x + width / 2, selected, width, label="Selected attempts", color="#2457a6"
    )
    _annotate_bars(ax, bars_raw, raw)
    _annotate_bars(ax, bars_selected, selected)
    ax.set_xticks(x)
    ax.set_xticklabels(frame["grade"].tolist())
    ax.set_ylabel("Attempts")
    ax.set_title("Grade distribution")
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    return _save(fig, out_dir / "grade_distribution.png")


def _cgpa_distribution(report: Report, out_dir: Path) -> Path:
    frame = report.gpa_distribution
    labels = frame["cgpa_range"].tolist()
    values = frame["students"].to_numpy()
    fig, ax = plt.subplots(figsize=(8.2, 4.0))
    bars = ax.bar(labels, values, color="#3b7dd8", width=0.62)
    _annotate_bars(ax, bars, values)
    ax.set_ylabel("Students")
    ax.set_xlabel("CGPA range")
    ax.set_title("CGPA distribution")
    ax.yaxis.get_major_locator().set_params(integer=True)
    ax.spines[["top", "right"]].set_visible(False)
    return _save(fig, out_dir / "cgpa_distribution.png")


def _credits_earned(report: Report, out_dir: Path) -> Path:
    frame = report.students
    labels = frame["student_id"].tolist()
    values = frame["credits_earned"].to_numpy()
    fig, ax = plt.subplots(figsize=(8.2, 4.0))
    bars = ax.bar(labels, values, color="#2f8f6b", width=0.6)
    _annotate_bars(ax, bars, values)
    ax.set_ylabel("Credits earned")
    ax.set_title("Credits earned per student")
    ax.yaxis.get_major_locator().set_params(integer=True)
    ax.spines[["top", "right"]].set_visible(False)
    return _save(fig, out_dir / "credits_earned.png")


def _attempts_per_course(report: Report, out_dir: Path) -> Path:
    frame = report.courses
    x = np.arange(len(frame))
    width = 0.4
    attempts = frame["attempts"].to_numpy()
    retakes = frame["retakes"].to_numpy()
    fig, ax = plt.subplots(figsize=(10.5, 4.4))
    bars_attempts = ax.bar(
        x - width / 2, attempts, width, label="All attempts", color="#9db8d8"
    )
    bars_retakes = ax.bar(
        x + width / 2, retakes, width, label="Retake attempts", color="#c97b38"
    )
    _annotate_bars(ax, bars_attempts, attempts)
    _annotate_bars(ax, bars_retakes, retakes)
    ax.set_xticks(x)
    ax.set_xticklabels(frame["course_id"].tolist(), rotation=45, ha="right")
    ax.set_ylabel("Attempts")
    ax.set_title("Attempts and retakes per course")
    ax.legend(frameon=False)
    ax.yaxis.get_major_locator().set_params(integer=True)
    ax.spines[["top", "right"]].set_visible(False)
    return _save(fig, out_dir / "attempts_per_course.png")


def _external_progress(report: Report, out_dir: Path) -> list[Path]:
    written: list[Path] = []
    requirements = {
        item.id: item for item in report.bundle.graduation.external_requirements
    }
    frame = report.external_progress
    for requirement_id in frame["requirement"].drop_duplicates().tolist():
        subset = frame[frame["requirement"] == requirement_id].sort_values("student_id")
        if subset.empty:
            continue
        labels = subset["student_id"].tolist()
        values = subset["total"].to_numpy()
        fig, ax = plt.subplots(figsize=(8.4, 4.2))
        bars = ax.bar(labels, values, color="#7a5bb5", width=0.6)
        _annotate_bars(ax, bars, values)
        requirement = requirements.get(requirement_id)
        if requirement is not None:
            for index, milestone in enumerate(requirement.milestones):
                deadline = milestone.deadline
                deadline_label = (
                    f"end of year {deadline.year}"
                    if deadline.type == "end_of_year"
                    else "graduation"
                )
                ax.axhline(
                    milestone.min,
                    color=["#b42318", "#c97b38", "#177245"][index % 3],
                    linestyle="--",
                    linewidth=1.2,
                    label=f"min {milestone.min} ({deadline_label})",
                )
        ax.set_ylabel(requirement.unit if requirement else "total")
        ax.set_title(f"External progress: {requirement_id}")
        ax.legend(frameon=False, loc="upper left")
        ax.spines[["top", "right"]].set_visible(False)
        written.append(_save(fig, out_dir / f"external_{_slug(requirement_id)}.png"))
    return written


def export_charts(report: Report, out_dir: str | Path) -> list[Path]:
    """Render the standard set of report charts as PNG files."""

    root = Path(out_dir).resolve() / "charts"
    paths = [
        _grade_distribution(report, root),
        _cgpa_distribution(report, root),
        _credits_earned(report, root),
        _attempts_per_course(report, root),
    ]
    paths.extend(_external_progress(report, root))
    return paths
