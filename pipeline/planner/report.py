"""Tinh lai cac chi so mong muon mem va canh bao tu MOT lo trinh da co.

Dung chung cho ca hai bo giai (sau khi giai xong) va cho ``compare.py``. Khong
tham gia vao viec giai. Validator (``validate.py``) khong dung file nay.
"""

from __future__ import annotations

from typing import Any

from planner.facts import (
    base_credit_limits,
    credit_limits,
    is_summer,
    plan_semesters,
    preference_order,
    preferences,
    preferred_load,
    summer_courses,
    summer_preferred_load,
    summer_specialized,
)
from planner.normalize import normalize


def _passed(fixture: dict[str, Any], scenario: dict[str, Any]) -> set[str]:
    out = set()
    for sc in fixture["student"]["student_courses"]:
        if sc["status"] == "completed" or (
            sc["status"] == "in-progress" and scenario["in_progress_results"][sc["course_code"]] == "pass"
        ):
            out.add(sc["course_code"])
    return out


def metrics(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    plan: dict[str, str],
    previous_plan: dict[str, str] | None = None,
) -> dict[str, Any]:
    """``plan``: {ma mon: ma ky}. Tra ve gia tri cua tung muc S1..S6."""
    fixture = normalize(fixture)
    semesters = plan_semesters(fixture)
    pos = {s: i for i, s in enumerate(semesters, start=1)}
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    passed = _passed(fixture, scenario)
    load: dict[str, int] = {}
    for c, s in plan.items():
        load[s] = load.get(s, 0) + credits[c]

    broken = []
    for rel in fixture["course_relations"]:
        c, r = rel["course_code"], rel["related_course_code"]
        if rel["type"] != "recommended" or c not in plan or r in passed:
            continue
        if not (r in plan and pos[plan[r]] < pos[plan[c]]):
            broken.append((r, c))
    done = passed | set(plan)
    internships = summer_courses(fixture)
    base_min = base_credit_limits(fixture)[0]
    s_lo, s_hi = summer_preferred_load(fixture)
    summer_loads: dict[str, int] = {}
    for c, s in plan.items():
        if is_summer(s) and c not in internships:
            summer_loads[s] = summer_loads.get(s, 0) + credits[c]
    summer_dev = sum(max(0, v - s_hi) + max(0, s_lo - v) for v in summer_loads.values() if v > 0)
    band = preferred_load(fixture, scenario)
    used = [s for s in semesters if load.get(s)]
    last = used[-1] if used else None
    deviation = 0
    if band:
        for s in semesters:
            if is_summer(s) or (last and pos[s] > pos[last]):
                continue
            ld = load.get(s, 0)
            deviation += max(0, ld - band[1])
            if s != last:
                deviation += max(0, band[0] - ld)
    return {
        "S10": sum(credits[c] for c, s in plan.items() if is_summer(s) and c not in internships),
        "S7": summer_dev,
        "S7_loads": summer_loads,
        "S8": deviation,
        "S11": sum(max(0, base_min - load.get(s, 0)) for s in semesters
                   if not is_summer(s) and last and pos[s] < pos[last]),
        "S9": sum(credits[c] for c, s in plan.items() if is_summer(s) and summer_specialized(fixture, c)),
        "S9_courses": sorted(c for c, s in plan.items() if is_summer(s) and summer_specialized(fixture, c)),
        "S1": max((pos[s] for s in plan.values()), default=0),
        "S6": sorted(set(broken)),
        "S4": [c for c in preferences(scenario)["wanted_courses"] if c not in done],
        "S2": sum(credits[c] for c in plan),
        "S5": max(load.values(), default=0),
        "S5_min": min(load.values(), default=0),
        "S3": sum(1 for c, s in (previous_plan or {}).items() if plan.get(c) != s),
    }


def objective(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    plan: dict[str, str],
    previous_plan: dict[str, str] | None = None,
) -> tuple:
    """Bo gia tri muc tieu theo dung thu tu uu tien, de so sanh hai bo giai."""
    m = metrics(fixture, scenario, plan, previous_plan)
    value = {k: (len(v) if isinstance(v, list) else v) for k, v in m.items()}
    return tuple(value[name] for name in preference_order(fixture, scenario))


def preferences_report(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    plan: dict[str, str],
    graduation_semester: str | None,
    previous_plan: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    m = metrics(fixture, scenario, plan, previous_plan)
    order = preference_order(fixture, scenario)
    out = [{"id": "S1", "detail": f"Học xong ở kỳ {graduation_semester}", "satisfied": True}]
    if m["S6"]:
        pairs = ", ".join(f"{r} trước {c}" for r, c in m["S6"])
        first = order.index("S6") < order.index("S1")
        hint = "" if first else "; có thể chọn \"Ưu tiên giữ khuyến nghị\" (có thể lùi kỳ tốt nghiệp)"
        out.append({"id": "S6", "detail": f"Không theo khuyến nghị: {pairs}{hint}", "satisfied": False,
                    "broken": [{"before": r, "course": c} for r, c in m["S6"]]})
    else:
        out.append({"id": "S6", "detail": "Giữ mọi khuyến nghị", "satisfied": True, "broken": []})
    for c in preferences(scenario)["wanted_courses"]:
        ok = c not in m["S4"]
        out.append({"id": "S4", "detail": f"Muốn học {c}" + ("" if ok else ": không đáp ứng được"),
                    "satisfied": ok})
    out.append({"id": "S2", "detail": f"Tổng {m['S2']} TC", "satisfied": True})
    if "S5" in order:
        out.append({"id": "S5", "detail": f"Kỳ nặng nhất {m['S5']} TC, nhẹ nhất {m['S5_min']} TC",
                    "satisfied": True})
    if "S7" in order:
        lo, hi = summer_preferred_load(fixture)
        loads = ", ".join(f"{s}: {v} TC" for s, v in sorted(m["S7_loads"].items())) or "không học hè"
        out.append({"id": "S7", "detail": f"Kỳ hè có học nên {lo}–{hi} TC ({loads})", "satisfied": m["S7"] == 0})
    if "S10" in order:
        out.append({"id": "S10", "detail": f"Học {m['S10']} TC ở kỳ hè (không tính thực tập)",
                    "satisfied": m["S10"] == 0})
    if "S9" in order:
        heavy = m["S9_courses"]
        out.append({"id": "S9", "detail": "Kỳ hè chỉ có môn đại cương, cơ sở ngành" if not heavy
                    else "Kỳ hè có môn ngành/chuyên ngành: " + ", ".join(heavy), "satisfied": not heavy})
    if "S11" in order:
        out.append({"id": "S11", "detail": "Mọi kỳ chính (trừ kỳ cuối) đủ 11 TC" if m["S11"] == 0
                    else f"Các kỳ chính thiếu tổng cộng {m['S11']} TC so với 11 TC (không học thừa để đủ)",
                    "satisfied": m["S11"] == 0})
    if "S8" in order:
        band = preferred_load(fixture, scenario)
        out.append({"id": "S8", "detail": f"Kỳ chính lệch khỏi khoảng {band[0]}–{band[1]} TC tổng cộng {m['S8']} TC",
                    "satisfied": m["S8"] == 0})
    if previous_plan:
        out.append({"id": "S3", "detail": f"{m['S3']} môn đổi so với lộ trình trước", "satisfied": True})
    return out


def warnings(fixture: dict[str, Any], scenario: dict[str, Any], plan: dict[str, str]) -> list[str]:
    fixture = normalize(fixture)
    out = []
    thesis = (fixture.get("graduation_courses") or {}).get("thesis")
    flags = fixture["student"].get("flags") or {}
    if thesis and thesis in plan:
        if flags.get("english_grad_reading") is False:
            out.append(f"Chưa đạt chuẩn tiếng Anh tốt nghiệp (Nghe–Đọc): phải đạt trước khi đăng ký {thesis} "
                       f"ở kỳ {plan[thesis]} (QĐ 285 Phụ lục 7)")
        if flags.get("mos") is False and fixture["curriculum"].get("cohort", 0) >= 2021:
            out.append(f"Chưa có chứng chỉ MOS: phải có trước khi đăng ký {thesis} ở kỳ {plan[thesis]} "
                       "(QĐ 285 Phụ lục 9)")
    base_min, _ = base_credit_limits(fixture)
    limits = credit_limits(fixture, scenario)
    for sem, (_, hi) in limits.items():
        if hi < base_min:
            out.append(f"Kỳ {sem}: bạn giới hạn {hi} TC, dưới mức tối thiểu {base_min}")
    # Song hanh xep cung ky: dang ky duoc, nhung C chi duoc cong nhan khi R dat (QD 285 Dieu 2).
    for rel in fixture["course_relations"]:
        c, r = rel["course_code"], rel["related_course_code"]
        if rel["type"] == "corequisite" and c in plan and plan.get(r) == plan[c]:
            out.append(f"{c} học cùng kỳ {plan[c]} với môn song hành {r}: {c} chỉ được tính tín chỉ "
                       f"khi {r} đạt; rớt {r} thì {c} không được công nhận (QĐ 285 Điều 2)")
    if plan:
        credits = {c["code"]: c["credits"] for c in fixture["courses"]}
        semesters = plan_semesters(fixture)
        last = max(plan.values(), key=semesters.index)
        loads = {s: 0 for s in semesters[: semesters.index(last) + 1]}
        for c, s in plan.items():
            loads[s] += credits[c]
        for s, load in loads.items():
            if is_summer(s) or load >= base_min:
                continue
            which = f"Kỳ cuối {s}" if s == last else f"Kỳ {s}"
            out.append(
                f"{which} chỉ {load} TC, dưới {base_min} TC của kỳ chính (không học thừa để đủ). "
                "QĐ 285 Điều 15.3 và 37.2 có thể buộc tạm dừng học khi đăng ký dưới mức tối thiểu: "
                "nên trao đổi với phòng đào tạo"
            )
    return out
