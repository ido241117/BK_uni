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
    assert ws.freeze_panes == "E2" and ws.auto_filter.ref
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


def test_build_merges_same_label_across_curricula():
    data = build({"C1": {"logic": ["A"]}, "C2": {"logic": ["B", "A"]}})
    assert data["tags"] == {"logic": ["A", "B"]}
    assert data["by_curriculum"]["C2"] == {"logic": ["B", "A"]}


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
