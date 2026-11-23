"""Chuan hoa fixture TRUOC khi giai. Chi doi hinh dang du lieu, khong chua luat.

Ca hai bo giai, validator va bao cao deu goi ``normalize`` (idempotent), nen ca
ba cung nhin mot du lieu. Cac buoc:

1. Mon "dieu kien" (``conditions``, vd ENG_GC, SA4001) bi bo khoi chuong trinh:
   khong phai lop hoc, khong xep vao ky.
2. Khoi con theo chuyen nganh (co ``parent``): neu sinh vien chon chuyen nganh
   (``student.target_specialization``), danh sach mon cua khoi goc thu lai con
   danh sach cua khoi con do (H15). Khong chon thi bo cac khoi con.
3. Khoi tu chon tu do (``pool_scope = "any"``, H13) doi thanh cac o trong
   ``FREE_k`` bat buoc, moi o ``pool_course_credits`` TC, khong co tien quyet.
   Tru truoc phan hoc vuot cac nhom tu chon (mon trong chuong trinh), roi moi
   tru mon da dat ngoai chuong trinh (thu tu cua file tien do myBK).
4. Ghi ``_total_credits`` = tong TC chuong trinh (bat buoc + nguong cac khoi
   goc), dung cho nguong mon tot nghiep (QD 285 Dieu 15.5).
"""

from __future__ import annotations

import copy
import math
from typing import Any

from planner.facts import FixtureError

DEFAULT_FREE_SLOT_CREDITS = 3


def normalize(fixture: dict[str, Any]) -> dict[str, Any]:
    if fixture.get("_normalized"):
        return fixture
    fx = copy.deepcopy(fixture)
    credits = {c["code"]: c["credits"] for c in fx["courses"]}
    groups = fx["course_groups"]
    for g in groups:
        g.setdefault("pool_scope", "listed")
        if g["pool_scope"] not in ("listed", "any"):
            raise FixtureError(f"pool_scope khong ho tro: {g['pool_scope']}")

    # 0. Khoi sinh vien tu chon cho mon (T46, 22/11, nguoi duyet: hoan toan ton trong lua chon cua sinh vien):
    #    ``student.block_overrides`` = {ma mon: ten khoi}. Mon bi bo khoi moi khoi cu; vao khoi ``listed`` thi
    #    thanh thanh vien khoi do; vao khoi ``any`` (tu chon tu do) thi tin chi tinh vao tu chon tu do.
    by_group = {g["name"]: g for g in groups}
    overrides = {code: name for code, name in (fx["student"].get("block_overrides") or {}).items()
                 if name in by_group and code in credits}
    for code, name in overrides.items():
        for g in groups:
            g["members"] = [c for c in g["members"] if c != code]
        if by_group[name]["pool_scope"] == "listed":
            by_group[name]["members"].append(code)
    to_listed = {c for c, n in overrides.items() if by_group[n]["pool_scope"] == "listed"}
    to_free = {c for c, n in overrides.items() if by_group[n]["pool_scope"] == "any"}
    # Mon ngoai CTDT vao khoi listed: bo giai chi xet mon trong ``curriculum_courses`` nen them vao do.
    listed_curriculum = {cc["course_code"] for cc in fx["curriculum_courses"]}
    for code in sorted(to_listed - listed_curriculum):
        fx["curriculum_courses"].append({"course_code": code, "recommended_year": None, "recommended_term": None})

    # 1. Mon dieu kien.
    conditions = set(fx.get("conditions", []))
    # Trang thai mon dieu kien truoc khi bo: engine ASP dung lam external_requirement.
    fx["_condition_statuses"] = {sc["course_code"]: sc["status"] for sc in fx["student"]["student_courses"]
                                 if sc["course_code"] in conditions}
    if conditions:
        fx["curriculum_courses"] = [cc for cc in fx["curriculum_courses"] if cc["course_code"] not in conditions]
        for g in groups:
            g["members"] = [c for c in g["members"] if c not in conditions]
        fx["course_relations"] = [r for r in fx["course_relations"]
                                  if r["course_code"] not in conditions and r["related_course_code"] not in conditions]
        fx["student"]["student_courses"] = [sc for sc in fx["student"]["student_courses"]
                                            if sc["course_code"] not in conditions]

    # 2. Chuyen nganh.
    target = fx["student"].get("target_specialization")
    children = [g for g in groups if g.get("parent")]
    # Khoi con theo chuyen nganh truoc khi gop: engine ASP dung lam major/major_course.
    fx["_specializations"] = [
        {"code": g.get("specialization"), "name": g["name"], "members": list(g["members"]),
         "required_count": g.get("required_count"), "required_credits": g.get("required_credits")}
        for g in children if g.get("specialization")
    ]
    if target is not None:
        chosen = [g for g in children if g.get("specialization") == target]
        if not chosen:
            raise FixtureError(f"khong co khoi con cho chuyen nganh '{target}'")
        by_name = {g["name"]: g for g in groups}
        for child in chosen:
            parent = by_name.get(child["parent"])
            if parent is None:
                raise FixtureError(f"khoi con '{child['name']}' tro toi khoi goc khong ton tai")
            keep = set(child["members"])
            parent["members"] = [c for c in parent["members"] if c in keep]
            parent["name"] = f"{parent['name']} [{target}]"
    groups = [g for g in groups if not g.get("parent")]

    # 4 (tinh truoc khi doi khoi tu do). Tong TC chuong trinh.
    total = 0
    for g in groups:
        if g["kind"] == "required":
            total += sum(credits[c] for c in g["members"])
        else:
            total += g["required_credits"] or 0

    # 3. Tu chon tu do -> o trong. Thu tu tinh tin chi theo file tien do myBK:
    #    bat buoc > tu chon > tu chon tu do; khi xet tu chon tu do thi mon TRONG
    #    chuong trinh (phan hoc vuot nhom tu chon) truoc, mon NGOAI chuong trinh sau.
    in_curriculum = {cc["course_code"] for cc in fx["curriculum_courses"]}
    #    Mon dang hoc gia dinh dau (``_assumed_pass``, cli.run ghi theo kich ban) tinh nhu da dat (22/11:
    #    truoc day mon ngoai CTDT dang hoc khong duoc tru, lo trinh xep du mot o tu chon tu do).
    completed = {sc["course_code"] for sc in fx["student"]["student_courses"] if sc["status"] == "completed"}
    completed |= set(fx["student"].get("_assumed_pass") or [])
    excess = 0
    for g in groups:
        if g["kind"] == "elective" and g["pool_scope"] == "listed" and g["required_credits"]:
            got = sum(credits[c] for c in g["members"] if c in completed)
            excess += max(0, got - g["required_credits"])
    outside = sum(credits.get(c, 0) for c in completed if c not in in_curriculum or c in to_free)
    #    Giai doan 12 (T62, 23/11): mon NGOAI chuong trinh sinh vien go ma vao o tu chon tu do
    #    (``student.free_choices``, backend ghim kem). Tru vao o trong sau mon da dat; mon nay thanh khoi
    #    bat buoc rieng de bo giai xep dung cho ghim.
    planned_free = sorted({c for c in fx["student"].get("free_choices") or []
                           if c in credits and c not in in_curriculum and c not in completed})
    planned_credits = sum(credits[c] for c in planned_free)
    out_groups = []
    for k, g in enumerate(groups, start=1):
        if g["pool_scope"] != "any":
            out_groups.append(g)
            continue
        need = g["required_credits"] or 0
        per = g.get("pool_course_credits") or DEFAULT_FREE_SLOT_CREDITS
        used_excess = min(excess, need)
        excess -= used_excess
        used_outside = min(outside, need - used_excess)
        outside -= used_outside
        used_planned = min(planned_credits, need - used_excess - used_outside)
        planned_credits -= used_planned
        left = max(0, need - used_excess - used_outside - used_planned)
        slots = [f"FREE_{k}_{j}" for j in range(1, math.ceil(left / per) + 1)]
        for code in slots:
            fx["courses"].append({"code": code, "name": f"O tu chon tu do ({g['name']})", "credits": per})
            fx["curriculum_courses"].append({"course_code": code, "recommended_year": None,
                                             "recommended_term": None})
        out_groups.append({"name": f"{g['name']} (o trong)", "kind": "required", "required_count": None,
                           "required_credits": None, "pool_scope": "listed", "members": slots,
                           "_free_slots": True})
        fx.setdefault("_free_outside_credits", 0)
        fx["_free_outside_credits"] += used_outside
    if planned_free:
        for code in planned_free:
            fx["curriculum_courses"].append({"course_code": code, "recommended_year": None, "recommended_term": None})
        out_groups.append({"name": "Tu chon tu do ban chon", "kind": "required", "required_count": None,
                           "required_credits": None, "pool_scope": "listed", "members": planned_free})
    fx["course_groups"] = out_groups
    fx["_total_credits"] = total
    fx["_normalized"] = True
    return fx
