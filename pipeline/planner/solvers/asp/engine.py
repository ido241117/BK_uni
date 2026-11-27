"""ASP execution layer: run clingo and turn answer sets into typed plans."""

from __future__ import annotations


import re
import sys
import time
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
# mirror the #minimize statements in core/optimize.lp (@7 .. @0).
OBJECTIVE_LEVELS: tuple[str, ...] = (
    "last_semester",
    "retakes",
    "cost",
    "typical_term",
    "level_order",
    "balance",
    "taste",
    "popularity",
)

PRIORITY_LABELS: dict[int, str] = {
    7: "last_semester",
    6: "retakes",
    5: "cost",
    4: "typical_term",
    3: "level_order",
    2: "balance",
    1: "taste",
    0: "popularity",
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
    runtime: float = 0.0

    def labelled_objective(self) -> list[tuple[str, int]]:
        return label_objective(self.objective, self.priority)

    def full_objective(self) -> list[int]:
        return [value for _, value in self.labelled_objective()]


def label_objective(
    objective: list[int],
    priority: list[int] | None = None,
) -> list[tuple[str, int]]:
    """Pair objective entries with names, filling omitted levels with zero.

    The result always follows the canonical order of ``OBJECTIVE_LEVELS``
    so it is stable across configurations and seeds.
    """
    if not objective:
        # ``--opt-mode=ignore`` returns models without an objective vector.
        # Do not turn that absence into fake zero values.
        return []
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
class ElectiveSlot:
    """A planned elective the student has not named: reported by its group.

    ``representative`` is the course the solver used; ``options`` are other
    unplanned courses that are fully interchangeable with it.
    """

    group: str
    representative: str
    major: str | None = None
    interests: list[str] = field(default_factory=list)
    options: list[str] = field(default_factory=list)

    def label(self, credits: int) -> str:
        unit = "credit" if credits == 1 else "credits"
        text = f"one {self.group} elective ({credits} {unit})"
        if self.major:
            text += f", {self.major} major course"
        return text


@dataclass
class PlannedCourse:
    code: str
    name: str
    credits: int
    retake: int | None = None
    slot: ElectiveSlot | None = None
    note: str | None = None


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
    runtime: float = 0.0
    gpa_by_scale: dict[str, int] = field(default_factory=dict)
    total_cost: int | None = None
    total_attempted: int | None = None
    passed: list[str] = field(default_factory=list)
    credited: list[str] = field(default_factory=list)
    ready_to_graduate: bool = False
    assumed_pass: list[str] = field(default_factory=list)
    graduation_blocked: list[str] = field(default_factory=list)
    ext_missed: list[dict[str, Any]] = field(default_factory=list)
    ext_pending: list[dict[str, Any]] = field(default_factory=list)
    major_earned: list[str] = field(default_factory=list)
    major_counts: dict[str, int] = field(default_factory=dict)
    major_titles: dict[str, str] = field(default_factory=dict)
    declared_major: str | None = None
    default_major: str | None = None
    gpa_best_case: int | None = None
    gpa_required_avg: int | None = None
    gpa_already_satisfied: bool = False
    gpa_requirement_impossible: bool = False
    reserved: list[dict[str, Any]] = field(default_factory=list)

    @property
    def last_semester(self) -> int:
        return self.semesters[-1].semester if self.semesters else 0

    @property
    def objective_by_level(self) -> list[tuple[str, int]]:
        return label_objective(self.objective)

    @property
    def optimization(self) -> str:
        """Machine-readable optimization status for reports."""
        if self.optimal:
            return "proven_optimal"
        if not self.objective:
            return "unoptimized"
        return "not_proven_optimal"

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
                            "slot": (
                                None
                                if course.slot is None
                                else {
                                    "label": course.slot.label(course.credits),
                                    "group": course.slot.group,
                                    "major": course.slot.major,
                                    "interests": list(course.slot.interests),
                                    "representative": course.slot.representative,
                                    "options": list(course.slot.options),
                                }
                            ),
                            "note": course.note,
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
            "ready_to_graduate": self.ready_to_graduate,
            "assumed_pass": self.assumed_pass,
            "graduation_blocked": self.graduation_blocked,
            "external_missed": self.ext_missed,
            "external_pending": self.ext_pending,
            "major_earned": self.major_earned,
            "major_counts": dict(self.major_counts),
            "declared_major": self.declared_major,
            "default_major": self.default_major,
            "gpa_best_case": self.gpa_best_case,
            "gpa_required_avg": self.gpa_required_avg,
            "gpa_already_satisfied": self.gpa_already_satisfied,
            "gpa_requirement_impossible": self.gpa_requirement_impossible,
            "reserved_terms": self.reserved,
            "objective": dict(self.objective_by_level),
            "objective_vector": list(self.objective),
            "priority": list(self.priority),
            "optimal": self.optimal,
            "optimization": self.optimization,
            "runtime_seconds": round(self.runtime, 3),
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
    gpa_best_case: int | None = None
    gpa_required_avg: int | None = None
    gpa_already_satisfied = False
    gpa_requirement_impossible = False
    must: list[str] = []
    passed: list[str] = []
    credited: list[str] = []
    ready_to_graduate = False
    assumed_pass: list[str] = []
    graduation_blocked: list[str] = []
    ext_missed: list[dict[str, Any]] = []
    ext_pending: list[dict[str, Any]] = []
    major_earned: list[str] = []
    major_counts: dict[str, int] = {}
    declared_major: str | None = None
    major_titles = {
        str(major.get("id", "")).strip().upper(): str(
            major.get("name", major.get("id", ""))
        )
        for major in curriculum.get("majors", [])
        if major.get("id") is not None
    }
    # Interest tags that are major ids are shown with the curriculum spelling.
    major_titles_short = {
        asp_name(str(major["id"])): str(major["id"])
        for major in curriculum.get("majors", [])
        if major.get("id") is not None
    }

    slot_groups: dict[str, str] = {}
    slot_options: dict[str, list[str]] = defaultdict(list)
    slot_interests: dict[str, list[str]] = defaultdict(list)
    notes: dict[str, str] = {}
    reserved: list[dict[str, Any]] = []
    planned_atoms: list[tuple[str, PlannedCourse]] = []

    for symbol in solution.symbols:
        name = getattr(symbol, "name", "")
        arguments = getattr(symbol, "arguments", ())
        if name == "elective_slot" and len(arguments) >= 2:
            slot_groups[str(arguments[0])] = str(arguments[1])
        elif name == "slot_option" and len(arguments) >= 2:
            code, _, _, _ = _course_display(str(arguments[1]), catalog)
            slot_options[str(arguments[0])].append(code)
        elif name == "interest_match" and len(arguments) >= 2:
            slot_interests[str(arguments[0])].append(str(arguments[1]))
        elif name == "course_note" and len(arguments) >= 2:
            notes[str(arguments[0])] = str(arguments[1].string)
        elif name == "reserved" and len(arguments) >= 2:
            code, title, _, _ = _course_display(str(arguments[1]), catalog)
            reserved.append(
                {"semester": int(str(arguments[0])), "code": code, "name": title}
            )
        elif name == "plan" and len(arguments) >= 2:
            code, title, credits, retake = _course_display(
                str(arguments[0]), catalog
            )
            semester = int(str(arguments[1]))
            planned = PlannedCourse(
                code=code,
                name=title,
                credits=credits,
                retake=retake,
            )
            plan_by_semester[semester].append(planned)
            planned_atoms.append((str(arguments[0]), planned))
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
        elif name == "ready_to_graduate":
            ready_to_graduate = True
        elif name == "assumed_pass" and arguments:
            code, _, _, _ = _course_display(str(arguments[0]), catalog)
            assumed_pass.append(code)
        elif name == "graduation_blocked" and arguments:
            graduation_blocked.append(str(arguments[0]))
        elif name == "ext_missed" and len(arguments) >= 2:
            ext_missed.append(
                {"requirement": str(arguments[0]), "year": int(str(arguments[1]))}
            )
        elif name == "ext_pending" and len(arguments) >= 3:
            ext_pending.append(
                {
                    "requirement": str(arguments[0]),
                    "year": int(str(arguments[1])),
                    "missing": int(str(arguments[2])),
                }
            )
        elif name == "major_earned" and arguments:
            key = str(arguments[0]).strip().upper()
            major_earned.append(key)
        elif name == "major_count" and len(arguments) >= 2:
            key = str(arguments[0]).strip().upper()
            major_counts[key] = int(str(arguments[1]))
        elif name == "student_major" and arguments:
            declared_major = str(arguments[0]).strip().upper()
        elif name == "gpa_best_case" and arguments:
            gpa_best_case = int(str(arguments[0]))
        elif name == "gpa_required_avg" and arguments:
            gpa_required_avg = int(str(arguments[0]))
        elif name == "gpa_already_satisfied":
            gpa_already_satisfied = True
        elif name == "gpa_requirement_impossible":
            gpa_requirement_impossible = True

    if gpa is None and gpas:
        preferred = asp_name(policy.default_scale)
        gpa = gpas.get(preferred, gpas[sorted(gpas)[0]])

    # Group display names: curriculum group ids keyed by ASP atom.
    group_titles = {
        asp_name(str(group["id"])): str(group["id"])
        for group in curriculum.get("groups", [])
    }
    declared_courses: set[str] = set()
    if declared_major is not None:
        for major in curriculum.get("majors", []):
            if str(major.get("id", "")).strip().upper() == declared_major:
                declared_courses = {
                    asp_name(cid)
                    for cid in (major.get("rule") or {}).get("course_ids", [])
                }
    for atom, course in planned_atoms:
        base, _ = _split_course_atom(atom)
        course.note = notes.get(base)
        if course.retake is None and atom in slot_groups:
            course.slot = ElectiveSlot(
                group=group_titles.get(slot_groups[atom], slot_groups[atom].upper()),
                representative=course.code,
                major=(
                    major_titles_short.get(asp_name(declared_major), declared_major)
                    if declared_major is not None and atom in declared_courses
                    else None
                ),
                interests=sorted(
                    major_titles_short.get(tag, tag)
                    for tag in slot_interests.get(atom, [])
                ),
                options=sorted(slot_options.get(atom, [])),
            )
    for courses in plan_by_semester.values():
        courses.sort(key=lambda course: (course.slot is not None, course.code))

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
        runtime=solution.runtime,
        gpa_by_scale=dict(gpas),
        total_cost=total_cost,
        total_attempted=total_attempted,
        passed=sorted(passed),
        credited=sorted(credited),
        ready_to_graduate=ready_to_graduate,
        assumed_pass=sorted(assumed_pass),
        graduation_blocked=sorted(graduation_blocked),
        ext_missed=sorted(
            ext_missed, key=lambda item: (item["requirement"], item["year"])
        ),
        ext_pending=sorted(
            ext_pending,
            key=lambda item: (item["requirement"], item["year"]),
        ),
        major_earned=sorted(major_earned),
        major_counts=dict(sorted(major_counts.items())),
        major_titles=major_titles,
        declared_major=declared_major,
        default_major=(
            str(curriculum.get("default_major"))
            if curriculum.get("default_major") is not None
            else None
        ),
        gpa_best_case=gpa_best_case,
        gpa_required_avg=gpa_required_avg,
        gpa_already_satisfied=gpa_already_satisfied,
        gpa_requirement_impossible=gpa_requirement_impossible,
        reserved=sorted(reserved, key=lambda item: item["semester"]),
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
    def plan_sort_key(plan: Plan) -> tuple:
        if plan.optimal:
            rank = 0
        elif plan.objective:
            rank = 1
        else:
            rank = 2
        return (
            rank,
            tuple(plan.objective),
            plan.last_semester,
            len(plan.semesters),
            tuple(
                (semester.semester, tuple(course.code for course in semester.courses))
                for semester in plan.semesters
            ),
        )

    plans.sort(key=plan_sort_key)
    return plans


# ---------------------------------------------------------------------------
# clingo runner
# ---------------------------------------------------------------------------

ASP_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SolverOptions:
    """Typed clingo options.

    ``plans`` is the number of distinct plans to keep (default 3; 0 means all
    models).  ``opt_mode`` selects clingo's search strategy:

    * ``optN`` (default) - prove optimality, then return up to ``plans``
      optimal models.
    * ``opt`` - compatibility alias for ``optN``; it also returns up to
      ``plans`` models instead of stopping at one.
    * ``ignore`` - return up to ``plans`` models without optimizing.

    If optimized mode finds fewer than ``plans`` distinct optimal models, it
    fills the remaining slots with non-optimal models and marks them as such
    (set ``fill=False`` to return only proven-optimal models).  ``time_limit``
    stops the search after the given number of seconds.  It is a soft limit:
    clingo checks it between propagation steps, and a single long step can
    overshoot it.  The CLI additionally supervises a real solve in a child
    process with a hard wall clock.  Any model found before the limit is
    returned with ``optimal=False`` unless optimality was already proven.
    ``extra_facts`` and ``extra_program`` append scenario facts or rules (for
    example a temporary objective) after the core program.  ``allow_summer``
    opts into extra terms (summer) with ``-c extra_sem=1``; they are off by
    default.  ``progress`` prints improving objectives to stderr while the
    search runs.
    """

    horizon: int | None = None
    studied_terms: int | None = None
    plans: int = 3
    min_load: int | None = None
    max_load: int | None = None
    summer_min_load: int | None = None
    summer_max_load: int | None = None
    allow_summer: bool = False
    shift: int | None = None
    seed: int | None = None
    budget: int | None = None
    objective_scale: str | None = None
    opt_mode: str = "optN"
    time_limit: float | None = None
    progress: bool = False
    fill: bool = True
    extra_facts: tuple[str, ...] = field(default_factory=tuple)
    extra_program: tuple[str, ...] = field(default_factory=tuple)
    extra_args: tuple[str, ...] = field(default_factory=tuple)


def _read_source(path: Path) -> str:
    return Path(path).read_text(encoding="utf-8")


def _symbol_key(symbols: list[clingo.Symbol]) -> tuple[str, ...]:
    return tuple(sorted(str(symbol) for symbol in symbols))


def _solution_sort_key(solution: Solution) -> tuple:
    """Proven plans first, then candidates by objective, then unoptimized."""
    if solution.optimal:
        rank = 0
    elif solution.objective:
        rank = 1
    else:
        rank = 2
    return rank, tuple(solution.full_objective())


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
    """Run clingo on encoding + extension + policy + curriculum + student.

    Student facts are interpreted by ``core/translate.lp``; preferences and
    display atoms come from ``core/optimize.lp``.
    """
    options = options or SolverOptions()
    if options.opt_mode not in {"optN", "opt", "ignore"}:
        raise ValueError(
            "opt_mode must be one of 'optN', 'opt' or 'ignore'"
        )
    if options.plans < 0:
        raise ValueError("plans must be >= 0")
    if options.time_limit is not None and options.time_limit <= 0:
        raise ValueError("time_limit must be > 0")

    # ``opt`` is kept as a compatibility alias.  It used to stop after one
    # optimal model, but the CLI contract now asks for up to ``plans`` plans.
    # ``optN`` provides that while still proving optimality.
    opt_mode = "optN" if options.opt_mode == "opt" else options.opt_mode
    started = time.perf_counter()

    common_arguments: list[str] = []
    if options.horizon is not None:
        common_arguments.append(f"-c n={options.horizon}")
    if options.studied_terms is not None:
        common_arguments.append(f"-c t={options.studied_terms}")
    if options.min_load is not None:
        common_arguments.append(f"-c min_load={options.min_load}")
    if options.max_load is not None:
        common_arguments.append(f"-c max_load={options.max_load}")
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
        common_arguments.append(f"-c min_load_summer={summer_min}")
    if summer_max is not None:
        common_arguments.append(f"-c max_load_summer={summer_max}")
    if options.allow_summer:
        # extension.lp keeps extra terms (summer) empty unless extra_sem != 0.
        common_arguments.append("-c extra_sem=1")
    if options.shift is not None:
        common_arguments.append(f"-c shift={options.shift}")
    if options.seed is not None:
        common_arguments.append(f"--seed={options.seed}")
    common_arguments.extend(options.extra_args)

    # Pass source text instead of file paths: clingo's native loader can fail
    # on Windows paths containing non-ASCII characters.
    #
    # Layer order mirrors pipeline/planner/solvers/asp/README.md: the generic core,
    # then the generated policy/curriculum, then the student input through
    # translate.lp, and finally the preferences/output in optimize.lp.
    sources = [
        ASP_DIR / "core" / "encoding.lp",
        ASP_DIR / "core" / "extension.lp",
        Path(policy_path),
        Path(curriculum_path),
        ASP_DIR / "core" / "translate.lp",
        Path(student_path),
        ASP_DIR / "core" / "optimize.lp",
    ]

    def build_control(
        mode: str,
        models: int | None = None,
    ) -> clingo.Control:
        arguments = [f"--opt-mode={mode}", "--warn=none"]
        if models is not None:
            arguments.append(f"--models={models}")
        arguments.extend(common_arguments)
        control = clingo.Control(arguments)
        for path in sources:
            control.add("base", [], _read_source(path))
        if options.budget is not None:
            control.add("base", [], f"budget({int(options.budget)}).")
        if options.objective_scale is not None:
            control.add(
                "base", [], f"objective_scale({options.objective_scale})."
            )
        for fact in options.extra_facts:
            control.add("base", [], fact)
        for program in options.extra_program:
            control.add("base", [], program)
        ground_started = time.perf_counter()
        control.ground([("base", [])])
        if options.progress:
            print(
                f"[clingo] grounded in {time.perf_counter() - ground_started:.2f}s",
                file=sys.stderr,
                flush=True,
            )
        return control

    # The Python API otherwise stops after one model.  ``0`` means all models;
    # optN controls its own stopping point through the model callback.
    primary_models: int | None = None
    if opt_mode == "ignore" or options.plans == 0:
        primary_models = options.plans
    control = build_control(opt_mode, primary_models)
    proven: list[Solution] = []
    fallback: list[Solution] = []
    model_count = 0

    if options.progress:
        limit = (
            "none" if options.time_limit is None else f"{options.time_limit:g}s"
        )
        print(
            f"[clingo] start opt-mode={opt_mode} "
            f"plans={options.plans} time-limit={limit}",
            file=sys.stderr,
            flush=True,
        )

    def on_model(model: clingo.Model) -> bool | None:
        nonlocal model_count
        model_count += 1
        solution = Solution(
            symbols=list(model.symbols(shown=True)),
            objective=list(model.cost),
            priority=list(model.priority),
            optimal=bool(model.optimality_proven),
        )
        fallback.append(solution)

        if options.progress:
            kind = "optimal" if solution.optimal else "candidate"
            objective = (
                " ".join(str(value) for value in solution.objective) or "n/a"
            )
            print(
                f"[clingo] {kind} model {model_count} "
                f"at {time.perf_counter() - started:.2f}s: {objective}",
                file=sys.stderr,
                flush=True,
            )

        if not solution.optimal:
            # In optN clingo reports improving models while it searches; they
            # are not candidates.  Ignore mode has no proof to wait for, so
            # stop after the requested number of models.
            if (
                opt_mode == "ignore"
                and options.plans > 0
                and len(fallback) >= options.plans
            ):
                return False
            return None
        proven.append(solution)
        if options.plans > 0 and len(proven) >= options.plans:
            return False  # optimum is proven; enough alternative plans
        return None

    handle = control.solve(on_model=on_model, async_=True)
    timed_out = False
    if options.time_limit is not None:
        if not handle.wait(options.time_limit):
            timed_out = True
            if options.progress:
                print(
                    f"[clingo] time limit {options.time_limit:g}s reached at "
                    f"{time.perf_counter() - started:.2f}s; stopping the search",
                    file=sys.stderr,
                    flush=True,
                )
            handle.cancel()
        elif options.progress:
            print(
                f"[clingo] search wait returned at "
                f"{time.perf_counter() - started:.2f}s",
                file=sys.stderr,
                flush=True,
            )

    try:
        result = handle.get()
    except RuntimeError:
        if not timed_out:
            raise
        result = None
    if options.progress:
        print(
            f"[clingo] search finished at {time.perf_counter() - started:.2f}s",
            file=sys.stderr,
            flush=True,
        )

    satisfiable = bool(result is not None and result.satisfiable)
    unknown = bool(result.unknown) if result is not None else True
    elapsed = time.perf_counter() - started
    if not satisfiable and not proven and not fallback:
        status = "UNKNOWN" if (unknown or timed_out) else "UNSATISFIABLE"
        return [Solution(status=status, runtime=elapsed)]

    if proven:
        solutions = _merge_solutions(proven)
        for solution in solutions:
            solution.optimal = True
        # If the instance has fewer optimal models than requested, fill the
        # remaining slots with distinct non-optimal answer sets seen during
        # the same search.  They are explicitly marked as candidates.
        if options.fill and options.plans > 0 and len(solutions) < options.plans:
            seen = {_symbol_key(solution.symbols) for solution in solutions}
            for extra in _merge_solutions(fallback):
                key = _symbol_key(extra.symbols)
                if key in seen:
                    continue
                extra.optimal = False
                solutions.append(extra)
                seen.add(key)
                if len(solutions) >= options.plans:
                    break

        # A completed optN search can still expose fewer distinct answer sets
        # than requested (for example, one optimal plan and one improving
        # snapshot).  Enumerate additional unoptimized models to fill the plan
        # list; they are labelled as unoptimized.
        if (
            options.fill
            and options.plans > 0
            and len(solutions) < options.plans
            and not timed_out
        ):
            remaining = options.plans - len(solutions)
            seen = {_symbol_key(solution.symbols) for solution in solutions}
            extras: list[Solution] = []

            def on_fill_model(model: clingo.Model) -> bool | None:
                symbols = list(model.symbols(shown=True))
                key = _symbol_key(symbols)
                if key in seen:
                    return None
                extras.append(Solution(symbols=symbols, optimal=False))
                seen.add(key)
                if len(extras) >= remaining:
                    return False
                return None

            fill_control = build_control("ignore", 0)
            fill_handle = fill_control.solve(
                on_model=on_fill_model, async_=True
            )
            fill_limit = 10.0
            if options.time_limit is not None:
                fill_limit = min(fill_limit, options.time_limit)
            if not fill_handle.wait(fill_limit):
                fill_handle.cancel()
            try:
                fill_handle.get()
            except RuntimeError:
                pass
            if options.progress and extras:
                print(
                    f"[clingo] filled {len(extras)} unoptimized plan(s)",
                    file=sys.stderr,
                    flush=True,
                )
            solutions.extend(extras)
    else:
        # Search stopped (interrupt/limit, or ignore mode) before optimality
        # was proven.  Keep the best snapshots but mark them honestly as not
        # proven.
        solutions = _merge_solutions(fallback)
        for solution in solutions:
            solution.optimal = False

    elapsed = time.perf_counter() - started
    solutions.sort(key=_solution_sort_key)
    if options.plans > 0:
        solutions = solutions[: options.plans]
    if not solutions:
        return [Solution(status="UNKNOWN", runtime=elapsed)]
    for solution in solutions:
        solution.runtime = elapsed
    if options.progress and timed_out:
        print(
            f"[clingo] returning {len(solutions)} model(s) found before the "
            "time limit",
            file=sys.stderr,
            flush=True,
        )
    return solutions
