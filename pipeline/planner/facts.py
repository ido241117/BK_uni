"""Doc va kiem tra dau vao (fixture + kich ban), cac luat dung chung cho moi bo giai.

Facts cho engine ASP do ``solve_asp.py`` sinh (xem ``ASP-ADAPTER.md``).
Moi thu khong ho tro duoc bao loi ro rang thay vi am tham bo qua.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

# Rang buoc cung. "prior" (hoc truoc) bi BO theo quyet dinh 18/11: chap nhan
# trong dau vao nhung khong xet. "recommended" (khuyen nghi) la mong muon mem S6.
HARD_RELATIONS = ("prerequisite", "corequisite")
SOFT_RELATIONS = ("recommended",)
IGNORED_RELATIONS = ("prior",)
ALL_RELATIONS = HARD_RELATIONS + SOFT_RELATIONS + IGNORED_RELATIONS
STATUSES = ("not-started", "in-progress", "completed", "failed")

# Thu tu uu tien mong muon mem (ke hoach muc 3.2). S5 chi xet khi bat balanced_load;
# S7 (it hoc he) va S9 (he uu tien mon dai cuong, co so nganh) khi sinh vien bat it nhat mot ky he; S8 (ky chinh 15-18 TC) khi co
# preferred_load.
DEFAULT_ORDER = ("S1", "S6", "S4", "S9", "S7", "S2", "S11", "S8", "S5", "S3", "S10")
RECOMMENDATIONS_FIRST_ORDER = ("S6", "S1", "S4", "S9", "S7", "S2", "S11", "S8", "S5", "S3", "S10")
DEFAULT_SUMMER_PREFERRED_LOAD = (6, 9)  # nguoi duyet chon 19/11
DEFAULT_SUMMER_MAX = 12  # nguoi duyet chon 19/11; QD 285 khong quy dinh


class FixtureError(ValueError):
    """Du lieu dau vao sai hoac dung tinh nang chua ho tro."""


def load_fixture(path: str | Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def get_scenario(fixture: dict[str, Any], scenario_id: str) -> dict[str, Any]:
    for scenario in fixture.get("scenarios", []):
        if scenario["id"] == scenario_id:
            return scenario
    raise FixtureError(f"khong co kich ban '{scenario_id}'")


def plan_semesters(fixture: dict[str, Any]) -> list[str]:
    """Cac ky con lai sau ky hien tai, theo thu tu thoi gian."""
    semesters = fixture["semesters"]
    current = fixture["student"]["current_semester"]
    if current not in semesters:
        raise FixtureError(f"current_semester '{current}' khong nam trong semesters")
    return semesters[semesters.index(current) + 1:]


def preferences(scenario: dict[str, Any]) -> dict[str, Any]:
    prefs = scenario.get("preferences") or {}
    return {
        "wanted_courses": list(prefs.get("wanted_courses", [])),
        "balanced_load": bool(prefs.get("balanced_load", False)),
        "recommendations_first": bool(prefs.get("recommendations_first", False)),
    }


def preferred_load(fixture: dict[str, Any], scenario: dict[str, Any]) -> tuple[int, int] | None:
    """Khoang tin chi dep cho ky chinh (S8). Kich ban ghi de ``rules.preferred_load``."""
    band = (scenario.get("preferences") or {}).get("preferred_load")
    if band is None:
        band = (fixture.get("rules") or {}).get("preferred_load")
    return (band[0], band[1]) if band else None


def preference_order(fixture: dict[str, Any], scenario: dict[str, Any]) -> list[str]:
    """Cac muc mem dang bat, tu uu tien cao xuong thap."""
    prefs = preferences(scenario)
    order = RECOMMENDATIONS_FIRST_ORDER if prefs["recommendations_first"] else DEFAULT_ORDER
    active = {
        "S5": prefs["balanced_load"],
        "S7": bool(scenario.get("summer_opt_in")),
        "S9": bool(scenario.get("summer_opt_in")),
        "S10": bool(scenario.get("summer_opt_in")),
        "S8": preferred_load(fixture, scenario) is not None,
    }
    return [s for s in order if active.get(s, True)]


def summer_preferred_load(fixture: dict[str, Any]) -> tuple[int, int]:
    """S7: khoang tin chi dep cua ky he co hoc (khong tinh thuc tap)."""
    band = (fixture.get("rules") or {}).get("summer_preferred_load", DEFAULT_SUMMER_PREFERRED_LOAD)
    return band[0], band[1]


def summer_specialized(fixture: dict[str, Any], course: str) -> bool:
    """S9: mon cap 3 tro len (nganh, chuyen nganh; QD 285 Phu luc 1) va khong phai thuc tap.

    Cap 1 la mon chung (dai cuong), cap 2 la co so nganh: ky he uu tien hai loai nay.
    """
    level = course_level(course)
    return level is not None and level >= 3 and course not in summer_courses(fixture)


def summer_allowed(fixture: dict[str, Any], scenario: dict[str, Any], course: str, semester: str) -> bool:
    """Mon ``course`` co duoc xep vao ky he ``semester`` khong (quyet dinh 19/11).

    Thuc tap (``rules.summer_courses``) luon duoc. Mon khac chi khi sinh vien bat ky he
    do (``scenario.summer_opt_in``) VA mon tung mo he trong lich su (``summer_history``;
    fixture khong co lich su thi khong loc).
    """
    if course in summer_courses(fixture):
        return True
    if course in set(fixture.get("summer_excluded", [])):  # do an khong hoc he (19/11)
        return False
    if semester not in (scenario.get("summer_opt_in") or []):
        return False
    history = fixture.get("summer_history")
    return history is None or course in history


def base_credit_limits(fixture: dict[str, Any]) -> tuple[int, int]:
    """Muc tin chi chung: ``rules`` neu co, khong thi lay cua chuong trinh."""
    rules = fixture.get("rules") or {}
    cur = fixture["curriculum"]
    return (
        rules.get("credits_min", cur["min_semester_credits"]),
        rules.get("credits_max", cur["max_semester_credits"]),
    )


def credit_limits(fixture: dict[str, Any], scenario: dict[str, Any]) -> dict[str, tuple[int, int]]:
    """{ma ky: (toi thieu, toi da)} cho cac ky se xep.

    Toi da = nho nhat cua muc chung, ``max_credits`` va ``semester_limits[ky].max``.
    Toi thieu CUNG chi khi sinh vien tu dat ``semester_limits[ky].min``. Muc chung (11 TC
    ky chinh) la mong muon mem S11 (quyet dinh 19/11): khong hoc thua de du 11.
    """
    lo, hi = base_credit_limits(fixture)
    cap = scenario.get("max_credits")
    if cap is not None:
        hi = min(hi, cap)
    out = {}
    for sem in plan_semesters(fixture):
        own = (scenario.get("semester_limits") or {}).get(sem, {})
        sem_hi = min(hi, (fixture.get("rules") or {}).get("summer_credits_max", DEFAULT_SUMMER_MAX)) \
            if is_summer(sem) else hi
        s_hi = min(sem_hi, own["max"]) if "max" in own else sem_hi
        s_lo = 0 if is_summer(sem) else own.get("min", 0)  # ky he khong co muc toi thieu
        out[sem] = (min(s_lo, s_hi), s_hi)
    return out


def is_summer(semester_code: str) -> bool:
    """Ma ky YYS voi S = 3 la ky he (QD 285 Dieu 6.1)."""
    return re.fullmatch(r"\d\d3", semester_code) is not None


def summer_courses(fixture: dict[str, Any]) -> set[str]:
    """Mon duoc xep vao ky he (H14: chi thuc tap ngoai truong)."""
    return set((fixture.get("rules") or {}).get("summer_courses", []))


def graduation_needs(fixture: dict[str, Any]) -> dict[str, int]:
    """{ma mon tot nghiep: so TC tich luy toi thieu truoc ky hoc mon do} (QD 285 Dieu 15.5).

    Mau so la tong TC chuong trinh (``_total_credits``, do normalize tinh).
    """
    thresholds = (fixture.get("rules") or {}).get("graduation_thresholds", {})
    courses = fixture.get("graduation_courses", {})
    total = fixture.get("_total_credits")
    out = {}
    for kind, code in courses.items():
        if kind in thresholds and total:
            out[code] = math.ceil(thresholds[kind] * total - 1e-9)
    return out


_LEVEL = re.compile(r"^[A-Za-z]+(\d)")


def course_level(code: str) -> int | None:
    """Cap do mon = chu so dau cua ma (QD 285 Phu luc 1: MMLXXX). None neu khong doc duoc."""
    m = _LEVEL.match(code)
    return int(m.group(1)) if m else None


def required_year(level: int) -> int:
    """QD 285 Dieu 15.4: cap 1 moi nam; cap 2 tu nam 2; cap 3 tro len tu nam 3."""
    return 1 if level <= 1 else 2 if level == 2 else 3


def semester_year(semester_code: str, cohort: int) -> int:
    """Nam hoc theo khoa (quyet dinh 18/11): ky YYS thuoc nam YY - (khoa mod 100) + 1."""
    return int(semester_code[:2]) - cohort % 100 + 1


def level_enabled(fixture: dict[str, Any]) -> bool:
    return bool((fixture.get("rules") or {}).get("course_level", False))


def validate_input(fixture: dict[str, Any], scenario: dict[str, Any]) -> None:
    codes = [c["code"] for c in fixture["courses"]]
    if len(codes) != len(set(codes)):
        raise FixtureError("trung ma mon trong courses")
    known = set(codes)
    in_curriculum = {cc["course_code"] for cc in fixture["curriculum_courses"]}

    def need(code: str, where: str) -> None:
        if code not in known:
            raise FixtureError(f"{where}: ma mon '{code}' khong ton tai")

    for code in in_curriculum:
        need(code, "curriculum_courses")
    for rel in fixture["course_relations"]:
        need(rel["course_code"], "course_relations")
        need(rel["related_course_code"], "course_relations")
        if rel["type"] not in ALL_RELATIONS:
            raise FixtureError(f"loai quan he khong ho tro: {rel['type']}")

    seen_member: dict[str, str] = {}
    for group in fixture["course_groups"]:
        if group["kind"] not in ("required", "elective"):
            raise FixtureError(f"kind khong ho tro: {group['kind']}")
        if group["kind"] == "elective" and group["required_count"] is None \
                and group["required_credits"] is None:
            raise FixtureError(f"khoi tu chon '{group['name']}' khong co nguong")
        for code in group["members"]:
            need(code, f"course_groups[{group['name']}]")
            if code in seen_member:
                raise FixtureError(
                    f"mon {code} thuoc 2 khoi ({seen_member[code]}, {group['name']}): "
                    "khoi chong lan chua duoc ho tro"
                )
            seen_member[code] = group["name"]

    plan = set(plan_semesters(fixture))
    policy = fixture["offerings"]["unknown_policy"]
    if policy != "assume-open":
        raise FixtureError(f"unknown_policy chua ho tro: {policy}")
    for rec in fixture["offerings"]["records"]:
        need(rec["course_code"], "offerings")
        if rec["status"] not in ("confirmed", "not-offered"):
            raise FixtureError(f"offering status khong ho tro: {rec['status']}")

    statuses: dict[str, str] = {}
    for sc in fixture["student"]["student_courses"]:
        need(sc["course_code"], "student_courses")
        if sc["status"] not in STATUSES:
            raise FixtureError(f"trang thai khong hop le: {sc['status']}")
        if sc["course_code"] in statuses:
            raise FixtureError(f"trung trang thai cho mon {sc['course_code']}")
        statuses[sc["course_code"]] = sc["status"]

    in_progress = {c for c, s in statuses.items() if s == "in-progress"}
    results = scenario.get("in_progress_results", {})
    if set(results) != in_progress:
        raise FixtureError(
            "kich ban phai gia dinh pass/fail cho DUNG cac mon dang hoc: "
            f"can {sorted(in_progress)}, nhan {sorted(results)}"
        )
    for code, result in results.items():
        if result not in ("pass", "fail"):
            raise FixtureError(f"ket qua gia dinh khong hop le cho {code}: {result}")

    for key in ("locked", "not_offered"):
        for item in scenario.get(key, []):
            need(item["course_code"], f"scenario.{key}")
            if item["semester_code"] not in plan:
                raise FixtureError(
                    f"scenario.{key}: ky {item['semester_code']} khong nam trong cac ky se xep"
                )

    def positive_int(value: Any, where: str) -> None:
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise FixtureError(f"{where}: phai la so nguyen khong am, nhan {value!r}")

    if scenario.get("max_credits") is not None:
        positive_int(scenario["max_credits"], "scenario.max_credits")
    for sem, own in (scenario.get("semester_limits") or {}).items():
        if sem not in plan:
            raise FixtureError(f"scenario.semester_limits: ky {sem} khong nam trong cac ky se xep")
        for k, v in own.items():
            if k not in ("min", "max"):
                raise FixtureError(f"scenario.semester_limits[{sem}]: khoa la {k}")
            positive_int(v, f"scenario.semester_limits[{sem}].{k}")
    deadline = scenario.get("graduate_by")
    if deadline is not None and deadline not in plan:
        raise FixtureError(f"scenario.graduate_by: ky {deadline} khong nam trong cac ky se xep")

    for sem in scenario.get("summer_opt_in") or []:
        if sem not in plan or not is_summer(sem):
            raise FixtureError(f"scenario.summer_opt_in: {sem} khong phai ky he con lai")
    raw_prefs = scenario.get("preferences") or {}
    for k in raw_prefs:
        if k not in ("wanted_courses", "balanced_load", "recommendations_first", "preferred_load"):
            raise FixtureError(f"scenario.preferences: khoa la {k}")
    band = preferred_load(fixture, scenario)
    if band is not None and not (isinstance(band[0], int) and isinstance(band[1], int) and 0 <= band[0] <= band[1]):
        raise FixtureError(f"preferred_load phai la [thap, cao], nhan {band}")
    for code in raw_prefs.get("wanted_courses", []):
        need(code, "scenario.preferences.wanted_courses")
        if code not in in_curriculum:
            raise FixtureError(f"scenario.preferences.wanted_courses: {code} khong thuoc chuong trinh")

    if level_enabled(fixture) and not isinstance(fixture["curriculum"].get("cohort"), int):
        raise FixtureError("rules.course_level can curriculum.cohort")
    for kind, code in (fixture.get("graduation_courses") or {}).items():
        if kind not in ("internship", "specialized_project", "thesis"):
            raise FixtureError(f"graduation_courses: loai la {kind}")
        if code not in in_curriculum:
            raise FixtureError(f"graduation_courses.{kind}: {code} khong thuoc chuong trinh")
    for code in summer_courses(fixture):
        need(code, "rules.summer_courses")


def assumptions(fixture: dict[str, Any], scenario: dict[str, Any]) -> list[str]:
    """Cac gia dinh ma ket qua phu thuoc vao, de in kem lo trinh."""
    notes = [
        f"Môn đang học {code}: giả định {'đậu' if r == 'pass' else 'rớt'}"
        for code, r in sorted(scenario["in_progress_results"].items())
    ]
    notes.append("Mọi môn xếp trong tương lai được giả định sẽ đậu")
    notes.append("Môn không có thông tin mở lớp được giả định là có mở")
    notes.append("Quan hệ học trước (HT) không được xét")
    notes.append("Khuyến nghị (KN) là mong muốn, không bắt buộc: có thể bị phá, xem phần mong muốn")
    notes.append("Kỳ khuyến nghị trong chương trình không bắt buộc")
    notes.append("Kỳ chính cố gắng đủ 11 TC nhưng không học thừa để đủ; kỳ nào dưới 11 TC có ghi chú để trao đổi phòng đào tạo")
    if level_enabled(fixture):
        notes.append("Năm học tính theo khóa; cấp độ môn lấy từ chữ số đầu của mã môn")
    if scenario.get("summer_opt_in"):
        notes.append("Kỳ hè bạn bật: chỉ xếp môn từng mở hè trong lịch sử, không xếp đồ án; tối đa "
                     f"{(fixture.get('rules') or {}).get('summer_credits_max', DEFAULT_SUMMER_MAX)} TC")
    else:
        notes.append("Không xếp môn thường vào kỳ hè (bạn chưa bật kỳ hè nào)")
    for item in scenario.get("locked", []):
        notes.append(f"Bạn khóa {item['course_code']} vào kỳ {item['semester_code']}")
    for item in scenario.get("not_offered", []):
        notes.append(f"Giả định {item['course_code']} không mở kỳ {item['semester_code']}")
    return notes
