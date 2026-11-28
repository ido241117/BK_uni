"""Solver adapters: the only place that knows which planner solves step 3.

The pipeline talks to a solver through four calls:

    adapter.settings(cfg_solver)   -> dict      settings from [solver.<name>] (part of the cache key)
    adapter.fingerprint()          -> str       hash of the solver's sources (part of the cache key)
    adapter.solve(fx, sc, settings) -> dict     a planner result (``planner.model.result.make_result``)
    adapter.stopped_by(result, settings) -> str "proven" | "time_limit" | "solve_limit" | ...

Input is the planner JSON contract (fixture + scenario), shared by every planner solver.
Output is reduced to one common record (``common_result``) with a common status:

| Common status | Meaning |
|---|---|
| OPTIMAL | a plan, proven optimal |
| FEASIBLE | a plan, not proven optimal (a limit stopped the search) |
| INFEASIBLE | proven: no plan exists |
| NO_PLAN | no plan and no proof (a limit stopped the search first) |

Built in: ``asp`` (``planner.solvers.asp.adapter``) and ``cpsat`` (``planner.solvers.cpsat``). Another
solver plugs in with ``[solver] name = "package.module:factory"``, where ``factory()``
returns an object with the four calls above and a ``name`` attribute. Changing a solver's
sources changes its fingerprint, so cached results of the old version are not reused.
"""

from __future__ import annotations

import hashlib
import importlib
from pathlib import Path

STATUS = {"OPTIMAL": "OPTIMAL", "FEASIBLE": "FEASIBLE", "SAT_NOT_PROVEN_OPTIMAL": "FEASIBLE",
          "INFEASIBLE": "INFEASIBLE", "UNSAT": "INFEASIBLE", "TIMEOUT": "NO_PLAN",
          "NO_PLAN": "NO_PLAN"}


def hash_files(paths) -> str:
    h = hashlib.sha256()
    for path in paths:
        h.update(Path(path).read_bytes())
    return h.hexdigest()


def shared_model_files() -> tuple[str, ...]:
    """Planner code every built-in solver runs (input checks, normalization, result building)."""
    from planner.model import facts, normalize, report, result, student_requests
    return tuple(m.__file__ for m in (facts, normalize, report, result, student_requests))


class AspSolver:
    """``planner.solvers.asp.adapter`` (engine in ``pipeline/planner/solvers/asp``).

    [solver.asp] mode = "conflicts": 1 thread, stop after ``solve_limit`` conflicts
    (reproducible; ``time_limit`` is a safety net). mode = "time": ``threads`` threads,
    stop at ``time_limit`` seconds (not reproducible).
    """

    name = "asp"

    def settings(self, s: dict) -> dict:
        if s["mode"] == "conflicts":
            return {"threads": 1, "solve_limit": int(s["solve_limit"]), "time_limit": float(s["time_limit"])}
        if s["mode"] == "time":
            return {"threads": int(s["threads"]), "solve_limit": None, "time_limit": float(s["time_limit"])}
        raise ValueError(f"unknown [solver.asp] mode {s['mode']!r}")

    def fingerprint(self) -> str:
        from planner.solvers.asp import adapter as S
        from planner.solvers.asp import policy
        return hash_files((*S.SOURCES_BEFORE, *S.SOURCES_AFTER, S.__file__, policy.__file__, S.TAGS_FILE,
                           S.ALIASES_FILE, *shared_model_files()))

    def solve(self, fx: dict, sc: dict, st: dict) -> dict:
        from planner.solvers.asp.adapter import solve_asp
        return solve_asp(fx, sc, None, st["time_limit"], threads=st["threads"],
                         solve_limit=st["solve_limit"])

    def stopped_by(self, r: dict, st: dict) -> str:
        return (r.get("engine_report") or {}).get("stopped_by") or "unknown"


class CpSatSolver:
    """``planner.solvers.cpsat`` (OR-Tools CP-SAT, 1 worker). [solver.cpsat] time_limit in
    seconds; the wall-clock limit makes unproven results machine-dependent."""

    name = "cpsat"

    def settings(self, s: dict) -> dict:
        return {"time_limit": float(s["time_limit"])}

    def fingerprint(self) -> str:
        from planner.solvers import cpsat
        return hash_files((cpsat.__file__, *shared_model_files()))

    def solve(self, fx: dict, sc: dict, st: dict) -> dict:
        from planner.solvers.cpsat import solve_cpsat
        return solve_cpsat(fx, sc, None, st["time_limit"])

    def stopped_by(self, r: dict, st: dict) -> str:
        return "proven" if r["status"] in ("OPTIMAL", "UNSAT") else "time_limit"


BUILTIN = {"asp": AspSolver, "cpsat": CpSatSolver}


def get_solver(name: str):
    """Built-in name, or "package.module:factory" for a plugged-in solver."""
    if name in BUILTIN:
        return BUILTIN[name]()
    if ":" in name:
        module, attr = name.split(":", 1)
        return getattr(importlib.import_module(module), attr)()
    raise ValueError(f"unknown solver {name!r}; built in: {sorted(BUILTIN)} or 'module:factory'")


def solver_name(cfg) -> str:
    return cfg["solver"]["name"]


def solver_label(cfg) -> str:
    """Output folder label: [solver] label, else the solver name ("a.b:f" -> "a.b-f")."""
    return cfg["solver"].get("label") or solver_name(cfg).replace(":", "-")


def solver_settings(cfg) -> dict:
    adapter = get_solver(solver_name(cfg))
    return adapter.settings(cfg["solver"].get(adapter.name, {}))


def common_result(r: dict, seconds: float, stopped_by: str, solver: str) -> dict:
    """Reduce a planner result to the record the pipeline stores and evaluates."""
    return {"solver": solver, "status": STATUS.get(r["status"], r["status"]),
            "raw_status": r["status"], "stopped_by": stopped_by, "seconds": round(seconds, 2),
            "plan": {s["semester_code"]: sorted(s["courses"]) for s in (r.get("semesters") or [])},
            "graduation_semester": r.get("graduation_semester"),
            "objective": (r.get("engine_report") or {}).get("objective", r.get("objective", [])),
            "violations": r.get("violations", []), "warnings": r.get("warnings", [])}


def upgrade(res: dict, solver: str) -> dict:
    """Results cached before the adapter layer (23/11/2026) lack the common fields."""
    if "raw_status" not in res:
        res = {**res, "solver": solver, "raw_status": res["status"],
               "status": STATUS.get(res["status"], res["status"])}
    return res
