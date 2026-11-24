"""Step 1: student traits, interests and (optionally) per-student model parameters.

Traits are independent of each other and of ability. Each kind of draw has its own
random stream, so changing a parameter value never changes the underlying draws:
the preferred maximum is ``round(mean + sd * z)`` and the summer opt-in is
``early_pref > threshold`` with ``z`` and ``early_pref`` drawn once.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np

_STREAM_POP = 2
_STREAM_INTERESTS = 5
_STREAM_PARAMS = 6


@dataclass(frozen=True)
class Student:
    id: int
    theta: float               # ability, N(0, 1)
    specialization: str
    preferred_load: tuple[int, int]
    early_pref: float          # U(0, 1); opts in to summer if above threshold
    cost_sensitivity: float    # U(0, 1)
    summer_opt_in: bool
    interests: tuple[str, ...] = ()
    params: dict = field(default_factory=dict, hash=False, compare=False)   # per-student draws

    def row(self) -> dict:
        d = asdict(self)
        d["preferred_load"] = f"{self.preferred_load[0]}-{self.preferred_load[1]}"
        d["interests"] = "|".join(self.interests)
        d.update({f"p_{k}": v for k, v in d.pop("params").items()})
        return d


def latin_hypercube(n: int, bounds: list[tuple[float, float]], seed: int) -> np.ndarray:
    """n x d Latin hypercube sample, one stratum per student in every dimension."""
    rng = np.random.default_rng([seed, _STREAM_PARAMS])
    d = len(bounds)
    u = (np.argsort(rng.random((d, n)), axis=1).T + rng.random((n, d))) / n
    lo = np.array([b[0] for b in bounds])
    hi = np.array([b[1] for b in bounds])
    return lo + u * (hi - lo)


def interest_weights(cur, spec: str) -> dict[str, int]:
    """Tag -> number of the specialization's group-C courses carrying it."""
    tags = cur.course_tags()
    w: dict[str, int] = {}
    for c in cur.group_c(spec):
        for t in tags.get(c, ()):
            w[t] = w.get(t, 0) + 1
    return dict(sorted(w.items()))


def sample_students(n: int, pop: dict, seed: int, cur=None,
                    param_ranges: dict[str, tuple[float, float]] | None = None) -> list[Student]:
    """``pop``: [population] at base values. ``param_ranges`` {name: (low, high)}: draw
    those parameters per student (Latin hypercube); None = everyone at base."""
    rng = np.random.default_rng([seed, _STREAM_POP])
    rng_int = np.random.default_rng([seed, _STREAM_INTERESTS])
    specs = pop["specializations"]
    lo, hi = pop["preferred_max_range"]
    names = sorted(param_ranges or {})
    draws = latin_hypercube(n, [param_ranges[k] for k in names], seed) if names else None
    weights = {s: interest_weights(cur, s) for s in specs} if cur is not None else {}
    out = []
    for i in range(n):
        params = {k: float(draws[i, j]) for j, k in enumerate(names)} if names else {}
        p = {**pop, **params}
        theta = float(rng.standard_normal())
        spec = specs[int(rng.integers(len(specs)))]
        z = float(rng.standard_normal())
        early = float(rng.uniform())
        cost = float(rng.uniform())
        top = int(np.clip(round(p["preferred_max_mean"] + pop["preferred_max_sd"] * z), lo, hi))
        interests: tuple[str, ...] = ()
        w = weights.get(spec)
        if w:
            k = int(rng_int.integers(pop["interests_min"], pop["interests_max"] + 1))
            tags = list(w)
            prob = np.array([w[t] for t in tags], float)
            pick = rng_int.choice(len(tags), size=min(k, len(tags)), replace=False, p=prob / prob.sum())
            interests = tuple(sorted(tags[j] for j in pick))
        out.append(Student(i, theta, spec, (top - pop["preferred_band_width"], top), early, cost,
                           early > p["summer_threshold"], interests, params))
    return out
