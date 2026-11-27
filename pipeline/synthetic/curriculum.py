"""Curriculum, grade scale and tuition, read from the planner's own data.

Registration legality and the graduation check reuse ``planner.validate`` so the
simulator does not re-encode curriculum rules.
"""

from __future__ import annotations

import copy
import json
import re
import tomllib
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from planner.normalize import normalize
from planner.validate import validate_plan

PIPELINE = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).resolve().parent / "config.toml"

# validate_plan messages about graduation completeness, not registration.
_COMPLETENESS = ("thieu mon bat buoc", "khoi '")
FREE_PREFIX = "ELECTIVE_"   # taken free electives (planner slots are FREE_<k>_<j>)
MAX_FREE = 12


def load_config(path: Path = CONFIG) -> dict[str, Any]:
    with open(path, "rb") as fh:
        return tomllib.load(fh)


def base_values(section: dict[str, Any], overrides: dict[str, float] | None = None) -> dict[str, Any]:
    """{name: base} for ranged entries, plain values kept; ``overrides`` win."""
    out = {k: (v["base"] if isinstance(v, dict) and "base" in v else v) for k, v in section.items()}
    out.update({k: v for k, v in (overrides or {}).items() if k in out})
    return out


def ranges(cfg: dict[str, Any]) -> dict[str, tuple[str, float, float, float]]:
    """{param: (section, base, low, high)} over all ranged entries."""
    out = {}
    for sec, body in cfg.items():
        for k, v in body.items():
            if isinstance(v, dict) and {"base", "low", "high"} <= v.keys():
                out[k] = (sec, v["base"], v["low"], v["high"])
    return out


@dataclass(frozen=True)
class Scale:
    """policy.lp: letter cut-offs on the 10-point scale and 4-point grade points."""

    cutoffs: tuple[tuple[float, float], ...]   # (min_score, gpa_points), descending

    def points(self, score: float) -> float:
        for lo, pts in self.cutoffs:
            if score >= lo - 1e-9:
                return pts
        return 0.0


def parse_policy(path: Path) -> tuple[Scale, list[tuple[str, int, int, float, float, int]]]:
    text = path.read_text(encoding="utf-8")
    mins = {g: int(v) for g, v in re.findall(r"grade_min_score\(score_10, (\w+), (\d+)\)", text)}
    pts = {g: int(v) for g, v in re.findall(r"grade_points\(gpa_4, (\w+), (\d+)\)", text)}
    cut = tuple(sorted(((mins[g] / 100, pts[g] / 100) for g in mins), reverse=True))
    fees = [(t, int(a), int(b), int(base) / 1000, int(rate) / 1000, int(over))
            for t, a, b, base, rate, over in re.findall(
                r"fee_rule\((\w+), (\d+), (\d+), (\d+), (\d+), (\d+)\)", text)]
    return Scale(cut), fees


class Curriculum:
    def __init__(self, cfg: dict[str, Any]):
        run = cfg["run"]
        self.raw = json.loads((PIPELINE / run["fixture"]).read_text(encoding="utf-8"))
        self.scale, self.fee_rules = parse_policy(PIPELINE / run["policy"])
        self.start = run["semester_before_start"]
        self.semesters = [self.start] + list(self.raw["semesters"])
        self.specializations = list(cfg["population"]["specializations"])
        self.elective_semesters = cfg["baseline"]["elective_semesters"]
        self.curriculum_code = self.raw["curriculum"]["code"]
        rules = self.raw["rules"]
        self.internships = set(rules.get("summer_courses", []))
        self.graduation_courses = set(self.raw.get("graduation_courses", {}).values())
        # A taken free-elective slot becomes a distinct course outside the curriculum,
        # which normalize() counts toward the free-elective group.
        free = next(g for g in self.raw["course_groups"] if g.get("pool_scope") == "any")
        self.free_credits = free.get("pool_course_credits") or 3
        self.raw["courses"] += [{"code": f"{FREE_PREFIX}{i}", "name": "Synthetic free elective",
                                 "credits": self.free_credits} for i in range(1, MAX_FREE + 1)]

    # -- static structure (per specialization) -------------------------------
    @lru_cache(maxsize=None)
    def normalized(self, spec: str) -> dict[str, Any]:
        return normalize(self._fixture(spec, (), (), self.start))

    def credits(self, spec: str) -> dict[str, int]:
        return {c["code"]: c["credits"] for c in self.normalized(spec)["courses"]}

    @lru_cache(maxsize=None)
    def all_codes(self) -> tuple[str, ...]:
        """Stable course index for random-number keys (union over specializations)."""
        codes = set()
        for s in self.specializations:
            codes |= set(self.credits(s))
        return tuple(sorted(codes))

    @lru_cache(maxsize=None)
    def groups(self, spec: str) -> list[dict[str, Any]]:
        return self.normalized(spec)["course_groups"]

    @lru_cache(maxsize=None)
    def recommended(self, spec: str) -> dict[str, int]:
        """Required course -> recommended main-semester index (1..8)."""
        out = {}
        for cc in self.raw["curriculum_courses"]:
            if cc.get("recommended_year"):
                out[cc["course_code"]] = (cc["recommended_year"] - 1) * 2 + cc["recommended_term"]
        return out

    @lru_cache(maxsize=None)
    def course_tags(self) -> dict[str, frozenset[str]]:
        """Course -> tags (planner/data/course-tags.json), read as the planner reads them:
        the program family's list, else the merged one."""
        data = json.loads((PIPELINE / "planner" / "data" / "course-tags.json").read_text(encoding="utf-8"))
        family = (data.get("families") or {}).get(self.curriculum_code)
        tags = (data.get("by_family") or {}).get(family) if family else None
        out: dict[str, set[str]] = {}
        for tag, codes in (tags if tags is not None else data.get("tags", {})).items():
            for c in codes:
                out.setdefault(c, set()).add(tag)
        return {c: frozenset(t) for c, t in out.items()}

    def group_c(self, spec: str) -> list[str]:
        return next(g["members"] for g in self.groups(spec) if self.elective_group_key(g) == "C")

    def free_slots(self, spec: str, passed) -> list[str]:
        """Planner slot codes still open for this student's state."""
        fx = normalize(self._fixture(spec, passed, (), self.start))
        return [c for g in fx["course_groups"] if g.get("_free_slots") for c in g["members"]]

    def elective_group_key(self, group: dict[str, Any]) -> str | None:
        m = re.search(r"nhóm ([A-D])", group["name"])
        return m.group(1) if m else None

    def is_summer(self, sem: str) -> bool:
        return sem.endswith("3")

    def fee(self, credits: int, summer: bool) -> float:
        """Tuition in million VND (policy.lp fee_rule). Zero credits -> no fee."""
        if credits <= 0:
            return 0.0
        kind = "summer" if summer else "regular"
        for t, lo, hi, base, rate, over in self.fee_rules:
            if t == kind and lo <= credits <= hi:
                return base + rate * max(0, credits - over)
        raise ValueError(f"no fee rule for {credits} credits ({kind})")

    # -- state-dependent checks -----------------------------------------------
    def _fixture(self, spec: str, passed, failed, current: str) -> dict[str, Any]:
        fx = copy.deepcopy(self.raw)
        fx["semesters"] = list(self.semesters)
        fx["student"] = {
            "current_semester": current,
            "source": "synthetic",
            "target_specialization": spec,
            "student_courses": [{"course_code": c, "status": "completed"} for c in sorted(passed)]
            + [{"course_code": c, "status": "failed"} for c in sorted(set(failed) - set(passed))],
        }
        fx["scenarios"] = []
        return fx

    def state_fixture(self, spec: str, passed, failed, current: str) -> dict[str, Any]:
        return self._fixture(spec, passed, failed, current)

    def scenario(self, summer_opt_in: list[str] | None = None, interests=None,
                 max_credits: int | None = None, skip_semesters=None) -> dict[str, Any]:
        sc: dict[str, Any] = {"id": "sim", "in_progress_results": {}}
        if skip_semesters:
            sc["skip_semesters"] = list(skip_semesters)
        if summer_opt_in:
            sc["summer_opt_in"] = list(summer_opt_in)
        if interests:
            sc["interests"] = list(interests)
        if max_credits is not None:
            sc["max_credits"] = int(max_credits)
        return sc

    def summers_from(self, semester: str) -> list[str]:
        """Summer codes after ``semester`` (the summer opt-in of an opted-in student)."""
        return [s for s in self.semesters[self.semesters.index(semester) + 1:] if self.is_summer(s)]

    # -- calendar -----------------------------------------------------------------
    def main_code(self, k: int) -> str:
        """Code of the k-th main semester from enrollment (1-based)."""
        return [s for s in self.semesters[1:] if not self.is_summer(s)][k - 1]

    def next_term(self, semester: str) -> str | None:
        i = self.semesters.index(semester) + 1
        return self.semesters[i] if i < len(self.semesters) else None

    def fills_next_errors(self, plan: dict[str, list[str]]) -> list[str]:
        """DESIGN.md B1: the term after an internship holds no other course."""
        errs = []
        for sem, courses in plan.items():
            nxt = self.next_term(sem)
            if nxt and set(courses) & self.internships and plan.get(nxt):
                errs.append(f"ky {nxt}: phai trong (thuc tap dang ky ky {sem})")
        return errs

    def registration_errors(self, spec, passed, failed, current, semester, courses,
                            summer_opt_in=None) -> list[str]:
        """Rule violations of registering ``courses`` in ``semester`` (completeness ignored)."""
        fx = self._fixture(spec, passed, failed, current)
        errs = validate_plan(fx, self.scenario(summer_opt_in),
                             [{"semester_code": semester, "courses": list(courses)}])
        return [e for e in errs if not e.startswith(_COMPLETENESS)]

    def individually_legal(self, spec, passed, failed, current, semester, candidates,
                           summer_opt_in=None) -> list[str]:
        """Candidates with no course-specific violation (one validator call).

        Corequisites count as satisfied only if the partner is also a candidate;
        the final bundle must be re-checked with ``registration_errors``.
        """
        errs = self.registration_errors(spec, passed, failed, current, semester, candidates,
                                        summer_opt_in)
        bad = {e.split(":", 1)[0] for e in errs if ":" in e and not e.startswith("ky ")}
        return [c for c in candidates if c not in bad]

    def graduated(self, spec, passed) -> bool:
        fx = self._fixture(spec, passed, (), self.start)
        return not [e for e in validate_plan(fx, self.scenario(), []) if e.startswith(_COMPLETENESS)]
