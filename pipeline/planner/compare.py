"""So sanh Clingo va CP-SAT: cung dau vao, doi chieu trang thai, muc tieu, thoi gian.

    cd pipeline
    .venv/Scripts/python -m planner.compare                 # 5 kich ban cua toy.json
    .venv/Scripts/python -m planner.compare --benchmark     # du lieu sinh ngau nhien
    .venv/Scripts/python -m planner.compare --diagnose      # vi sao Clingo cham?

Hai bo giai co the tra hai lo trinh KHAC nhau ma van dung, mien la cung gia tri
muc tieu. Vi vay so sanh bo ba (ky cuoi, tong tin chi, so thay doi), khong so
tung mon.
"""

from __future__ import annotations

import argparse
import random
import time
from typing import Any

from planner.facts import load_fixture
from planner.report import metrics
from planner.report import objective as report_objective
from planner.run_scenarios import DEFAULT_FIXTURE
from planner.solve import plan_map, solve
from planner.solve_cpsat import solve_cpsat
from planner.validate import validate_plan


def objective(fixture: dict, scenario: dict, result: dict, previous: dict[str, str] | None) -> tuple | None:
    """Gia tri cac muc mem theo thu tu uu tien (S1, S6, S4, S2, [S5], S3), tinh lai tu JSON."""
    if not result["semesters"]:
        return None
    return report_objective(fixture, scenario, plan_map(result), previous)


def run_pair(fixture: dict, scenario: dict, previous: dict[str, str] | None, time_limit: float):
    rows = []
    for name, fn in (("clingo", solve), ("cp-sat", solve_cpsat)):
        start = time.perf_counter()
        result = fn(fixture, scenario, previous, time_limit)
        elapsed = time.perf_counter() - start
        violations = (
            validate_plan(fixture, scenario, result["semesters"]) if result["semesters"] else []
        )
        rows.append({
            "solver": name,
            "status": result["status"],
            "objective": objective(fixture, scenario, result, previous),
            "valid": not violations,
            "seconds": elapsed,
            "result": result,
        })
    return rows


def agree(rows: list[dict]) -> str:
    a, b = rows
    proven = {"OPTIMAL", "UNSAT"}
    if a["status"] not in proven or b["status"] not in proven:
        return "khong ket luan (co bo giai het gio)"
    same = a["status"] == b["status"] and a["objective"] == b["objective"]
    return "KHOP" if same else "LECH"


def print_rows(title: str, rows: list[dict]) -> None:
    print(f"\n{title}  ->  {agree(rows)}")
    for r in rows:
        valid = "" if r["objective"] is None else ("hop le" if r["valid"] else "VI PHAM")
        print(f"   {r['solver']:<7} {r['status']:<22} muc tieu={str(r['objective']):<14} "
              f"{valid:<8} {r['seconds'] * 1000:8.1f} ms")


def compare_fixture(fixture: dict, time_limit: float) -> None:
    previous: dict[str, str] | None = None
    for scenario in fixture["scenarios"]:
        rows = run_pair(fixture, scenario, previous, time_limit)
        print_rows(scenario["id"], rows)
        if previous is None and rows[0]["result"]["semesters"]:
            previous = plan_map(rows[0]["result"])  # ca hai dung chung lo trinh co so


# --- Du lieu sinh ngau nhien de do thoi gian ---------------------------------

def synthetic(n_courses: int, n_semesters: int, seed: int) -> dict[str, Any]:
    """Chuong trinh bia: mon chia tang, tien quyet chi tro ve tang truoc."""
    rng = random.Random(seed)
    layers = max(2, n_semesters - 2)
    codes = [f"C{k:03d}" for k in range(n_courses)]
    layer = {c: k * layers // n_courses for k, c in enumerate(codes)}
    credit = {c: rng.choice([2, 3, 3, 4]) for c in codes}
    relations = []
    for c in codes:
        earlier = [d for d in codes if layer[d] < layer[c]]
        for d in rng.sample(earlier, min(len(earlier), rng.choice([0, 1, 1, 2]))):
            kind = rng.choice(["prerequisite", "prerequisite", "prior", "corequisite"])
            relations.append({"course_code": c, "related_course_code": d, "type": kind})
    n_required = n_courses * 3 // 4
    required, elective = codes[:n_required], codes[n_required:]
    rng.shuffle(elective)
    elective_need = sum(credit[c] for c in elective) // 2
    total = sum(credit[c] for c in required) + elective_need
    semesters = [f"S{k}" for k in range(n_semesters + 1)]
    blocked = [
        {"course_code": c, "semester_code": rng.choice(semesters[1:]), "status": "not-offered"}
        for c in rng.sample(codes, n_courses // 5)
    ]
    return {
        "curriculum": {
            "code": f"SYN-{n_courses}-{seed}",
            "min_semester_credits": 6,
            "max_semester_credits": int(total / n_semesters * 1.25) + 4,
        },
        "semesters": semesters,
        "courses": [{"code": c, "name": c, "credits": credit[c]} for c in codes],
        "curriculum_courses": [{"course_code": c} for c in codes],
        "course_relations": relations,
        "course_groups": [
            {"name": "req", "kind": "required", "required_count": None,
             "required_credits": None, "members": required},
            {"name": "ele", "kind": "elective", "required_count": None,
             "required_credits": elective_need, "members": elective},
        ],
        "offerings": {"unknown_policy": "assume-open", "records": blocked},
        "student": {"current_semester": "S0", "student_courses": []},
        "scenarios": [{"id": "fresh", "in_progress_results": {}}],
    }


def benchmark(time_limit: float) -> None:
    print(f"Sinh vien moi, 8 ky, gioi han {time_limit:.0f}s moi lan giai, CP-SAT chay 1 luong")
    for n_courses in (20, 40, 60, 80):
        for seed in (1, 2, 3):
            fixture = synthetic(n_courses, 8, seed)
            rows = run_pair(fixture, fixture["scenarios"][0], None, time_limit)
            print_rows(f"{n_courses} mon, seed {seed}", rows)


# --- Chan doan: phan nao cua bai toan lam Clingo cham? -----------------------

def _clingo_variant(fixture: dict, keep: set[str], extra: str, time_limit: float) -> str:
    """Giai bang Clingo, chi giu cac #minimize cua mong muon trong ``keep`` (vd {"s1"})."""
    import re

    import clingo

    from planner.facts import export_facts
    from planner.solve import ENCODING

    lines = []
    for line in ENCODING.read_text(encoding="utf-8").splitlines():
        found = re.match(r"#minimize.*priority\((s\d)", line)
        if found and found.group(1) not in keep:
            continue
        lines.append(line)
    ctl = clingo.Control(["--opt-mode=opt"], logger=lambda code, message: None)
    ctl.add("base", [], "\n".join(lines) + "\n" + extra)
    ctl.add("base", [], export_facts(fixture, fixture["scenarios"][0]))
    ctl.ground([("base", [])])
    start = time.perf_counter()
    with ctl.solve(async_=True) as handle:
        finished = handle.wait(time_limit)
        if not finished:
            handle.cancel()
        result = handle.get()
    elapsed = (time.perf_counter() - start) * 1000
    conflicts = int(ctl.statistics["solving"]["solvers"]["conflicts"])
    if not finished:
        verdict = "HET GIO"
    else:
        verdict = "xong, co nghiem" if result.satisfiable else "xong, vo nghiem"
    return f"{verdict:<16} {elapsed:8.0f} ms  {conflicts:>7} mau thuan"


def diagnose(time_limit: float) -> None:
    fixture = synthetic(40, 8, 1)
    scenario = fixture["scenarios"][0]
    reference = solve_cpsat(fixture, scenario, None, time_limit)
    m = metrics(fixture, scenario, plan_map(reference), None)
    best_last, total = m["S1"], m["S2"]
    cap = fixture["curriculum"]["max_semester_credits"]
    print(f"Bai 40 mon, 8 ky. Toi uu (CP-SAT): xong o ky {best_last}, {total} TC. Toi da {cap} TC/ky.")
    print(f"Phep dem: {best_last - 1} ky x {cap} TC = {(best_last - 1) * cap} TC < {total} TC can hoc.\n")

    print("Clingo, tung phan cua bai toan:")
    tasks = [
        ("tim mot lo trinh hop le bat ky", set(), ""),
        ("toi thieu tin chi (chi muc S2)", {"s2"}, ""),
        (f"toi thieu tin chi, biet truoc xong o ky {best_last}", {"s2"},
         f":- take(_, I), I > {best_last}."),
        ("toi thieu ky cuoi (chi muc S1)", {"s1"}, ""),
        (f"chung minh KHONG the xong trong {best_last - 1} ky", set(),
         f":- take(_, I), I > {best_last - 1}."),
    ]
    for label, keep, extra in tasks:
        print(f"   {label:<48} {_clingo_variant(fixture, keep, extra, time_limit)}")

    print("\nCP-SAT, bat va tat noi long tuyen tinh (LP):")
    for label, level in (("LP bat (mac dinh)", None), ("LP tat", 0)):
        start = time.perf_counter()
        result = solve_cpsat(fixture, scenario, None, time_limit, level)
        elapsed = (time.perf_counter() - start) * 1000
        print(f"   {label:<48} {result['status']:<22} {elapsed:8.0f} ms")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--diagnose", action="store_true")
    parser.add_argument("--time-limit", type=float, default=30.0)
    args = parser.parse_args()
    if args.diagnose:
        diagnose(args.time_limit)
    elif args.benchmark:
        benchmark(args.time_limit)
    else:
        compare_fixture(load_fixture(DEFAULT_FIXTURE), args.time_limit)


if __name__ == "__main__":
    main()
