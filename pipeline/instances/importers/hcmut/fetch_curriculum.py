"""Dung fixture tu MOT chuong trinh that, qua API doc cong khai cua backend (chi GET).

    cd pipeline
    .venv/Scripts/python -m instances.importers.hcmut.fetch_curriculum CS-2023-KHMT instances/hcmut khmt2023-demo

Writes curricula/<code>/curriculum.json, students/<name>.json and requests/<name>.json
(instances/SCHEMA.md) through ``convert.from_planner_fixture``.

Khong co du lieu sinh vien: phan ``student`` la mot sinh vien BIA (khong ten,
khong MSSV) da hoc xong cac mon co ky khuyen nghi truoc ky hien tai.

Quy tac doi tu database sang fixture (cung la quy tac backend se dung o T15):
- Mon bat buoc = mon cua chuong trinh khong thuoc khoi tu chon goc nao (giong
  ``Frontend/src/pages/courses/analysis/analyze.ts``) va khong phai "dieu kien".
- Khoi con co ``parent_group_id`` (chuyen nganh) giu lai kem ``parent``, ``specialization``.
- Khoi ``pool_scope = any`` (tu chon tu do) giu nguyen; ``planner.model.normalize`` doi thanh o trong.
- Nhom "E. Dieu kien tot nghiep" -> ``conditions`` (khong xep vao ky).
- Nhom "D. Hoc phan tot nghiep" -> ``graduation_courses`` theo ten mon.
- ``summer_history``: mon tung mo o mot ky he (ma ky ket thuc bang 3) trong lich su.
- ``summer_excluded``: mon co chu "do an" trong ten, khong xep vao ky he (nguoi duyet 19/11).
- ``rules``: 11-25 TC/ky, he toi da 12 TC, khoang dep 15-18 TC (nguoi duyet 18-19/11).
"""

from __future__ import annotations

import json
import sys
import unicodedata
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from instances.importers.hcmut.convert import from_planner_fixture, write_instance

API = "http://localhost:3210/api/"


def get(path: str) -> Any:
    for attempt in range(8):
        try:
            time.sleep(0.2)
            with urllib.request.urlopen(API + path, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"API tu choi lien tuc (429): {path}")


def pages(path: str) -> list[dict[str, Any]]:
    out, page = [], 1
    while True:
        sep = "&" if "?" in path else "?"
        data = get(f"{path}{sep}page={page}&take=100")
        if isinstance(data, list):
            return data
        out += data["data"]
        if not data.get("pagination", {}).get("hasNextPage"):
            return out
        page += 1


def graduation_kind(name: str) -> str | None:
    low = name.lower()
    if "thực tập" in low:
        return "internship"
    if "chuyên ngành" in low:
        return "specialized_project"
    if any(k in low for k in ("tốt nghiệp", "luận văn", "khóa luận", "khoá luận", "capstone")):
        return "thesis"
    return None


def semesters_for(cohort: int, main_count: int = 12) -> list[str]:
    out, yy = [], cohort % 100
    while sum(1 for s in out if s[-1] != "3") < main_count:
        out += [f"{yy}1", f"{yy}2", f"{yy}3"]
        yy += 1
    return out


def build(code: str) -> dict[str, Any]:
    cur = next(c for c in pages("curricula") if c["code"] == code)
    cid = cur["id"]
    items = pages(f"curricula/{cid}/courses")
    course_of = {it["course_id"]: it["course"] for it in items}
    code_of = {k: v["code"] for k, v in course_of.items()}
    groups = pages(f"curricula/{cid}/groups")
    specs = {s["id"]: s["code"] for s in pages(f"curricula/{cid}/specializations")}
    cats = {c["name"]: [m["course"]["code"] for m in c["members"]] for c in pages(f"curricula/{cid}/categories")}
    conditions = sorted(next((v for k, v in cats.items() if k.startswith("E.")), []))
    grad_codes = next((v for k, v in cats.items() if k.startswith("D.")), [])

    out_groups, in_root = [], set()
    name_of = {g["id"]: g["name"] for g in groups}
    for g in groups:
        members = [code_of[m["course_id"]] for m in pages(f"curricula/{cid}/groups/{g['id']}/members")
                   if m["course_id"] in code_of]
        entry = {
            "name": g["name"], "kind": g["kind"], "required_count": g["required_count"],
            "required_credits": g["required_credits"], "pool_scope": g["pool_scope"],
            "pool_course_credits": g["pool_course_credits"], "members": sorted(members),
        }
        if g["parent_group_id"]:
            entry["parent"] = name_of[g["parent_group_id"]]
            entry["specialization"] = specs.get(g["specialization_id"])
        elif g["pool_scope"] == "listed":
            in_root.update(members)
        out_groups.append(entry)
    required = sorted(c for c in code_of.values() if c not in in_root and c not in conditions)
    out_groups.insert(0, {"name": "Bat buoc (suy ra)", "kind": "required", "required_count": None,
                          "required_credits": None, "pool_scope": "listed", "members": required})

    relations = [
        {"course_code": r["course_code"], "related_course_code": r["related_course_code"],
         "type": r["type"], "source": "curriculum"}
        for r in pages(f"curricula/{cid}/relations")
        if r["course_code"] in code_of.values() and r["related_course_code"] in code_of.values()
    ]
    names = {v["code"]: v["name"] for v in course_of.values()}
    internship = {c for c in grad_codes if graduation_kind(names[c]) == "internship"}
    summer_excluded = sorted(c for c, nm in names.items()
                             if "đồ án" in unicodedata.normalize("NFC", nm).lower()
                             and c not in internship)
    summer_history = sorted({code_of[o["course_id"]] for o in pages(f"curricula/{cid}/opened-semesters")
                             if o["semester_code"].endswith("3") and o["course_id"] in code_of})
    graduation = {graduation_kind(names[c]): c for c in grad_codes if graduation_kind(names[c])}
    cohort = cur["cohort"]
    sems = semesters_for(cohort)
    current = f"{cohort % 100 + 2}2"  # sinh vien bia: dang hoc ky 2 nam 3
    done_before = {(y, t) for y in range(1, 4) for t in (1, 2)} - {(3, 2)}
    student_courses = []
    for it in items:
        c = it["course"]["code"]
        if c in conditions:
            continue
        y, t = it["recommended_year"], it["recommended_term"]
        if (y, t) in done_before:
            student_courses.append({"course_code": c, "status": "completed"})
        elif (y, t) == (3, 2) and c not in grad_codes:
            student_courses.append({"course_code": c, "status": "in-progress"})
    return {
        "schema_version": 1,
        "_note": f"Lay tu API doc cong khai ngay {time.strftime('%Y-%m-%d')}. Sinh vien la BIA.",
        "curriculum": {"code": cur["code"], "name": cur["name"], "cohort": cohort,
                       "duration_years": cur["duration_years"],
                       "min_semester_credits": cur["min_semester_credits"],
                       "max_semester_credits": cur["max_semester_credits"]},
        "rules": {"credits_min": 11, "credits_max": 25, "course_level": True,
                  "summer_credits_max": 12, "preferred_load": [15, 18], "summer_preferred_load": [6, 9],
                  "summer_courses": [graduation["internship"]] if "internship" in graduation else [],
                  "graduation_thresholds": {"internship": 0.65, "specialized_project": 0.70, "thesis": 0.85}},
        "semesters": sems,
        "courses": sorted(({"code": v["code"], "name": v["name"], "credits": v["credits"]}
                           for v in course_of.values()), key=lambda c: c["code"]),
        "curriculum_courses": sorted(({"course_code": it["course"]["code"],
                                       "recommended_year": it["recommended_year"],
                                       "recommended_term": it["recommended_term"]} for it in items),
                                     key=lambda c: c["course_code"]),
        "course_relations": sorted(relations, key=lambda r: (r["course_code"], r["related_course_code"])),
        "course_groups": out_groups,
        "conditions": conditions,
        "summer_history": summer_history,
        "summer_excluded": summer_excluded,
        "graduation_courses": graduation,
        "offerings": {"unknown_policy": "assume-open", "records": []},
        "student": {"current_semester": current, "source": "simulated",
                    "target_specialization": None, "student_courses": student_courses},
        "scenarios": [{"id": "base", "label": "Sinh vien bia, dau het mon dang hoc",
                       "in_progress_results": {sc["course_code"]: "pass" for sc in student_courses
                                               if sc["status"] == "in-progress"}}],
    }


def main(argv: list[str] | None = None) -> None:
    code, university, name = argv if argv is not None else sys.argv[1:4]
    data = build(code)
    for path in write_instance(Path(university), from_planner_fixture(data, name), name):
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
