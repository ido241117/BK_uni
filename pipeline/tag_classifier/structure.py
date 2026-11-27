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
    """One candidate per distinct cleaned block or category name, with the courses the faculty listed.
    Specializations are left out (the planner handles the student's specialization itself): blocks
    tied to a specialization, and categories named like one. With `allowed` (the electives to tag),
    only those courses count as members, and a name none of whose courses is allowed is skipped."""
    prefixes = [norm(p) for p in cfg["name_prefixes"]]
    generic = {norm(g) for g in cfg["generic_names"]}
    spec_names = {norm(s["name"]) for s in curr["specializations"]}
    by_name: dict[str, dict[str, Any]] = {}
    for kind, items in (("group", curr["groups"]), ("category", curr["categories"])):
        for g in items:
            if g.get("specialization"):
                continue
            label = clean_structure_name(g["name"], prefixes, generic)
            if not label or norm(label) in spec_names:
                continue
            members = [m for m in g["members"] if allowed is None or m in allowed]
            if not members:
                continue
            cand = by_name.setdefault(norm(label), {"key": slug(label), "label_vi": label, "label_en": None,
                                                    "origin": "structure", "sources": [], "members": set()})
            cand["sources"].append({"type": kind, "name": g["name"]})
            cand["members"].update(members)
    return [dict(c, members=sorted(c["members"])) for c in by_name.values()]


def specialization_candidates(curr: dict[str, Any], allowed: set[str] | None = None) -> list[dict[str, Any]]:
    """One evaluation-only candidate per specialization (key = its code), with the courses the faculty
    listed. Scored so the evaluation can check the models against the faculty's lists; never reviewed or
    exported."""
    members = specialization_members(curr)
    out = []
    for s in curr["specializations"]:
        listed = sorted(m for m in members.get(s["code"], ()) if allowed is None or m in allowed)
        if listed:
            out.append({"key": s["code"], "label_vi": s["name"], "label_en": None, "origin": "structure",
                        "sources": [{"type": "specialization", "name": s["name"], "code": s["code"]}],
                        "members": listed, "evaluation_only": True})
    return out
