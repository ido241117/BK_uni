"""Bước 1b: làm sạch đề cương trong snapshot -> data/courses.jsonl.

    cd pipeline
    tag_classifier/.venv/Scripts/python -m tag_classifier.preprocess

Mỗi môn có trong ít nhất một chương trình được ghi một dòng, kể cả môn không có đề cương hoặc đề
cương không dùng được (``usable: false``), để các bước sau biết vì sao môn đó không có tag.

Quy tắc (ngưỡng và mẫu trong config.toml, mục [preprocess]); mỗi thay đổi ghi một dòng vào
logs/preprocess.csv:
    multiple_versions   nhiều phiên bản cùng mã môn: giữ bản mới nhất (applies_from, version)
    en_is_vi / vi_is_en dòng ở ô "en" thực chất là tiếng Việt (hoặc ngược lại): chuyển hoặc bỏ
    placeholder         buổi học / dòng chỉ là chỗ trống ("Topic 1", "Midterm exam", "Review")
    boilerplate         dòng thủ tục lặp lại (yêu cầu tự học...)
    identical_content   nhiều mã môn có phần nội dung giống hệt nhau: giữ cả, ghi nhóm
    copied_summary      phần tóm tắt giống hệt môn khác nhưng phần còn lại khác: giữ, chỉ đánh dấu
    no_syllabus         môn không có đề cương
    unusable            còn quá ít chữ sau khi làm sạch (min_topic_chars)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from typing import Any

from tag_classifier.common import (
    TOPIC_SECTIONS, load_config, read_json, read_jsonl, resolve, utf8_stdout, write_json, write_jsonl,
)
from tag_classifier.text import clean_text, compile_patterns, letter_count, matches_any, vi_ratio

LANGS = ("en", "vi")
# Dòng ngắn hơn số chữ cái này: không đủ để nhận diện ngôn ngữ, để nguyên ở ô nguồn đã ghi.
MIN_LETTERS_FOR_DETECTION = 12


class Log:
    def __init__(self) -> None:
        self.rows: list[dict[str, str]] = []

    def add(self, code: str, rule: str, section: str = "", lang: str = "", detail: str = "") -> None:
        self.rows.append({"course_code": code, "rule": rule, "section": section, "lang": lang,
                          "detail": detail[:300]})


# ---------------------------------------------------------------------------------------------
# Chọn phiên bản

def _version_key(o: dict[str, Any]) -> tuple:
    applies = int(o["applies_from"]) if str(o.get("applies_from") or "").isdigit() else -1
    parts = tuple(int(x) for x in re.findall(r"\d+", str(o.get("version") or "")))
    return (applies, parts, str(o.get("source_updated_at") or ""))


def pick_versions(outlines: list[dict[str, Any]], log: Log) -> dict[str, dict[str, Any]]:
    by_code: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for o in outlines:
        by_code[o["course_code"]].append(o)
    chosen = {}
    for code, versions in by_code.items():
        versions.sort(key=_version_key, reverse=True)
        chosen[code] = versions[0]
        for old in versions[1:]:
            log.add(code, "multiple_versions", detail=(
                f"giữ version {versions[0]['version']} (applies_from {versions[0]['applies_from']}), "
                f"bỏ version {old['version']} (applies_from {old['applies_from']})"))
    return chosen


# ---------------------------------------------------------------------------------------------
# Ngôn ngữ của một trường song ngữ {en, vi}

def is_vi(line: str, threshold: float) -> bool:
    return letter_count(line) >= MIN_LETTERS_FOR_DETECTION and vi_ratio(line) >= threshold


def is_en(line: str, en_max: float) -> bool:
    return letter_count(line) >= MIN_LETTERS_FOR_DETECTION and vi_ratio(line) <= en_max


def assign_languages(pair: dict[str, str], threshold: float, en_max: float, code: str, section: str,
                     log: Log) -> dict[str, str]:
    """Xét từng dòng. Ô "en" phải là tiếng Anh (mô hình tiếng Anh chỉ đọc ô này): dòng chắc chắn
    là tiếng Việt bị đưa sang ô "vi" (bỏ nếu ô "vi" đã có dòng đó). Ô "vi" chỉ chuyển dòng chắc
    chắn là tiếng Anh sang ô "en" khi ô "en" trống; dòng tiếng Việt lẫn thuật ngữ Anh giữ nguyên."""
    en = [x for x in (pair.get("en") or "").split("\n") if x]
    vi = [x for x in (pair.get("vi") or "").split("\n") if x]
    vi_set = set(vi)
    keep_en = []
    for line in en:
        if is_vi(line, threshold):
            if line in vi_set:
                log.add(code, "en_is_vi", section, "en", "bỏ (ô vi đã có): " + line)
            else:
                vi.append(line)
                vi_set.add(line)
                log.add(code, "en_is_vi", section, "en", "chuyển sang vi: " + line)
        else:
            keep_en.append(line)
    if not keep_en:
        moved = [line for line in vi if is_en(line, en_max)]
        for line in moved:
            log.add(code, "vi_is_en", section, "vi", "chuyển sang en (ô en trống): " + line)
        keep_en = moved
        vi = [line for line in vi if line not in set(moved)]
    out = {}
    if keep_en:
        out["en"] = "\n".join(keep_en)
    if vi:
        out["vi"] = "\n".join(vi)
    return out


# ---------------------------------------------------------------------------------------------
# Làm sạch các phần của một đề cương

class Cleaner:
    def __init__(self, cfg: dict[str, Any], log: Log) -> None:
        p = cfg["preprocess"]
        self.placeholder = compile_patterns(p["placeholder_patterns"])
        self.boilerplate = compile_patterns(p["boilerplate_line_patterns"])
        self.threshold = p["vi_diacritic_ratio"]
        self.en_max = p["en_max_diacritic_ratio"]
        self.log = log

    def lines(self, value: object, code: str, section: str, lang: str, drop_placeholder: bool) -> list[str]:
        out = []
        for line in clean_text(value):
            if matches_any(line, self.boilerplate):
                self.log.add(code, "boilerplate", section, lang, line)
            elif drop_placeholder and matches_any(line, self.placeholder):
                self.log.add(code, "placeholder", section, lang, line)
            else:
                out.append(line)
        return out

    def bilingual(self, value: object, code: str, section: str, drop_placeholder: bool = False) -> dict[str, str]:
        """Trường {en, vi} (hoặc chuỗi) -> {lang: văn bản sạch}."""
        if not isinstance(value, dict):
            value = {"en": value} if value else {}
        pair = {lang: "\n".join(self.lines(value.get(lang), code, section, lang, drop_placeholder))
                for lang in LANGS}
        return assign_languages(pair, self.threshold, self.en_max, code, section, self.log)

    def items(self, values: list[dict[str, str]], code: str, section: str) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {lang: [] for lang in LANGS}
        for v in values:
            for lang, text in v.items():
                if text:
                    out[lang].append(text)
        return {lang: lst for lang, lst in out.items() if lst}


def _name(obj: Any) -> dict[str, str]:
    return obj.get("name") or {} if isinstance(obj, dict) else {}


def outcome_text(lo: dict[str, Any]) -> dict[str, str]:
    """Tên và mô tả một chuẩn đầu ra; mô tả thường lặp lại tên."""
    out = {}
    for lang in LANGS:
        name = ((lo.get("name") or {}).get(lang) or "").strip()
        desc = ((lo.get("description") or {}).get(lang) or "").strip()
        if desc and name and not desc.startswith(name[:40]):
            out[lang] = f"{name}: {desc}"
        else:
            out[lang] = desc or name
    return out


def clean_outline(content: dict[str, Any], code: str, cleaner: Cleaner) -> dict[str, Any]:
    sections: dict[str, Any] = {}
    sections["summary"] = cleaner.bilingual(content.get("summary"), code, "summary")
    sections["objectives"] = cleaner.bilingual(content.get("objectives"), code, "objectives")

    los = [cleaner.bilingual(outcome_text(lo), code, "learning_outcomes")
           for lo in content.get("learning_outcomes") or []]
    sections["learning_outcomes"] = cleaner.items(los, code, "learning_outcomes")

    sessions = sorted(content.get("sessions") or [], key=lambda s: s.get("order") or 0)
    cleaned = [cleaner.bilingual(s.get("content"), code, "sessions", drop_placeholder=True) for s in sessions]
    sections["sessions"] = cleaner.items(cleaned, code, "sessions")

    extra: dict[str, Any] = {}
    acts = [cleaner.bilingual(_name(a), code, "assessment_activities")
            for a in content.get("assessment_activities") or []]
    extra["assessment_activities"] = cleaner.items(acts, code, "assessment_activities")
    methods = [cleaner.bilingual(_name(m), code, "teaching_methods") for m in content.get("teaching_methods") or []]
    extra["teaching_methods"] = cleaner.items(methods, code, "teaching_methods")
    for key in ("references", "study_guide", "notes"):
        extra[key] = cleaner.bilingual(content.get(key), code, key)
    return {"sections": sections, "extra": extra}


def section_chars(sections: dict[str, Any], lang: str) -> int:
    total = 0
    for value in sections.values():
        v = value.get(lang)
        total += sum(len(x) for x in v) if isinstance(v, list) else len(v or "")
    return total


def _digest(obj: Any) -> str:
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------------------------

def preprocess(snapshot: dict[str, Any], cfg: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, Any]]:
    log = Log()
    cleaner = Cleaner(cfg, log)
    p = cfg["preprocess"]

    curricula = snapshot["curricula"]
    in_curricula: dict[str, list[str]] = defaultdict(list)
    faculty_of: dict[str, set[str]] = defaultdict(set)
    for c in curricula:
        for code in c["courses"]:
            in_curricula[code].append(c["code"])
            faculty_of[code].add(c["faculty"])
    names = {c["code"]: c for c in snapshot["courses"]}
    chosen = pick_versions(snapshot["outlines"], log)

    records = []
    for code in sorted(in_curricula):
        base = names.get(code, {})
        raw_name = base.get("name") or ""
        vi_name, _, en_name = raw_name.partition(" / ")
        rec: dict[str, Any] = {
            "code": code, "credits": base.get("credits"), "curricula": sorted(in_curricula[code]),
            "faculties": sorted(faculty_of[code]), "name_vi": vi_name.strip() or None,
            "name_en": en_name.strip() or None, "flags": [], "usable": False,
        }
        outline = chosen.get(code)
        if outline is None:
            rec["flags"].append("no_syllabus")
            log.add(code, "no_syllabus")
            records.append(rec)
            continue
        rec["name_vi"] = outline.get("name_vi") or rec["name_vi"]
        rec["name_en"] = outline.get("name_en") or rec["name_en"]
        rec["outline"] = {k: outline.get(k) for k in ("version", "applies_from", "source_code", "content_hash",
                                                      "faculty_code")}
        rec.update(clean_outline(outline.get("content") or {}, code, cleaner))
        topic = {k: rec["sections"][k] for k in TOPIC_SECTIONS}
        rec["available"] = {k: sorted(v.keys()) for k, v in topic.items()}
        chars = {lang: section_chars(topic, lang) for lang in LANGS}
        rec["topic_chars"] = chars
        for lang in LANGS:
            if chars[lang] < p["min_topic_chars"]:
                rec["flags"].append(f"{lang}_missing")
        rec["usable"] = any(chars[lang] >= p["min_topic_chars"] for lang in LANGS)
        if not rec["usable"]:
            log.add(code, "unusable", detail=f"en {chars['en']} ký tự, vi {chars['vi']} ký tự")
        rec["content_key"] = _digest(topic)
        rec["summary_key"] = _digest(rec["sections"]["summary"]) if rec["sections"]["summary"] else None
        records.append(rec)

    _flag_duplicates(records, log)
    summary = _summary(records, curricula, log, p)
    for r in records:
        r.pop("summary_key", None)
    return records, log.rows, summary


def _flag_duplicates(records: list[dict[str, Any]], log: Log) -> None:
    by_content: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_summary: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in records:
        if r.get("usable"):
            by_content[r["content_key"]].append(r)
            if r.get("summary_key"):
                by_summary[r["summary_key"]].append(r)
    for group in by_content.values():
        if len(group) > 1:
            codes = sorted(r["code"] for r in group)
            for r in group:
                r["flags"].append("identical_content")
                r["identical_with"] = [c for c in codes if c != r["code"]]
                log.add(r["code"], "identical_content", detail="cùng nội dung với " + ", ".join(r["identical_with"]))
    for group in by_summary.values():
        distinct = {r["content_key"] for r in group}
        if len(distinct) > 1:
            codes = sorted(r["code"] for r in group)
            for r in group:
                others = [c for c in codes if c != r["code"] and c not in r.get("identical_with", [])]
                if others:
                    r["flags"].append("copied_summary")
                    r["summary_same_as"] = others
                    log.add(r["code"], "copied_summary", "summary", detail="tóm tắt giống " + ", ".join(others))


def _summary(records: list[dict[str, Any]], curricula: list[dict[str, Any]], log: Log,
             p: dict[str, Any]) -> dict[str, Any]:
    rules = Counter(row["rule"] for row in log.rows)
    flags = Counter(f for r in records for f in r["flags"])

    per_faculty: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        for fac in r["faculties"]:
            c = per_faculty[fac]
            c["courses"] += 1
            if "no_syllabus" in r["flags"]:
                c["no_syllabus"] += 1
            elif not r["usable"]:
                c["unusable"] += 1
            else:
                c["usable"] += 1
                if {"copied_summary", "identical_content"} & set(r["flags"]):
                    c["usable_flagged"] += 1

    # Dòng lặp lại ở nhiều môn: chỉ báo cáo để bổ sung mẫu có căn cứ.
    seen: dict[str, set[str]] = defaultdict(set)
    for r in records:
        for key, value in (r.get("sections") or {}).items():
            for lang, v in value.items():
                for chunk in (v if isinstance(v, list) else [v]):
                    for line in chunk.split("\n"):
                        seen[line.strip().lower()].add(r["code"])
    repeated = sorted(((line, len(codes)) for line, codes in seen.items()
                       if len(codes) >= p["repeated_line_min_courses"] and line),
                      key=lambda x: -x[1])

    usable = [r for r in records if r["usable"]]
    return {
        "courses": len(records),
        "with_syllabus": sum("no_syllabus" not in r["flags"] for r in records),
        "usable": len(usable),
        "usable_by_language": {
            "both": sum(not ({"en_missing", "vi_missing"} & set(r["flags"])) for r in usable),
            "en_only": sum("vi_missing" in r["flags"] and "en_missing" not in r["flags"] for r in usable),
            "vi_only": sum("en_missing" in r["flags"] and "vi_missing" not in r["flags"] for r in usable),
        },
        "flags": dict(sorted(flags.items())),
        "log_rules": dict(sorted(rules.items())),
        "per_faculty": {fac: dict(c) for fac, c in sorted(per_faculty.items())},
        "curricula": len(curricula),
        "repeated_lines": [{"line": line, "courses": n} for line, n in repeated[:60]],
    }


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.parse_args(argv)
    utf8_stdout()
    cfg = load_config()
    paths = cfg["paths"]
    snap_dir = resolve(paths["snapshot_dir"])
    snapshot = {
        "curricula": read_json(snap_dir / "curricula.json"),
        "courses": read_json(snap_dir / "courses.json"),
        "outlines": list(read_jsonl(snap_dir / "outlines.jsonl.gz")),
    }
    records, log_rows, summary = preprocess(snapshot, cfg)

    write_jsonl(resolve(paths["courses_file"]), records)
    log_path = resolve(paths["preprocess_log"])
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w", encoding="utf-8-sig", newline="") as f:  # BOM: Excel đọc đúng tiếng Việt
        w = csv.DictWriter(f, fieldnames=["course_code", "rule", "section", "lang", "detail"])
        w.writeheader()
        w.writerows(log_rows)
    write_json(resolve(paths["preprocess_summary"]), summary)

    print(f"{summary['courses']} môn trong {summary['curricula']} chương trình; "
          f"{summary['with_syllabus']} có đề cương; {summary['usable']} dùng được")
    print("  ngôn ngữ (môn dùng được):", summary["usable_by_language"])
    print("  cờ:", summary["flags"])
    print("  log:", summary["log_rules"], "->", log_path)


if __name__ == "__main__":
    main()
