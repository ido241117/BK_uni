"""Chay Clingo va doi nghiem ve JSON theo ky."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import clingo

from planner.facts import assumptions, export_facts, plan_semesters
from planner.normalize import normalize
from planner.report import preferences_report, warnings

ENCODING = Path(__file__).with_name("encoding.lp")


def solve(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    previous_plan: dict[str, str] | None = None,
    time_limit: float = 30.0,
    extra_args: tuple[str, ...] = (),
) -> dict[str, Any]:
    """``extra_args``: tham so them cho Clingo, vd ("--opt-strategy=usc",)."""
    fixture = normalize(fixture)
    facts = export_facts(fixture, scenario, previous_plan)
    def logger(code: clingo.MessageCode, message: str) -> None:
        # Predicate tuy chon (locked, prev, ...) co the khong co fact nao: binh thuong.
        if code != clingo.MessageCode.AtomUndefined:
            print(message)

    ctl = clingo.Control(["--opt-mode=opt", *extra_args], logger=logger)
    # Khong dung ctl.load(): Clingo tren Windows khong mo duoc duong dan co dau.
    ctl.add("base", [], ENCODING.read_text(encoding="utf-8"))
    ctl.add("base", [], facts)
    ctl.ground([("base", [])])

    best: list[tuple[str, int]] | None = None
    proven = False

    def on_model(model: clingo.Model) -> None:
        # Duoc goi moi lan tim ra nghiem tot hon; nghiem cuoi cung la tot nhat.
        nonlocal best, proven
        best = [
            (atom.arguments[0].string, atom.arguments[1].number)
            for atom in model.symbols(shown=True)
        ]
        proven = model.optimality_proven

    with ctl.solve(on_model=on_model, async_=True) as handle:
        if not handle.wait(time_limit):
            handle.cancel()
        result = handle.get()
    # Het gio truoc khi chung minh xong thi khong duoc goi la toi uu.
    proven = proven or (best is not None and result.exhausted)

    if best is None:
        status = "UNSAT" if result.unsatisfiable else "TIMEOUT"
    else:
        status = "OPTIMAL" if proven else "SAT_NOT_PROVEN_OPTIMAL"
    return make_result(fixture, scenario, "clingo", status, best, previous_plan)


def make_result(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    solver: str,
    status: str,
    takes: list[tuple[str, int]] | None,
    previous_plan: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Dung chung cho moi bo giai. ``takes``: [(ma mon, chi so ky 1..n)] hoac None."""
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
        return output

    by_sem: dict[int, list[str]] = {}
    for code, i in takes:
        by_sem.setdefault(i, []).append(code)
    output["semesters"] = [
        {
            "semester_code": semesters[i - 1],
            "courses": sorted(by_sem[i]),
            "credits": sum(credits[c] for c in by_sem[i]),
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
