"""Canonical instance format: loader/validator and the legacy converters."""

from __future__ import annotations

import copy
import json
import shutil
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PIPELINE))

from instances.importers.legacy import (  # noqa: E402
    ConversionError,
    from_data_curriculum,
    from_planner_fixture,
    hcmut_to_term,
    term_sequence,
    term_to_hcmut,
    to_data_curriculum,
    to_planner_fixture,
)
from instances.loader import InstanceError, load_university  # noqa: E402

INSTANCES = PIPELINE / "instances"
FIXTURES = PIPELINE / "planner" / "fixtures"


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


def test_committed_instances_match_their_legacy_sources():
    """Until the legacy files are deleted, the instances must stay generated from them."""
    assert _read(INSTANCES / "hcmut/curricula/cs_2023/curriculum.json") == from_data_curriculum(
        _read(PIPELINE / "data/curriculum.json"))
    conv = from_planner_fixture(_read(FIXTURES / "khmt2023.json"), "khmt2023-demo", "policy_2020")
    assert _read(INSTANCES / "hcmut/curricula/CS-2023-KHMT/curriculum.json") == conv["curriculum"]
    assert _read(INSTANCES / "hcmut/students/khmt2023-demo.json") == conv["students"]
    assert _read(INSTANCES / "hcmut/requests/khmt2023-demo.json") == conv["requests"]


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


def test_data_curriculum_round_trip_is_exact():
    raw = _read(PIPELINE / "data/curriculum.json")
    assert to_data_curriculum(from_data_curriculum(raw)) == raw


def test_data_curriculum_keeps_or_prerequisites():
    raw = _read(PIPELINE / "data/curriculum.json")
    raw["courses"][5]["prerequisites"] = [["CO1005", "CO1007"], ["MT1003"]]
    cur = from_data_curriculum(raw)
    mine = [r["any_of"] for r in cur["relations"] if r["course"] == raw["courses"][5]["id"]]
    assert ["CO1005", "CO1007"] in mine and ["MT1003"] in mine
    assert to_data_curriculum(cur) == raw


@pytest.mark.parametrize("fixture", ["toy.json", "khmt2023.json"])
def test_planner_fixture_conversion_is_a_fixed_point(fixture):
    fx = _read(FIXTURES / fixture)
    conv = from_planner_fixture(fx, "s")
    back = to_planner_fixture(conv["curriculum"], conv["students"], "s", conv["requests"])
    again = from_planner_fixture(back, "s")
    again["curriculum"]["_provenance"] = conv["curriculum"]["_provenance"]
    assert again == conv


def test_planner_fixture_rejects_gaps_in_semesters():
    fx = copy.deepcopy(_read(FIXTURES / "toy.json"))
    fx["semesters"].remove("261")
    with pytest.raises(ConversionError, match="not consecutive"):
        from_planner_fixture(fx, "s")


def test_cpsat_gives_the_same_result_on_converted_toy():
    pytest.importorskip("ortools")
    from planner.cli import run

    fx = _read(FIXTURES / "toy.json")
    conv = from_planner_fixture(fx, "s")
    back = to_planner_fixture(conv["curriculum"], conv["students"], "s", conv["requests"])

    def solve(f, scenario):
        payload = {k: v for k, v in f.items() if k != "scenarios"} | {"scenario": scenario}
        result = run(payload, "cpsat", 30.0, snapshot=None)
        result.pop("solve_ms", None)
        return result

    for original, converted in zip(fx["scenarios"], back["scenarios"]):
        assert solve(fx, original) == solve(back, converted), original["id"]
