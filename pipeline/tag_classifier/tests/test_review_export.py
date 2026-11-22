"""Review workbook round trip (the team's columns survive regeneration, Vietnamese text intact) and
export validation."""

from __future__ import annotations

import pytest
from openpyxl import load_workbook

from tag_classifier.common import stale_models
from tag_classifier.export import build, not_rescored, read_reviews
from tag_classifier.workbook import course_codes, read_decisions, read_review_rows, write_review


def tag(key, keep="", courses="", **extra):
    return {"tag": key, "label": extra.pop("label", key), "keep": keep, "courses": courses, **extra}


def test_workbook_round_trip_keeps_text_and_layout(tmp_path):
    path = tmp_path / "C1.xlsx"
    write_review(path, [tag("TNT", keep="Keep", rename=" AI ", note="môn hay", label_vi="Trí tuệ nhân tạo",
                            courses="CO3061 Nhập môn Trí tuệ Nhân tạo\nCO3117 Học máy", doubtful=True)],
                 [{"code": "CO3061", "name": "Nhập môn Trí tuệ Nhân tạo", "tags": "AI"}])
    assert read_decisions(path) == {"TNT": {"keep": "Keep", "rename": "AI", "note": "môn hay"}}
    [row] = read_review_rows(path)
    assert row["label_vi"] == "Trí tuệ nhân tạo" and row["_row"] == 2
    wb = load_workbook(path)
    ws = wb["Tags"]
    assert ws.freeze_panes == "F2" and ws.auto_filter.ref
    assert [dv.formula1 for dv in ws.data_validations.dataValidation] == ['"Keep,Drop"']
    assert ws["D2"].fill.fgColor.rgb.endswith("FBE3D6")          # doubtful row shaded (not the decision cells)
    assert ws["A2"].fill.fgColor.rgb in (None, "00000000")
    assert wb["Courses"]["B2"].value == "Nhập môn Trí tuệ Nhân tạo"
    assert read_decisions(tmp_path / "missing.xlsx") == {}


def test_course_codes_take_the_first_word_of_each_line():
    assert course_codes("CO3061 Intro to AI\n\n  CO3117 Machine Learning \nCO3061 again") == ["CO3061", "CO3117"]
    assert course_codes("") == []


def test_read_reviews_exports_kept_rows_under_rename_or_tag_name(tmp_path):
    write_review(tmp_path / "C1.xlsx", [
        tag("TNT", keep="Keep", rename="AI", courses="CO3061 Intro to AI\nCO3117 ML"),
        tag("toan", keep="Drop", label="Toán", courses="MT1003 Calculus"),
        tag("big-data", keep="keep", label="big data", courses="CO3137 Big Data\nCO4033 BI"),
        tag("web", keep="", label="web programming", courses="CO3049 Web"),
    ], [])
    write_review(tmp_path / "C2.xlsx", [tag("x", keep="Keep", label="Toán ứng dụng", courses="MT2013 x")], [])
    (tmp_path / "~$C1.xlsx").write_bytes(b"lock")                   # Excel's lock file while C1 is open
    by_curr, _, errors, warnings = read_reviews(tmp_path)
    assert errors == [] and warnings == []
    assert by_curr == {"C1": {"AI": ["CO3061", "CO3117"], "big data": ["CO3137", "CO4033"]},
                       "C2": {"Toán ứng dụng": ["MT2013"]}}
    assert build(by_curr)["tags"] == {"AI": ["CO3061", "CO3117"], "Toán ứng dụng": ["MT2013"],
                                      "big data": ["CO3137", "CO4033"]}


def test_typo_is_an_error_and_kept_row_without_courses_is_skipped(tmp_path):
    write_review(tmp_path / "C1.xlsx", [tag("a", keep="yes", courses="X1 a"), tag("b", keep="Keep"),
                                        tag("c", keep="Keep", courses="X3 c")], [])
    by_curr, _, errors, warnings = read_reviews(tmp_path)
    assert errors == ["C1.xlsx row 2 (tag a): Keep must be Keep or Drop or empty, got 'yes'"]
    assert warnings == ["C1.xlsx row 3 (tag b): kept but has no courses, skipped"]
    assert by_curr == {"C1": {"c": ["X3"]}}


@pytest.mark.parametrize("value", ["Keep", "Drop", "", "KEEP", "drop"])
def test_valid_keep_values(tmp_path, value):
    write_review(tmp_path / "C1.xlsx", [tag("a", keep=value, courses="X1 a")], [])
    assert read_reviews(tmp_path)[2] == []


def test_build_keeps_family_lists_and_maps_curricula_to_families():
    data = build({"CS-KHMT": {"logic": ["A"]}, "CE-KTMT": {"logic": ["B", "A"]}}, None,
                 {"CS-2023-KHMT": "CS-KHMT", "CS-2024-KHMT": "CS-KHMT", "XX-2023-Y": "XX-Y"})
    assert data["by_family"]["CE-KTMT"] == {"logic": ["B", "A"]}
    assert data["families"] == {"CS-2023-KHMT": "CS-KHMT", "CS-2024-KHMT": "CS-KHMT"}   # families without tags left out
    assert data["tags"] == {"logic": ["A", "B"]}                                        # merged fallback


def test_stale_models_compares_scored_renames_with_the_workbook():
    scores = {"scores": {"a": {}, "b": {}, "c": {}}, "renamed": {"a": {"CND": "data"}, "b": {}}}
    assert stale_models(scores, {"CND": "data"}) == ["b", "c"]      # c: scored before renames existed
    assert stale_models(scores, {}) == ["a"]
    assert stale_models({"scores": {"a": {}}}, {}) == []             # old scores file, no renames: fine


def test_renamed_tags_not_rescored_are_exported_and_marked(tmp_path):
    write_review(tmp_path / "C1.xlsx", [
        tag("MMA", keep="Keep", label="security", rename="cryptography and network security", courses="CO3069 x"),
        tag("TNT", keep="Keep", label="artificial intelligence", rename="AI", courses="CO3061 x"),
        tag("XLA", keep="Drop", label="computer vision", rename="vision", courses="CO3057 x"),   # dropped: ignored
    ], [])
    by_curr, renamed, errors, _ = read_reviews(tmp_path)
    assert errors == [] and set(by_curr["C1"]) == {"cryptography and network security", "AI"}
    assert renamed == {"C1": {"MMA": {"name": "cryptography and network security", "old": "security"},
                              "TNT": {"name": "AI", "old": "artificial intelligence"}}}
    # The primary model (first of primary_models present) scored the TNT rename only.
    scores = {"scores": {"modernbert": {}, "embedding": {}}, "renamed": {"modernbert": {"TNT": "AI"}}}
    marked = not_rescored(renamed["C1"], scores, ["modernbert", "embedding"])
    assert marked == {"cryptography and network security": "security"}
    assert not_rescored(renamed["C1"], None, ["modernbert"]) == {"cryptography and network security": "security",
                                                                 "AI": "artificial intelligence"}
    data = build(by_curr, {"C1": marked, "C2": {}})
    assert data["renamed_not_rescored"] == {"C1": {"cryptography and network security": "security"}}
    assert data["tags"]["cryptography and network security"] == ["CO3069"]


def test_shared_decision_applies_unless_the_program_row_decides(tmp_path):
    from tag_classifier.review import shared_rows
    from tag_classifier.workbook import SHARED_FILE, read_shared, write_shared
    write_review(tmp_path / "A.xlsx", [tag("ai", label="Artificial  Intelligence", courses="X1 a\nX2 b", alpha=0.8),
                                       tag("web", label="web programming", keep="Keep", courses="X3 c")], [])
    write_review(tmp_path / "B.xlsx", [tag("ai2", label="artificial intelligence", courses="X2 b\nX4 d", alpha=0.6),
                                       tag("bio", label="biology", keep="Drop", courses="X5 e")], [])
    rows = shared_rows(tmp_path)
    ai = rows[0]                                                   # in two programs: listed first
    assert (ai["name"], ai["program_count"], ai["course_count"], ai["alpha"]) == ("Artificial  Intelligence", 2, 3, 0.7)
    assert ai["programs"] == "A: 2\nB: 2"
    # The team decides "artificial intelligence" once, for both programs.
    write_shared(tmp_path / SHARED_FILE, [dict(r, keep="Keep", rename="AI") if r is ai else r for r in rows])
    assert read_shared(tmp_path)["artificial intelligence"] == {"keep": "Keep", "rename": "AI", "note": ""}
    assert shared_rows(tmp_path)[0]["keep"] == "Keep"              # kept when the shared sheet is rebuilt
    by_curr, renamed, errors, _ = read_reviews(tmp_path)           # shared.xlsx itself is not a program
    assert errors == [] and set(by_curr) == {"A", "B"}
    assert by_curr == {"A": {"AI": ["X1", "X2"], "web programming": ["X3"]}, "B": {"AI": ["X2", "X4"]}}
    assert renamed["B"] == {"ai2": {"name": "AI", "old": "artificial intelligence"}}
    # A program row's own decision wins over the shared one.
    write_review(tmp_path / "B.xlsx", [tag("ai2", label="artificial intelligence", keep="Drop", courses="X2 b")], [])
    assert read_reviews(tmp_path)[0]["B"] == {}


def test_read_renames_takes_the_shared_rename_when_the_row_has_none(tmp_path):
    from tag_classifier.workbook import SHARED_FILE, read_renames, write_shared
    write_review(tmp_path / "C1.xlsx", [tag("ai", label="artificial intelligence"),
                                        tag("web", label="web programming", rename="web development")], [])
    write_shared(tmp_path / SHARED_FILE, [{"name": "Artificial Intelligence", "rename": "AI"},
                                          {"name": "web programming", "rename": "ignored: the row has its own"}])
    cfg = {"review": {"out_dir": str(tmp_path)}}
    assert read_renames(cfg, "C1") == {"ai": "AI", "web": "web development"}
