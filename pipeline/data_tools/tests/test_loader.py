"""Loader and cross-reference validation tests."""

from __future__ import annotations

import json
import shutil

import pytest

from data_tools.loader import DataValidationError, load_data


def test_loads_all_files_and_links_ids(bundle):
    assert bundle.curriculum.id == "cs_2023"
    assert bundle.policy.id == "policy_2020"
    assert bundle.graduation.curriculum_id == bundle.curriculum.id
    assert bundle.graduation.grading_policy == bundle.policy.id
    assert len(bundle.students) == 7
    assert {student.student_id for student in bundle.students} == {
        "S001",
        "S002",
        "S003",
        "S004",
        "S005",
        "S006",
        "S007",
    }
    assert all(
        student.curriculum_id == bundle.curriculum.id for student in bundle.students
    )
    assert all(student.grading_policy == bundle.policy.id for student in bundle.students)


def test_attempt_courses_exist_in_curriculum(bundle):
    course_ids = set(bundle.curriculum.courses)
    for student in bundle.students:
        for attempt in student.attempts:
            assert attempt.course in course_ids


def test_invalid_course_reference_is_rejected(tmp_path, data_dir):
    data_copy = tmp_path / "data"
    shutil.copytree(data_dir, data_copy)

    history_path = data_copy / "student_history.json"
    history = json.loads(history_path.read_text(encoding="utf-8"))
    history["students"][0]["attempts"][0]["course"] = "NOT_A_COURSE"
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")

    with pytest.raises(DataValidationError, match="unknown course"):
        load_data(data_copy)
