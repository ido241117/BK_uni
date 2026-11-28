"""Tinh lai cac chi so mong muon mem va canh bao tu MOT lo trinh da co.

Dung chung cho ca hai bo giai (sau khi giai xong) va cho ``compare.py``. Khong
tham gia vao viec giai. Validator (``validate.py``) khong dung file nay.
"""

from __future__ import annotations

from typing import Any

from planner.model.facts import (
    DEFAULT_SUMMER_MAX,
    graduation_pairs,
    offered_pairs,
    offered_terms,
    offering_soft,
    base_credit_limits,
    credit_limits,
    is_summer,
    plan_semesters,
    SOLVER_GOALS,
    preference_order,
    preferences,
    preferred_load,
    summer_courses,
    summer_preferred_load,
    summer_specialized,
)
from planner.model.normalize import normalize


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
    # ST, OH (sprint 11) chua co trong metrics: tinh 0 khi so sanh hai bo giai.
    # Solver-specific goals (facts.SOLVER_GOALS) are left out: they are not comparable across solvers.
    return tuple(value.get(name, 0) for name in preference_order(fixture, scenario) if name not in SOLVER_GOALS)


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
        # Sinh vien co the tat S6/S1 (sprint 11): goi y chi khi S6 dang xep sau S1.
        first = "S6" not in order or "S1" not in order or order.index("S6") < order.index("S1")
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


def warning_items(fixture: dict[str, Any], scenario: dict[str, Any], plan: dict[str, str]) -> list[dict[str, Any]]:
    """Canh bao co cau truc (22/11): giao dien gan vao dung mon / dung ky, loi nhe nhang (``message``).

    ``text`` la cau cu (giu nguyen de ``warnings`` va test cu khong doi). ``confirm``: canh bao chi la nhac,
    sinh vien tu xac nhan duoc (vd da dat chuan tieng Anh) thi giao dien hien nut xac nhan.
    """
    fixture = normalize(fixture)
    out: list[dict[str, Any]] = []
    thesis = next((c for k, c in graduation_pairs(fixture) if k == "thesis"), None)
    flags = fixture["student"].get("flags") or {}
    if thesis and thesis in plan:
        if flags.get("english_grad_reading") is False:
            out.append({
                "kind": "english", "course": thesis, "semester": plan[thesis], "confirm": "english",
                "text": f"Chưa đạt chuẩn tiếng Anh tốt nghiệp (Nghe–Đọc): phải đạt trước khi đăng ký {thesis} "
                        f"ở kỳ {plan[thesis]} (QĐ 285 Phụ lục 7)",
                "message": "Môn này cần chuẩn tiếng Anh tốt nghiệp (Nghe–Đọc) trước khi đăng ký. "
                           "Nếu bạn đạt rồi thì bấm xác nhận nhé.",
            })
        if flags.get("mos") is False and fixture["curriculum"].get("cohort", 0) >= 2021:
            out.append({
                "kind": "mos", "course": thesis, "semester": plan[thesis], "confirm": "mos",
                "text": f"Chưa có chứng chỉ MOS: phải có trước khi đăng ký {thesis} ở kỳ {plan[thesis]} "
                        "(QĐ 285 Phụ lục 9)",
                "message": "Môn này cần chứng chỉ MOS trước khi đăng ký. Nếu bạn có rồi thì bấm xác nhận nhé.",
            })
    base_min, _ = base_credit_limits(fixture)
    limits = credit_limits(fixture, scenario)
    for sem, (_, hi) in limits.items():
        if hi < base_min:
            out.append({
                "kind": "limit", "semester": sem,
                "text": f"Kỳ {sem}: bạn giới hạn {hi} TC, dưới mức tối thiểu {base_min}",
                "message": f"Bạn đặt tối đa {hi} TC, thấp hơn mức tối thiểu {base_min} TC của kỳ chính.",
            })
    # Song hanh xep cung ky: dang ky duoc, nhung C chi duoc cong nhan khi R dat (QD 285 Dieu 2).
    for rel in fixture["course_relations"]:
        c, r = rel["course_code"], rel["related_course_code"]
        if rel["type"] == "corequisite" and c in plan and plan.get(r) == plan[c]:
            out.append({
                "kind": "corequisite", "course": c, "semester": plan[c],
                "text": f"{c} học cùng kỳ {plan[c]} với môn song hành {r}: {c} chỉ được tính tín chỉ "
                        f"khi {r} đạt; rớt {r} thì {c} không được công nhận (QĐ 285 Điều 2)",
                "message": f"Học cùng kỳ với {r}. Môn này chỉ được công nhận khi {r} đạt.",
            })
    if plan:
        credits = {c["code"]: c["credits"] for c in fixture["courses"]}
        semesters = plan_semesters(fixture)
        last = max(plan.values(), key=semesters.index)
        loads = {s: 0 for s in semesters[: semesters.index(last) + 1]}
        for c, s in plan.items():
            loads[s] += credits[c]
        for s, load in loads.items():
            # The last term may hold fewer credits than the minimum (university practice, 28/11/2026).
            if is_summer(s) or load >= base_min or s == last:
                continue
            which = f"Kỳ {s}"
            out.append({
                "kind": "low_credits", "semester": s,
                "text": f"{which} chỉ {load} TC, dưới {base_min} TC của kỳ chính (không học thừa để đủ). "
                        "QĐ 285 Điều 15.3 và 37.2 có thể buộc tạm dừng học khi đăng ký dưới mức tối thiểu: "
                        "nên trao đổi với phòng đào tạo",
                "message": f"Kỳ này có {load} TC, dưới mức tối thiểu {base_min} TC. "
                           "Nếu cần, bạn hỏi phòng đào tạo nhé.",
            })
    out += _extra_items(fixture, scenario, plan)
    for item in out:
        item.setdefault("rule", RULE_OF_KIND.get(item["kind"]))
    return out


# T56 (23/11): moi loai canh bao gan dieu cua QD 285 (docs/CONSTRAINTS.md, section 5); luat nhom tu dat ghi ro.
RULE_OF_KIND = {
    "english": "QĐ 285 Phụ lục 7",
    "mos": "QĐ 285 Phụ lục 9",
    "limit": "QĐ 285 Điều 15.3",
    "corequisite": "QĐ 285 Điều 2.1",
    "low_credits": "QĐ 285 Điều 15.3, 37.2",
    "skip_consecutive": "QĐ 285 Điều 32.1",
    "target_over_law": "QĐ 285 Điều 15.3 (mức 11–25 do nhóm chọn)",
    "offering_history": "Lịch sử mở lớp (nhóm tự đặt, không phải quy định)",
}

TERM_NAME = {"1": "kỳ 1", "2": "kỳ 2", "3": "kỳ hè"}


def _extra_items(fixture: dict[str, Any], scenario: dict[str, Any], plan: dict[str, str]) -> list[dict[str, Any]]:
    """Giai doan 12 (T52, T55): nghi 2 ky chinh lien tiep, o TC vuot luat, mon xep vao loai ky chua tung mo."""
    out: list[dict[str, Any]] = []
    semesters = plan_semesters(fixture)
    mains = [s for s in semesters if not is_summer(s)]
    skipped = set(scenario.get("skip_semesters") or [])
    for a, b in zip(mains, mains[1:]):
        if a in skipped and b in skipped:
            out.append({
                "kind": "skip_consecutive", "semester": a,
                "text": f"Nghỉ liên tiếp kỳ {a} và {b}: cần làm đơn xin phép Phòng Đào tạo (nghỉ học tạm thời tối đa 4 kỳ)",
                "message": f"Bạn nghỉ cả {a} và {b}. Nghỉ từ 2 kỳ chính liên tiếp cần làm đơn xin phép Phòng Đào tạo.",
            })
    _, base_max = base_credit_limits(fixture)
    summer_max = (fixture.get("rules") or {}).get("summer_credits_max", DEFAULT_SUMMER_MAX)
    for sem, want in (scenario.get("semester_targets") or {}).items():
        law = summer_max if is_summer(sem) else base_max
        if want > law:
            out.append({
                "kind": "target_over_law", "semester": sem,
                "text": f"Kỳ {sem}: bạn muốn {want} TC, vượt mức {law} TC; vẫn xếp theo ý bạn",
                "message": f"Bạn muốn {want} TC, vượt mức {law} TC. Web vẫn xếp theo ý bạn, nhớ hỏi phòng đào tạo nhé.",
            })
    if offering_soft(fixture):
        ok = offered_pairs(scenario)
        for c, sem in plan.items():
            terms = offered_terms(fixture, c)
            if terms is None or sem[-1] in terms or (c, sem) in ok:
                continue
            out.append({
                "kind": "offering_history", "course": c, "semester": sem, "confirm": "offered",
                "text": f"{c} chưa từng mở {TERM_NAME.get(sem[-1], 'loại kỳ này')} trong lịch sử mở lớp, xếp ở {sem}",
                "message": f"Môn này chưa từng mở {TERM_NAME.get(sem[-1], 'loại kỳ này')}. Nếu biết kỳ {sem} có mở, bấm \"Kỳ này có mở\".",
            })
    return out


def warnings(fixture: dict[str, Any], scenario: dict[str, Any], plan: dict[str, str]) -> list[str]:
    return [item["text"] for item in warning_items(fixture, scenario, plan)]
