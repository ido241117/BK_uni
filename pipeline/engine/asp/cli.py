"""Presentation layer: render plans and expose the planner CLI."""

from __future__ import annotations


import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import ExitStack
from dataclasses import replace
from decimal import Decimal
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


def _gpa_label(gpa: int | None, precision: int = 2) -> str | None:
    if gpa is None:
        return None
    return f"{gpa / (10 ** precision):.{precision}f}"


def _money_label(
    value: int | None,
    precision: int | None,
    unit: str = "",
    currency: str = "",
) -> str | None:
    """Format a fixed-point money amount; ``precision`` is the scale exponent."""
    if value is None or precision is None:
        return None
    amount = value / (10 ** precision)
    text = f"{amount:,.{precision}f}" if precision else f"{amount:,.0f}"
    if unit:
        text += f" {unit}"
    if currency:
        text += f" {currency}"
    return text


def _major_label(plan: Plan) -> str | None:
    if plan.major_earned:
        return ", ".join(
            f"{plan.major_titles.get(major, major)} "
            f"({plan.major_counts.get(major, 0)} courses)"
            for major in plan.major_earned
        )
    if plan.declared_major:
        title = plan.major_titles.get(plan.declared_major, plan.declared_major)
        return f"{title} (declared, not earned)"
    if plan.default_major:
        return f"{plan.default_major} (default; no major declared)"
    return None


def _external_labels(plan: Plan) -> list[str]:
    labels: list[str] = []
    for item in plan.ext_missed:
        labels.append(
            f"{item['requirement']} missed the year {item['year']} deadline"
        )
    for item in plan.ext_pending:
        labels.append(
            f"{item['requirement']} needs {item['missing']} more "
            f"by year {item['year']}"
        )
    for requirement in plan.graduation_blocked:
        labels.append(f"{requirement} is below the graduation minimum")
    return labels


def _diagnostic_rows(
    plan: Plan,
    money_precision: int | None,
    money_unit: str,
    money_currency: str,
) -> list[tuple[str, str]]:
    """Human-readable rows for facts the solver already derived."""
    rows: list[tuple[str, str]] = []
    if plan.ready_to_graduate:
        rows.append(("Graduation", "READY"))
    elif plan.degree_complete:
        rows.append(
            ("Graduation", "DEGREE COMPLETE (external requirements outstanding)")
        )
    else:
        rows.append(("Graduation", "NOT READY"))

    major = _major_label(plan)
    if major:
        rows.append(("Major", major))

    if plan.gpa_best_case is not None:
        label = _gpa_label(plan.gpa_best_case)
        if label:
            rows.append(("GPA best case", label))
    if plan.gpa_requirement_impossible:
        target = _gpa_label(plan.gpa_required_avg)
        detail = f" (target {target})" if target else ""
        rows.append(("GPA needed", f"impossible under current plan{detail}"))
    elif plan.gpa_already_satisfied or (
        plan.gpa_required_avg is not None and plan.gpa_required_avg <= 0
    ):
        rows.append(("GPA needed", "already met (no extra GPA needed)"))
    elif plan.gpa_required_avg is not None:
        label = _gpa_label(plan.gpa_required_avg)
        if label:
            rows.append(("GPA needed", f"{label} on remaining credits"))

    if plan.assumed_pass:
        rows.append(("Assumed passes", ", ".join(plan.assumed_pass)))
    if plan.must:
        rows.append(("Retakes needed", ", ".join(plan.must)))
    external = _external_labels(plan)
    if external:
        rows.append(("External", "; ".join(external)))

    cost = _money_label(
        plan.total_cost, money_precision, money_unit, money_currency
    )
    if cost is not None:
        rows.append(("Future tuition", cost))
    return rows


def objective_label(plan: Plan) -> str:
    """Format the clingo objective vector with one label per priority level."""
    if not plan.objective:
        proof = "proven optimal" if plan.optimal else "unoptimized"
        return f"objective: n/a ({proof})"
    values = ", ".join(
        f"{name}={value}" for name, value in plan.objective_by_level
    )
    proof = "proven optimal" if plan.optimal else "not proven optimal"
    return f"objective: {values} ({proof})"


def _format_plan_text(
    plan: Plan,
    index: int,
    total: int,
    *,
    gpa_precision: int = 2,
    money_precision: int | None = None,
    money_unit: str = "",
    money_currency: str = "",
) -> str:
    lines = [f"PLAN {index} / {total}", "=" * 66]
    lines.append(objective_label(plan))
    lines.append(f"Solve time      : {plan.runtime:.2f} s")
    lines.append("")

    if plan.history:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan.history
        )
        attempted = sum(item["credits"] for item in plan.history)
        lines.append(f"History: {history} ({attempted} attempted)")
        lines.append("")

    if not plan.semesters:
        lines.append("(no future courses)")
        lines.append("")

    for semester in plan.semesters:
        kind = semester.semester_type or "term"
        fee = _money_label(
            semester.fee, money_precision, money_unit, money_currency
        )
        header = (
            f"Semester {semester.semester}  "
            f"({kind}, {_credit_label(semester.credits)}, "
            f"scheduled total {semester.cumulative}"
        )
        if fee is not None:
            header += f", fee {fee}"
        header += ")"
        lines.append(header)
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
    lines.append(f"Planned credits : {plan.total_planned} (attempted)")
    lines.append(
        f"Total credits   : {plan.total_credit} / {plan.total_degree} (earned)"
    )
    status = "COMPLETE" if plan.degree_complete else "INCOMPLETE"
    lines.append(f"Status          : {status}")
    if plan.gpa is not None:
        lines.append(f"GPA             : {_gpa_label(plan.gpa, gpa_precision)}")
    for label, value in _diagnostic_rows(
        plan, money_precision, money_unit, money_currency
    ):
        lines.append(f"{label:<16}: {value}")
    return "\n".join(lines)


def _format_plan_markdown(
    plan: Plan,
    index: int,
    total: int,
    *,
    gpa_precision: int = 2,
    money_precision: int | None = None,
    money_unit: str = "",
    money_currency: str = "",
) -> str:
    lines = [f"## Plan {index} / {total}", ""]
    lines.append(f"`{objective_label(plan)}`")
    lines.append("")
    lines.append(f"**Solve time:** {plan.runtime:.2f} s")
    lines.append("")

    if plan.history:
        history = ", ".join(
            f"semester {item['semester']} ({item['credits']} cr)"
            for item in plan.history
        )
        attempted = sum(item["credits"] for item in plan.history)
        lines.append(f"**History:** {history} ({attempted} attempted)")
        lines.append("")

    for semester in plan.semesters:
        kind = semester.semester_type or "term"
        fee = _money_label(
            semester.fee, money_precision, money_unit, money_currency
        )
        heading = (
            f"### Semester {semester.semester} - {kind}, "
            f"{_credit_label(semester.credits)} "
            f"(scheduled total {semester.cumulative}"
        )
        if fee is not None:
            heading += f", fee {fee}"
        heading += ")"
        lines.append(heading)
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
    lines.append(f"- **Planned credits:** {plan.total_planned} (attempted)")
    lines.append(
        f"- **Total credits:** {plan.total_credit} / {plan.total_degree} (earned)"
    )
    lines.append(f"- **Status:** {status}")
    if plan.gpa is not None:
        lines.append(f"- **GPA:** {_gpa_label(plan.gpa, gpa_precision)}")
    for label, value in _diagnostic_rows(
        plan, money_precision, money_unit, money_currency
    ):
        lines.append(f"- **{label}:** {value}")
    return "\n".join(lines)


def _format_solution_raw(solution: Solution, index: int, total: int) -> str:
    labelled = solution.labelled_objective()
    objective = (
        ", ".join(f"{name}={value}" for name, value in labelled)
        if labelled
        else "n/a"
    )
    if not labelled:
        proof = "optimal" if solution.optimal else "unoptimized"
    else:
        proof = "optimal" if solution.optimal else "not-proven-optimal"
    atoms = " ".join(str(symbol) for symbol in solution.symbols)
    return (
        f"% plan {index} / {total}\n"
        f"% objective: {objective} ({proof})\n"
        f"% solve time: {solution.runtime:.2f}s\n"
        f"{atoms}"
    )


def render_solutions(
    solutions: list[Solution],
    curriculum: dict[str, Any],
    policy: Policy,
    output_format: str = "text",
    *,
    gpa_precision: int = 2,
    money_precision: int | None = None,
    money_unit: str = "",
    money_currency: str = "",
) -> str:
    satisfiable = [
        solution for solution in solutions if solution.status == "SATISFIABLE"
    ]
    if not satisfiable:
        if not solutions:
            return "UNSATISFIABLE"
        solution = solutions[0]
        if output_format == "json":
            return json.dumps(
                {
                    "plans": [],
                    "status": solution.status,
                    "runtime_seconds": round(solution.runtime, 3),
                },
                ensure_ascii=False,
                indent=2,
            )
        return (
            f"{solution.status} "
            f"(solve time: {solution.runtime:.2f} s)"
        )

    if output_format == "raw":
        ordered = sorted(
            satisfiable,
            key=lambda solution: (
                0
                if solution.optimal
                else 1
                if solution.objective
                else 2,
                tuple(solution.full_objective()),
            ),
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
            _format_plan_markdown(
                plan,
                index,
                total,
                gpa_precision=gpa_precision,
                money_precision=money_precision,
                money_unit=money_unit,
                money_currency=money_currency,
            )
            for index, plan in enumerate(plans, start=1)
        )
    return "\n\n".join(
        _format_plan_text(
            plan,
            index,
            total,
            gpa_precision=gpa_precision,
            money_precision=money_precision,
            money_unit=money_unit,
            money_currency=money_currency,
        )
        for index, plan in enumerate(plans, start=1)
    )


# ---------------------------------------------------------------------------
# command-line interface
# ---------------------------------------------------------------------------

try:  # package import
    from .data import load_bundle, load_tuition
    from .engine import SolverOptions, solve
    from .translation import (
        build_tuition,
        curriculum_file_stem,
        find_student,
        load_json,
        load_student_history,
        planning_horizon,
        student_to_facts,
        write_programs,
    )
except ImportError:  # script/test import
    from data import load_bundle, load_tuition
    from engine import SolverOptions, solve
    from translation import (
        build_tuition,
        curriculum_file_stem,
        find_student,
        load_json,
        load_student_history,
        planning_horizon,
        student_to_facts,
        write_programs,
    )

ASP_DIR = Path(__file__).resolve().parent
DATA_DIR = ASP_DIR.parents[1] / "data"
DEFAULT_CURRICULUM = DATA_DIR / "curriculum.json"
DEFAULT_GRADING_POLICY = DATA_DIR / "grading_policy.json"
DEFAULT_GRADUATION = DATA_DIR / "graduation_requirements.json"
DEFAULT_TUITION_POLICY = DATA_DIR / "tuition_policy.json"
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
        help="tuition program name (default: student program, then curriculum default_major)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=(
            "where to write the generated curriculum ASP file "
            "(default: <curriculum-id>.lp when only generating; a temporary file when solving)"
        ),
    )
    parser.add_argument(
        "--policy-output",
        type=Path,
        default=None,
        help=(
            "where to write the generated policy ASP file "
            "(default: policy.lp when only generating; a temporary file when solving)"
        ),
    )
    parser.add_argument(
        "--semesters",
        type=int,
        default=None,
        help=(
            "absolute last term index passed to clingo as -c n=... "
            "(default: --t + --future-terms)"
        ),
    )
    parser.add_argument(
        "--future-terms",
        type=int,
        default=None,
        help=(
            "number of terms to plan after the studied terms "
            "(default: curriculum planning.horizon)"
        ),
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
        help="student input file; run clingo after writing the facts",
    )
    parser.add_argument(
        "--student-json",
        type=Path,
        metavar="STUDENT_HISTORY_JSON",
        help=(
            "generate the student facts from student_history.json instead of "
            "a hand-written .lp file (uses expected.as_of_term)"
        ),
    )
    parser.add_argument(
        "--student-id",
        default=None,
        help="student id to select from --student-json (default: first record)",
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
        default=1,
        help="number of plans to print (default: 1; 0 = all)",
    )
    parser.add_argument(
        "--fill",
        action="store_true",
        help=(
            "when fewer than --plans optimal plans exist, add non-optimal "
            "candidate plans (default: only proven-optimal plans)"
        ),
    )
    parser.add_argument(
        "--opt-mode",
        choices=("optN", "opt", "ignore"),
        default="optN",
        help=(
            "clingo optimization mode (default: optN). optN proves optimality; "
            "opt is an alias for optN; ignore returns up to --plans models "
            "without optimizing."
        ),
    )
    parser.add_argument(
        "--time-limit",
        type=float,
        default=None,
        metavar="SECONDS",
        help=(
            "stop the search after SECONDS and return the best model found "
            "(default: 30 for optimized modes when --plans > 0; 0 = no limit)"
        ),
    )
    parser.add_argument(
        "--require-optimal",
        action="store_true",
        help="exit with code 3 unless at least one plan's optimality was proven",
    )
    parser.add_argument(
        "--progress",
        action="store_true",
        help="print improving objectives to stderr while solving",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="clingo random seed",
    )
    parser.add_argument(
        "--max-budget",
        type=float,
        default=None,
        metavar="MONEY",
        help=(
            "additional budget cap in tuition money units (e.g. 14 = 14 "
            "million VND); applied together with any student budget"
        ),
    )
    parser.add_argument(
        "--no-summer",
        action="store_true",
        help="forbid future summer terms",
    )
    parser.add_argument(
        "--max-terms",
        type=int,
        default=None,
        metavar="N",
        help="forbid future courses after absolute semester index N",
    )
    parser.add_argument(
        "--fact",
        action="append",
        metavar="ASP_FACT",
        help=(
            "append an extra ASP fact or rule (repeatable), e.g. "
            "--fact 'closed(co3057,9).' for a what-if scenario"
        ),
    )
    parser.add_argument(
        "--explain",
        action="store_true",
        help=(
            "when unsatisfiable, retry without the budget and with a larger "
            "horizon to report the likely cause"
        ),
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
        help=(
            "report path; default is reports/<student>-plan.<ext> in the "
            "current directory"
        ),
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="print to the console only; do not write a report file",
    )
    return parser


def _strip_predicate_facts(text: str, predicate: str) -> str:
    """Remove whole ``predicate(...)`` fact lines from a student file."""
    pattern = re.compile(rf"^\s*{re.escape(predicate)}\s*\(", re.MULTILINE)
    kept = [line for line in text.splitlines() if not pattern.match(line)]
    return "\n".join(kept) + "\n"


def explain_unsat(
    curriculum_path: Path,
    policy_path: Path,
    student_path: Path,
    options: SolverOptions,
    curriculum: dict[str, Any],
    policy: Policy,
    *,
    money_precision: int,
    money_unit: str,
    money_currency: str,
) -> str:
    """Diagnose a likely cause of UNSAT without relaxing every rule.

    Two concrete questions answer most real cases: "is the budget the
    blocker?" (re-solve without it, minimising cost at a new top priority) and
    "is the horizon too short?" (re-solve with three extra terms).  Both checks
    are opt-in because they run additional solver calls.
    """
    notes: list[str] = []
    student_text = Path(student_path).read_text(encoding="utf-8")
    has_budget_fact = (
        re.search(r"(?m)^\s*budget\s*\(", student_text) is not None
        or any(
            re.match(r"^\s*budget\s*\(", fact)
            for fact in options.extra_facts
        )
    )
    if options.budget is not None or has_budget_fact:
        with tempfile.TemporaryDirectory(prefix="asp-explain-budget-") as raw_dir:
            stripped = _strip_predicate_facts(student_text, "budget")
            stripped_path = Path(raw_dir) / "student-no-budget.lp"
            stripped_path.write_text(stripped, encoding="utf-8")
            budget_options = replace(
                options,
                budget=None,
                extra_facts=tuple(
                    fact
                    for fact in options.extra_facts
                    if not re.match(r"^\s*budget\s*\(", fact)
                ),
                extra_program=options.extra_program
                + ("#minimize{ F@7,I : fee(I,F) }.",),
                opt_mode="optN",
                plans=1,
                fill=False,
                time_limit=min(options.time_limit or 30.0, 30.0),
                progress=False,
            )
            solutions = solve(
                curriculum_path, policy_path, stripped_path, budget_options
            )
            if any(item.status == "SATISFIABLE" for item in solutions):
                plan = plans_from_solutions(solutions, curriculum, policy)[0]
                cost = _money_label(
                    plan.total_cost,
                    money_precision,
                    money_unit,
                    money_currency,
                )
                notes.append(
                    "the budget is blocking: without it, the cheapest feasible "
                    f"plan costs {cost or 'an unknown amount'}"
                )
                notes.append(
                    "raise --max-budget (or the student's budget) above that "
                    "amount"
                )
                return "explain: " + notes[0] + "\n  hint: " + notes[1]

    base_horizon = options.horizon or 12
    wide_options = replace(
        options,
        horizon=base_horizon + 3,
        opt_mode="ignore",
        plans=1,
        fill=False,
        time_limit=min(options.time_limit or 30.0, 20.0),
        extra_program=(),
        progress=False,
    )
    solutions = solve(curriculum_path, policy_path, student_path, wide_options)
    if any(item.status == "SATISFIABLE" for item in solutions):
        plan = plans_from_solutions(solutions, curriculum, policy)[0]
        return (
            f"explain: no plan fits within semester {base_horizon}; "
            f"a feasible plan exists with --semesters {base_horizon + 3} "
            f"(the first one found ends in semester {plan.last_semester})."
        )

    reasons = [
        "a failed compulsory course cannot be scheduled",
        "a prerequisite/offering conflict",
        "group quotas that cannot be filled",
    ]
    if any("max_term(" in fact for fact in options.extra_facts):
        reasons.append("--max-terms is set; raise it or remove it")
    if any("no_summer" in fact for fact in options.extra_facts):
        reasons.append("--no-summer is set; the plan may need a summer term")
    if any(item.status == "UNKNOWN" for item in solutions):
        reasons.append("the wider-horizon check timed out; raise --time-limit")
    return (
        "explain: no feasible plan found even with a larger horizon.\n  check: "
        + "; ".join(reasons)
    )


def _write_report(
    rendered: str,
    requested: Path | None,
    stem: str,
    output_format: str,
) -> Path:
    extension = REPORT_EXTENSIONS[output_format]
    path = requested or (Path.cwd() / "reports" / f"{stem}-plan.{extension}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rendered + "\n", encoding="utf-8")
    print(f"wrote {path}", file=sys.stderr, flush=True)
    return path


def _hard_timeout_grace(limit: float) -> float:
    """Small grace period so the child can report a graceful soft-limit stop."""
    return max(5.0, min(30.0, limit * 0.1))


def _supervise_solve(
    argv: list[str] | None,
    time_limit: float | None,
    solving: bool,
) -> int | None:
    """Run a real CLI solve in a child process with a hard wall-clock limit.

    clingo's Python ``SolveHandle.wait`` timeout is only checked between
    propagation steps; a single step can run far past the requested limit.
    The child still uses the engine's soft limit so it can print the best model
    found, while the parent kills it if it truly stops making progress.  Only
    real CLI invocations are supervised: tests and callers that pass an
    explicit ``argv`` keep running in-process.
    """
    if (
        argv is not None
        or not solving
        or time_limit is None
        or os.environ.get("ASP_HARD_TIMEOUT_CHILD") == "1"
    ):
        return None

    grace = _hard_timeout_grace(time_limit)
    hard_limit = time_limit + grace
    command = [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]]
    env = dict(os.environ)
    env["ASP_HARD_TIMEOUT_CHILD"] = "1"
    print(
        f"hard timeout: {hard_limit:g}s wall clock "
        f"({time_limit:g}s solver limit + {grace:g}s grace)...",
        file=sys.stderr,
        flush=True,
    )
    try:
        child = subprocess.Popen(command, env=env)
    except OSError as exc:
        print(f"error: could not start solver process: {exc}", file=sys.stderr)
        return 1

    try:
        return child.wait(timeout=hard_limit)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait()
        print(
            f"error: solver did not finish within {hard_limit:g}s "
            f"({time_limit:g}s limit + {grace:g}s grace); no plan was "
            "produced. Increase --time-limit, reduce the horizon, or use "
            "--opt-mode ignore for a quick feasibility run.",
            file=sys.stderr,
            flush=True,
        )
        return 4
    except KeyboardInterrupt:
        child.kill()
        child.wait()
        raise


def main(argv: list[str] | None = None) -> int:
    # The workspace path may contain non-ASCII characters.  Line buffering
    # keeps diagnostics visible even when stdout is redirected to a file.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)

    parser = build_parser()
    args = parser.parse_args(argv)
    if args.plans < 0:
        parser.error("--plans must be >= 0")
    if args.time_limit is not None and args.time_limit < 0:
        parser.error("--time-limit must be >= 0")
    if args.future_terms is not None and args.future_terms < 0:
        parser.error("--future-terms must be >= 0")
    if args.max_terms is not None and args.max_terms < 0:
        parser.error("--max-terms must be >= 0")
    if args.max_budget is not None and args.max_budget < 0:
        parser.error("--max-budget must be >= 0")
    if args.student_json is not None and args.solve is not None:
        parser.error("--student-json and --solve are mutually exclusive")
    if args.student_id is not None and args.student_json is None:
        parser.error("--student-id requires --student-json")

    time_limit = args.time_limit
    if time_limit == 0:
        time_limit = None
    elif (
        time_limit is None
        and args.opt_mode != "ignore"
        and args.plans > 0
    ):
        # Keep optimized runs interactive by default.  The engine still
        # returns the best models found and labels them as not proven optimal.
        time_limit = 30.0

    solving = args.solve is not None or args.student_json is not None
    supervised = _supervise_solve(argv, time_limit, solving)
    if supervised is not None:
        return supervised

    bundle = load_bundle(
        args.curriculum,
        args.grading_policy,
        args.graduation,
    )
    tuition = load_tuition(args.tuition_policy)
    tuition_raw = load_json(args.tuition_policy)
    gpa_scale = next(
        (scale for scale in bundle.policy.scales if scale.default), None
    )
    gpa_precision = gpa_scale.precision if gpa_scale is not None else 2

    student: dict[str, Any] | None = None
    facts = None
    if args.student_json is not None:
        try:
            raw_students = load_student_history(args.student_json)
            student = find_student(raw_students, args.student_id)
            facts = student_to_facts(
                student,
                curriculum=bundle.curriculum,
                policy=bundle.policy,
                money_scale=10**tuition.precision,
            )
        except (OSError, ValueError) as exc:
            print(f"error: {exc}", file=sys.stderr, flush=True)
            return 1
        if args.t is not None and args.t != facts.studied_terms:
            parser.error(
                f"--t {args.t} disagrees with {facts.student_id}: "
                f"as_of_term implies t={facts.studied_terms}"
            )
        t = facts.studied_terms
    else:
        t = args.t

    program = (
        args.program
        or (student.get("program") if student else None)
        or bundle.curriculum.get("default_major")
    )

    if args.semesters is not None:
        horizon = args.semesters
    elif args.future_terms is not None:
        horizon = (t or 0) + args.future_terms
    else:
        horizon = planning_horizon(t or 0, bundle.curriculum)
    if horizon <= 0:
        parser.error("the planning horizon must be positive")

    with ExitStack() as stack:
        tmpdir: Path | None = None
        if solving and (
            args.student_json is not None
            or args.output is None
            or args.policy_output is None
        ):
            tmpdir = Path(
                stack.enter_context(
                    tempfile.TemporaryDirectory(prefix="asp-planner-")
                )
            )
        curriculum_output_name = f"{curriculum_file_stem(bundle.curriculum)}.lp"
        output = args.output or (
            tmpdir / curriculum_output_name
            if tmpdir is not None
            else ASP_DIR / curriculum_output_name
        )
        policy_output = args.policy_output or (
            tmpdir / "policy.lp"
            if tmpdir is not None
            else DEFAULT_POLICY_OUTPUT
        )
        write_programs(
            bundle.curriculum,
            bundle.policy,
            output,
            policy_output,
            extra_policy=build_tuition(tuition_raw, program),
        )
        # Status messages go to stderr so that stdout stays machine-readable in
        # JSON and raw mode.  Temporary files used only for solving are quiet.
        if not solving or args.output is not None:
            print(f"wrote {output}", file=sys.stderr, flush=True)
        if not solving or args.policy_output is not None:
            print(f"wrote {policy_output}", file=sys.stderr, flush=True)

        if not solving:
            return 0

        if facts is not None:
            assert tmpdir is not None
            student_path = tmpdir / f"{facts.student_id or 'student'}.lp"
            student_path.write_text(facts.facts, encoding="utf-8")
            report_stem = facts.student_id or "student"
        else:
            assert args.solve is not None
            student_path = args.solve
            report_stem = args.solve.stem
            if t is None:
                student_text = student_path.read_text(encoding="utf-8")
                if re.search(r"(?m)^\s*taken\s*\(", student_text):
                    print(
                        "warning: the student file has taken/2 facts but --t "
                        "was not given; the planner treats them as future. "
                        "Pass --t <studied terms>.",
                        file=sys.stderr,
                        flush=True,
                    )

        extra_facts: list[str] = []
        if args.no_summer:
            extra_facts.append("no_summer.")
        if args.max_terms is not None:
            extra_facts.append(f"max_term({args.max_terms}).")
        for raw_fact in args.fact or []:
            fact = raw_fact.strip()
            if not fact:
                continue
            if not fact.endswith("."):
                fact += "."
            extra_facts.append(fact)

        budget = None
        if args.max_budget is not None:
            budget = tuition.scaled(Decimal(str(args.max_budget)))

        limit = (
            ""
            if time_limit is None
            else f", time-limit={time_limit:g}s"
        )
        print(
            f"solving {student_path} (opt-mode={args.opt_mode}, "
            f"plans={args.plans}, t={t or 0}, horizon={horizon}{limit})...",
            file=sys.stderr,
            flush=True,
        )
        options = SolverOptions(
            horizon=horizon,
            studied_terms=t,
            plans=args.plans,
            min_load=args.min_load,
            max_load=args.max_load,
            shift=args.shift,
            seed=args.seed,
            budget=budget,
            opt_mode=args.opt_mode,
            time_limit=time_limit,
            progress=args.progress,
            fill=args.fill,
            extra_facts=tuple(extra_facts),
        )
        solutions = solve(output, policy_output, student_path, options)
        rendered = render_solutions(
            solutions,
            bundle.curriculum,
            bundle.policy,
            args.format,
            gpa_precision=gpa_precision,
            money_precision=tuition.precision,
            money_unit=tuition.money_unit,
            money_currency=tuition.currency,
        )
        print(rendered)

        satisfiable = [
            item for item in solutions if item.status == "SATISFIABLE"
        ]
        exit_code = 0
        if not satisfiable:
            unsat = any(
                item.status == "UNSATISFIABLE" for item in solutions
            )
            if unsat:
                print(
                    "no feasible plan; rerun with --explain for a budget and "
                    "horizon diagnosis, or raise --semesters/--future-terms.",
                    file=sys.stderr,
                    flush=True,
                )
                if args.explain:
                    try:
                        explanation = explain_unsat(
                            output,
                            policy_output,
                            student_path,
                            options,
                            bundle.curriculum,
                            bundle.policy,
                            money_precision=tuition.precision,
                            money_unit=tuition.money_unit,
                            money_currency=tuition.currency,
                        )
                        print(explanation, file=sys.stderr, flush=True)
                    except (OSError, RuntimeError, ValueError) as exc:
                        print(
                            f"explain failed: {exc}", file=sys.stderr, flush=True
                        )
                exit_code = 2
            else:
                print(
                    "no model was found before the solver stopped; "
                    "increase --time-limit or use --opt-mode ignore",
                    file=sys.stderr,
                    flush=True,
                )
                exit_code = 4
        elif args.require_optimal and not any(
            item.optimal for item in satisfiable
        ):
            print(
                "the best plan was not proven optimal before the time limit; "
                "increase --time-limit or remove --require-optimal.",
                file=sys.stderr,
                flush=True,
            )
            exit_code = 3

        if not args.no_report:
            _write_report(rendered, args.report, report_stem, args.format)

        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
