"""Program families: id from the code, merged record."""

from __future__ import annotations

from tag_classifier.family import family_id, merge_family


def cohort(code, year, courses, specs=(), overview=None, name="Khoa học Máy tính (Computer Science)"):
    return {"code": code, "cohort": year, "name": f"{name} - khóa {year}", "faculty": "KH&KT Máy tính",
            "major": "Khoa học Máy tính", "courses": courses,
            "groups": [{"name": "Tự chọn", "kind": "elective", "members": courses, "specialization": None}],
            "categories": [], "specializations": [{"code": c, "name": c} for c in specs],
            "profile": {"en": {"overview": overview}} if overview else {}}


def test_family_id_drops_the_cohort_year():
    assert family_id({"code": "CS-2023-KHMT", "cohort": 2023}) == "CS-KHMT"
    assert family_id({"code": "EE-2024-KTDIEN", "cohort": 2024}) == "EE-KTDIEN"
    assert family_id({"code": "2025-ABC", "cohort": 2025}) == "ABC"


def test_merge_family_unions_courses_and_keeps_cohorts():
    fam = merge_family("CS-KHMT", [cohort("CS-2024-KHMT", 2024, ["A", "C"], ["AI"], "Same text."),
                                   cohort("CS-2023-KHMT", 2023, ["A", "B"], ["TNT", "AI"], "Same text.")])
    assert fam["code"] == "CS-KHMT" and fam["name"] == "Khoa học Máy tính (Computer Science)"
    assert [c["code"] for c in fam["cohorts"]] == ["CS-2023-KHMT", "CS-2024-KHMT"]       # oldest first
    assert fam["courses"] == ["A", "B", "C"] and len(fam["groups"]) == 2
    assert [s["code"] for s in fam["specializations"]] == ["TNT", "AI"]                  # once per code
    assert fam["cohort_courses"] == {"CS-2023-KHMT": ["A", "B"], "CS-2024-KHMT": ["A", "C"]}
    assert fam["profile"] == {"en": {"overview": "Same text."}}                          # identical texts once
