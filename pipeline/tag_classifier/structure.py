"""Candidates from the curriculum structure: specializations, block (group) names and category
names, each with the courses the faculty listed under it."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from typing import Any

_PAREN = re.compile(r"\((?:nhóm|học kỳ|bắt buộc)[^)]*\)", re.IGNORECASE)
_GROUP_LETTER = re.compile(r"\s*-?\s*\bnhóm\s+[A-Z]\b", re.IGNORECASE)
_YEAR = re.compile(r"\s*-\s*20\d\d\b")


def specialization_members(curr: dict[str, Any]) -> dict[str, set[str]]:
    """{specialization code: courses the faculty listed under it}."""
    out: dict[str, set[str]] = defaultdict(set)
    for g in curr["groups"]:
        if g.get("specialization"):
            out[g["specialization"]].update(g["members"])
    return out


def elective_codes(curr: dict[str, Any]) -> set[str]:
    return {m for g in curr["groups"] if g["kind"] == "elective" for m in g["members"]}


def courses_to_tag(curr: dict[str, Any], records: dict[str, dict[str, Any]], electives_only: bool) -> list[dict[str, Any]]:
    """The program's courses that tags are for: usable syllabi, and with electives_only (config [scope])
    only members of the program's elective groups. A course can be elective in one program and
    compulsory in another, so this is decided per program."""
    codes = curr["courses"]
    if electives_only:
        electives = elective_codes(curr)
        codes = [x for x in codes if x in electives]
    return [records[x] for x in codes if x in records and records[x]["usable"]]


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def slug(text: str) -> str:
    """ASCII key: no Vietnamese diacritics, lower case, hyphens ("C++" -> "cplusplus")."""
    t = text.replace("đ", "d").replace("Đ", "D").replace("+", "plus").replace("#", "sharp")
    t = "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def clean_structure_name(name: str, prefixes: list[str], generic: set[str]) -> str | None:
    """'Chuyên ngành - nhóm C (học kỳ 7 và 8) - Trí tuệ nhân tạo ứng dụng' -> 'Trí tuệ nhân tạo ứng dụng'.
    None when only generic words remain ('Tự chọn tự do', 'Chuyên ngành - nhóm A')."""
    t = re.sub(r"\s+", " ", _YEAR.sub(" ", _GROUP_LETTER.sub(" ", _PAREN.sub(" ", name)))).strip(" -")
    if norm(t) in generic:  # before stripping prefixes, so "Tự chọn tự do" does not become "tự do"
        return None
    parts = [p.strip() for p in re.split(r"\s+-\s+", t) if p.strip()]
    if len(parts) > 1 and norm(parts[0]) in prefixes:
        t = " - ".join(parts[1:])
    for p in sorted(prefixes, key=len, reverse=True):
        if norm(t).startswith(p + " ") and len(t) > len(p) + 1:
            t = t[len(p):].strip(" -")
            break
    t = re.sub(r"\s+", " ", t).strip(" -")
    return None if not t or norm(t) in generic else t


def structure_candidates(curr: dict[str, Any], cfg: dict[str, Any], allowed: set[str] | None = None) -> list[dict[str, Any]]:
    """One candidate per distinct cleaned name. A specialization is keyed by its code (e.g. TNT);
    a group or category with the same name joins it. With `allowed` (the program's electives), only
    those courses count as members, and a name none of whose courses is allowed is skipped."""
    prefixes = [norm(p) for p in cfg["name_prefixes"]]
    generic = {norm(g) for g in cfg["generic_names"]}
    spec_by_name = {norm(s["name"]): s for s in curr["specializations"]}
    by_name: dict[str, dict[str, Any]] = {}

    def add(label: str, members: list[str], source: dict[str, Any]) -> None:
        if allowed is not None:
            members = [m for m in members if m in allowed]
            if not members:
                return
        spec = spec_by_name.get(norm(label))
        cand = by_name.setdefault(norm(label), {
            "key": spec["code"] if spec else slug(label), "label_vi": label, "label_en": None,
            "origin": "structure", "sources": [], "members": set(),
        })
        cand["sources"].append(source)
        cand["members"].update(members)

    spec_members = specialization_members(curr)
    for s in curr["specializations"]:
        add(s["name"], sorted(spec_members[s["code"]]), {"type": "specialization", "name": s["name"], "code": s["code"]})
    for kind, items in (("group", curr["groups"]), ("category", curr["categories"])):
        for g in items:
            label = clean_structure_name(g["name"], prefixes, generic)
            if label:
                add(label, g["members"], {"type": kind, "name": g["name"]})
    return [dict(c, members=sorted(c["members"])) for c in by_name.values()]
