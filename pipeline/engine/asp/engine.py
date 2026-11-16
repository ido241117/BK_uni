"""ASP execution layer: run clingo and turn answer sets into typed plans."""

from __future__ import annotations


import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import clingo

try:  # package import
    from .data import Policy
    from .translation import asp_name
except ImportError:  # script/test import
    from data import Policy
    from translation import asp_name

# clingo orders the optimization vector by descending priority.  These labels
# mirror the #minimize statements in plan.lp / extension.lp (@6 .. @1).
OBJECTIVE_LEVELS: tuple[str, ...] = (
    "last_semester",
    "retakes",
    "cost",
    "level_order",
    "balance",
    "taste",
)

PRIORITY_LABELS: dict[int, str] = {
    6: "last_semester",
    5: "retakes",
    4: "cost",
    3: "level_order",
    2: "balance",
    1: "taste",
}

_RETAKE_RE = re.compile(r"^rt\(([^,]+),(\d+)\)$")


@dataclass
class Solution:
    """One clingo answer set plus its optimization vector.

    ``objective`` is clingo's raw objective vector (one entry per reported
    priority level), not money.  ``priority`` says which level each entry belongs to;
    clingo can omit a level when its objective expression is trivially
    impossible for the instance.  ``optimal`` records whether clingo proved
    this vector optimal.
    """

    symbols: list[clingo.Symbol] = field(default_factory=list)
    objective: list[int] = field(default_factory=list)
    priority: list[int] = field(default_factory=list)
    optimal: bool = False
    status: str = "SATISFIABLE"

    def labelled_objective(self) -> list[tuple[str, int]]:
        return label_objective(self.objective, self.priority)

    def full_objective(self) -> list[int]:
        return [value for _, value in self.labelled_objective()]


def label_objective(
    objective: list[int],
    priority: list[int] | None = None,
) -> list[tuple[str, int]]:
    """Pair objective entries with names, filling omitted levels with zero.

    The result always follows the canonical order ``last_semester``,
    ``retakes``, ``cost``, ``level_order``, ``balance``, ``taste`` so it is
    stable across configurations and seeds.
    """
    if priority is None or len(priority) != len(objective):
        return [
            (
                OBJECTIVE_LEVELS[index]
                if index < len(OBJECTIVE_LEVELS)
                else f"objective_{index + 1}",
                value,
            )
            for index, value in enumerate(objective)
        ]

    by_level = dict(zip(priority, objective))
    labelled: list[tuple[str, int]] = []
    for level in sorted(PRIORITY_LABELS, reverse=True):
        labelled.append((PRIORITY_LABELS[level], by_level.get(level, 0)))
    return labelled


@dataclass
class PlannedCourse:
    code: str
    name: str
    credits: int
    retake: int | None = None


@dataclass
class PlannedSemester:
    semester: int
    credits: int
    cumulative: int
    courses: list[PlannedCourse] = field(default_factory=list)
    semester_type: str | None = None
    earned: int | None = None
    fee: int | None = None


@dataclass
class Plan:
    history: list[dict[str, Any]]
    semesters: list[PlannedSemester]
    total_planned: int
    total_credit: int
    total_degree: int
    degree_complete: bool
    gpa: int | None
    must: list[str]
    objective: list[int] = field(default_factory=list)
    priority: list[int] = field(default_factory=list)
    optimal: bool = False
    status: str = "SATISFIABLE"
    gpa_by_scale: dict[str, int] = field(default_factory=dict)
    total_cost: int | None = None
    total_attempted: int | None = None
    passed: list[str] = field(default_factory=list)
    credited: list[str] = field(default_factory=list)
    pending: list[str] = field(default_factory=list)

    @property
    def last_semester(self) -> int:
        return self.semesters[-1].semester if self.semesters else 0

    @property
    def objective_by_level(self) -> list[tuple[str, int]]:
        return label_objective(self.objective)

    def to_dict(self) -> dict[str, Any]:
        return {
            "history": self.history,
            "semesters": [
                {
                    "semester": semester.semester,
                    "semester_type": semester.semester_type,
                    "credits": semester.credits,
                    "earned": semester.earned,
                    "fee": semester.fee,
                    "cumulative": semester.cumulative,
                    "courses": [
                        {
                            "code": course.code,
                            "name": course.name,
                            "credits": course.credits,
                            "retake": course.retake,
                        }
                        for course in semester.courses
                    ],
                }
                for semester in self.semesters
            ],
            "total_planned": self.total_planned,
            "total_attempted": self.total_attempted,
            "total_credit": self.total_credit,
            "total_degree": self.total_degree,
            "total_cost": self.total_cost,
            "degree_complete": self.degree_complete,
            "gpa": self.gpa,
            "gpa_by_scale": dict(self.gpa_by_scale),
            "must": self.must,
            "passed": self.passed,
            "credited": self.credited,
            "pending": self.pending,
            "objective": dict(self.objective_by_level),
            "objective_vector": list(self.objective),
            "priority": list(self.priority),
            "optimal": self.optimal,
            "status": self.status,
        }


def _split_course_atom(atom: str) -> tuple[str, int | None]:
    """Return the base course atom and optional retake number."""
    match = _RETAKE_RE.match(atom)
    if match:
        return match.group(1), int(match.group(2))
    return atom, None


def _course_display(
    atom: str,
    catalog: dict[str, dict[str, Any]],
) -> tuple[str, str, int, int | None]:
    """Map an ASP course atom to ``(code, name, credits, retake)``."""
    base, retake = _split_course_atom(atom)
    course = catalog.get(base)
    if course is None:
        return base.upper(), "(unknown course)", 0, retake
    return (
        str(course.get("id", base)),
        str(course.get("name", "")),
        int(course.get("credits", 0)),
        retake,
    )


def model_to_plan(
    solution: Solution,
    curriculum: dict[str, Any],
    policy: Policy,
) -> Plan:
    """Turn one answer set into a semester-oriented :class:`Plan`."""
    catalog = {
        asp_name(course["id"]): course
        for course in curriculum.get("courses", [])
    }
    plan_by_semester: dict[int, list[PlannedCourse]] = defaultdict(list)
    semester_credits: dict[int, int] = {}
    semester_earned: dict[int, int] = {}
    semester_fees: dict[int, int] = {}
    semester_types: dict[int, str] = {}
    total_planned: int | None = None
    total_attempted: int | None = None
    total_credit: int | None = None
    total_cost: int | None = None
    total_degree = (
        policy.min_total_credits
        if policy.min_total_credits is not None
        else int(curriculum.get("total_credits", 0))
    )
    degree_complete = False
    gpa: int | None = None
    gpas: dict[str, int] = {}
    must: list[str] = []
    passed: list[str] = []
    credited: list[str] = []
    pending: list[str] = []

    for symbol in solution.symbols:
        name = getattr(symbol, "name", "")
        arguments = getattr(symbol, "arguments", ())
        if name == "plan" and len(arguments) >= 2:
            code, title, credits, retake = _course_display(
                str(arguments[0]), catalog
            )
            semester = int(str(arguments[1]))
            plan_by_semester[semester].append(
                PlannedCourse(
                    code=code,
                    name=title,
                    credits=credits,
                    retake=retake,
                )
            )
        elif name == "semester_credits" and len(arguments) >= 2:
            semester_credits[int(str(arguments[0]))] = int(str(arguments[1]))
        elif name == "semester_earned" and len(arguments) >= 2:
            semester_earned[int(str(arguments[0]))] = int(str(arguments[1]))
        elif name == "semester_fee" and len(arguments) >= 2:
            semester_fees[int(str(arguments[0]))] = int(str(arguments[1]))
        elif name == "semester_type" and len(arguments) >= 2:
            semester_types[int(str(arguments[0]))] = str(arguments[1])
        elif name == "total_planned" and arguments:
            total_planned = int(str(arguments[0]))
        elif name == "total_attempted" and arguments:
            total_attempted = int(str(arguments[0]))
        elif name == "total_credit" and arguments:
            total_credit = int(str(arguments[0]))
        elif name == "total_cost" and arguments:
            total_cost = int(str(arguments[0]))
        elif name == "degree_complete":
            degree_complete = True
        elif name == "gpa" and len(arguments) >= 2:
            gpas[str(arguments[0])] = int(str(arguments[1]))
        elif name == "gpa" and arguments:
            gpa = int(str(arguments[0]))
        elif name == "must" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            must.append(code)
        elif name == "passed_course" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            passed.append(code)
        elif name == "credited" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            credited.append(code)
        elif name == "pending" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            pending.append(code)

    if gpa is None and gpas:
        preferred = asp_name(policy.default_scale)
        gpa = gpas.get(preferred, gpas[sorted(gpas)[0]])

    for courses in plan_by_semester.values():
        courses.sort(key=lambda course: course.code)

    future_semesters = set(plan_by_semester)
    history = [
        {"semester": semester, "credits": credits}
        for semester, credits in sorted(semester_credits.items())
        if semester not in future_semesters
    ]

    cumulative = sum(item["credits"] for item in history)
    semesters: list[PlannedSemester] = []
    for semester in sorted(plan_by_semester):
        courses = plan_by_semester[semester]
        credits = semester_credits.get(
            semester, sum(course.credits for course in courses)
        )
        cumulative += credits
        semesters.append(
            PlannedSemester(
                semester=semester,
                credits=credits,
                cumulative=cumulative,
                courses=courses,
                semester_type=semester_types.get(semester),
                earned=semester_earned.get(semester),
                fee=semester_fees.get(semester),
            )
        )

    if total_planned is None:
        total_planned = sum(semester.credits for semester in semesters)
    if total_credit is None:
        total_credit = cumulative
    if total_cost is None and semester_fees:
        total_cost = sum(semester_fees.values())

    return Plan(
        history=history,
        semesters=semesters,
        total_planned=total_planned,
        total_credit=total_credit,
        total_degree=total_degree,
        degree_complete=degree_complete,
        gpa=gpa,
        must=sorted(must),
        objective=solution.full_objective(),
        priority=list(solution.priority),
        optimal=solution.optimal,
        status=solution.status,
        gpa_by_scale=dict(gpas),
        total_cost=total_cost,
        total_attempted=total_attempted,
        passed=sorted(passed),
        credited=sorted(credited),
        pending=sorted(pending),
    )


def plans_from_solutions(
    solutions: list[Solution],
    curriculum: dict[str, Any],
    policy: Policy,
) -> list[Plan]:
    satisfiable = [
        solution for solution in solutions if solution.status == "SATISFIABLE"
    ]
    plans = [
        model_to_plan(solution, curriculum, policy)
        for solution in satisfiable
    ]
    plans.sort(
        key=lambda plan: (
            tuple(plan.objective),
            plan.last_semester,
            len(plan.semesters),
            tuple(
                (semester.semester, tuple(course.code for course in semester.courses))
                for semester in plan.semesters
            ),
        )
    )
    return plans


# ---------------------------------------------------------------------------
# clingo runner
# ---------------------------------------------------------------------------

ASP_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SolverOptions:
    """Typed clingo options.

    ``plans`` is the number of distinct plans to keep (0 means all optimal
    models).  Optimization always uses ``--opt-mode=optN`` so intermediate,
    non-optimal models are never reported as candidate plans.
    """

    horizon: int | None = None
    studied_terms: int | None = None
    plans: int = 3
    min_load: int | None = None
    max_load: int | None = None
    summer_min_load: int | None = None
    summer_max_load: int | None = None
    shift: int | None = None
    seed: int | None = None
    budget: int | None = None
    objective_scale: str | None = None
    extra_args: tuple[str, ...] = field(default_factory=tuple)


def _read_source(path: Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def _symbol_key(symbols: list[clingo.Symbol]) -> tuple[str, ...]:
    return tuple(sorted(str(symbol) for symbol in symbols))


def _merge_solutions(solutions: list[Solution]) -> list[Solution]:
    """De-duplicate the first (not-yet-proven) snapshot from its proof copy."""
    merged: dict[tuple[str, ...], Solution] = {}
    for solution in solutions:
        key = _symbol_key(solution.symbols)
        previous = merged.get(key)
        if previous is None:
            merged[key] = solution
        else:
            previous.optimal = previous.optimal or solution.optimal
            if len(solution.objective) > len(previous.objective):
                previous.objective = solution.objective
                previous.priority = solution.priority
    return list(merged.values())


def solve(
    curriculum_path: Path,
    policy_path: Path,
    student_path: Path,
    options: SolverOptions | None = None,
) -> list[Solution]:
    """Run clingo on encoding + policy + extension + curriculum + student + plan."""
    options = options or SolverOptions()

    arguments = ["--opt-mode=optN", "--warn=none"]
    if options.horizon is not None:
        arguments.append(f"-c n={options.horizon}")
    if options.studied_terms is not None:
        arguments.append(f"-c t={options.studied_terms}")
    if options.min_load is not None:
        arguments.append(f"-c min_load={options.min_load}")
    if options.max_load is not None:
        arguments.append(f"-c max_load={options.max_load}")
    summer_min = (
        options.summer_min_load
        if options.summer_min_load is not None
        else options.min_load
    )
    summer_max = (
        options.summer_max_load
        if options.summer_max_load is not None
        else options.max_load
    )
    if summer_min is not None:
        arguments.append(f"-c min_load_summer={summer_min}")
    if summer_max is not None:
        arguments.append(f"-c max_load_summer={summer_max}")
    if options.shift is not None:
        arguments.append(f"-c shift={options.shift}")
    if options.seed is not None:
        arguments.append(f"--seed={options.seed}")
    arguments.extend(options.extra_args)

    control = clingo.Control(arguments)
    # Pass source text instead of file paths: clingo's native loader can fail
    # on Windows paths containing non-ASCII characters.
    sources = [
        ASP_DIR / "encoding.lp",
        Path(policy_path),
        ASP_DIR / "extension.lp",
        Path(curriculum_path),
        Path(student_path),
        ASP_DIR / "plan.lp",
    ]
    for path in sources:
        control.add("base", [], _read_source(path))

    if options.budget is not None:
        control.add("base", [], f"budget({int(options.budget)}).")
    if options.objective_scale is not None:
        control.add("base", [], f"objective_scale({options.objective_scale}).")

    control.ground([("base", [])])
    proven: list[Solution] = []
    fallback: list[Solution] = []

    def on_model(model: clingo.Model) -> bool | None:
        solution = Solution(
            symbols=list(model.symbols(shown=True)),
            objective=list(model.cost),
            priority=list(model.priority),
            optimal=bool(model.optimality_proven),
        )
        fallback.append(solution)
        if not solution.optimal:
            # optN may still report improving models while it searches.  They
            # are not candidates: only a proven-optimal snapshot is kept.
            return None
        proven.append(solution)
        if options.plans > 0 and len(proven) >= options.plans:
            return False  # optimum is proven; enough alternative plans
        return None

    result = control.solve(on_model=on_model)
    if not result.satisfiable:
        status = "UNKNOWN" if result.unknown else "UNSATISFIABLE"
        return [Solution(status=status)]

    if proven:
        solutions = _merge_solutions(proven)
    else:
        # Search stopped (interrupt/limit) before optimality was proven.  Keep
        # the best improving snapshot but mark it honestly as not proven.
        solutions = _merge_solutions(fallback)
        for solution in solutions:
            solution.optimal = False

    solutions.sort(key=lambda solution: tuple(solution.full_objective()))
    if options.plans > 0:
        solutions = solutions[: options.plans]
    return solutions
