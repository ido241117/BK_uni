"""Compile the university policy files to ASP facts for the engine in ``core/``.

The policy reaches the solver through the planner input (``fixture["policy"]``, written by
``planner.model.input.to_planner_fixture``), never from files, so the evaluation cache key
(a hash of the fixture) covers it. Sources (instances/SCHEMA.md):

    grading    policy/grading.json        grade scale, GPA scale, retake rules
    graduation curricula/<id>/graduation.json   minimum cumulative GPA
    tuition    policy/tuition.json        fee tiers per term type (needs curriculum.program)
    external   policy/external.json       requirements outside the course plan

Load bounds are NOT policy facts: the adapter emits ``load_bound/3`` from the fixture
(docs/PLANNER-PARITY.md), so every solver uses the same numbers.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from instances.policy import fee_tiers

# Calendar of HCMUT: parts 1 and 2 are regular terms, part 3 is the optional summer term.
CALENDAR = (
    "term_parts(3).",
    "term_part_type(1, regular).",
    "term_part_type(2, regular).",
    "term_part_type(3, summer).",
    "extra_semester_type(summer).",
)
GPA_SCALE, SCORE_SCALE = "gpa_4", "score_10"
PRECISION = 2  # both scales are compiled as value * 100
MONEY_PRECISION = 3


class PolicyError(ValueError):
    """A policy file uses a feature the compiler does not support."""


def grade_atom(symbol: str) -> str:
    """``"A+"`` -> ``a_plus``, ``"B"`` -> ``b``."""
    return symbol.lower().replace("+", "_plus").replace("-", "_minus")


def _scaled(value: Any, precision: int = PRECISION) -> int:
    q = Decimal(str(value)).scaleb(precision).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(q)


def grading_facts(grading: dict[str, Any]) -> list[str]:
    """Grade scale, the 4-point GPA scale, the 10-point score scale and retake rules."""
    gpa = grading.get("gpa") or {}
    if gpa.get("formula", "credit_weighted_mean") != "credit_weighted_mean":
        raise PolicyError(f"grading.gpa.formula {gpa.get('formula')!r} is not supported")
    scale = grading["grade_scale"]
    score_max = max(Decimal(str(g["max_score"])) for g in scale)
    out = [
        f"scale({GPA_SCALE}, 0, {_scaled(gpa.get('scale_max', '4.00'))}).",
        f"scale_precision({GPA_SCALE}, {PRECISION}).",
        f"scale_role({GPA_SCALE}, gpa).",
        f"default_scale({GPA_SCALE}).",
        f"scale({SCORE_SCALE}, 0, {_scaled(score_max)}).",
        f"scale_precision({SCORE_SCALE}, {PRECISION}).",
        f"scale_role({SCORE_SCALE}, score).",
    ]
    for g in scale:
        a = grade_atom(g["grade"])
        points = _scaled(g["points"])
        # Score-scale value of a grade: midpoint of its band, rounded half-up.
        mid = (Decimal(str(g["min_score"])) + Decimal(str(g["max_score"]))) / 2
        out += [f"grade({a}).", f'grade_symbol({a}, "{g["grade"]}").',
                f"grade_min_score({SCORE_SCALE}, {a}, {_scaled(g['min_score'])})."]
        if g.get("passing"):
            out.append(f"grade_passing({a}).")
        if g.get("earns_credit"):
            out.append(f"grade_earns_credit({a}).")
        out += [f"grade_points({GPA_SCALE}, {a}, {points}).", f"grade_points({a}, {points}).",
                f"grade_points({SCORE_SCALE}, {a}, {_scaled(mid)})."]
        if g.get("in_gpa"):
            out += [f"grade_in_gpa({GPA_SCALE}, {a}).", f"grade_in_gpa({a}).", f"grade_in_gpa({SCORE_SCALE}, {a})."]
    out += [f"grade_rank({grade_atom(g['grade'])}, {i})." for i, g in enumerate(scale)]
    out += [f"included_course_kind({k})." for k in gpa.get("included_course_kinds", ["regular"])]
    retake = grading.get("retake") or {}
    selection = retake.get("gpa_attempt_selection", "latest")
    if selection not in ("latest", "best"):
        raise PolicyError(f"grading.retake.gpa_attempt_selection {selection!r} is not supported")
    out.append(f"gpa_attempt_selection({selection}).")
    cap = (retake.get("grade_cap") or {}).get("max_grade")
    if cap is not None:
        out.append(f"retake_grade_cap({grade_atom(cap)}).")
    return out


def graduation_facts(graduation: dict[str, Any] | None) -> list[str]:
    """Minimum cumulative GPA (reported by the engine, not a constraint). Total credits come from the groups."""
    out = ["graduation_requirement(all_groups_satisfied)."]
    for req in (graduation or {}).get("requirements", []):
        if req.get("type") == "min_cumulative_gpa":
            value = _scaled(req["value"])
            out += [f"graduation_requirement(min_cumulative_gpa, {value}).", f"min_gpa({GPA_SCALE}, {value})."]
    return out


def tuition_facts(tuition: dict[str, Any], program: str) -> list[str]:
    """``fee_rule(Type, Min, Max, Base, Rate, Over)`` in thousandths of the policy's money unit."""
    out = [f"money_scale({10 ** MONEY_PRECISION}).",
           f"money_currency({str(tuition.get('currency', 'unit')).lower()}).",
           f"money_unit({str(tuition.get('money_unit', 'unit')).lower()})."]
    for term_type, tiers in sorted(fee_tiers(tuition, program).items()):
        for lo, hi, base, rate, over in tiers:
            out.append(f"fee_rule({term_type}, {lo}, {hi}, {_scaled(base, MONEY_PRECISION)}, "
                       f"{_scaled(rate, MONEY_PRECISION)}, {over}).")
    return out


def applies(requirement: dict[str, Any], cohort: int | None) -> bool:
    """Whether an external requirement applies to a cohort (unknown cohort: it applies)."""
    span = requirement.get("cohorts") or {}
    if cohort is None:
        return True
    return (span.get("from") is None or cohort >= span["from"]) and (span.get("to") is None or cohort <= span["to"])


def external_facts(external: dict[str, Any], cohort: int | None) -> list[str]:
    """``external_requirement/4`` and ``external_milestone/3,4`` of the requirements that apply."""
    out = []
    for r in external.get("requirements", []):
        if not applies(r, cohort):
            continue
        rid = f'"{r["id"]}"'
        out.append(f"external_requirement({rid}, {r['unit']}, cumulative, {r['enforcement']}).")
        for m in r["milestones"]:
            d = m["deadline"]
            if d["type"] == "end_of_year":
                out.append(f"external_milestone({rid}, end_of_year, {d['year']}, {m['min']}).")
            else:
                out.append(f"external_milestone({rid}, graduation, {m['min']}).")
    return out


def compile_policy(policy: dict[str, Any] | None, program: str | None, cohort: int | None) -> tuple[str, list[str]]:
    """``fixture["policy"]`` -> (ASP facts, warnings). Missing parts are left out with a warning."""
    policy = policy or {}
    lines = list(CALENDAR)
    warnings = []
    if policy.get("grading"):
        lines += grading_facts(policy["grading"])
        lines += graduation_facts(policy.get("graduation"))
    else:
        warnings.append("No grading policy in the input: GPA is not computed.")
    if policy.get("tuition"):
        if program:
            lines += tuition_facts(policy["tuition"], program)
        else:
            warnings.append("The curriculum has no 'program', so no tuition rule applies: tuition is not computed.")
    if policy.get("external"):
        lines += external_facts(policy["external"], cohort)
    return "\n".join(lines) + "\n", warnings
