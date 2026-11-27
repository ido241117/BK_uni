"""Canonical instance format: loader/validator, the HCMUT converter and the solver adapters."""

from __future__ import annotations

import copy
import json
import shutil
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE))

from instances.importers.hcmut import fetch_curriculum  # noqa: E402
from instances.importers.hcmut.convert import from_planner_fixture  # noqa: E402
from planner.solvers.asp.data import from_instance_curriculum  # noqa: E402
from planner.model.input import (  # noqa: E402
    ConversionError,
    hcmut_to_term,
    term_sequence,
    term_to_hcmut,
    to_planner_fixture,
)
from instances.loader import InstanceError, load_university  # noqa: E402

INSTANCES = PIPELINE / "instances"
TOY = ("toy", "TOY-2025", "toy-demo")
KHMT = ("hcmut", "CS-2023-KHMT", "khmt2023-demo")


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


# --- terms -------------------------------------------------------------------


def test_term_sequence_with_and_without_summer():
    assert term_sequence("2023-1", 4, True) == ["2023-1", "2023-2", "2023-3", "2024-1"]
    assert term_sequence("2025-2", 3, False) == ["2025-2", "2026-1", "2026-2"]
    assert term_sequence("2025-1", 0, False) == []


def test_term_sequence_rejects_summer_start_without_summer_terms():
    with pytest.raises(ConversionError):
        term_sequence("2025-3", 2, False)


def test_hcmut_term_codes_round_trip():
    assert hcmut_to_term("233") == "2023-3"
    assert term_to_hcmut("2023-3") == "233"
    with pytest.raises(ConversionError):
        hcmut_to_term("234")


# --- committed instances -----------------------------------------------------


@pytest.mark.parametrize("university", ["hcmut", "toy"])
def test_committed_instances_validate(university):
    uni = load_university(INSTANCES / university)
    assert uni.curricula


def test_khmt_instance_counts():
    cur = _read(INSTANCES / "hcmut/curricula/CS-2023-KHMT/curriculum.json")
    types = [r["type"] for r in cur["relations"]]
    assert len(cur["courses"]) == 96
    assert (types.count("prerequisite"), types.count("corequisite"), types.count("recommended")) == (11, 1, 18)
    assert [m["id"] for m in cur["majors"]] == ["CNDL", "CNPM", "MMANM", "TTNT", "XLA"]
    assert {m["refines_group"] for m in cur["majors"]} == {"G4"}  # elective group C
    free = [g for g in cur["groups"] if g.get("scope") == "any"]
    assert len(free) == 1 and free[0]["slot_credits"] == 3


# --- validator catches broken input ------------------------------------------


@pytest.fixture()
def toy_copy(tmp_path):
    dst = tmp_path / "toy"
    shutil.copytree(INSTANCES / "toy", dst)
    return dst


def _edit(path: Path, fn):
    obj = _read(path)
    fn(obj)
    path.write_text(json.dumps(obj), encoding="utf-8")


@pytest.mark.parametrize("break_it, expected", [
    (lambda c: c["relations"].append({"course": "CS101", "type": "prerequisite", "any_of": ["NOPE"]}), "unknown course 'NOPE'"),
    (lambda c: c["relations"].append({"course": "CS101", "type": "required", "any_of": ["MA101"]}), "unknown type"),
    (lambda c: c["relations"].append({"course": "CS101", "type": "prerequisite", "any_of": []}), "at least one course"),
    (lambda c: c["courses"].append(dict(c["courses"][0])), "duplicate course id"),
    (lambda c: c["groups"][0]["course_ids"].append("NOPE"), "unknown course 'NOPE'"),
    (lambda c: c["planning"].update(min_load=20), "min_load > planning.max_load"),
    (lambda c: c["courses"][0].update(offered_terms=[4]), "subset"),
])
def test_validator_rejects_broken_curriculum(toy_copy, break_it, expected):
    _edit(toy_copy / "curricula/TOY-2025/curriculum.json", break_it)
    with pytest.raises(InstanceError, match=expected):
        load_university(toy_copy)


def test_validator_rejects_broken_student_and_request(toy_copy):
    _edit(toy_copy / "students/toy-demo.json", lambda s: s["attempts"][0].update(term="261", result="done"))
    _edit(toy_copy / "requests/toy-demo.json", lambda r: r[0].update(student_id="ghost"))
    with pytest.raises(InstanceError) as exc:
        load_university(toy_copy)
    text = str(exc.value)
    assert "term must look like YYYY-P" in text
    assert "unknown result 'done'" in text
    assert "unknown student 'ghost'" in text


# --- converters --------------------------------------------------------------


def _instance(university: str, curriculum_id: str, name: str):
    root = INSTANCES / university
    return (_read(root / "curricula" / curriculum_id / "curriculum.json"),
            _read(root / "students" / f"{name}.json"), _read(root / "requests" / f"{name}.json"))


@pytest.mark.parametrize("case", [TOY, KHMT], ids=["toy", "khmt"])
def test_hcmut_layout_round_trip_reproduces_the_instance(case):
    """Instance -> planner input (HCMUT web layout) -> instance gives back the committed files."""
    curriculum, students, requests = _instance(*case)
    student_id = students["students"][0]["student_id"]
    fx = to_planner_fixture(curriculum, students, student_id, requests)
    conv = from_planner_fixture(fx, student_id, students["students"][0]["grading_policy"])
    conv["curriculum"]["_provenance"] = curriculum["_provenance"]
    assert conv == {"curriculum": curriculum, "students": students, "requests": requests}


def test_hcmut_layout_rejects_gaps_in_semesters():
    curriculum, students, requests = _instance(*TOY)
    fx = to_planner_fixture(curriculum, students, "toy-demo", requests)
    fx["semesters"].remove("261")
    with pytest.raises(ConversionError, match="not consecutive"):
        from_planner_fixture(fx, "toy-demo")


def test_fetch_curriculum_writes_a_loadable_instance(tmp_path, monkeypatch):
    curriculum, students, requests = _instance(*KHMT)
    fx = to_planner_fixture(curriculum, students, "khmt2023-demo", requests)
    fx["_note"] = curriculum["_provenance"]["note"]
    monkeypatch.setattr(fetch_curriculum, "build", lambda code: copy.deepcopy(fx))
    shutil.copytree(INSTANCES / "hcmut" / "policy", tmp_path / "hcmut" / "policy")
    fetch_curriculum.main(["CS-2023-KHMT", str(tmp_path / "hcmut"), "khmt2023-demo"])
    uni = load_university(tmp_path / "hcmut")
    assert uni.curricula["CS-2023-KHMT"]["curriculum"] == curriculum
    assert uni.requests["khmt2023-demo"] == requests


def test_asp_adapter_turns_relations_into_or_groups():
    cur = _read(INSTANCES / "hcmut/curricula/cs_2023/curriculum.json")
    target = cur["courses"][5]["id"]
    cur["relations"] = [r for r in cur["relations"] if r["course"] != target] + [
        {"course": target, "type": "prerequisite", "any_of": ["CO1005", "CO1007"], "source": "curriculum"},
        {"course": target, "type": "prerequisite", "any_of": ["MT1003"]},
        {"course": target, "type": "recommended", "any_of": ["CH1003"]},
    ]
    course = next(c for c in from_instance_curriculum(cur)["courses"] if c["id"] == target)
    assert course["prerequisites"] == [["CO1005", "CO1007"], ["MT1003"]]
    assert course["corequisites"] == []
