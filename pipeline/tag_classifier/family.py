"""Program families: the cohorts of one program, tagged and reviewed together.

CS-2023-KHMT, CS-2024-KHMT and CS-2026-KHMT are cohorts of one program and share most electives; the
family CS-KHMT is the program code without the cohort year. (Grouping by major + faculty would split
programs whose name or faculty is spelled differently between cohorts, e.g. "Kỹ thuật Điện" vs
"Kỹ thuật điện".) Each cohort stays a separate program for the planner; candidates, scores, review
and export are per family, over the union of the cohorts' electives.
"""

from __future__ import annotations

import re
from typing import Any

from tag_classifier.common import read_json, resolve


def family_id(curr: dict[str, Any]) -> str:
    """Program code without the cohort year: CS-2023-KHMT -> CS-KHMT."""
    return re.sub(r"-{2,}", "-", re.sub(rf"-?{curr['cohort']}-?", "-", curr["code"])).strip("-")


def _merge_profiles(cohorts: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for lang in ("en", "vi"):
        for field in ("overview", "career_opportunities"):
            texts = list(dict.fromkeys(t for c in cohorts if (t := ((c.get("profile") or {}).get(lang) or {}).get(field))))
            if texts:
                out.setdefault(lang, {})[field] = "\n".join(texts)
    return out


def merge_family(fid: str, cohorts: list[dict[str, Any]]) -> dict[str, Any]:
    """One curriculum-shaped record for the family: union of courses, every cohort's groups and
    categories, specializations by code, merged profile texts; plus the cohorts and their courses."""
    cohorts = sorted(cohorts, key=lambda c: c["cohort"])
    latest = cohorts[-1]
    specs: dict[str, dict[str, Any]] = {}
    for c in cohorts:
        for s in c["specializations"]:
            specs.setdefault(s["code"], s)
    return {
        "code": fid, "name": re.sub(r"\s*-\s*khóa\s+\d{4}\s*$", "", latest["name"]), "faculty": latest["faculty"],
        "major": latest["major"], "cohorts": [{"code": c["code"], "cohort": c["cohort"]} for c in cohorts],
        "cohort_courses": {c["code"]: sorted(c["courses"]) for c in cohorts},
        "courses": sorted({x for c in cohorts for x in c["courses"]}),
        "groups": [g for c in cohorts for g in c["groups"]],
        "categories": [g for c in cohorts for g in c["categories"]],
        "specializations": list(specs.values()),
        "profile": _merge_profiles(cohorts),
    }


def all_families(cfg: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """{family id: merged record} for every family in the snapshot."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for c in read_json(resolve(cfg["paths"]["snapshot_dir"]) / "curricula.json"):
        groups.setdefault(family_id(c), []).append(c)
    return {fid: merge_family(fid, cs) for fid, cs in sorted(groups.items())}


def load_family(cfg: dict[str, Any], fid: str) -> dict[str, Any]:
    families = all_families(cfg)
    if fid not in families:
        raise SystemExit(f"no program family {fid} (family = program code without the cohort year, e.g. CS-KHMT)")
    return families[fid]


def family_of_curricula(cfg: dict[str, Any]) -> dict[str, str]:
    """{curriculum code: family id} for every curriculum in the snapshot."""
    return {c["code"]: family_id(c) for c in read_json(resolve(cfg["paths"]["snapshot_dir"]) / "curricula.json")}
