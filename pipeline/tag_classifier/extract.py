"""Bước 1a: đọc database (chỉ đọc) -> data/snapshot/.

Đây là bước duy nhất chạm vào database. Các bước sau (và notebook Colab) chỉ dùng snapshot, nên
thông tin đăng nhập database không rời máy.

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.extract

Ghi ra:
    curricula.json      chương trình: hồ sơ (profile), chuyên ngành, khối, nhóm môn, danh sách môn
    courses.json        các môn có trong ít nhất một chương trình (mã, tên, tín chỉ)
    outlines.jsonl.gz   mọi phiên bản đề cương của các môn đó (nội dung đầy đủ)
    manifest.json       thời điểm trích, số dòng mỗi loại
"""

from __future__ import annotations

import argparse
import datetime as dt
from collections import defaultdict
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from tag_classifier.common import load_config, resolve, utf8_stdout, write_json, write_jsonl


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'\"")
    return env


def connect(env: dict[str, str]) -> psycopg.Connection:
    conn = psycopg.connect(
        host=env["DB_HOST"], port=int(env.get("DB_PORT") or 5432), user=env["DB_USERNAME"],
        password=env["DB_PASSWORD"], dbname=env["DB_NAME"],
        sslmode="require" if env.get("DB_SSL_MODE") == "require" else "disable",
        row_factory=dict_row,
    )
    conn.read_only = True  # mọi giao dịch của kết nối này là READ ONLY
    return conn


QUERIES = {
    "curricula": """select id, code, name, name_en, major, faculty, cohort, source_code,
                           profile_source_code, profile
                    from {s}.curricula order by code""",
    "specializations": """select id, curriculum_id, code, name, description
                          from {s}.curriculum_specializations""",
    "groups": """select id, curriculum_id, name, kind::text as kind, specialization_id, parent_group_id,
                        required_count, required_credits, pool_scope
                 from {s}.course_groups""",
    "group_members": """select m.group_id, upper(trim(c.code)) as code
                        from {s}.course_group_members m join {s}.courses c on c.id = m.course_id""",
    "categories": """select id, curriculum_id, name from {s}.course_categories""",
    "category_members": """select m.category_id, upper(trim(c.code)) as code
                           from {s}.course_category_members m join {s}.courses c on c.id = m.course_id""",
    "curriculum_courses": """select cc.curriculum_id, upper(trim(c.code)) as code
                             from {s}.curriculum_courses cc join {s}.courses c on c.id = cc.course_id""",
    "courses": """select distinct upper(trim(c.code)) as code, c.name, c.credits
                  from {s}.courses c join {s}.curriculum_courses cc on cc.course_id = c.id""",
    "outlines": """select upper(trim(o.course_code)) as course_code, o.version, o.applies_from, o.source_code,
                          o.source_updated_at, o.name_vi, o.name_en, o.faculty_code, o.content_hash, o.content
                   from {s}.course_outlines o
                   where upper(trim(o.course_code)) in (
                       select upper(trim(c.code)) from {s}.courses c
                       join {s}.curriculum_courses cc on cc.course_id = c.id)""",
}


def fetch(conn: psycopg.Connection, schema: str) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    with conn.transaction(), conn.cursor() as cur:
        for name, text in QUERIES.items():
            cur.execute(sql.SQL(text).format(s=sql.Identifier(schema)))
            out[name] = cur.fetchall()
    return out


def assemble(raw: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Gom dữ liệu thành một bản ghi cho mỗi chương trình."""
    by_curr: dict[Any, dict[str, Any]] = {}
    for c in raw["curricula"]:
        by_curr[c["id"]] = {
            "id": str(c["id"]), "code": c["code"], "name": c["name"], "name_en": c["name_en"],
            "major": c["major"], "faculty": c["faculty"], "cohort": c["cohort"],
            "source_code": c["source_code"], "profile_source_code": c["profile_source_code"],
            "profile": c["profile"], "specializations": [], "groups": [], "categories": [], "courses": [],
        }
    spec_code = {s["id"]: s["code"] for s in raw["specializations"]}
    for s in raw["specializations"]:
        by_curr[s["curriculum_id"]]["specializations"].append(
            {"code": s["code"], "name": s["name"], "description": s["description"]})

    members: dict[Any, list[str]] = defaultdict(list)
    for m in raw["group_members"]:
        members[m["group_id"]].append(m["code"])
    group_name = {g["id"]: g["name"] for g in raw["groups"]}
    for g in raw["groups"]:
        by_curr[g["curriculum_id"]]["groups"].append({
            "name": g["name"], "kind": g["kind"], "specialization": spec_code.get(g["specialization_id"]),
            "parent": group_name.get(g["parent_group_id"]), "required_count": g["required_count"],
            "required_credits": g["required_credits"], "pool_scope": g["pool_scope"],
            "members": sorted(members.get(g["id"], [])),
        })

    cat_members: dict[Any, list[str]] = defaultdict(list)
    for m in raw["category_members"]:
        cat_members[m["category_id"]].append(m["code"])
    for c in raw["categories"]:
        by_curr[c["curriculum_id"]]["categories"].append(
            {"name": c["name"], "members": sorted(cat_members.get(c["id"], []))})

    for cc in raw["curriculum_courses"]:
        by_curr[cc["curriculum_id"]]["courses"].append(cc["code"])

    out = []
    for c in by_curr.values():
        c["courses"] = sorted(set(c["courses"]))
        for key in ("specializations", "groups", "categories"):
            c[key].sort(key=lambda x: (x.get("code") or "", x["name"]))
        out.append(c)
    return sorted(out, key=lambda c: c["code"])


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--config", type=Path, default=None)
    args = ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config(args.config)
    env = read_env(resolve(cfg["database"]["env_file"]))
    schema = env.get("DB_SCHEMA") or "public"

    with connect(env) as conn:
        raw = fetch(conn, schema)

    out_dir = resolve(cfg["paths"]["snapshot_dir"])
    curricula = assemble(raw)
    write_json(out_dir / "curricula.json", curricula)
    write_json(out_dir / "courses.json", sorted(raw["courses"], key=lambda c: c["code"]))
    n_outlines = write_jsonl(out_dir / "outlines.jsonl.gz",
                             sorted(raw["outlines"], key=lambda o: (o["course_code"], str(o["version"]))))
    manifest = {
        "extracted_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "counts": {"curricula": len(curricula), "courses": len(raw["courses"]), "outlines": n_outlines,
                   "outline_codes": len({o["course_code"] for o in raw["outlines"]}),
                   "specializations": len(raw["specializations"]), "groups": len(raw["groups"]),
                   "categories": len(raw["categories"])},
    }
    write_json(out_dir / "manifest.json", manifest)
    print(f"snapshot -> {out_dir}")
    for k, v in manifest["counts"].items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
