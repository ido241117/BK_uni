"""Read ``policy/grading.json`` and ``policy/tuition.json`` (instances/SCHEMA.md) into plain values.

Used by consumers that need the numbers, not a solver encoding (the ASP solver compiles
the same files itself, with more validation).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

OPEN_MAX = 999   # upper bound of a tier without max_credits


def grade_cutoffs(grading: dict[str, Any]) -> tuple[tuple[float, float], ...]:
    """((min_score, grade_points), ...) from the highest grade down."""
    return tuple(sorted(((float(g["min_score"]), float(g["points"])) for g in grading["grade_scale"]),
                        reverse=True))


def _money(value: Any, precision: int) -> float:
    q = Decimal(1).scaleb(-precision)
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def fee_tiers(tuition: dict[str, Any], program: str) -> dict[str, list[tuple[int, int, float, float, int]]]:
    """{term type: [(min_credits, max_credits, base, rate, over), ...]} for ``program``.

    A tier costs ``base + rate * max(0, credits - over)``; money is rounded half-up to the
    policy's ``precision``. A rule listing ``"*"`` matches every program.
    """
    precision = int(tuition.get("precision", 3))
    out: dict[str, list[tuple[int, int, float, float, int]]] = {}
    for rule in tuition["tuition_rules"]:
        if program not in rule["programs"] and "*" not in rule["programs"]:
            continue
        model = rule["fee_model"]
        tiers = []
        for t in model.get("tiers") or [model]:
            cond = t.get("condition") or {}
            lo, hi = int(cond.get("min_credits", 0)), int(cond.get("max_credits", OPEN_MAX))
            kind = t.get("fee_type", model.get("type"))
            if kind == "flat":
                discount = Decimal(str(t.get("discount", t.get("percentage", 0))))
                tiers.append((lo, hi, _money(Decimal(str(t["flat_fee"])) * (1 - discount), precision), 0.0, 0))
            elif kind == "per_credit":
                over = int(t.get("excess_over", 0)) if t.get("applies_to") == "excess_over" else 0
                tiers.append((lo, hi, _money(t.get("base_fee", 0), precision),
                              _money(t["rate_per_credit"], precision), over))
            else:
                raise ValueError(f"unknown fee_type {kind!r}")
        for term_type in rule["semester_types"]:
            if term_type in out:
                raise ValueError(f"several tuition rules match {term_type!r} for {program!r}")
            out[term_type] = tiers
    return out


def term_fee(tiers: dict[str, list[tuple[int, int, float, float, int]]], credits: int, term_type: str) -> float:
    """Tuition of one term; zero credits cost nothing."""
    if credits <= 0:
        return 0.0
    for lo, hi, base, rate, over in tiers[term_type]:
        if lo <= credits <= hi:
            return base + rate * max(0, credits - over)
    raise ValueError(f"no fee tier for {credits} credits ({term_type})")
