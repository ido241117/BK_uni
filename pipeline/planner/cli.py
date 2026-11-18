"""Cong vao cho backend: doc JSON tu stdin, ghi JSON ket qua ra stdout.

    cd pipeline
    .venv/Scripts/python -m planner.cli --solver cpsat < input.json

Dau vao: mot fixture (dinh dang ``fixtures/toy.json``, khong can ``scenarios``)
cong them:
    "scenario":      kich ban (in_progress_results, locked, not_offered,
                     max_credits, semester_limits, graduate_by, preferences)
    "previous_plan": {ma mon: ma ky} cua lo trinh moc (khong bat buoc)
    scenario.use_inferred_relations (mac dinh false, nguoi duyet 19/11): dung quan he suy ra
    tu ban chup ``data/relations-snapshot.json`` (giai doan 3)

Dau ra: muc 4.3 cua ke hoach (docs/2026-11-18-ke-hoach-goi-y-hoc-phan.md).
Du lieu sai -> status "INPUT_ERROR" kem ``error``; khong bao gio in traceback ra stdout.
Ma thoat luon la 0 khi da in duoc JSON.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from pathlib import Path
from typing import Any

from planner.facts import FixtureError
from planner.normalize import normalize
from planner.relations import enrich
from planner.relations import load as load_snapshot
from planner.solve import diff, solve
from planner.solve_cpsat import solve_cpsat
from planner.validate import validate_plan

SOLVERS = {"cpsat": solve_cpsat, "clingo": solve}
DEFAULT_SNAPSHOT = Path(__file__).with_name("data") / "relations-snapshot.json"


def _reason(fixture: dict[str, Any], scenario: dict[str, Any], code: str) -> str:
    statuses = {sc["course_code"]: sc["status"] for sc in fixture["student"]["student_courses"]}
    if statuses.get(code) == "failed" or (
        statuses.get(code) == "in-progress" and scenario["in_progress_results"].get(code) == "fail"
    ):
        return "retake"
    if code in (scenario.get("preferences") or {}).get("wanted_courses", []):
        return "wanted"
    if code.startswith("FREE_"):
        return "free_elective"
    for group in fixture["course_groups"]:
        if code in group["members"] and group["kind"] == "elective":
            return "elective"
    return "required"


def _explain_unsat(fixture: dict[str, Any], scenario: dict[str, Any], time_limit: float) -> str:
    """Thu bo tung lua chon cua sinh vien (bang CP-SAT) de tim nut gay ra UNSAT."""
    knobs: list[tuple[str, dict[str, Any]]] = []
    for k, item in enumerate(scenario.get("locked", [])):
        trial = copy.deepcopy(scenario)
        del trial["locked"][k]
        knobs.append((f"khóa {item['course_code']} vào kỳ {item['semester_code']}", trial))
    for key, label in (("graduate_by", "hạn tốt nghiệp"), ("max_credits", "mức tín chỉ tối đa"),
                       ("semester_limits", "giới hạn tín chỉ từng kỳ")):
        if scenario.get(key):
            trial = copy.deepcopy(scenario)
            trial.pop(key)
            knobs.append((label, trial))
    culprits = [label for label, trial in knobs
                if solve_cpsat(fixture, trial, None, time_limit)["status"] != "UNSAT"]
    if culprits:
        return "Bỏ một trong các lựa chọn sau thì có lộ trình: " + "; ".join(culprits)

    # Khong do lua chon cua sinh vien: thu noi tung luat cua truong de chi ra luat nao chan.
    rules = fixture.get("rules") or {}
    relaxations: list[tuple[str, dict[str, Any]]] = []
    if rules.get("course_level"):
        relaxations.append(("cấp độ môn (QĐ 285 Điều 15.4: môn cấp 3 trở lên từ năm 3)",
                            {**fixture, "rules": {**rules, "course_level": False}}))
    if rules.get("graduation_thresholds"):
        relaxations.append(("ngưỡng tín chỉ của môn tốt nghiệp (QĐ 285 Điều 15.5)",
                            {**fixture, "rules": {**rules, "graduation_thresholds": {}}}))
    blocking = [label for label, fx in relaxations if solve_cpsat(fx, scenario, None, time_limit)["status"] != "UNSAT"]
    prefix = "Bỏ từng lựa chọn một vẫn không có lộ trình. " if knobs else ""
    if blocking:
        return prefix + "Luật đang chặn lộ trình: " + "; ".join(blocking) + \
            ". Thường gặp khi còn ít môn học được ở một kỳ; nên hỏi phòng đào tạo"
    return prefix + "Không có lộ trình trong các kỳ còn lại với dữ liệu chương trình hiện tại"


def run(payload: dict[str, Any], solver: str, time_limit: float,
        snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = {k: v for k, v in payload.items() if k not in ("scenario", "previous_plan")}
    scenario = dict(payload.get("scenario") or {})
    scenario.setdefault("id", "request")
    # Nguoi duyet 19/11: khong dung quan he suy ra tu chuong trinh khac khi giai. Ban chup chi
    # dung de liet ke mon khong co thong tin tien quyet (unverified_prerequisites).
    use_inferred = scenario.pop("use_inferred_relations", False)
    if snapshot is not None:
        raw = enrich(raw, snapshot)
        if not use_inferred:
            raw["course_relations"] = [r for r in raw["course_relations"] if r.get("source") != "inferred"]
    fixture = normalize(raw)
    previous = payload.get("previous_plan")
    inferred = [{k: r[k] for k in ("course_code", "related_course_code", "type", "inferred_from")}
                for r in fixture["course_relations"] if r.get("source") == "inferred"]

    start = time.perf_counter()
    result = SOLVERS[solver](fixture, scenario, previous, time_limit)
    solve_ms = round((time.perf_counter() - start) * 1000)

    locked = {(i["course_code"], i["semester_code"]) for i in scenario.get("locked", [])}
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    semesters = [
        {
            "semester_code": s["semester_code"],
            "credits": s["credits"],
            "courses": [
                {"code": c, "credits": credits[c], "reason": _reason(fixture, scenario, c),
                 "locked": (c, s["semester_code"]) in locked}
                for c in s["courses"]
            ],
        }
        for s in result["semesters"]
    ]
    violations = validate_plan(fixture, scenario, result["semesters"]) if result["semesters"] else []
    diff_vs_previous: list[str] = []
    if previous and result["semesters"]:
        diff_vs_previous = diff({"semesters": [{"semester_code": s, "courses": [c]}
                                               for c, s in previous.items()]}, result)
    return {
        "status": result["status"],
        "solver": result["solver"],
        "solve_ms": solve_ms,
        "semesters": semesters,
        "graduation_semester": result["graduation_semester"],
        "preferences_report": result["preferences_report"],
        "assumptions": result["assumptions"] + (
            [f"{len(inferred)} quan hệ tiên quyết/song hành suy ra từ chương trình khác "
             f"(bản chụp {fixture.get('relations_snapshot')})"] if inferred else []),
        "warnings": result["warnings"],
        "unverified_prerequisites": fixture.get("unverified_prerequisites", []),
        "inferred_relations": inferred,
        "relations_snapshot": fixture.get("relations_snapshot"),
        "violations": violations,
        "diff_vs_previous": diff_vs_previous,
        "infeasible_reason": _explain_unsat(fixture, scenario, time_limit) if result["status"] == "UNSAT" else None,
    }


def input_error(message: str, solver: str) -> dict[str, Any]:
    return {"status": "INPUT_ERROR", "solver": solver, "error": message, "semesters": [],
            "graduation_semester": None, "violations": []}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bo giai lo trinh: JSON stdin -> JSON stdout")
    parser.add_argument("--solver", choices=sorted(SOLVERS), default="cpsat")
    parser.add_argument("--time-limit", type=float, default=30.0)
    parser.add_argument("--relations-snapshot", type=Path, default=DEFAULT_SNAPSHOT,
                        help="ban chup quan he mon (giai doan 3); 'none' de tat")
    args = parser.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        if not isinstance(payload, dict):
            raise FixtureError("dau vao phai la mot object JSON")
        snap_path = args.relations_snapshot
        snapshot = load_snapshot(snap_path) if snap_path and str(snap_path) != "none" and snap_path.exists() else None
        output = run(payload, args.solver, args.time_limit, snapshot)
    except json.JSONDecodeError as exc:
        output = input_error(f"JSON khong hop le: {exc}", args.solver)
    except FixtureError as exc:
        output = input_error(str(exc), args.solver)
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        output = input_error(f"thieu hoac sai truong du lieu: {type(exc).__name__}: {exc}", args.solver)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
