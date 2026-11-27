"""Quy tắc làm sạch (text.py) và tiền xử lý (preprocess.py) trên dữ liệu nhỏ tự tạo."""

from __future__ import annotations

import copy

import pytest

from tag_classifier.common import load_config
from tag_classifier.preprocess import Log, assign_languages, pick_versions, preprocess
from tag_classifier.text import clean_text, vi_ratio

CFG = load_config()


# --- text.py ------------------------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("<p>Machine&nbsp;learning</p>", ["Machine learning"]),
    ("﻿Data mining [1], [2]", ["Data mining"]),
    ("Chapter 1. Introduction to compilers", ["Introduction to compilers"]),
    ("Chương 6: Edge AI trong IoT", ["Edge AI trong IoT"]),
    ("PART II: Semantic interpretation", ["Semantic interpretation"]),
    ("1.1. Overview\n• Supervised learning", ["Overview", "Supervised learning"]),
    ("(CHAPTER 3: Forecasting", ["Forecasting"]),
    # Từ thường bắt đầu bằng chữ số La Mã không bị cắt.
    ("Unit vectors and matrices", ["Unit vectors and matrices"]),
    ("Lesson learned from projects", ["Lesson learned from projects"]),
    # Số liền chữ (5G, 3D) không phải đánh số.
    ("5G networks\n3D game programming", ["5G networks", "3D game programming"]),
    # Xuống dòng giữa câu được nối lại; gạch đầu dòng thì không.
    ("This\ncourse provides theory.\n- use tools", ["This course provides theory.", "use tools"]),
    ("", []),
    (None, []),
])
def test_clean_text(raw, expected):
    assert clean_text(raw) == expected


def test_vi_ratio():
    assert vi_ratio("Machine learning basics") == 0
    assert vi_ratio("Học máy cơ bản") > 0.3
    assert vi_ratio("123 !!!") == 0


# --- nhận diện ngôn ngữ từng dòng ---------------------------------------------------------------

def langs(pair):
    return assign_languages(pair, 0.08, 0.01, "X", "s", Log())


def test_vietnamese_line_in_en_slot_moves_or_drops():
    vi_line = "Phân phối không khí trong phòng"
    # Ô vi đã có dòng đó: bỏ khỏi ô en.
    assert langs({"en": f"Air distribution in rooms\n{vi_line}", "vi": vi_line}) == {
        "en": "Air distribution in rooms", "vi": vi_line}
    # Ô vi chưa có: chuyển sang.
    assert langs({"en": f"Air distribution in rooms\n{vi_line}"}) == {
        "en": "Air distribution in rooms", "vi": vi_line}


def test_english_line_in_vi_slot_moves_only_when_en_empty():
    en_line = "Introduction to machine learning methods"
    assert langs({"vi": en_line}) == {"en": en_line}
    assert langs({"en": "Something else entirely here", "vi": en_line}) == {
        "en": "Something else entirely here", "vi": en_line}


def test_mixed_vietnamese_with_english_terms_stays():
    # Dòng thật của CO2039 có tỉ lệ 0.068: không đủ chắc là tiếng Việt, cũng không phải tiếng Anh.
    mixed = ("Tính đa hình (Polymorphism) và Trừu tượng (Abstraction) Override/overload "
             "Dynamic/Static Binding Abstract class Interface")
    assert 0.01 < vi_ratio(mixed) < 0.08
    assert langs({"vi": mixed}) == {"vi": mixed}
    assert langs({"en": mixed, "vi": "Đa hình"}) == {"en": mixed, "vi": "Đa hình"}


# --- chọn phiên bản -----------------------------------------------------------------------------

def test_pick_newest_version_and_log_others():
    log = Log()
    outlines = [
        {"course_code": "A", "version": "6.1", "applies_from": "251"},
        {"course_code": "A", "version": "2.0", "applies_from": "261"},
        {"course_code": "A", "version": "10.0", "applies_from": "251"},
    ]
    chosen = pick_versions(outlines, log)
    assert chosen["A"]["version"] == "2.0"  # applies_from mới nhất trước, rồi tới version
    assert [r["rule"] for r in log.rows] == ["multiple_versions"] * 2


# --- toàn bộ bước tiền xử lý --------------------------------------------------------------------

LONG = "Supervised learning, decision trees, neural networks and model evaluation. " * 4


def outline(code, summary, sessions, version="1.0"):
    return {"course_code": code, "version": version, "applies_from": "251", "source_code": f"DCMH.{code}",
            "source_updated_at": None, "name_vi": f"Môn {code}", "name_en": f"Course {code}",
            "faculty_code": "MT", "content_hash": code,
            "content": {"summary": {"en": summary, "vi": "Học máy cơ bản cho sinh viên"},
                        "sessions": [{"order": i, "content": {"en": s}} for i, s in enumerate(sessions)]}}


def snapshot():
    return {
        "curricula": [{"code": "C1", "faculty": "F1", "courses": ["A", "B", "C", "D", "E", "F"]}],
        "courses": [{"code": c, "name": f"Môn {c} / Course {c}", "credits": 3} for c in "ABCDEF"],
        "outlines": [
            outline("A", LONG, ["Topic 1", "Decision trees", "Midterm exam",
                                "Self-study requirements for students: 6 hours"]),
            outline("B", LONG, ["Topic 1", "Decision trees", "Midterm exam"]),   # giống hệt A sau làm sạch
            outline("C", LONG, ["Graph neural networks"]),                     # cùng tóm tắt, khác buổi học
            outline("D", "Too short.", []),                                     # không đủ chữ
            outline("F", LONG, ["Reinforcement learning"]),
        ],
    }


@pytest.fixture(scope="module")
def result():
    records, log_rows, summary = preprocess(copy.deepcopy(snapshot()), CFG)
    return {r["code"]: r for r in records}, log_rows, summary


def test_placeholders_and_boilerplate_removed(result):
    recs, log_rows, _ = result
    assert recs["A"]["sections"]["sessions"]["en"] == ["Decision trees"]
    rules = {(r["course_code"], r["rule"], r["detail"]) for r in log_rows}
    assert ("A", "placeholder", "Topic 1") in rules
    assert ("A", "placeholder", "Midterm exam") in rules
    assert ("A", "boilerplate", "Self-study requirements for students: 6 hours") in rules


def test_identical_and_copied_summary_flags(result):
    recs, _, _ = result
    assert "identical_content" in recs["A"]["flags"] and recs["A"]["identical_with"] == ["B"]
    # C có cùng tóm tắt nhưng khác buổi học: cờ copied_summary, không phải identical_content.
    assert "copied_summary" in recs["C"]["flags"] and "identical_content" not in recs["C"]["flags"]
    assert set(recs["C"]["summary_same_as"]) == {"A", "B", "F"}


def test_unusable_and_missing_syllabus(result):
    recs, _, summary = result
    assert recs["D"]["usable"] is False
    assert recs["E"]["flags"] == ["no_syllabus"] and recs["E"]["usable"] is False
    assert recs["E"]["name_en"] == "Course E"  # tên lấy từ bảng courses khi không có đề cương
    assert summary["usable"] == 4 and summary["with_syllabus"] == 5 and summary["courses"] == 6


def test_vietnamese_summary_kept_in_vi_slot(result):
    recs, _, _ = result
    assert recs["F"]["sections"]["summary"]["vi"] == "Học máy cơ bản cho sinh viên"
    assert recs["F"]["available"]["summary"] == ["en", "vi"]
