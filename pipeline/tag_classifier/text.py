"""Làm sạch văn bản đề cương và nhận diện tiếng Việt / tiếng Anh."""

from __future__ import annotations

import html
import re
from typing import Iterable

# Chữ cái có dấu chỉ tiếng Việt dùng (cả hoa lẫn thường), và đ/Đ.
_VI_CHARS = set(
    "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
    "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ"
)

_TAG = re.compile(r"<[^>]+>")
_INVISIBLE = re.compile(r"[﻿​‌‍⁠]")
# [1]  [1,2]  [1-3]  [1][2]
_REF = re.compile(r"\[\s*\d+(?:\s*[-,–;]\s*\d+)*\s*\]")
_BULLET = re.compile(r"^[\-•·*–—●▪◦+>]+\s*")
# "Chapter 1." "Chương 6:" "PART I:" "Topic 2 -" "Tuần 3" "1.1." "(CHAPTER 3:" ở đầu dòng.
_HEADING = re.compile(
    r"^\(?\s*(?:chapter|chương|chuong|part|phần|topic|chủ đề|week|tuần|lesson|bài|unit|module|session|buổi)"
    # \b sau số La Mã: "Unit vectors", "Lesson learned" không bị cắt.
    r"\s*(?:\d+|[IVXLivxl]+)\b\s*[\.:)\-–]?\s*",
    re.IGNORECASE,
)
_NUMBERING = re.compile(r"^\(?\d+(?:\.\d+)*[\.)]?\s+(?=\S)")
_SPACES = re.compile(r"[ \t ]+")
_ORPHAN_PUNCT = re.compile(r"(?:\s*[,;]\s*){2,}")


def vi_ratio(text: str) -> float:
    """Tỉ lệ chữ có dấu tiếng Việt trên tổng số chữ cái (0 với văn bản không có chữ)."""
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return 0.0
    return sum(ch in _VI_CHARS for ch in letters) / len(letters)


def letter_count(text: str) -> int:
    return sum(ch.isalpha() for ch in text)


def clean_line(line: str) -> str:
    line = _BULLET.sub("", line.strip())
    original = _SPACES.sub(" ", line).strip()
    # Bỏ lặp: "1. Chapter 2:" -> "", tối đa vài lượt.
    for _ in range(3):
        new = _HEADING.sub("", line)
        new = _NUMBERING.sub("", new)
        new = _BULLET.sub("", new)
        if new == line:
            break
        line = new
    line = _ORPHAN_PUNCT.sub(", ", line)
    line = _SPACES.sub(" ", line).strip(" ,;:-–")
    # Dòng chỉ có tiêu đề ("Topic 1", "2.3"): giữ nguyên để quy tắc placeholder bỏ và ghi log,
    # thay vì biến mất không dấu vết.
    return line or original


def clean_text(value: object) -> list[str]:
    """Văn bản thô -> danh sách dòng đã làm sạch (bỏ dòng rỗng)."""
    if value is None:
        return []
    text = html.unescape(str(value))
    text = _TAG.sub(" ", text)
    text = _INVISIBLE.sub("", text)
    text = _REF.sub(" ", text)
    lines: list[str] = []
    for raw in re.split(r"[\r\n]+", text):
        # Nguồn hay xuống dòng giữa câu ("This\ncourse provides..."): dòng thô bắt đầu bằng chữ
        # thường (không có gạch đầu dòng) là phần tiếp của dòng trước.
        stripped = raw.strip()
        if lines and stripped[:1].islower():
            lines[-1] = _SPACES.sub(" ", f"{lines[-1]} {stripped}").strip()
            continue
        line = clean_line(raw)
        if line:
            lines.append(line)
    return lines


def phrase_pattern(phrase: str) -> re.Pattern[str]:
    """Matches the phrase as whole words in lower-cased text ("neural networks" not in "neural networking")."""
    return re.compile(r"(?<!\w)" + re.escape(phrase.strip().lower()) + r"(?!\w)")


def compile_patterns(patterns: Iterable[str]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


def matches_any(line: str, patterns: list[re.Pattern[str]]) -> bool:
    return any(p.search(line) for p in patterns)
