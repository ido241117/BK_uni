"""Giai doan 3: ban chup quan he mon cua moi chuong trinh, do do nhat quan, va tang
du lieu tien quyet co nhan nguon.

    cd pipeline
    .venv/Scripts/python -m planner.relations snapshot planner/data/relations-snapshot.json
    .venv/Scripts/python -m planner.relations report planner/data/relations-snapshot.json
    .venv/Scripts/python -m planner.relations coverage planner/data/relations-snapshot.json planner/fixtures/khmt2023.json

Nguon cua mot quan he trong dau vao bo giai (``source``):
    curriculum  co trong chuong trinh cua sinh vien
    inferred    suy ra tu chuong trinh KHAC: cung cap mon, cung loai, xuat hien trong
                it nhat ``INFER_MIN_SHARE`` so chuong trinh co ca hai mon, va mon do
                khong co quan he cung loai nao trong chuong trinh cua sinh vien
Chi suy ra tien quyet (TQ) va song hanh (SH); khuyen nghi (KN) khong suy ra; hoc truoc
(HT) bi bo tu 18/11.
"""

from __future__ import annotations

import collections
import json
import sys
import time
from pathlib import Path
from typing import Any

INFER_TYPES = ("prerequisite", "corequisite")
INFER_MIN_SHARE = 0.5


# --- T12: ban chup ---------------------------------------------------------------

def take_snapshot() -> dict[str, Any]:
    from planner.fetch_curriculum import pages

    curricula = pages("curricula")
    out = []
    for cur in curricula:
        courses = sorted({it["course"]["code"] for it in pages(f"curricula/{cur['id']}/courses")})
        rels = sorted(
            ({"course_code": r["course_code"], "related_course_code": r["related_course_code"], "type": r["type"]}
             for r in pages(f"curricula/{cur['id']}/relations")),
            key=lambda r: (r["course_code"], r["related_course_code"], r["type"]),
        )
        out.append({"code": cur["code"], "cohort": cur["cohort"], "courses": courses, "relations": rels})
    return {
        "taken_at": time.strftime("%Y-%m-%d"),
        "source": "GET /api/curricula, /api/curricula/:id/courses, /api/curricula/:id/relations (doc cong khai)",
        "curricula_count": len(out),
        "relations_count": sum(len(c["relations"]) for c in out),
        "curricula": sorted(out, key=lambda c: c["code"]),
    }


# --- T13: do nhat quan -------------------------------------------------------------

def consistency(snapshot: dict[str, Any], types: tuple[str, ...] = INFER_TYPES) -> dict[str, Any]:
    """Voi moi mon co mat o >= 2 chuong trinh: tap quan he (loai, mon lien quan) co giong nhau khong.

    Chi so sanh quan he ma mon lien quan cung co trong chuong trinh do, de chuong trinh
    khong co mon R khong bi tinh la "thieu quan he voi R".
    """
    per_course: dict[str, list[frozenset]] = collections.defaultdict(list)
    for cur in snapshot["curricula"]:
        rel_of: dict[str, set] = collections.defaultdict(set)
        for r in cur["relations"]:
            if r["type"] in types:
                rel_of[r["course_code"]].add((r["type"], r["related_course_code"]))
        for c in cur["courses"]:
            per_course[c].append(frozenset(rel_of.get(c, set())))
    same, differ = [], []
    for c, sets in per_course.items():
        if len(sets) < 2:
            continue
        (same if len(set(sets)) == 1 else differ).append(c)
    detail = {}
    for c in sorted(differ):
        variants = collections.Counter(per_course[c])
        detail[c] = [{"relations": sorted(f"{t}:{r}" for t, r in v), "curricula": n}
                     for v, n in variants.most_common()]
    return {"types": list(types), "courses_in_2plus": len(same) + len(differ),
            "same_everywhere": len(same), "differ": len(differ), "differ_detail": detail}


# --- T14: tang du lieu tien quyet -------------------------------------------------

def enrich(fixture: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any]:
    """Them quan he ``inferred`` cho mon thieu quan he trong chuong trinh cua sinh vien.

    Tra ve fixture moi; moi quan he co ``source``. Ghi ``unverified_prerequisites``:
    mon cua chuong trinh khong co quan he TQ/SH o bat ky nguon nao (co the that su
    khong co tien quyet, hoac du lieu thieu).
    """
    fx = json.loads(json.dumps(fixture))
    own_code = fx["curriculum"]["code"]
    in_curr = {cc["course_code"] for cc in fx["curriculum_courses"]}
    for r in fx["course_relations"]:
        r.setdefault("source", "curriculum")
    has_type = {(r["course_code"], r["type"]) for r in fx["course_relations"]}

    others = [cur for cur in snapshot["curricula"] if cur["code"] != own_code]
    support: collections.Counter = collections.Counter()
    for cur in others:
        for key in {(r["course_code"], r["related_course_code"], r["type"]) for r in cur["relations"]
                    if r["type"] in INFER_TYPES}:
            support[key] += 1
    code_sets = [set(cur["courses"]) for cur in others]
    both = {(c, rc): sum(1 for codes in code_sets if c in codes and rc in codes) for c, rc, _ in support}

    added = []
    for (c, rc, t), n in sorted(support.items()):
        if c not in in_curr or rc not in in_curr or (c, t) in has_type:
            continue
        share = n / both[(c, rc)] if both[(c, rc)] else 0
        if share >= INFER_MIN_SHARE:
            added.append({"course_code": c, "related_course_code": rc, "type": t, "source": "inferred",
                          "inferred_from": f"{n}/{both[(c, rc)]} chuong trinh khac"})
    fx["course_relations"] += added

    with_any = {r["course_code"] for r in fx["course_relations"] if r["type"] in INFER_TYPES}
    with_any |= {r["related_course_code"] for r in fx["course_relations"] if r["type"] in INFER_TYPES}
    fx["unverified_prerequisites"] = sorted(c for c in in_curr if c not in with_any)
    fx["relations_snapshot"] = snapshot.get("taken_at")
    return fx


def coverage(fixture: dict[str, Any]) -> dict[str, Any]:
    in_curr = {cc["course_code"] for cc in fixture["curriculum_courses"]}
    src: dict[str, set] = collections.defaultdict(set)
    for r in fixture["course_relations"]:
        if r["type"] in INFER_TYPES:
            src[r["course_code"]].add(r.get("source", "curriculum"))
    n = len(in_curr)
    cur = sum(1 for c in in_curr if "curriculum" in src.get(c, ()))
    inf = sum(1 for c in in_curr if src.get(c) == {"inferred"})
    return {"courses": n, "with_curriculum_relation": cur, "with_only_inferred_relation": inf,
            "without_relation_as_course": n - cur - inf,
            "unverified_prerequisites": len(fixture.get("unverified_prerequisites", []))}


def load(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1]
    if cmd == "snapshot":
        snap = take_snapshot()
        out = Path(sys.argv[2])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(snap, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"da ghi {out}: {snap['curricula_count']} chuong trinh, {snap['relations_count']} quan he, "
              f"ngay {snap['taken_at']}")
    elif cmd == "report":
        rep = consistency(load(sys.argv[2]))
        print(json.dumps({k: v for k, v in rep.items() if k != "differ_detail"}, ensure_ascii=False, indent=1))
        for c, variants in list(rep["differ_detail"].items())[: int(sys.argv[3]) if len(sys.argv) > 3 else 15]:
            print(c, variants)
    elif cmd == "coverage":
        fx = enrich(load(sys.argv[3]), load(sys.argv[2]))
        print(json.dumps(coverage(fx), ensure_ascii=False, indent=1))
        for r in fx["course_relations"]:
            if r["source"] == "inferred":
                print("  suy ra:", r["course_code"], r["type"], r["related_course_code"], r["inferred_from"])
    else:
        raise SystemExit(f"lenh la: {cmd}")


if __name__ == "__main__":
    main()
