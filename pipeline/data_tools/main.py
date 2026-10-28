"""Command-line entry point for the academic-advising Python engine."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data_tools.exporters.chart_export import export_charts
from data_tools.exporters.csv_export import export_csv
from data_tools.exporters.table_export import export_tables
from data_tools.loader import DataValidationError, load_data
from data_tools.policy import audit_all, expected_summary
from data_tools.stats import build_report

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = PROJECT_ROOT / "data"
DEFAULT_OUTPUT = PROJECT_ROOT / "output"
ALL_FORMATS = {"csv", "tables", "charts", "html"}


def _parse_formats(value: str) -> set[str]:
    formats = {item.strip().lower() for item in value.split(",") if item.strip()}
    if "all" in formats:
        return set(ALL_FORMATS)
    unknown = formats - ALL_FORMATS
    if unknown:
        raise ValueError(
            f"unknown format(s): {', '.join(sorted(unknown))}; "
            f"choose from {', '.join(sorted(ALL_FORMATS))} or all"
        )
    if not formats:
        raise ValueError("at least one output format is required")
    return formats


def _display(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _load(data_dir: str):
    return load_data(data_dir)


def command_validate(args: argparse.Namespace) -> int:
    try:
        bundle = _load(args.data)
        audits = audit_all(bundle)
    except DataValidationError as exc:
        print("Validation failed:", file=sys.stderr)
        for message in exc.messages:
            print(f"  - {message}", file=sys.stderr)
        return 2

    matches, total = expected_summary(audits)
    print(f"Curriculum: {bundle.curriculum.id} ({bundle.curriculum.name})")
    print(f"Policy:     {bundle.policy.id}")
    print(f"Students:   {len(bundle.students)}")
    print(f"Attempts:   {sum(len(student.attempts) for student in bundle.students)}")
    print(f"Expected checks: {matches}/{total} matched")
    if matches != total:
        for audit in audits:
            if audit.expected_check.ok:
                continue
            print(f"  {audit.student.student_id}:", file=sys.stderr)
            for difference in audit.expected_check.differences:
                print(f"    - {difference}", file=sys.stderr)
        return 1
    print("Dataset is valid and every expected result matches.")
    return 0


def command_report(args: argparse.Namespace) -> int:
    try:
        formats = _parse_formats(args.formats)
        bundle = _load(args.data)
        report = build_report(bundle)
    except (DataValidationError, ValueError) as exc:
        if isinstance(exc, DataValidationError):
            print("Validation failed:", file=sys.stderr)
            for message in exc.messages:
                print(f"  - {message}", file=sys.stderr)
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 2

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    chart_paths: list[Path] = []

    if "csv" in formats:
        written.extend(export_csv(report, out_dir))
    if "charts" in formats:
        chart_paths = export_charts(report, out_dir)
        written.extend(chart_paths)
    if "tables" in formats or "html" in formats:
        written.extend(
            export_tables(
                report,
                out_dir,
                chart_paths=chart_paths,
                write_markdown="tables" in formats,
                write_html="html" in formats or "tables" in formats,
            )
        )

    print(f"Report for {bundle.curriculum.id} / {bundle.policy.id}")
    print(
        "Expected checks: "
        f"{report.overview['expected_matches']}/{report.overview['expected_total']} matched"
    )
    print(f"Average CGPA: {report.overview['average_cgpa']}")
    if report.overview["external_missed"]:
        print(f"External requirements missed: {report.overview['external_missed']}")
    print(f"Wrote {len(written)} files to {_display(out_dir)}")
    for path in written:
        print(f"  - {_display(path)}")
    return 0 if report.overview["expected_all_ok"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate the advising dataset and export CSV/table/chart reports."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser(
        "validate", help="load the dataset and compare computed results with expected values"
    )
    validate_parser.add_argument(
        "--data",
        default=str(DEFAULT_DATA),
        help=f"dataset directory (default: {DEFAULT_DATA})",
    )
    validate_parser.set_defaults(func=command_validate)

    report_parser = subparsers.add_parser(
        "report",
        aliases=["export"],
        help="build CSV, Markdown, HTML and chart outputs",
    )
    report_parser.add_argument(
        "--data",
        default=str(DEFAULT_DATA),
        help=f"dataset directory (default: {DEFAULT_DATA})",
    )
    report_parser.add_argument(
        "--out",
        default=str(DEFAULT_OUTPUT),
        help=f"output directory (default: {DEFAULT_OUTPUT})",
    )
    report_parser.add_argument(
        "--formats",
        default="csv,tables,charts,html",
        help="comma-separated: csv,tables,charts,html or all (default: all)",
    )
    report_parser.set_defaults(func=command_report)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
