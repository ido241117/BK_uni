"""Adapter: planner JSON -> engine ASP (``pipeline/planner/solvers/asp``) -> ket qua chung.

Day la cau noi DUY NHAT giua dau vao cua web (JSON do backend ghep tu database, xem
``Backend/src/planner/planner-input.ts``) va engine ASP. Engine khong biet JSON; adapter
khong chua luat. Tai lieu day du: ``pipeline/planner/solvers/asp/ADAPTER.md``.

    from planner.solvers.asp.adapter import solve_asp
    result = solve_asp(fixture, scenario, previous_plan=None, time_limit=30.0)

Cung chu ky va cung dang ket qua voi ``solve_cpsat`` (qua ``result.make_result``), cong them
``engine_report`` (GPA, chuyen nganh, dieu kien tot nghiep, lich su mo lop, hoc phi, tag).

Chuong trinh Clingo duoc nap theo thu tu:
    core/encoding.lp  core/extension.lp  policy.lp  <facts cua adapter>
    core/translate.lp  core/optimize.lp
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import clingo

from planner.model.facts import (
    FixtureError,
    course_level,
    graduation_needs,
    level_enabled,
    plan_semesters,
    required_year,
    semester_year,
    validate_input,
)
from planner.model.normalize import normalize
from planner.model.result import make_result

ASP_DIR = Path(__file__).resolve().parent
PIPELINE = ASP_DIR.parents[2]
SOURCES_BEFORE = (ASP_DIR / "core" / "encoding.lp", ASP_DIR / "core" / "extension.lp", ASP_DIR / "policy.lp")
SOURCES_AFTER = (ASP_DIR / "core" / "translate.lp", ASP_DIR / "core" / "optimize.lp")
TAGS_FILE = PIPELINE / "instances" / "hcmut" / "course-tags.json"
ALIASES_FILE = PIPELINE / "instances" / "importers" / "hcmut" / "mybk-code-aliases.json"
# So luong Clingo (portfolio cau hinh). Do 20/11/2026 tren du lieu that (KHMT, 21 ky): 1 luong het 30 s
# chua chung minh toi uu va nghiem kem hon; 4 luong tim nghiem tot nhat trong 30 s o ca 3 lan chay,
# chung minh toi uu 1/3 lan. planner/solvers/asp/ADAPTER.md muc 8.
THREADS = 4

SEMESTER = re.compile(r"^(\d\d)([123])$")
GRADES = {"A+": "a_plus", "A": "a", "B+": "b_plus", "B": "b", "C+": "c_plus", "C": "c",
          "D+": "d_plus", "D": "d", "F": "f"}  # ky hieu diem chu trong policy.lp
OBJECTIVE_LEVELS = ("gaps", "last_semester", "retakes", "offering_history", "cost",
                    "typical_term", "level_order", "balance", "taste")  # @8 .. @0 (optimize.lp)


# --- Tien ich -----------------------------------------------------------------

def _q(value: str) -> str:
    """Chuoi ASP co nhay kep (ma mon giu nguyen, khoi phuc duoc khi doc ket qua)."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _load_json(path: Path, default: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def _policy_constants() -> dict[str, int]:
    """``#const`` trong policy.lp (muc tin chi), de doi chieu voi du lieu chuong trinh."""
    text = (ASP_DIR / "policy.lp").read_text(encoding="utf-8")
    return {m.group(1): int(m.group(2)) for m in re.finditer(r"#const\s+(\w+)\s*=\s*(-?\d+)\s*\.", text)}


def _parse_score(value: Any) -> int | None:
    """Diem he 10 dang chuoi ("7.5", "7,5") hoac so -> so nguyen x100; khong doc duoc -> None."""
    if value is None:
        return None
    try:
        score = float(str(value).strip().replace(",", "."))
    except ValueError:
        return None
    return round(score * 100) if 0 <= score <= 10 else None


class Calendar:
    """Doi ma ky YYS sang chi so ky cua engine: ky 1 la ky dau tien trong ``semesters``.

    Engine danh so ky lien tuc (ky 1, 2, he, 1, 2, he...), nen chi so tinh tu ma ky,
    khong tu vi tri trong danh sach (fixture co the bo qua ky he).
    """

    def __init__(self, semesters: list[str]):
        bad = [s for s in semesters if not SEMESTER.match(s)]
        if bad:
            raise FixtureError(f"engine ASP can ma ky dang YYS (vd 251, 253), nhan {bad[:3]}")
        first = SEMESTER.match(semesters[0])
        self.year0, self.part0 = int(first.group(1)), int(first.group(2))

    @property
    def enroll_part(self) -> int:
        return self.part0

    def index(self, code: str) -> int:
        m = SEMESTER.match(code)
        if not m:
            raise FixtureError(f"ma ky khong hop le: {code}")
        return (int(m.group(1)) - self.year0) * 3 + (int(m.group(2)) - self.part0) + 1

    def code(self, index: int) -> str:
        k = (index - 1) + (self.part0 - 1)
        return f"{self.year0 + k // 3:02d}{k % 3 + 1}"


# --- Sinh facts ---------------------------------------------------------------

def build_program(fixture: dict[str, Any], scenario: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Fixture DA chuan hoa + kich ban -> (facts, ngu canh de doc ket qua).

    Ham thuan, khong goi Clingo: test duoc rieng.
    """
    cal = Calendar(fixture["semesters"])
    plan = plan_semesters(fixture)
    current = fixture["student"]["current_semester"]
    t = cal.index(current)
    deadline = scenario.get("graduate_by")
    n = cal.index(deadline) if deadline else (cal.index(plan[-1]) if plan else t)
    future = range(t + 1, n + 1)
    plan_index = {code: cal.index(code) for code in plan if cal.index(code) <= n}
    credits = {c["code"]: c["credits"] for c in fixture["courses"]}
    out: list[str] = [f"enroll_part_in({cal.enroll_part})."]
    warnings: list[str] = []

    # Ky trong khoang t+1..n ma fixture khong cho xep (vd fixture khong liet ke ky he do).
    plannable = set(plan_index.values())
    out.extend(f"empty(s({i}))." for i in future if i not in plannable)

    # -- Chuong trinh: khoi, tin chi, quan he -----------------------------------
    members: set[str] = set()
    lower_total = 0
    for k, group in enumerate(fixture["course_groups"], start=1):
        gid = f"g{k}"
        codes = sorted(group["members"])
        members.update(codes)
        out.extend(f"in({_q(c)}, {gid})." for c in codes)
        member_credits = sum(credits[c] for c in codes)
        if group["kind"] == "required":
            lo, hi = member_credits, member_credits
        else:
            out.append(f"elective_group({gid}).")
            lo, hi = group["required_credits"] or 0, member_credits
            if group["required_count"] is not None:
                out.append(f"map(min_courses, {gid}, {group['required_count']}).")
        out.append(f"map(l, {gid}, {lo}). map(u, {gid}, {hi}).  % {group['name']}")
        lower_total += lo
    out.extend(f"map(c, {_q(c)}, {credits[c]})." for c in sorted(members))
    # total_degree tu chinh cac khoi (khong de trong policy.lp vi moi chuong trinh khac nhau).
    out.append(f"map(l, total_degree, {lower_total}). "
               f"map(u, total_degree, {sum(credits[c] for c in members)}).")

    for rel in fixture["course_relations"]:
        course, related = rel["course_code"], rel["related_course_code"]
        if course not in members:
            continue
        if rel["type"] == "prerequisite":
            out.append(f"prereq({_q(course)}, {_q(related)}).")
        elif rel["type"] == "corequisite":
            out.append(f"coreq({_q(course)}, {_q(related)}).")
        # "prior" bi bo (18/11); "recommended" engine chua co muc tieu tuong ung.

    for code in sorted(members):
        level = course_level(code)
        if level is not None:
            out.append(f"course_level({_q(code)}, {level}).")

    # Cap do mon (QD 285 Dieu 15.4): mon cap L chi tu nam required_year(L).
    if level_enabled(fixture):
        cohort = fixture["curriculum"]["cohort"]
        for code in sorted(members):
            level = course_level(code)
            if level is None:
                continue
            need = required_year(level)
            for i in future:
                if semester_year(cal.code(i), cohort) < need:
                    out.append(f"ban({_q(code)}, {i}).")

    # Internship (rules.summer_courses, KHMT 2023: CO3335): registered in a term with its
    # credits and fee there, carried out in the following term, which the engine keeps empty
    # (fills_next, extension.lp section 17). No placement restriction: usually semester 6
    # with the internship in the summer after.
    internships = set((fixture.get("rules") or {}).get("summer_courses", [])) & members
    for code in sorted(internships):
        out.append(f"fills_next({_q(code)}).")

    # Mon tot nghiep (QD 285 Dieu 15.5). TC ngoai chuong trinh (da tinh vao tu chon tu do)
    # khong nam trong engine nen tru truoc.
    # Counting (23/11/2026): credits before the course's term plus the other courses of that
    # term (the course itself excluded), for every graduation course.
    outside = fixture.get("_free_outside_credits", 0)
    for code, need in sorted(graduation_needs(fixture).items()):
        if code in members:
            out.append(f"milestone({_q(code)}, {max(0, need - outside)}).")

    # Lich su mo lop -> offer_hist/offer_seen (muc tieu mem @5).
    history = fixture.get("opened_semesters") or {}
    seen: dict[int, set[str]] = {}
    for sems in history.values():
        for sem in sems:
            m = SEMESTER.match(sem)
            if m:
                seen.setdefault(int(m.group(2)), set()).add(sem)
    out.extend(f"offer_seen({part}, {len(sems)})." for part, sems in sorted(seen.items()))
    for code in sorted(members):
        counts: dict[int, int] = {}
        for sem in set(history.get(code, [])):
            m = SEMESTER.match(sem)
            if m:
                counts[int(m.group(2))] = counts.get(int(m.group(2)), 0) + 1
        out.extend(f"offer_hist({_q(code)}, {part}, {cnt})." for part, cnt in sorted(counts.items()))

    # Chuyen nganh -> major (dem so mon, dung required_count cua khoi con).
    target = fixture["student"].get("target_specialization")
    for spec in fixture.get("_specializations", []):
        major = _q(spec["code"])
        out.append(f"major({major}).")
        out.extend(f"major_course({major}, {_q(c)})." for c in sorted(spec["members"]) if c in members)
        if spec["required_count"] is not None:
            out.append(f"major_min({major}, {spec['required_count']}).")
            if spec["code"] == target:
                out.append(f"student_major({major}).")

    # Tags (pipeline/instances/hcmut/course-tags.json, written by pipeline/tag_classifier): the list of the
    # student's program family (all cohorts of the program), else the merged list of every family.
    tag_file = _load_json(TAGS_FILE, {})
    family = (tag_file.get("families") or {}).get(fixture["curriculum"].get("code"))
    tags = (tag_file.get("by_family") or {}).get(family) if family else None
    if tags is None:
        tags = tag_file.get("tags") or {}
    course_tags: dict[str, list[str]] = {}
    for tag, codes in sorted(tags.items()):
        for code in codes:
            if code in members:
                out.append(f"tag({_q(code)}, {_q(tag)}).")
                course_tags.setdefault(code, []).append(tag)

    # -- Sinh vien -------------------------------------------------------------
    statuses = {sc["course_code"]: sc["status"] for sc in fixture["student"]["student_courses"]}
    results = scenario.get("in_progress_results", {})
    grades: dict[str, dict[str, Any]] = {}
    for row in fixture["student"].get("scores") or []:
        grades[row["code"]] = row
    unknown_letters: set[str] = set()
    for code in sorted(members):
        status = statuses.get(code, "not-started")
        row = grades.get(code, {})
        score = _parse_score(row.get("score"))
        letter = row.get("letter")
        if status == "not-started" and not (score is not None and score < 400):
            continue  # chua hoc (diem rot tu file myBK van tinh la mot lan hoc rot)
        a = _q(code)
        out.append(f"taken({a}, {t}). attempt_count({a}, 1). last_attempt({a}, {a}).")
        if status == "in-progress":
            if results.get(code) == "fail":
                out.append(f"result({a}, failed).")
            continue  # dang hoc, gia dinh dau: engine ghi nhan lac quan (status unknown)
        if letter in GRADES:
            out.append(f"map(g, {a}, {GRADES[letter]}).")
        elif letter:
            unknown_letters.add(str(letter))
        if score is not None:
            out.append(f"raw_score({a}, {score}).")
        elif letter not in GRADES:
            out.append(f"result({a}, {'passed' if status == 'completed' else 'failed'}).")
    if unknown_letters:
        warnings.append(f"Điểm chữ không có trong thang điểm của policy.lp, bỏ qua khi tính GPA: "
                        f"{', '.join(sorted(unknown_letters))}")

    # Dieu kien tot nghiep (nhom E: ENG_GC, SA4001...) -> external_requirement.
    aliases = _load_json(ALIASES_FILE, {}).get("aliases") or {}
    passed_conditions = {code for code, st in (fixture.get("_condition_statuses") or {}).items()
                         if st == "completed"}
    for row in fixture["student"].get("graduation_conditions") or []:
        if row.get("passed"):
            # Chuong trinh co the dung ma goc (ENG_GC) hoac ma myBK (ENG_GC_600): nhan ca hai.
            passed_conditions.update({row["code"], aliases.get(row["code"], row["code"])})
    for code in fixture.get("conditions", []):
        r = _q(code)
        out.append(f"external_requirement({r}, course, cumulative, blocking). "
                   f"external_milestone({r}, graduation, 1).")
        if code in passed_conditions:
            out.append(f"external_progress({r}, {t}, 1).")

    # -- Kich ban --------------------------------------------------------------
    def future_index(code: str, where: str) -> int:
        if code not in plan_index:
            raise FixtureError(f"{where}: ky {code} khong nam trong cac ky se xep")
        return plan_index[code]

    for item in scenario.get("locked", []):
        out.append(f"pin({_q(item['course_code'])}, {future_index(item['semester_code'], 'scenario.locked')}).")
    blocked = [r for r in fixture["offerings"]["records"] if r["status"] == "not-offered"]
    blocked += scenario.get("not_offered", [])
    for rec in blocked:
        if rec["semester_code"] in plan_index:
            out.append(f"closed({_q(rec['course_code'])}, {plan_index[rec['semester_code']]}).")
    if scenario.get("max_credits") is not None:
        out.extend(f"sem_max({i}, {scenario['max_credits']})." for i in future)
    for sem, own in (scenario.get("semester_limits") or {}).items():
        i = future_index(sem, "scenario.semester_limits")
        if "max" in own:
            out.append(f"sem_max({i}, {own['max']}).")
        if "min" in own:
            out.append(f"sem_min({i}, {own['min']}).")
    for sem in scenario.get("skip_semesters") or []:
        out.append(f"skip({future_index(sem, 'scenario.skip_semesters')}).")

    # Interests: tag names the student picked (Clingo tab). Weight 1 each; optimize.lp maximises the
    # summed weights of the planned electives' tags, at the lowest priority (taste).
    interests = scenario.get("interests") or []
    if not isinstance(interests, list) or not all(isinstance(x, str) and x for x in interests):
        raise FixtureError("scenario.interests: expected a list of tag names")
    interests = sorted(set(interests))
    tagged = {tag for course_tag_list in course_tags.values() for tag in course_tag_list}
    for tag in interests:
        out.append(f"interest({_q(tag)}, 1).")
        if tag not in tagged:
            warnings.append(f'Interest "{tag}" has no course in your program, so it does not change the plan.')

    # -- Doi chieu muc tin chi: policy.lp la quy dinh, du lieu chuong trinh chi de canh bao --
    pol = _policy_constants()
    cur = fixture["curriculum"]
    rules = fixture.get("rules") or {}
    pairs = [("chương trình", cur.get("min_semester_credits"), cur.get("max_semester_credits")),
             ("rules của web", rules.get("credits_min"), rules.get("credits_max"))]
    for label, lo, hi in pairs:
        if lo is None or hi is None:
            continue
        if (lo, hi) != (pol.get("min_load"), pol.get("max_load")):
            warnings.append(f"Mức tín chỉ kỳ chính theo {label} ({cur.get('code')}): {lo}–{hi} TC, khác policy.lp "
                            f"({pol.get('min_load')}–{pol.get('max_load')} TC). Bộ giải ASP dùng policy.lp.")
    summer_max = rules.get("summer_credits_max")
    if summer_max is not None and summer_max != pol.get("max_load_summer"):
        warnings.append(f"Tối đa kỳ hè theo rules của web: {summer_max} TC, khác policy.lp "
                        f"({pol.get('max_load_summer')} TC). Bộ giải ASP dùng policy.lp.")

    context = {
        "calendar": cal, "t": t, "n": n, "plan": plan, "plan_index": plan_index,
        "allow_summer": bool(scenario.get("summer_opt_in")), "course_tags": course_tags,
        "interests": interests, "warnings": warnings,
    }
    return "\n".join(out) + "\n", context


# --- Giai -----------------------------------------------------------------------

def _term(symbol: clingo.Symbol) -> Any:
    if symbol.type == clingo.SymbolType.Number:
        return symbol.number
    if symbol.type == clingo.SymbolType.String:
        return symbol.string
    return str(symbol)


def _base_code(symbol: clingo.Symbol) -> tuple[str, bool]:
    """plan(X, I): X la "MA" hoac rt("MA", K) (hoc lai)."""
    if symbol.type == clingo.SymbolType.Function and symbol.name == "rt":
        return symbol.arguments[0].string, True
    return symbol.string, False


def solve_asp(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    previous_plan: dict[str, str] | None = None,
    time_limit: float = 30.0,
    threads: int = THREADS,
    solve_limit: int | None = None,
) -> dict[str, Any]:
    """Giai bang engine ASP. ``previous_plan`` khong dung (engine chua co muc tieu S3);
    khac biet so voi lo trinh moc do ``cli.py`` tinh.

    ``solve_limit``: stop after this many conflicts (clasp ``--solve-limit``). With
    ``threads=1`` the result is then reproducible, unlike the wall-clock ``time_limit``
    (still applied as a safety net; ``engine_report.stopped_by`` says which limit hit).
    """
    fixture = normalize(fixture)
    validate_input(fixture, scenario)
    facts, ctx = build_program(fixture, scenario)

    args = ["--opt-mode=opt", "--warn=none", f"--parallel-mode={threads}", f"-c t={ctx['t']}", f"-c n={ctx['n']}"]
    if solve_limit is not None:
        args.append(f"--solve-limit={solve_limit}")
    if ctx["allow_summer"]:
        args.append("-c extra_sem=1")
    ctl = clingo.Control(args)
    # Khong dung ctl.load(): Clingo tren Windows khong mo duoc duong dan co dau.
    for path in SOURCES_BEFORE:
        ctl.add("base", [], path.read_text(encoding="utf-8"))
    ctl.add("base", [], facts)
    for path in SOURCES_AFTER:
        ctl.add("base", [], path.read_text(encoding="utf-8"))

    started = time.perf_counter()
    ctl.ground([("base", [])])
    best: list[clingo.Symbol] | None = None
    cost: list[tuple[int, int]] = []
    proven = False

    def on_model(model: clingo.Model) -> None:
        nonlocal best, cost, proven
        best = list(model.symbols(shown=True))
        # Clingo bo cac muc khong co phan tu nao, nen ghep gia tri voi muc uu tien that.
        cost = list(zip(model.priority, model.cost))
        proven = model.optimality_proven

    # Gioi han thoi gian: mem (Clingo chi kiem tra giua cac buoc lan truyen; grounding
    # khong ngat duoc). Gioi han cung la PLANNER_TIMEOUT_MS cua backend (giet tien trinh).
    remaining = max(0.1, time_limit - (time.perf_counter() - started))
    timed_out = False
    with ctl.solve(on_model=on_model, async_=True) as handle:
        if not handle.wait(remaining):
            timed_out = True
            handle.cancel()
        outcome = handle.get()
    proven = proven or (best is not None and outcome.exhausted)
    if best is None:
        status = "UNSAT" if outcome.unsatisfiable else "TIMEOUT"
    else:
        status = "OPTIMAL" if proven else "SAT_NOT_PROVEN_OPTIMAL"

    takes = None
    report: dict[str, Any] = {"objective": [], "ground_and_solve_ms": round((time.perf_counter() - started) * 1000)}
    engine_warnings = list(ctx["warnings"])
    if best is not None:
        takes, report, more = _decode(best, cost, ctx)
        report["ground_and_solve_ms"] = round((time.perf_counter() - started) * 1000)
        engine_warnings += more
    report["stopped_by"] = ("proven" if proven or outcome.unsatisfiable
                            else "time_limit" if timed_out else "solve_limit")

    result = make_result(fixture, scenario, "clingo", status, takes, previous_plan)
    result["assumptions"] = _assumptions(fixture, scenario, ctx)
    result["warnings"] = engine_warnings + result["warnings"]
    result["engine_report"] = report
    return result


def _decode(symbols: list[clingo.Symbol], cost: list[tuple[int, int]], ctx: dict[str, Any]):
    cal: Calendar = ctx["calendar"]
    plan_pos = {code: k for k, code in enumerate(ctx["plan"], start=1)}
    takes: list[tuple[str, int]] = []
    report: dict[str, Any] = {
        "objective": [{"level": OBJECTIVE_LEVELS[8 - p] if 0 <= p <= 8 else str(p), "priority": p, "value": v}
                      for p, v in cost],
        "gpa": {}, "majors": [], "fees": {}, "offering_misses": [], "gaps": [],
        "graduation_blocked": [], "external_missed": [], "external_pending": [],
        "degree_complete": False, "ready_to_graduate": False,
    }
    warnings: list[str] = []
    major_count: dict[str, int] = {}
    majors_earned: set[str] = set()
    for s in symbols:
        args = s.arguments
        if s.name == "plan" and len(args) == 2:
            code, _ = _base_code(args[0])
            takes.append((code, plan_pos[cal.code(args[1].number)]))
        elif s.name == "gap":
            report["gaps"].append(cal.code(args[0].number))
        elif s.name == "gpa" and len(args) == 2:
            report["gpa"][str(args[0])] = args[1].number / 100
        elif s.name in ("gpa_best_case", "gpa_required_avg"):
            report[s.name] = args[0].number / 100
        elif s.name in ("gpa_already_satisfied", "gpa_requirement_impossible", "degree_complete",
                        "ready_to_graduate"):
            report[s.name] = True
        elif s.name == "major_count":
            major_count[_term(args[0])] = args[1].number
        elif s.name == "major_earned":
            majors_earned.add(_term(args[0]))
        elif s.name == "semester_fee":
            report["fees"][cal.code(args[0].number)] = args[1].number
        elif s.name == "offer_miss":
            report["offering_misses"].append({"course": _term(args[0]), "semester": cal.code(args[1].number),
                                              "missed_percent": args[2].number})
        elif s.name == "graduation_blocked":
            report["graduation_blocked"].append(_term(args[0]))
        elif s.name == "ext_missed":
            report["external_missed"].append({"requirement": _term(args[0]), "year": args[1].number})
        elif s.name == "ext_pending":
            report["external_pending"].append({"requirement": _term(args[0]), "year": args[1].number,
                                               "missing": args[2].number})
    report["majors"] = [{"code": m, "count": c, "earned": m in majors_earned} for m, c in sorted(major_count.items())]
    report["course_tags"] = {c: tags for c, tags in ctx["course_tags"].items() if any(c == x for x, _ in takes)}
    # Planned courses carrying each interest the student picked ([] when none of them was planned).
    report["interests"] = {tag: sorted(c for c, tags in report["course_tags"].items() if tag in tags)
                           for tag in ctx["interests"]}
    for key in ("gaps", "graduation_blocked"):
        report[key].sort()
    for sem in report["gaps"]:
        warnings.append(f"Kỳ {sem} bị bỏ trống giữa các kỳ có học vì không xếp được môn nào hợp lệ. "
                        f"Nếu bạn muốn nghỉ kỳ này, chọn nghỉ kỳ {sem} (skip_semesters).")
    for req in report["graduation_blocked"]:
        warnings.append(f"Chưa đạt điều kiện tốt nghiệp {req} (theo dữ liệu hiện có).")
    return takes, report, warnings


def _assumptions(fixture: dict[str, Any], scenario: dict[str, Any], ctx: dict[str, Any]) -> list[str]:
    notes = [f"Môn đang học {code}: giả định {'đậu' if r == 'pass' else 'rớt'}"
             for code, r in sorted(scenario["in_progress_results"].items())]
    pol = _policy_constants()
    notes += [
        "Bộ giải: engine ASP (pipeline/planner/solvers/asp/core) với quy định trong policy.lp",
        "Mọi môn xếp trong tương lai được giả định sẽ đậu",
        f"Tín chỉ mỗi kỳ chính {pol.get('min_load')}–{pol.get('max_load')} (trừ kỳ cuối có môn), "
        f"kỳ hè tối đa {pol.get('max_load_summer')} theo policy.lp",
        "Thứ tự mục tiêu cố định: không bỏ trống kỳ, xong sớm, học lại sớm, đúng kỳ thường mở lớp, "
        "học phí, kỳ điển hình, môn cấp thấp trước, đều tải",
        "Mong muốn trên trang Gợi ý (môn muốn học, ưu tiên khuyến nghị, đều tải, khoảng tín chỉ đẹp, "
        "giữ lộ trình mốc) chưa có trong engine ASP nên không được xét",
        "Quan hệ học trước (HT) và khuyến nghị (KN) không được xét",
        "Môn đã học được ghi nhận ở kỳ hiện tại (web không lưu kỳ học của từng môn)",
    ]
    if level_enabled(fixture):
        notes.append("Năm học tính theo khóa; cấp độ môn lấy từ chữ số đầu của mã môn")
    notes.append("Kỳ hè: được xếp mọi môn (luật kỳ hè của engine)" if ctx["allow_summer"]
                 else "Không xếp môn vào kỳ hè (bạn chưa bật kỳ hè nào)")
    for item in scenario.get("locked", []):
        notes.append(f"Bạn khóa {item['course_code']} vào kỳ {item['semester_code']}")
    for item in scenario.get("not_offered", []):
        notes.append(f"Giả định {item['course_code']} không mở kỳ {item['semester_code']}")
    for sem in scenario.get("skip_semesters") or []:
        notes.append(f"Bạn nghỉ kỳ {sem}")
    if ctx["interests"]:
        notes.append(f"Interests: {', '.join(ctx['interests'])}. Lowest priority: they decide between electives only "
                     "when every other goal is equal")
    return notes
