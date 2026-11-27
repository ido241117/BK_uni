"""Cong vao cho backend: doc JSON tu stdin, ghi JSON ket qua ra stdout.

    cd pipeline
    .venv/Scripts/python -m planner.cli --solver cpsat < input.json

Dau vao: dict dau vao cua planner (``planner.model.input.load_fixture``, khong can ``scenarios``)
cong them:
    "scenario":      kich ban (in_progress_results, locked, not_offered,
                     max_credits, semester_limits, graduate_by, preferences)
    "previous_plan": {ma mon: ma ky} cua lo trinh moc (khong bat buoc)
    scenario.use_inferred_relations (mac dinh false, nguoi duyet 19/11): dung quan he suy ra
    tu ban chup ``data/relations-snapshot.json`` (giai doan 3)

Dau ra: muc 4.3 cua ke hoach (docs/02-ke-hoach.md).
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

from planner.model.facts import (
    FixtureError,
    assumed_fails,
    base_credit_limits,
    is_summer,
    offered_terms,
    plan_semesters,
    summer_courses,
)
from planner.model.normalize import normalize
from instances.importers.hcmut.relations import enrich
from planner.model.report import warning_items
from instances.importers.hcmut.relations import load as load_snapshot
from planner.model.result import diff
from planner.solvers.asp.adapter import solve_asp
from planner.solvers.cpsat import solve_cpsat
from evaluation.validate import validate_plan

# "clingo" = engine ASP (pipeline/planner/solvers/asp/core) qua planner/solvers/asp/adapter.py (ADAPTER.md).
SOLVERS = {"cpsat": solve_cpsat, "clingo": solve_asp}
DEFAULT_SNAPSHOT = Path(__file__).resolve().parents[1] / "instances" / "hcmut" / "raw" / "relations-snapshot.json"


def _allocate_blocks(fixture: dict[str, Any], planned: list[str], chosen: set[str]) -> dict[str, str]:
    """Moi mon tu chon trong lo trinh lap yeu cau nao (24/11, nguoi duyet chon cach A).

    Cung luat dem voi ``normalize.py`` buoc 3: moi khoi tu chon (``listed``, khong phai khoi con chuyen
    nganh) lap phan con thieu truoc (da dat + dang hoc gia dinh dau tinh truoc); phan du cua khoi tinh vao
    tu chon tu do. Trong mot khoi, mon sinh vien ghim/chon nhan khoi truoc mon bo giai tam chon.
    Tra ve {ma mon: ten khoi}; o ``FREE_`` luon thuoc khoi tu chon tu do.
    """
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    student = fixture["student"]
    done = {sc["course_code"] for sc in student["student_courses"] if sc["status"] == "completed"}
    done |= set(student.get("_assumed_pass") or [])
    free_name = next((g["name"].replace(" (o trong)", "") for g in fixture["course_groups"] if g.get("_free_slots")), None)
    out: dict[str, str] = {}
    for g in fixture["course_groups"]:
        if g.get("_free_slots"):
            for c in g["members"]:
                out[c] = free_name or g["name"]
            continue
        if g["kind"] != "elective" or g.get("parent") or g.get("specialization"):
            continue
        members = set(g["members"])
        here = sorted((c for c in planned if c in members), key=lambda c: (c not in chosen, c))
        if g.get("required_credits"):
            need = max(0, g["required_credits"] - sum(credits[c] for c in done if c in members))
            for c in here:
                if need > 0:
                    out[c], need = g["name"], need - credits[c]
                else:
                    out[c] = free_name or g["name"]
        elif g.get("required_count") is not None:
            need = max(0, g["required_count"] - sum(1 for c in done if c in members))
            for i, c in enumerate(here):
                out[c] = g["name"] if i < need else (free_name or g["name"])
        else:
            for c in here:
                out[c] = g["name"]
    return out


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


def _feasible(fixture: dict[str, Any], scenario: dict[str, Any], time_limit: float) -> bool:
    return solve_cpsat(fixture, scenario, None, time_limit)["status"] not in ("UNSAT", "TIMEOUT")


def _without(items: list[Any], k: int) -> list[Any]:
    return [x for j, x in enumerate(items) if j != k]


def _knobs(fixture: dict[str, Any], scenario: dict[str, Any], skip_target: str | None = None
           ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Tung lua chon cua sinh vien, bo rieng tung cai: [(cach go, kich ban da bo)].

    ``cach go`` (giai doan 12, M11) co ``kind`` de giao dien bam la ap dung: unpin, unskip, remove_not_offered,
    remove_target, remove_assumed_fail, assume_pass, enable_summer, remove_graduate_by, remove_frozen.
    """
    out: list[tuple[dict[str, Any], dict[str, Any]]] = []

    def add(fix: dict[str, Any], **changes: Any) -> None:
        t = copy.deepcopy(scenario)
        for key, value in changes.items():
            if value is None:
                t.pop(key, None)
            else:
                t[key] = value
        out.append((fix, t))

    # Ghim tuyet doi thi khong bao gio de xuat bo ghim (nguoi duyet 22/11).
    if not (fixture.get("rules") or {}).get("pins_absolute"):
        for k, item in enumerate(scenario.get("locked", [])):
            add({"kind": "unpin", "course": item["course_code"], "semester": item["semester_code"],
                 "label": f"Bỏ ghim {item['course_code']} ở {item['semester_code']}"},
                locked=_without(scenario["locked"], k))
    for sem in scenario.get("skip_semesters") or []:
        add({"kind": "unskip", "semester": sem, "label": f"Không nghỉ kỳ {sem}"},
            skip_semesters=[x for x in scenario["skip_semesters"] if x != sem])
    for k, item in enumerate(scenario.get("not_offered") or []):
        add({"kind": "remove_not_offered", "course": item["course_code"], "semester": item["semester_code"],
             "label": f"Cho {item['course_code']} mở lại kỳ {item['semester_code']}"},
            not_offered=_without(scenario["not_offered"], k))
    for sem in list(scenario.get("semester_targets") or {}):
        if sem != skip_target:
            add({"kind": "remove_target", "semester": sem, "label": f"Bỏ số TC muốn ở kỳ {sem}"},
                semester_targets={k: v for k, v in scenario["semester_targets"].items() if k != sem})
    for code in assumed_fails(scenario):
        add({"kind": "remove_assumed_fail", "course": code, "label": f"Bỏ giả định rớt {code}"},
            assumed_fail=[i for i in scenario["assumed_fail"] if i["course_code"] != code])
    for code, r in sorted((scenario.get("in_progress_results") or {}).items()):
        if r == "fail":
            add({"kind": "assume_pass", "course": code, "label": f"Giả định đậu {code}"},
                in_progress_results={**scenario["in_progress_results"], code: "pass"})
    opted = scenario.get("summer_opt_in") or []
    summers = [x for x in plan_semesters(fixture) if is_summer(x) and x not in opted]
    for sem in summers[:3]:
        add({"kind": "enable_summer", "semester": sem, "label": f"Học hè {sem}"}, summer_opt_in=[*opted, sem])
    if scenario.get("graduate_by"):
        add({"kind": "remove_graduate_by", "label": "Bỏ hạn tốt nghiệp"}, graduate_by=None)
    if scenario.get("frozen_semesters"):
        add({"kind": "remove_frozen", "label": "Bỏ các kỳ đã khóa"}, frozen_semesters=None)
    if scenario.get("max_credits"):
        add({"kind": "remove_max_credits", "label": "Bỏ mức tín chỉ tối đa"}, max_credits=None)
    if scenario.get("semester_limits"):
        add({"kind": "remove_semester_limits", "label": "Bỏ giới hạn tín chỉ từng kỳ"}, semester_limits=None)
    return out


def _blocking_rules(fixture: dict[str, Any], scenario: dict[str, Any], time_limit: float) -> list[str]:
    """Noi tung luat cua truong de chi ra luat nao chan (dung khi bo lua chon cua sinh vien khong du)."""
    rules = fixture.get("rules") or {}
    relaxations: list[tuple[str, dict[str, Any]]] = []
    if rules.get("course_level"):
        relaxations.append(("cấp độ môn (QĐ 285 Điều 15.4: môn cấp 3 trở lên từ năm 3)",
                            {**fixture, "rules": {**rules, "course_level": False}}))
    if rules.get("graduation_thresholds"):
        relaxations.append(("ngưỡng tín chỉ của môn tốt nghiệp (QĐ 285 Điều 15.5)",
                            {**fixture, "rules": {**rules, "graduation_thresholds": {}}}))
    relaxations.append(("tiên quyết, song hành (QĐ 285 Điều 2.1)",
                        {**fixture, "course_relations": [r for r in fixture["course_relations"]
                                                         if r["type"] not in ("prerequisite", "corequisite")]}))
    return [label for label, fx in relaxations if _feasible(fx, scenario, time_limit)]


def _explain_unsat(fixture: dict[str, Any], scenario: dict[str, Any], time_limit: float
                   ) -> tuple[str, list[dict[str, Any]]]:
    """Thu bo tung lua chon cua sinh vien (bang CP-SAT) de tim nut gay ra UNSAT. Tra (loi giai thich, cach go)."""
    knobs = _knobs(fixture, scenario)
    fixes = [fix for fix, trial in knobs if _feasible(fixture, trial, time_limit)]
    if fixes:
        return "Bỏ một trong các lựa chọn sau thì có lộ trình: " + "; ".join(f["label"] for f in fixes), fixes
    blocking = _blocking_rules(fixture, scenario, time_limit)
    prefix = "Bỏ từng lựa chọn một vẫn không có lộ trình. " if knobs else ""
    if blocking:
        return (prefix + "Luật đang chặn lộ trình: " + "; ".join(blocking)
                + ". Thường gặp khi còn ít môn học được ở một kỳ; nên hỏi phòng đào tạo"), []
    return prefix + "Không có lộ trình trong các kỳ còn lại với dữ liệu chương trình hiện tại", []


def _explain_targets(fixture: dict[str, Any], scenario: dict[str, Any], requests: list[dict[str, Any]],
                     plan: dict[str, str], time_limit: float, limit: int = 2) -> None:
    """T53 (23/11): thay loi doan "khong con mon du dieu kien" bang ly do that, cho toi da ``limit`` ky.

    1) Ky cuoi cung co mon: chi con bay nhieu TC de hoc. 2) Giai lai voi so TC muon thanh muc toi thieu cung:
    khong giai duoc thi bo tung lua chon cua sinh vien, roi noi tung luat, de chi ra cai chan.
    """
    targets = scenario.get("semester_targets") or {}
    semesters = plan_semesters(fixture)
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    last = max(plan.values(), key=semesters.index) if plan else None
    done = 0
    for row in requests:
        if row["kind"] != "target" or row["status"] == "met" or done >= limit:
            continue
        sem = row["item"].split(":")[0]
        want = targets.get(sem)
        got = sum(credits[c] for c, s in plan.items() if s == sem)
        if want is None or got >= want:
            continue
        done += 1
        if last is None or semesters.index(sem) >= semesters.index(last):
            row["detail"] = f"xếp được {got} TC: đây là kỳ cuối, các môn còn lại chỉ có {got} TC"
            continue
        hard = copy.deepcopy(scenario)
        limits = hard.setdefault("semester_limits", {})
        limits[sem] = {**limits.get(sem, {}), "min": want}
        hard["semester_targets"] = {k: v for k, v in targets.items() if k != sem}
        if _feasible(fixture, hard, time_limit):
            continue  # giu loi cu: co cach xep du nhung pha uu tien cao hon
        culprits = [fix["label"] for fix, trial in _knobs(fixture, hard, skip_target=sem)
                    if _feasible(fixture, trial, time_limit)]
        if culprits:
            row["detail"] = f"xếp được {got} TC; muốn đủ {want} TC thì: " + " hoặc ".join(culprits)
            continue
        rules = _blocking_rules(fixture, hard, time_limit)
        if rules:
            row["detail"] = f"xếp được {got} TC; các môn còn lại chưa đủ điều kiện học ở kỳ này (" + "; ".join(rules) + ")"
        else:
            row["detail"] = f"xếp được {got} TC; không có tổ hợp môn đủ điều kiện để đạt {want} TC ở kỳ này"


def _course_facts(fixture: dict[str, Any], passed: set[str]) -> dict[str, Any]:
    """Giai doan 12 (M6, T61): du lieu de trang tu to ky duoc / khong duoc khi sinh vien chon mon, khong goi bo giai."""
    internships = summer_courses(fixture)
    excluded = set(fixture.get("summer_excluded", []))
    history = fixture.get("summer_history")
    out: dict[str, Any] = {}
    in_curriculum = {cc["course_code"] for cc in fixture["curriculum_courses"]}
    for code in sorted(in_curriculum - passed):
        rels = [r for r in fixture["course_relations"]
                if r["course_code"] == code and r["related_course_code"] not in passed]
        if code in internships:
            summer = "internship"
        elif code in excluded:
            summer = "excluded"
        elif history is None or code in history or code.startswith("FREE_"):
            summer = "history"
        else:
            summer = "no_history"
        terms = offered_terms(fixture, code)
        out[code] = {
            "prerequisites": sorted(r["related_course_code"] for r in rels if r["type"] == "prerequisite"),
            "corequisites": sorted(r["related_course_code"] for r in rels if r["type"] == "corequisite"),
            "summer": summer,
            "terms": sorted(terms) if terms is not None else None,
        }
    return out


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
    # Mon dang hoc gia dinh dau: normalize tru vao tu chon tu do nhu mon da dat (22/11).
    results = scenario.get("in_progress_results") or {}
    raw["student"] = {**raw["student"], "_assumed_pass": sorted(
        sc["course_code"] for sc in raw["student"]["student_courses"]
        if sc["status"] == "in-progress" and results.get(sc["course_code"]) == "pass")}
    fixture = normalize(raw)
    previous = payload.get("previous_plan")
    inferred = [{k: r[k] for k in ("course_code", "related_course_code", "type", "inferred_from")}
                for r in fixture["course_relations"] if r.get("source") == "inferred"]

    start = time.perf_counter()
    result = SOLVERS[solver](fixture, scenario, previous, time_limit)
    solve_ms = round((time.perf_counter() - start) * 1000)

    locked = {(i["course_code"], i["semester_code"]) for i in scenario.get("locked", [])}
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    # O khoi (Q7, 22/11): mon tu chon bo giai tu chon (sinh vien chua ghim, chua chon) va o tu chon
    # tu do hien thanh "khoi (x TC) ▾" tren giao dien; mon sinh vien ghim/chon thi hien ten mon.
    # 24/11: nhan khoi = yeu cau mon do LAP (_allocate_blocks), khong phai khoi goc cua mon.
    chosen = {c for c, _ in locked} | set((scenario.get("preferences") or {}).get("wanted_courses", []))
    planned = [c for s in result["semesters"] for c in s["courses"]]
    block_of = _allocate_blocks(fixture, planned, chosen)
    semesters = [
        {
            "semester_code": s["semester_code"],
            "credits": s["credits"],
            "courses": [
                {"code": c, "credits": credits[c], "reason": _reason(fixture, scenario, c),
                 "locked": (c, s["semester_code"]) in locked,
                 "block": block_of.get(c),
                 "slot": c in block_of and c not in chosen}
                for c in s["courses"]
            ] + [
                # W1: lan hoc gia dinh rot (tinh TC cua ky, khong dat)
                {"code": c, "credits": credits[c], "reason": _reason(fixture, scenario, c), "locked": False,
                 "block": block_of.get(c), "slot": False, "assumed_fail": True}
                for c in s.get("failed_attempts", [])
            ],
        }
        for s in result["semesters"]
    ]
    violations = validate_plan(fixture, scenario, result["semesters"]) if result["semesters"] else []
    pin_warnings: list[str] = []
    if (fixture.get("rules") or {}).get("pins_absolute"):
        # Ghim tuyet doi: vi pham o mon ghim la canh bao (da noi trong bang requests), khong phai loi.
        pinned_codes = {c for c, _ in locked}
        pin_warnings = [v for v in violations if any(v.startswith(c) or f" {c}" in v for c in pinned_codes)]
        violations = [v for v in violations if v not in pin_warnings]
    plan_now = {c: s["semester_code"] for s in result["semesters"] for c in s["courses"]}
    if result["semesters"]:
        _explain_targets(fixture, scenario, result.get("requests", []), plan_now, time_limit)
    reason, fixes = _explain_unsat(fixture, scenario, time_limit) if result["status"] == "UNSAT" else (None, [])
    results_now = scenario.get("in_progress_results") or {}
    passed_now = {sc["course_code"] for sc in fixture["student"]["student_courses"]
                  if sc["status"] == "completed"
                  or (sc["status"] == "in-progress" and results_now.get(sc["course_code"]) == "pass")}
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
        "warnings": result["warnings"] + pin_warnings,
        # 22/11: canh bao gan voi mon / ky, loi nhe nhang, co the tu xac nhan (giao dien dung thay vi chuoi).
        "warning_items": warning_items(fixture, scenario, {c: s["semester_code"] for s in result["semesters"]
                                                           for c in s["courses"]}),
        "requests": result.get("requests", []),
        "unverified_prerequisites": fixture.get("unverified_prerequisites", []),
        "inferred_relations": inferred,
        "relations_snapshot": fixture.get("relations_snapshot"),
        "violations": violations,
        "diff_vs_previous": diff_vs_previous,
        "infeasible_reason": reason,
        # Giai doan 12 (M11): cach go co cau truc, giao dien bam la ap dung.
        "infeasible_fixes": fixes,
        # Giai doan 12 (M6): tien quyet, song hanh, ky he, loai ky tung mo cua tung mon chua dat.
        "course_facts": _course_facts(fixture, passed_now),
        "credit_rules": {"main_max": base_credit_limits(fixture)[1],
                         "summer_max": (fixture.get("rules") or {}).get("summer_credits_max", 12)},
        # Chi engine ASP co: GPA, chuyen nganh, dieu kien tot nghiep, lich su mo lop, hoc phi, tag.
        "engine_report": result.get("engine_report"),
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
