"""Validator doc lap: kiem tra mot lo trinh bang Python thuan.

Co y KHONG dung luat cua facts.py / solve.py / solve_cpsat.py / clingo, de loi
trong exporter hay encoding khong tu "xac nhan" chinh no. Chi dung chung buoc
chuan hoa du lieu ``normalize.py`` (doi hinh dang, khong chua luat).

Luu y: validator chi kiem tra TINH HOP LE, khong kiem tra toi uu, va van phu
thuoc vao viec chung ta hieu dung quy che.
"""

from __future__ import annotations

import math
import re
from typing import Any

from planner.facts import graduation_pairs
from planner.normalize import normalize


def validate_plan(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    plan: list[dict[str, Any]],
) -> list[str]:
    """Tra ve danh sach vi pham (rong = hop le).

    ``plan``: [{"semester_code": ..., "courses": [...]}, ...]
    """
    fixture = normalize(fixture)
    errors: list[str] = []
    order = {code: i for i, code in enumerate(fixture["semesters"])}
    current = order[fixture["student"]["current_semester"]]
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    cur = fixture["curriculum"]

    # Tinh trang sau ky hien tai, ap gia dinh cua kich ban.
    passed: set[str] = set()
    for sc in fixture["student"]["student_courses"]:
        code, status = sc["course_code"], sc["status"]
        if status == "completed":
            passed.add(code)
        elif status == "in-progress" and scenario["in_progress_results"][code] == "pass":
            passed.add(code)

    # Muc tin chi tung ky (tinh lai doc lap, khong dung facts.credit_limits).
    rules = fixture.get("rules") or {}
    base_min = rules.get("credits_min", cur["min_semester_credits"])
    base_max = rules.get("credits_max", cur["max_semester_credits"])
    if scenario.get("max_credits") is not None:
        base_max = min(base_max, scenario["max_credits"])

    def summer(sem_code: str) -> bool:
        return re.fullmatch(r"\d\d3", sem_code) is not None

    def limits_of(sem_code: str) -> tuple[int, int]:
        own = (scenario.get("semester_limits") or {}).get(sem_code, {})
        top = min(base_max, rules.get("summer_credits_max", 12)) if summer(sem_code) else base_max
        hi = min(top, own.get("max", top))
        lo = 0 if summer(sem_code) else own.get("min", 0)  # 11 TC chung la mem (19/11)
        return min(lo, hi), hi

    # Mon -> ky trong lo trinh.
    when: dict[str, int] = {}
    for sem in plan:
        code_s = sem["semester_code"]
        if code_s not in order or order[code_s] <= current:
            errors.append(f"ky {code_s} khong phai ky tuong lai hop le")
            continue
        for course in sem["courses"]:
            if course not in credits:
                errors.append(f"{course}: ma mon khong ton tai")
            elif course in when:
                errors.append(f"{course}: xep nhieu hon mot ky")
            elif course in passed:
                errors.append(f"{course}: da dat nhung van xep lai")
            else:
                when[course] = order[code_s]

    # Quan he giua cac mon.
    for rel in fixture["course_relations"]:
        course, related, kind = rel["course_code"], rel["related_course_code"], rel["type"]
        if course not in when:
            continue
        t = when[course]
        earlier = related in when and when[related] < t
        same = related in when and when[related] == t
        # QD 285 Dieu 2. "prior" bi bo (18/11); "recommended" la mem, khong xet o day.
        if kind == "prerequisite" and not (related in passed or earlier):
            errors.append(f"{course}: chua dat tien quyet {related}")
        elif kind == "corequisite" and not (related in passed or earlier or same):
            errors.append(f"{course}: thieu mon song hanh {related} (phai dat truoc hoac hoc cung ky)")

    # Mo mon va khoa mon.
    blocked = {
        (r["course_code"], r["semester_code"])
        for r in fixture["offerings"]["records"] if r["status"] == "not-offered"
    } | {(r["course_code"], r["semester_code"]) for r in scenario.get("not_offered", [])}
    sem_of = {i: code for code, i in order.items()}
    for course, t in when.items():
        if (course, sem_of[t]) in blocked:
            errors.append(f"{course}: khong mo ky {sem_of[t]}")
    for item in scenario.get("locked", []):
        if when.get(item["course_code"]) != order[item["semester_code"]]:
            errors.append(f"{item['course_code']}: khong nam o ky da khoa {item['semester_code']}")
    if scenario.get("graduate_by"):
        limit = order[scenario["graduate_by"]]
        for course, t in when.items():
            if t > limit:
                errors.append(f"{course}: xep sau han tot nghiep {scenario['graduate_by']}")

    # Cap do mon (QD 285 Dieu 15.4), nam hoc theo khoa.
    if rules.get("course_level"):
        cohort = cur["cohort"]
        for course, t in when.items():
            digits = [ch for ch in course if ch.isdigit()]
            head = course[: course.index(digits[0])] if digits else ""
            if not digits or not head.isalpha():
                continue
            level = int(digits[0])
            need = 1 if level <= 1 else 2 if level == 2 else 3
            year = int(sem_of[t][:2]) - cohort % 100 + 1
            if year < need:
                errors.append(f"{course}: cap {level} can nam {need}, ky {sem_of[t]} moi la nam {year}")

    # Ky he (H14): thuc tap luon duoc; mon khac chi khi sinh vien bat ky he do
    # va mon tung mo he trong lich su (neu fixture co lich su).
    internships = set(rules.get("summer_courses", []))
    opted = set(scenario.get("summer_opt_in") or [])
    history = fixture.get("summer_history")
    for course, t in when.items():
        sem_code = sem_of[t]
        if not summer(sem_code) or course in internships:
            continue
        if course in set(fixture.get("summer_excluded", [])):
            errors.append(f"{course}: do an khong xep vao ky he {sem_code}")
        elif sem_code not in opted:
            errors.append(f"{course}: ky he {sem_code} sinh vien chua bat, chi duoc xep thuc tap")
        # 22/11: o tu chon tu do (FREE_) dien mon nao cung duoc nen khong xet lich su; Q9 (offering_soft) thi
        # lich su mo lop la uu tien mem cua bo giai, khong phai loi (truoc day validator coi la luat cung).
        elif (history is not None and course not in history and not course.startswith("FREE_")
              and not (rules.get("offering_soft"))):
            errors.append(f"{course}: chua tung mo ky he, khong xep vao {sem_code}")

    # Mon tot nghiep (QD 285 Dieu 15.5): du TC tich luy den het ky hoc.
    thresholds = rules.get("graduation_thresholds", {})
    total_program = fixture.get("_total_credits")
    in_curr = {cc["course_code"] for cc in fixture["curriculum_courses"]}
    for kind, course in graduation_pairs(fixture):
        if course not in when or kind not in thresholds or not total_program:
            continue
        need = math.ceil(thresholds[kind] * total_program - 1e-9)
        have = (sum(credits[c] for c in passed if c in in_curr)
                + sum(credits[c] for c, t in when.items()
                      if t <= when[course] and c != course)
                + fixture.get("_free_outside_credits", 0))
        if have < need:
            errors.append(f"{course}: can {need} TC tich luy den het ky hoc (khong tinh mon nay), "
                          f"moi co {have}")

    # Tin chi moi ky.
    load: dict[int, int] = {}
    for course, t in when.items():
        load[t] = load.get(t, 0) + credits[course]
    last = max(load) if load else None
    for t in range(current + 1, (last or current) + 1):
        total = load.get(t, 0)
        lo, hi = limits_of(sem_of[t])
        if total > hi:
            errors.append(f"ky {sem_of[t]}: {total} TC vuot toi da {hi}")
        if t != last and total < lo:
            errors.append(f"ky {sem_of[t]}: {total} TC duoi toi thieu {lo}")

    # Yeu cau tot nghiep.
    done = passed | set(when)
    # Du khoi tu chon goc (ke ca mon se hoc) bu vao o tu chon tu do (giong solve_cpsat, 22/11).
    excess = sum(
        max(0, sum(credits[c] for c in g["members"] if c in done) - g["required_credits"])
        for g in fixture["course_groups"]
        if g["kind"] == "elective" and g.get("pool_scope", "listed") == "listed" and g["required_credits"]
        and not g.get("parent") and not g.get("specialization")
    )
    free_groups = [g for g in fixture["course_groups"] if g.get("_free_slots")]
    for group in fixture["course_groups"]:
        members = group["members"]
        if group.get("_free_slots") and members:
            per = credits[members[0]]
            have = sum(per for c in members if c in done) + (excess if len(free_groups) == 1 else 0)
            if have < per * len(members):
                errors.append(f"khoi '{group['name']}': {have}/{per * len(members)} TC tu chon tu do")
            continue
        if group["kind"] == "required":
            for course in members:
                if course not in done:
                    errors.append(f"thieu mon bat buoc {course}")
            continue
        got = [c for c in members if c in done]
        if group["required_credits"] is not None:
            total = sum(credits[c] for c in got)
            if total < group["required_credits"]:
                errors.append(
                    f"khoi '{group['name']}': {total}/{group['required_credits']} TC"
                )
        if group["required_count"] is not None and len(got) < group["required_count"]:
            errors.append(f"khoi '{group['name']}': {len(got)}/{group['required_count']} mon")

    return errors
