"""Bang ``requests``: moi yeu cau cua sinh vien duoc dap ung toi dau (sprint 11, 22/11).

Nguyen tac cua nguoi duyet: khong im lang bo yeu cau. Moi yeu cau (ghim, khoa ky, nghi ky,
so TC muon, mon muon hoc, han tot nghiep, mon khong mo) co mot dong ket qua:

- ``met``: dap ung dung nhu yeu cau.
- ``warning``: van dap ung (vd giu dung cho ghim) nhung trai luat cua truong; ``detail`` noi luat nao.
- ``partial``: dap ung mot phan (vd muon 15 TC, xep duoc 14).
- ``unmet``: khong dap ung; ``detail`` noi vi sao.

Chi doc ket qua (``plan``: ma mon -> ky), khong giai lai. Chu tieng Viet co dau vi hien thang
len giao dien.
"""

from __future__ import annotations

from typing import Any

from planner.model.facts import (
    assumed_fails,
    graduation_needs,
    is_summer,
    plan_semesters,
    preferences,
    summer_allowed,
)


def _passed(fixture: dict[str, Any], scenario: dict[str, Any]) -> set[str]:
    out = set()
    for sc in fixture["student"]["student_courses"]:
        if sc["status"] == "completed" or (
            sc["status"] == "in-progress" and scenario.get("in_progress_results", {}).get(sc["course_code"]) == "pass"
        ):
            out.add(sc["course_code"])
    return out


def _row(kind: str, item: str, status: str, detail: str) -> dict[str, str]:
    return {"kind": kind, "item": item, "status": status, "detail": detail}


def _pin_rule_breaks(fixture, scenario, plan, passed, credits, course, sem) -> list[str]:
    """Luat cua truong ma cho ghim (course, sem) trai; rong neu khong trai luat nao."""
    out = []
    for rel in fixture["course_relations"]:
        if rel["course_code"] != course or rel["related_course_code"] in passed:
            continue
        r, kind = rel["related_course_code"], rel["type"]
        when = plan.get(r)
        if kind == "prerequisite" and (when is None or when >= sem):
            out.append(f"chưa đạt tiên quyết {r} trước kỳ {sem}")
        elif kind == "corequisite" and (when is None or when > sem):
            out.append(f"chưa học song hành {r} trước hoặc cùng kỳ {sem}")
    need = graduation_needs(fixture).get(course)
    if need is not None:
        have = sum(credits.get(c, 0) for c in passed if c in credits) + fixture.get("_free_outside_credits", 0)
        have += sum(credits.get(c, 0) for c, s in plan.items() if s < sem)
        if have < need:
            out.append(f"cần tích lũy {need} TC trước kỳ {sem}, mới có {have}")
    if is_summer(sem) and not summer_allowed(fixture, scenario, course, sem):
        out.append(f"kỳ hè {sem} không xếp môn này")
    for rec in list(fixture["offerings"]["records"]) + list(scenario.get("not_offered", [])):
        if rec["course_code"] == course and rec["semester_code"] == sem and rec.get("status", "not-offered") == "not-offered":
            out.append(f"bạn khai môn không mở ở kỳ {sem}")
    return out


def requests_report(fixture: dict[str, Any], scenario: dict[str, Any], plan: dict[str, str] | None) -> list[dict[str, str]]:
    """Mot dong cho moi yeu cau cua sinh vien. ``plan`` None khi khong co lo trinh."""
    rows: list[dict[str, str]] = []
    passed = _passed(fixture, scenario)
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    future = plan_semesters(fixture)
    if plan is None:
        reason = "không có lộ trình thỏa mọi ràng buộc; xem phần giải thích"
        for item in scenario.get("locked", []):
            rows.append(_row("pin", f"{item['course_code']} → {item['semester_code']}", "unmet", reason))
        for sem, want in (scenario.get("semester_targets") or {}).items():
            rows.append(_row("target", f"{sem}: {want} TC", "unmet", reason))
        return rows

    # Ghim mon vao ky
    for item in scenario.get("locked", []):
        c, sem = item["course_code"], item["semester_code"]
        label = f"{c} → {sem}"
        if c in passed and plan.get(c) == sem:
            rows.append(_row("pin", label, "met", "học cải thiện: xếp đúng kỳ; không cộng thêm TC tích lũy"))
        elif plan.get(c) != sem:
            rows.append(_row("pin", label, "unmet", f"bộ giải xếp ở {plan.get(c, 'không kỳ nào')}"))
        else:
            breaks = _pin_rule_breaks(fixture, scenario, plan, passed, credits, c, sem)
            rows.append(_row("pin", label, "warning" if breaks else "met",
                             "giữ đúng chỗ ghim; lưu ý: " + "; ".join(breaks) if breaks else "giữ đúng chỗ ghim"))

    load = {s: sum(credits.get(c, 0) for c, t in plan.items() if t == s) for s in future}
    pinned_in = {}
    for item in scenario.get("locked", []):
        pinned_in.setdefault(item["semester_code"], []).append(item["course_code"])

    # So TC muon tung ky (Q5)
    for sem, want in (scenario.get("semester_targets") or {}).items():
        got = load.get(sem, 0)
        if got == want:
            rows.append(_row("target", f"{sem}: {want} TC", "met", f"xếp đúng {got} TC"))
        else:
            why = "không còn môn đủ điều kiện để thêm" if got < want else "không có tổ hợp môn vừa khít"
            status = "partial" if abs(got - want) <= 2 else "unmet"
            rows.append(_row("target", f"{sem}: {want} TC", status, f"xếp được {got} TC ({why})"))

    # Nghi ky, khoa ky
    for sem in scenario.get("skip_semesters", []):
        extra = pinned_in.get(sem, [])
        rows.append(_row("skip", sem, "warning" if extra else "met",
                         f"kỳ nghỉ nhưng bạn ghim {', '.join(extra)}; giữ chỗ ghim" if extra else "không xếp môn nào"))
    for sem in scenario.get("frozen_semesters", []):
        rows.append(_row("frozen", sem, "met", f"giữ đúng {load.get(sem, 0)} TC đang có"))

    # Mon muon hoc, han tot nghiep, mon khong mo
    for c in preferences(scenario)["wanted_courses"]:
        if c in passed:
            rows.append(_row("wanted", c, "met", "đã đạt"))
        elif c in plan:
            rows.append(_row("wanted", c, "met", f"xếp ở {plan[c]}"))
        else:
            rows.append(_row("wanted", c, "unmet", "chưa xếp được vào các kỳ còn lại"))
    deadline = scenario.get("graduate_by")
    if deadline:
        last = max(plan.values()) if plan else fixture["student"]["current_semester"]
        rows.append(_row("graduate_by", deadline, "met" if last <= deadline else "unmet",
                         f"học xong ở {last}" if last <= deadline else f"học xong ở {last}, trễ hơn hạn"))
    # Giai doan 12 (W1, W2): gia dinh rot mon trong lo trinh; "ky nay co mo".
    for c, sem in assumed_fails(scenario).items():
        again = plan.get(c)
        rows.append(_row("assumed_fail", f"{c} ở {sem}", "met" if again else "unmet",
                         f"học lại ở {again}" if again else "chưa xếp được lần học lại vào các kỳ còn lại"))
    for rec in scenario.get("offered") or []:
        c, sem = rec["course_code"], rec["semester_code"]
        rows.append(_row("offered", f"{c} ở {sem}", "met",
                         f"xếp ở {plan[c]}" if c in plan else "không xếp môn này"))
    for rec in scenario.get("not_offered", []):
        c, sem = rec["course_code"], rec["semester_code"]
        if plan.get(c) == sem:
            rows.append(_row("not_offered", f"{c} ở {sem}", "warning", "bạn ghim môn vào đúng kỳ này; giữ chỗ ghim"))
        else:
            rows.append(_row("not_offered", f"{c} ở {sem}", "met", "không xếp vào kỳ này"))
    return rows

