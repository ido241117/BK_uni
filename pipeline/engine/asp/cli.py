"""Presentation layer: render plans and expose the planner CLI."""

from __future__ import annotations


import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:  # package import
    from .data import Policy
    from .engine import Plan, Solution, plans_from_solutions
except ImportError:  # script/test import
    from data import Policy
    from engine import Plan, Solution, plans_from_solutions

REPORT_EXTENSIONS = {
    "text": "txt",
    "markdown": "md",
    "json": "json",
    "raw": "txt",
}


def _credit_label(credits: int) -> str:
    return f"{credits} credit" if credits == 1 else f"{credits} credits"


def _truncate(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    return text[: max(0, width - 3)] + "..."


def _gpa_label(gpa: int | None) -> str | None:
    if gpa is None:
        return None
    return f"{gpa / 100:.2f}"


def objective_label(plan: Plan) -> str:
    """Format the clingo objective vector with one label per priority level."""
    if not plan.objective:
        return "objective: n/a"
    values = ", ".join(
        f"{name}={value}" for name, value in plan.objective_by_level
    )
    proof = "proven optimal" if plan.optimal else "not proven optimal"
    return f"objective: {values} ({proof})"


def _format_plan_text(plan: Plan, index: int, total: int) -> str:
    lines = [f"PLAN {index} / {total}", "=" * 66]
    lines.append(objective_label(plan))
    lines.append("")

    if plan.history:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan.history
        )
        lines.append("History: " + history)
        lines.append("")

    if not plan.semesters:
        lines.append("(no future courses)")
        lines.append("")

    for semester in plan.semesters:
        lines.append(
            f"Semester {semester.semester}  "
            f"({_credit_label(semester.credits)}, "
            f"cumulative {semester.cumulative})"
        )
        lines.append(
            f"  {'Code':<8}  {'Course name':<48}  {'Credits':>7}"
        )
        lines.append(
            f"  {'-' * 8}  {'-' * 48}  {'-' * 7}"
        )
        for course in semester.courses:
            title = course.name
            if course.retake is not None:
                title += f" (retake {course.retake})"
            lines.append(
                f"  {course.code:<8}  "
                f"{_truncate(title, 48):<48}  "
                f"{course.credits:>7}"
            )
        lines.append("")

    lines.append("-" * 66)
    lines.append(f"Planned credits : {plan.total_planned}")
    lines.append(f"Total credits   : {plan.total_credit} / {plan.total_degree}")
    status = "COMPLETE" if plan.degree_complete else "INCOMPLETE"
    lines.append(f"Status          : {status}")
    if plan.gpa is not None:
        lines.append(f"GPA             : {_gpa_label(plan.gpa)}")
    if plan.must:
        lines.append("Retakes needed  : " + ", ".join(plan.must))
    return "\n".join(lines)


def _format_plan_markdown(plan: Plan, index: int, total: int) -> str:
    lines = [f"## Plan {index} / {total}", ""]
    lines.append(f"`{objective_label(plan)}`")
    lines.append("")

    if plan.history:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan.history
        )
        lines.append(f"**History:** {history}")
        lines.append("")

    for semester in plan.semesters:
        lines.append(
            f"### Semester {semester.semester} - "
            f"{_credit_label(semester.credits)} "
            f"(cumulative {semester.cumulative})"
        )
        lines.append("")
        lines.append("| Code | Course | Credits |")
        lines.append("| --- | --- | ---: |")
        for course in semester.courses:
            title = course.name
            if course.retake is not None:
                title += f" (retake {course.retake})"
            title = title.replace("|", "\\|")
            lines.append(
                f"| {course.code} | {title} | {course.credits} |"
            )
        lines.append("")

    status = "COMPLETE" if plan.degree_complete else "INCOMPLETE"
    lines.append(f"- **Planned credits:** {plan.total_planned}")
    lines.append(f"- **Total credits:** {plan.total_credit} / {plan.total_degree}")
    lines.append(f"- **Status:** {status}")
    if plan.gpa is not None:
        lines.append(f"- **GPA:** {_gpa_label(plan.gpa)}")
    if plan.must:
        lines.append("- **Retakes needed:** " + ", ".join(plan.must))
    return "\n".join(lines)


def _format_solution_raw(solution: Solution, index: int, total: int) -> str:
    objective = ", ".join(
        f"{name}={value}" for name, value in solution.labelled_objective()
    )
    proof = "optimal" if solution.optimal else "not-proven-optimal"
    atoms = " ".join(str(symbol) for symbol in solution.symbols)
    return (
        f"% plan {index} / {total}\n"
        f"% objective: {objective} ({proof})\n"
        f"{atoms}"
    )


def render_solutions(
    solutions: list[Solution],
    curriculum: dict[str, Any],
    policy: Policy,
    output_format: str = "text",
) -> str:
    satisfiable = [
        solution for solution in solutions if solution.status == "SATISFIABLE"
    ]
    if not satisfiable:
        return solutions[0].status if solutions else "UNSATISFIABLE"

    if output_format == "raw":
        ordered = sorted(
            satisfiable, key=lambda solution: tuple(solution.full_objective())
        )
        total = len(ordered)
        return "\n\n".join(
            _format_solution_raw(solution, index, total)
            for index, solution in enumerate(ordered, start=1)
        )

    plans = plans_from_solutions(satisfiable, curriculum, policy)
    total = len(plans)

    if output_format == "json":
        return json.dumps(
            [plan.to_dict() for plan in plans],
            ensure_ascii=False,
            indent=2,
        )
    if output_format == "markdown":
        return "\n\n".join(
            _format_plan_markdown(plan, index, total)
            for index, plan in enumerate(plans, start=1)
        )
    return "\n\n".join(
        _format_plan_text(plan, index, total)
        for index, plan in enumerate(plans, start=1)
    )


# ---------------------------------------------------------------------------
# command-line interface
# ---------------------------------------------------------------------------

try:  # package import
    from .data import load_bundle, load_tuition
    from .engine import SolverOptions, solve
    from .translation import build_tuition, student_to_facts, write_programs
except ImportError:  # script/test import
    from data import load_bundle, load_tuition
    from engine import SolverOptions, solve
    from translation import build_tuition, student_to_facts, write_programs

ASP_DIR = Path(__file__).resolve().parent
DATA_DIR = ASP_DIR.parents[1] / "data"
DEFAULT_CURRICULUM = DATA_DIR / "curriculum.json"
DEFAULT_GRADING_POLICY = DATA_DIR / "grading_policy.json"
DEFAULT_GRADUATION = DATA_DIR / "graduation_requirements.json"
DEFAULT_TUITION_POLICY = DATA_DIR / "tuition_policy.json"
DEFAULT_CURRICULUM_OUTPUT = ASP_DIR / "cs-2023.lp"
DEFAULT_POLICY_OUTPUT = ASP_DIR / "policy.lp"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate ASP facts from the JSON dataset and optionally solve a "
            "student plan."
        )
    )
    parser.add_argument(
        "--curriculum",
        type=Path,
        default=DEFAULT_CURRICULUM,
        help="path to curriculum.json",
    )
    parser.add_argument(
        "--grading-policy",
        type=Path,
        default=DEFAULT_GRADING_POLICY,
        help="path to grading_policy.json",
    )
    parser.add_argument(
        "--graduation",
        type=Path,
        default=DEFAULT_GRADUATION,
        help="path to graduation_requirements.json",
    )
    parser.add_argument(
        "--tuition-policy",
        type=Path,
        default=DEFAULT_TUITION_POLICY,
        help="path to tuition_policy.json",
    )
    parser.add_argument(
        "--program",
        default=None,
        help="tuition program name (default: curriculum default_major)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_CURRICULUM_OUTPUT,
        help="where to write the generated curriculum ASP file",
    )
    parser.add_argument(
        "--policy-output",
        type=Path,
        default=DEFAULT_POLICY_OUTPUT,
        help="where to write the generated policy ASP file",
    )
    parser.add_argument(
        "--semesters",
        type=int,
        default=None,
        help="planning horizon passed to clingo as -c n=... "
        "(default: policy.default_horizon)",
    )
    parser.add_argument(
        "--min-load",
        type=int,
        default=None,
        help="minimum credits in a used semester (default: policy)",
    )
    parser.add_argument(
        "--max-load",
        type=int,
        default=None,
        help="maximum credits in any future semester (default: policy)",
    )
    parser.add_argument(
        "--shift",
        type=int,
        default=None,
        help="calendar shift of the semester index (default: policy)",
    )
    parser.add_argument(
        "--solve",
        type=Path,
        metavar="STUDENT_LP",
        help="optional student input file; run clingo after writing the facts",
    )
    parser.add_argument(
        "--t",
        type=int,
        default=None,
        help="number of semesters already studied (passed as -c t=...)",
    )
    parser.add_argument(
        "--plans",
        type=int,
        default=3,
        help="number of distinct optimal plans to print (default: 3; 0 = all)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="clingo random seed",
    )
    parser.add_argument(
        "--format",
        choices=("text", "markdown", "json", "raw"),
        default="text",
        help="plan output format (default: text)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="report path; default is <student>-plan.<ext> next to the student file",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="print to the console only; do not write a report file",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    # The workspace path may contain non-ASCII characters.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = build_parser()
    args = parser.parse_args(argv)

    bundle = load_bundle(
        args.curriculum,
        args.grading_policy,
        args.graduation,
    )
    tuition = load_tuition(args.tuition_policy)
    program = args.program or bundle.curriculum.get("default_major")
    write_programs(
        bundle.curriculum,
        bundle.policy,
        args.output,
        args.policy_output,
        extra_policy=build_tuition(tuition, program),
    )
    print(f"wrote {args.output}")
    print(f"wrote {args.policy_output}")

    if not args.solve:
        return 0

    horizon = (
        args.semesters
        if args.semesters is not None
        else bundle.policy.default_horizon
    )
    solutions = solve(
        args.output,
        args.policy_output,
        args.solve,
        SolverOptions(
            horizon=horizon,
            studied_terms=args.t,
            plans=args.plans,
            min_load=args.min_load,
            max_load=args.max_load,
            shift=args.shift,
            seed=args.seed,
        ),
    )
    rendered = render_solutions(
        solutions,
        bundle.curriculum,
        bundle.policy,
        args.format,
    )
    print(rendered)

    if not args.no_report:
        extension = REPORT_EXTENSIONS[args.format]
        report_path = args.report
        if report_path is None:
            report_path = args.solve.with_name(
                f"{args.solve.stem}-plan.{extension}"
            )
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(rendered + "\n", encoding="utf-8")
        print(f"wrote {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
