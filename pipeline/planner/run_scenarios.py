"""Chay moi kich ban trong fixture, kiem tra bang validator, in khac biet.

    cd pipeline
    .venv/Scripts/python -m planner.run_scenarios
    .venv/Scripts/python -m planner.run_scenarios --json output/planner.json
    .venv/Scripts/python -m planner.run_scenarios --facts base     # xem facts cua engine ASP
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from planner.facts import get_scenario, load_fixture, validate_input
from planner.normalize import normalize
from planner.result import diff, plan_map
from planner.solve_asp import build_program, solve_asp
from planner.validate import validate_plan

DEFAULT_FIXTURE = Path(__file__).with_name("fixtures") / "toy.json"


def run_all(fixture: dict, solver: str = "clingo") -> list[dict]:
    """Kich ban dau tien la co so; cac kich ban sau co gang giu lo trinh co so."""
    if solver == "cpsat":
        from planner.solve_cpsat import solve_cpsat as solve_fn
    else:
        solve_fn = solve_asp  # "clingo" = engine ASP
    results: list[dict] = []
    base: dict | None = None
    for scenario in fixture["scenarios"]:
        previous = plan_map(base) if base and base["semesters"] else None
        result = solve_fn(fixture, scenario, previous)
        if result["semesters"]:
            result["violations"] = validate_plan(fixture, scenario, result["semesters"])
        else:
            result["violations"] = []
        result["diff_vs_base"] = diff(base, result) if base and result["semesters"] else []
        if base is None:
            base = result
        results.append(result)
    return results


def print_result(result: dict) -> None:
    print(f"\n=== {result['scenario_id']}: {result['label']}")
    print(f"    trang thai: {result['status']}")
    if not result["semesters"]:
        print("    khong co lo trinh thoa moi rang buoc trong cac ky con lai")
        return
    for sem in result["semesters"]:
        print(f"    ky {sem['semester_code']} ({sem['credits']:>2} TC): {', '.join(sem['courses'])}")
    print(f"    hoc xong o ky: {result['graduation_semester']}")
    verdict = "HOP LE" if not result["violations"] else "VI PHAM: " + "; ".join(result["violations"])
    print(f"    validator: {verdict}")
    for line in result["diff_vs_base"]:
        print(f"      {line}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--solver", choices=["clingo", "cpsat"], default="clingo")
    parser.add_argument("--json", type=Path, help="ghi toan bo ket qua ra file JSON")
    parser.add_argument("--facts", metavar="SCENARIO_ID", help="chi in facts engine ASP cua mot kich ban")
    args = parser.parse_args()

    fixture = load_fixture(args.fixture)
    if args.facts:
        scenario = get_scenario(fixture, args.facts)
        normalized = normalize(fixture)
        validate_input(normalized, scenario)
        print(build_program(normalized, scenario)[0], end="")
        return

    results = run_all(fixture, args.solver)
    print(f"bo giai: {args.solver}")
    for result in results:
        print_result(result)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nda ghi {args.json}")


if __name__ == "__main__":
    main()
