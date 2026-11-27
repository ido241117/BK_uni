"""Ket qua chung cua moi bo giai (CP-SAT, ASP engine): dung JSON theo ky, so sanh lo trinh.

Truoc day nam trong ``solve.py`` cua bo giai Clingo cu; tach ra khi thay bo giai do bang
engine ASP (``pipeline/planner/solvers/asp/core``, xem ``planner/solvers/asp/ADAPTER.md``).
"""

from __future__ import annotations

from typing import Any

from planner.model.facts import assumptions, plan_semesters
from planner.model.report import preferences_report, warnings
from planner.model.student_requests import requests_report


def make_result(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    solver: str,
    status: str,
    takes: list[tuple[str, int]] | None,
    previous_plan: dict[str, str] | None = None,
    attempts: list[tuple[str, int]] | None = None,
) -> dict[str, Any]:
    """Dung chung cho moi bo giai. ``takes``: [(ma mon, chi so ky 1..n)] hoac None.

    ``attempts`` (W1, 23/11): lan hoc sinh vien gia dinh RỚT, [(ma mon, chi so ky)]. Hien trong ky do
    (``failed_attempts``, cong vao TC cua ky) nhung khong nam trong ``courses`` va ``plan``.
    """
    semesters = plan_semesters(fixture)
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    output: dict[str, Any] = {
        "scenario_id": scenario["id"],
        "label": scenario.get("label", ""),
        "curriculum": fixture["curriculum"]["code"],
        "solver": solver,
        "assumptions": assumptions(fixture, scenario),
        "status": status,
    }

    if takes is None:
        # UNSAT chi co nghia: khong co lo trinh thoa moi rang buoc TRONG cac ky
        # con lai cua fixture, voi cac gia dinh tren. Khong phai "khong the tot nghiep".
        output["semesters"] = []
        output["graduation_semester"] = None
        output["preferences_report"] = []
        output["warnings"] = warnings(fixture, scenario, {})
        output["requests"] = requests_report(fixture, scenario, None)
        return output

    by_sem: dict[int, list[str]] = {}
    for code, i in takes:
        by_sem.setdefault(i, []).append(code)
    failed: dict[int, list[str]] = {}
    for code, i in attempts or []:
        failed.setdefault(i, []).append(code)
        by_sem.setdefault(i, [])
    output["semesters"] = [
        {
            "semester_code": semesters[i - 1],
            "courses": sorted(by_sem[i]),
            "credits": sum(credits[c] for c in by_sem[i]) + sum(credits[c] for c in failed.get(i, [])),
            **({"failed_attempts": sorted(failed[i])} if i in failed else {}),
        }
        for i in sorted(by_sem)
    ]
    output["graduation_semester"] = (
        output["semesters"][-1]["semester_code"] if by_sem else fixture["student"]["current_semester"]
    )
    plan = {code: semesters[i - 1] for code, i in takes}
    output["preferences_report"] = preferences_report(
        fixture, scenario, plan, output["graduation_semester"], previous_plan
    )
    output["warnings"] = warnings(fixture, scenario, plan)
    output["requests"] = requests_report(fixture, scenario, plan)  # sprint 11: khong im lang bo yeu cau
    return output


def plan_map(result: dict[str, Any]) -> dict[str, str]:
    """{ma mon: ma ky} tu ket qua solve."""
    return {c: s["semester_code"] for s in result["semesters"] for c in s["courses"]}


def diff(base: dict[str, Any], other: dict[str, Any]) -> list[str]:
    """Khac biet cua ``other`` so voi ``base``, theo tung mon."""
    a, b = plan_map(base), plan_map(other)
    lines = []
    for code in sorted(set(a) | set(b)):
        if code not in a:
            lines.append(f"+ {code} them vao ky {b[code]}")
        elif code not in b:
            lines.append(f"- {code} bo khoi ky {a[code]}")
        elif a[code] != b[code]:
            lines.append(f"~ {code} doi {a[code]} -> {b[code]}")
    return lines
