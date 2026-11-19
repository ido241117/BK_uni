"""Pins/bans, fills-next terms, typical terms, interests, slots, notes,
popularity and elective symmetry breaking."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest

from data import DataError, parse_popularity
from engine import SolverOptions, plans_from_solutions, solve
from translation import (
    build_curriculum,
    build_policy,
    elective_classes,
    student_to_facts,
)
from cli import render_solutions
from support import tiny_policy


def _course(cid: str, credits: int, **extra: Any) -> dict[str, Any]:
    course = {
        "id": cid,
        "name": f"Course {cid}",
        "credits": credits,
        "prerequisites": [],
        "corequisites": [],
        "offered_terms": [1, 2, 3],
    }
    course.update(extra)
    return course


# 15 credits: 9 mandatory, one 3-credit elective, a 1-credit project and a
# 2-credit internship.  E3001..E3003 are interchangeable; E3004 has a tag.
FEATURE_CURRICULUM: dict[str, Any] = {
    "schema_version": 1,
    "id": "feat",
    "name": "Feature Test Curriculum",
    "total_credits": 15,
    "courses": [
        _course("M1001", 3),
        _course("M1002", 3),
        _course("M2001", 3, prerequisites=[["M1001"]]),
        _course("E3001", 3),
        _course("E3002", 3),
        _course("E3003", 3),
        _course("E3004", 3, tags=["ml"]),
        _course("P3001", 1, typical_regular_term=2),
        _course(
            "I3001", 2, fills_next_term=True, note="needs faculty information"
        ),
    ],
    "groups": [
        {"id": "CORE", "type": "mandatory",
         "course_ids": ["M1001", "M1002", "M2001", "P3001", "I3001"]},
        {"id": "EL", "type": "elective", "min_credits": 3, "max_credits": 3,
         "course_ids": ["E3001", "E3002", "E3003", "E3004"]},
    ],
    "majors": [],
    "default_major": "Feat",
}


def _policy():
    return tiny_policy(min_total_credits=15)


def _write(
    directory: Path,
    curriculum: dict[str, Any],
    popularity: dict[str, int] | None = None,
    strip_classes: bool = False,
) -> tuple[Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    policy = _policy()
    curriculum_text = build_curriculum(curriculum, policy, popularity)
    if strip_classes:
        curriculum_text = "\n".join(
            line for line in curriculum_text.splitlines()
            if not line.startswith("elective_class(")
        )
    curriculum_path = directory / "feat.lp"
    curriculum_path.write_text(curriculum_text, encoding="utf-8")
    policy_path = directory / "policy.lp"
    policy_path.write_text(
        build_policy(policy)
        + "\nmoney_scale(1).\nmoney_currency(vnd).\nmoney_unit(unit).\n"
        "fee_rule(regular, 0, 999, 0, 0, 0).\nfee_rule(summer, 0, 999, 0, 0, 0).\n",
        encoding="utf-8",
    )
    return curriculum_path, policy_path


def _solutions(
    directory: Path,
    student: str = "",
    *,
    curriculum: dict[str, Any] | None = None,
    popularity: dict[str, int] | None = None,
    strip_classes: bool = False,
    horizon: int = 6,
    max_load: int = 6,
    allow_summer: bool = True,
    studied_terms: int | None = None,
    plans: int = 1,
    opt_mode: str = "optN",
):
    curriculum = curriculum or FEATURE_CURRICULUM
    curriculum_path, policy_path = _write(
        directory, curriculum, popularity, strip_classes
    )
    student_path = directory / "student.lp"
    student_path.write_text(student, encoding="utf-8")
    return solve(
        curriculum_path,
        policy_path,
        student_path,
        SolverOptions(
            horizon=horizon,
            studied_terms=studied_terms,
            plans=plans,
            min_load=3,
            max_load=max_load,
            allow_summer=allow_summer,
            opt_mode=opt_mode,
            fill=False,
        ),
    )


def _plan(directory: Path, student: str = "", **kwargs):
    curriculum = kwargs.get("curriculum") or FEATURE_CURRICULUM
    solutions = _solutions(directory, student, **kwargs)
    plans = plans_from_solutions(solutions, curriculum, _policy())
    assert plans, f"expected a plan, got {[s.status for s in solutions]}"
    assert plans[0].optimal
    return plans[0]


def _terms(plan) -> dict[str, int]:
    return {
        course.code: semester.semester
        for semester in plan.semesters
        for course in semester.courses
    }


def _course_in(plan, code: str):
    return next(
        course
        for semester in plan.semesters
        for course in semester.courses
        if course.code == code
    )


def _electives(plan) -> list[str]:
    return [code for code in _terms(plan) if code.startswith("E")]


def _objective(plan) -> dict[str, int]:
    return dict(plan.objective_by_level)


# ---------------------------------------------------------------------------
# Pins and bans
# ---------------------------------------------------------------------------
def test_pin_places_the_course_in_the_pinned_term(tmp_path: Path) -> None:
    free = _plan(tmp_path / "free", allow_summer=False)
    assert _terms(free)["M1002"] != 4
    pinned = _plan(tmp_path / "pin", "pin(m1002, 4).", allow_summer=False)
    assert _terms(pinned)["M1002"] == 4


def test_pin_into_a_closed_term_is_unsatisfiable(tmp_path: Path) -> None:
    solutions = _solutions(tmp_path, "pin(m1002, 4). closed(m1002, 4).")
    assert [s.status for s in solutions] == ["UNSATISFIABLE"]


def test_ban_removes_courses_from_the_plan(tmp_path: Path) -> None:
    plan = _plan(tmp_path, "ban(e3001). ban(e3002). ban(e3003).")
    assert _electives(plan) == ["E3004"]


def test_banning_a_compulsory_course_is_unsatisfiable(tmp_path: Path) -> None:
    solutions = _solutions(tmp_path, "ban(m1002).")
    assert [s.status for s in solutions] == ["UNSATISFIABLE"]


def test_term_ban_moves_the_course_out_of_that_term_only(tmp_path: Path) -> None:
    free = _plan(tmp_path / "free", allow_summer=False)
    term = _terms(free)["M1002"]
    banned = _plan(tmp_path / "ban", f"ban(m1002, {term}).", allow_summer=False)
    assert "M1002" in _terms(banned)
    assert _terms(banned)["M1002"] != term


def test_term_ban_on_a_pinned_term_is_unsatisfiable(tmp_path: Path) -> None:
    solutions = _solutions(tmp_path, "pin(m1002, 4). ban(m1002, 4).")
    assert [s.status for s in solutions] == ["UNSATISFIABLE"]


# ---------------------------------------------------------------------------
# fills_next: the following term is kept empty
# ---------------------------------------------------------------------------
def test_fills_next_keeps_the_following_summer_empty(tmp_path: Path) -> None:
    # Without the attribute, the optimum uses summer term 3 and ends there.
    plain = copy.deepcopy(FEATURE_CURRICULUM)
    for course in plain["courses"]:
        course.pop("fills_next_term", None)
    without = _plan(tmp_path / "without", "pin(i3001, 2).", curriculum=plain)
    assert without.last_semester == 3
    assert without.reserved == []

    plan = _plan(tmp_path / "with", "pin(i3001, 2).")
    terms = _terms(plan)
    assert terms["I3001"] == 2
    assert 3 not in terms.values()
    assert plan.last_semester == 4
    assert plan.reserved == [
        {"semester": 3, "code": "I3001", "name": "Course I3001"}
    ]


def test_fills_next_applies_to_an_in_progress_history_attempt(
    tmp_path: Path,
) -> None:
    student = (
        "taken(i3001, 2). attempt_count(i3001, 1). last_attempt(i3001, i3001).\n"
    )
    plan = _plan(tmp_path, student, studied_terms=2)
    assert 3 not in _terms(plan).values()
    assert [item["semester"] for item in plan.reserved] == [3]


# ---------------------------------------------------------------------------
# Typical term (half-step distance from the K-th regular term)
# ---------------------------------------------------------------------------
def test_typical_term_places_the_project_in_its_regular_term(
    tmp_path: Path,
) -> None:
    plan = _plan(tmp_path, allow_summer=False)
    assert _terms(plan)["P3001"] == 2
    assert _objective(plan)["typical_term"] == 0


@pytest.mark.parametrize("term, gap", [(1, 2), (3, 1), (4, 2), (5, 4)])
def test_typical_term_distance_counts_summer_as_a_half_step(
    tmp_path: Path, term: int, gap: int
) -> None:
    # Terms 1, 2 regular (core 1, 2), 3 summer, 4, 5 regular (core 3, 4).
    plan = _plan(tmp_path, f"pin(p3001, {term}).", horizon=6, max_load=9)
    assert _terms(plan)["P3001"] == term
    assert _objective(plan)["typical_term"] == gap


# ---------------------------------------------------------------------------
# Interests, automatic major tags, pref/avoid
# ---------------------------------------------------------------------------
def test_positive_interest_selects_a_tagged_elective(tmp_path: Path) -> None:
    plan = _plan(tmp_path, "interest(ml, 5).")
    assert _electives(plan) == ["E3004"]
    assert _objective(plan)["taste"] == -5
    slot = _course_in(plan, "E3004").slot
    assert slot is not None and slot.interests == ["ml"]
    assert slot.label(3) == "one EL elective (3 credits)"
    text = render_solutions(
        _solutions(tmp_path / "text", "interest(ml, 5)."),
        FEATURE_CURRICULUM, _policy(), "text",
    )
    assert "interest: ml" in text


def test_negative_interest_avoids_a_tagged_elective(tmp_path: Path) -> None:
    plan = _plan(tmp_path, "interest(ml, -5). ban(e3001).")
    assert _electives(plan) in (["E3002"], ["E3003"])


def test_major_lists_are_automatic_tags(tmp_path: Path) -> None:
    curriculum = copy.deepcopy(FEATURE_CURRICULUM)
    curriculum["majors"] = [
        {"id": "AI", "name": "AI", "rule": {
            "type": "required_courses", "min_courses": 1,
            "course_ids": ["E3002"]}}
    ]
    plan = _plan(tmp_path, "interest(ai, 3).", curriculum=curriculum)
    assert _electives(plan) == ["E3002"]


def test_course_id_interest_names_the_course(tmp_path: Path) -> None:
    plan = _plan(tmp_path, "interest(e3003, 10).")
    course = _course_in(plan, "E3003")
    assert course.slot is None  # named by the student
    assert _objective(plan)["taste"] == -10
    disliked = _plan(tmp_path / "neg", "interest(e3004, -10). interest(ml, 5).")
    # +5 from the tag, -10 on the course id: E3004 now scores -5.
    assert _electives(disliked) != ["E3004"]


# ---------------------------------------------------------------------------
# Slots and notes
# ---------------------------------------------------------------------------
def test_unnamed_electives_are_reported_as_slots(tmp_path: Path) -> None:
    plan = _plan(tmp_path)
    (code,) = _electives(plan)
    slot = _course_in(plan, code).slot
    assert slot is not None
    assert slot.group == "EL"
    assert slot.representative == code
    assert slot.label(3) == "one EL elective (3 credits)"
    if code in {"E3001", "E3002", "E3003"}:
        assert sorted(slot.options + [code]) == ["E3001", "E3002", "E3003"]
    text = render_solutions(
        _solutions(tmp_path / "again"), FEATURE_CURRICULUM, _policy(), "text"
    )
    assert "slot      one EL elective (3 credits)" in text


def test_declared_major_labels_the_slot(tmp_path: Path) -> None:
    curriculum = copy.deepcopy(FEATURE_CURRICULUM)
    curriculum["majors"] = [
        {"id": "AI", "name": "Applied AI", "rule": {
            "type": "required_courses", "min_courses": 1,
            "course_ids": ["E3002"]}}
    ]
    plan = _plan(tmp_path, "student_major(ai).", curriculum=curriculum)
    slot = _course_in(plan, "E3002").slot
    assert plan.declared_major == "AI"
    assert slot is not None and slot.major == "AI"
    assert slot.label(3) == "one EL elective (3 credits), AI major course"


def test_notes_are_attached_to_planned_courses(tmp_path: Path) -> None:
    plan = _plan(tmp_path)
    assert _course_in(plan, "I3001").note == "needs faculty information"
    assert _course_in(plan, "M1001").note is None
    payload = plan.to_dict()
    notes = {
        course["code"]: course["note"]
        for semester in payload["semesters"]
        for course in semester["courses"]
    }
    assert notes["I3001"] == "needs faculty information"


# ---------------------------------------------------------------------------
# Symmetry breaking keeps the optimum and removes permutations
# ---------------------------------------------------------------------------
def test_symmetry_breaking_keeps_the_optimum_and_drops_permutations(
    tmp_path: Path,
) -> None:
    curriculum = copy.deepcopy(FEATURE_CURRICULUM)
    curriculum["courses"] = [
        course for course in curriculum["courses"] if course["id"] != "E3004"
    ]
    curriculum["groups"][1]["course_ids"] = ["E3001", "E3002", "E3003"]

    with_sym = _plan(tmp_path / "sym", curriculum=curriculum)
    without = _plan(tmp_path / "nosym", curriculum=curriculum, strip_classes=True)
    assert with_sym.objective == without.objective
    assert _electives(with_sym) == ["E3001"]  # the lowest-ranked member

    def count(strip: bool) -> int:
        solutions = _solutions(
            tmp_path / f"enum-{strip}", curriculum=curriculum,
            strip_classes=strip, plans=0, opt_mode="ignore", allow_summer=False,
            horizon=4,
        )
        return len({tuple(sorted(map(str, s.symbols))) for s in solutions})

    assert count(strip=False) * 3 == count(strip=True)


def test_student_specific_courses_are_exempt_from_symmetry(tmp_path: Path) -> None:
    # E3003 is pinned: the rule must not force E3001 to be used first.
    plan = _plan(tmp_path, "pin(e3003, 2).")
    assert _electives(plan) == ["E3003"]


def test_elective_classes_group_only_identical_courses() -> None:
    curriculum = copy.deepcopy(FEATURE_CURRICULUM)
    assert elective_classes(curriculum) == [["E3001", "E3002", "E3003"]]
    # A course required by another course is no longer interchangeable.
    curriculum["courses"][2]["prerequisites"] = [["M1001"], ["E3002"]]
    assert elective_classes(curriculum) == [["E3001", "E3003"]]
    # Different popularity separates otherwise identical courses.
    assert elective_classes(FEATURE_CURRICULUM, {"E3001": 5}) == [
        ["E3002", "E3003"]
    ]


# ---------------------------------------------------------------------------
# Popularity
# ---------------------------------------------------------------------------
def test_popularity_breaks_ties_toward_the_most_taken_elective(
    tmp_path: Path,
) -> None:
    plan = _plan(
        tmp_path, popularity={"E3001": 5, "E3002": 50, "E3003": 10, "E3004": 1}
    )
    assert _electives(plan) == ["E3002"]
    assert _objective(plan)["popularity"] == 0


def test_interest_outranks_popularity(tmp_path: Path) -> None:
    plan = _plan(
        tmp_path, "interest(ml, 1).",
        popularity={"E3001": 5, "E3002": 50, "E3003": 10, "E3004": 1},
    )
    assert _electives(plan) == ["E3004"]


def test_parse_popularity_skips_placeholders_and_validates() -> None:
    raw = {
        "schema_version": 1,
        "curriculum_id": "feat",
        "courses": [
            {"course": "E3001", "count": 12},
            {"course": "E3002", "count": None},
        ],
    }
    assert parse_popularity(raw, FEATURE_CURRICULUM) == {"E3001": 12}
    bad = copy.deepcopy(raw)
    bad["courses"].append({"course": "X9999", "count": 1})
    with pytest.raises(DataError, match="unknown course"):
        parse_popularity(bad, FEATURE_CURRICULUM)
    bad = copy.deepcopy(raw)
    bad["courses"].append({"course": "E3002", "count": 1})
    with pytest.raises(DataError, match="duplicate"):
        parse_popularity(bad, FEATURE_CURRICULUM)
    bad = copy.deepcopy(raw)
    bad["courses"][0]["count"] = -1
    with pytest.raises(DataError, match="non-negative"):
        parse_popularity(bad, FEATURE_CURRICULUM)
    bad = copy.deepcopy(raw)
    bad["curriculum_id"] = "other"
    with pytest.raises(DataError, match="does not match"):
        parse_popularity(bad, FEATURE_CURRICULUM)


def test_checked_in_popularity_placeholder_has_no_effect() -> None:
    import json

    data_dir = Path(__file__).resolve().parents[3] / "data"
    curriculum = json.loads((data_dir / "curriculum.json").read_text("utf-8"))
    raw = json.loads((data_dir / "elective_popularity.json").read_text("utf-8"))
    assert parse_popularity(raw, curriculum) == {}
    electives = {
        cid
        for group in curriculum["groups"]
        if group["type"] == "elective"
        for cid in group["course_ids"]
    }
    assert {row["course"] for row in raw["courses"]} == electives


# ---------------------------------------------------------------------------
# Student JSON: pin, ban, interests
# ---------------------------------------------------------------------------
def _student(**extra: Any) -> dict[str, Any]:
    student = {
        "student_id": "T9",
        "enrollment_term": "2024-1",
        "as_of_term": "2024-2",
        "attempts": [{"course": "M1001", "term": "2024-1", "grade": "A"}],
    }
    student.update(extra)
    return student


def test_student_json_emits_pin_ban_and_interest_facts() -> None:
    curriculum = copy.deepcopy(FEATURE_CURRICULUM)
    curriculum["majors"] = [
        {"id": "AI", "name": "AI", "rule": {
            "type": "required_courses", "min_courses": 1,
            "course_ids": ["E3002"]}}
    ]
    facts = student_to_facts(
        _student(
            pin=[{"course": "I3001", "term": "2025-2"}],
            ban=["E3001", {"course": "E3002", "term": "2025-1"}],
            interests={"AI": 4, "ml": -2, "E3003": 7},
        ),
        curriculum=curriculum,
    ).facts
    assert "pin(i3001, 5)." in facts
    assert "ban(e3001)." in facts
    assert "ban(e3002, 4)." in facts
    assert "interest(ai, 4)." in facts
    assert "interest(ml, -2)." in facts
    assert "interest(e3003, 7)." in facts


@pytest.mark.parametrize(
    "extra, message",
    [
        ({"pin": [{"course": "M1002", "term": "2024-2"}]}, "only future terms"),
        ({"pin": [{"course": "X9", "term": "2025-1"}]}, "unknown course"),
        ({"ban": ["X9"]}, "unknown course"),
        ({"ban": [{"course": "X9", "term": "2025-1"}]}, "unknown course"),
        ({"ban": [{"course": "E3001", "term": "2024-2"}]}, "only future terms"),
        ({"prefer": ["E3001"]}, "no longer supported"),
        ({"avoid": ["E3001"]}, "no longer supported"),
        ({"interests": {"robotics": 3}}, "unknown keyword"),
        ({"interests": {"ml": 0}}, "non-zero"),
        ({"interests": {"ml": 11}}, "non-zero"),
        ({"interests": {"ml": "high"}}, "must be an integer"),
        ({"interests": ["ml"]}, "expected an object"),
    ],
)
def test_student_json_rejects_bad_planning_inputs(
    extra: dict[str, Any], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        student_to_facts(_student(**extra), curriculum=FEATURE_CURRICULUM)
