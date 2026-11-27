"""Score model: a linear IRT-style model on the 10-point scale.

    score = clip(mu + a*(theta - b_c) + year_effect*(year - 1)
                 + retake_effect*[attempt > 1] + eps, 0, 10),  eps ~ N(0, noise_sd)

theta ~ N(0, 1) fixes the yardstick; b_c ~ N(0, difficulty_sd) is the same for
every student. The noise for (student, course, attempt) comes from a generator
keyed on those ids, so both arms of a paired run see the same draw for the same
attempt (common random numbers).
"""

from __future__ import annotations

import math

import numpy as np

# Pass marks: D (4.0) in general, C (5.5) for graduation courses
# (QD285 Dieu 17.2 p.13, Dieu 18.3 p.14; see docs/04-luat-qd285.md section 2).
PASS_SCORE = 4.0
GRADUATION_PASS_SCORE = 5.5

_STREAM_SCORE = 1


def course_difficulties(codes: tuple[str, ...], sd: float, seed: int) -> dict[str, float]:
    z = np.random.default_rng([seed, 0]).standard_normal(len(codes))
    return {c: float(sd * v) for c, v in zip(codes, z)}


def expected_score(p: dict, theta: float, b: float, year: int, attempt: int) -> float:
    return (p["mu"] + p["discrimination"] * (theta - b) + p["year_effect"] * (year - 1)
            + p["retake_effect"] * (attempt > 1))


def noise(seed: int, student: int, course_index: int, attempt: int) -> float:
    return float(np.random.default_rng([seed, _STREAM_SCORE, student, course_index, attempt])
                 .standard_normal())


def draw_score(p: dict, theta: float, b: float, year: int, attempt: int, z: float) -> float:
    raw = expected_score(p, theta, b, year, attempt) + p["noise_sd"] * z
    step = p["round_to"]
    return min(10.0, max(0.0, round(round(raw / step) * step, 2)))


def fail_probability(p: dict, theta: float, b: float, year: int, attempt: int,
                     pass_score: float = PASS_SCORE) -> float:
    """P(score < pass_score) under the model (rounding ignored)."""
    z = (pass_score - expected_score(p, theta, b, year, attempt)) / p["noise_sd"]
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))
