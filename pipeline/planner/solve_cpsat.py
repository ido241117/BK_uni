"""Bo giai thu hai: OR-Tools CP-SAT.

Cung dau vao (JSON + kich ban) va cung dang dau ra voi engine ASP (``solve_asp.py``),
nhung viet doc lap: doc thang JSON, khong di qua facts hay engine ASP. Nho vay hai
bo giai co the doi chieu cheo nhau. Chi dung chung phan kiem tra dau vao va
cach doc kich ban (muc tin chi tung ky, thu tu uu tien) trong ``facts.py``.

Bien quyet dinh: x[c, i] = 1 neu mon c duoc xep vao ky thu i (i = 1..n).
"""

from __future__ import annotations

from typing import Any

from ortools.sat.python import cp_model

from planner.facts import (
    assumed_fails,
    base_credit_limits,
    course_level,
    credit_limits,
    graduation_needs,
    is_summer,
    level_enabled,
    offered_pairs,
    offered_terms,
    offering_soft,
    pinned,
    plan_semesters,
    preference_order,
    preferences,
    preferred_load,
    summer_allowed,
    summer_preferred_load,
    summer_specialized,
    required_year,
    semester_year,
    summer_courses,
    validate_input,
    year_thresholds,
)
from planner.normalize import normalize
from planner.result import make_result


def solve_cpsat(
    fixture: dict[str, Any],
    scenario: dict[str, Any],
    previous_plan: dict[str, str] | None = None,
    time_limit: float = 30.0,
    linearization_level: int | None = None,
) -> dict[str, Any]:
    """``linearization_level=0`` tat noi long tuyen tinh (chi dung de chan doan)."""
    fixture = normalize(fixture)
    validate_input(fixture, scenario)
    semesters = plan_semesters(fixture)
    n = len(semesters)
    index = {code: i for i, code in enumerate(semesters, start=1)}
    sems = range(1, n + 1)
    in_curriculum = {cc["course_code"] for cc in fixture["curriculum_courses"]}
    credits = {c["code"]: c["credits"] for c in fixture["courses"] if c["code"] in in_curriculum}
    limits = credit_limits(fixture, scenario)
    prefs = preferences(scenario)

    # --- Tinh trang sau ky hien tai --------------------------------------
    passed: set[str] = set()
    for sc in fixture["student"]["student_courses"]:
        code, status = sc["course_code"], sc["status"]
        if status == "completed" or (
            status == "in-progress" and scenario["in_progress_results"][code] == "pass"
        ):
            passed.add(code)

    model = cp_model.CpModel()

    # --- Bien: moi mon chua dat duoc xep nhieu nhat mot ky ---------------
    open_courses = [c for c in credits if c not in passed]
    x = {(c, i): model.new_bool_var(f"x_{c}_{i}") for c in open_courses for i in sems}
    taken = {c: sum(x[c, i] for i in sems) for c in open_courses}
    for c in open_courses:
        model.add(taken[c] <= 1)

    # --- Sprint 11 (22/11) -------------------------------------------------
    # Ghim tuyet doi (rules.pins_absolute): mon ghim luon o ky da ghim; luat cua truong xung dot
    # voi cho ghim thi bo qua cho rieng mon do (validator bao canh bao). Khong co co thi nhu cu.
    rules = fixture.get("rules") or {}
    absolute = bool(rules.get("pins_absolute"))
    # W1 (23/11): mon gia dinh rot o ky f: lan hoc do tinh TC cua ky f nhung KHONG dat; phai hoc lai sau f.
    fails = {c: index[s] for c, s in assumed_fails(scenario).items() if s in index and c in taken}
    pins = {c: index[s] for c, s in pinned(scenario).items()
            if s in index and c in taken and fails.get(c) != index[s]}

    def free(c: str, i: int) -> bool:
        """Luat cung ap cho (c, i) khong? False khi do la cho sinh vien ghim (ghim tuyet doi)."""
        return not (absolute and pins.get(c) == i)

    def done(c: str):
        return 1 if c in passed else taken[c] if c in taken else 0

    def before(c: str, i: int, inclusive: bool = False):
        """So lan c duoc xep truoc ky i (0 hoac 1)."""
        if c not in taken:
            return 0
        return sum(x[c, j] for j in sems if j < i or (inclusive and j == i))

    # --- Yeu cau tot nghiep ----------------------------------------------
    # Du nhom tu chon (ke ca mon se hoc) tinh sang tu chon tu do (myBK "Da dung de xet TCTD", 22/11).
    excess_vars = []
    for group in fixture["course_groups"]:
        members = [c for c in group["members"] if c in credits]
        if (group["kind"] == "elective" and group.get("pool_scope", "listed") == "listed" and group["required_credits"]
                and not group.get("parent") and not group.get("specialization")):  # chi khoi goc, tranh dem hai lan
            top = sum(credits[c] for c in members)
            ex = model.new_int_var(0, max(top, 0), f"excess_{len(excess_vars)}")
            model.add(ex <= sum(credits[c] * done(c) for c in members) - group["required_credits"])
            excess_vars.append(ex)
    free_groups = [g for g in fixture["course_groups"] if g.get("_free_slots")]
    for group in fixture["course_groups"]:
        members = [c for c in group["members"] if c in credits]
        if group.get("_free_slots") and members:
            # O tu do: du TC = so o x TC/o; phan du nhom tu chon (chia deu cho cac khoi tu do) bu vao.
            per = credits[members[0]]
            share = sum(excess_vars) if len(free_groups) == 1 else 0
            model.add(sum(per * done(c) for c in members) + share >= per * len(members))
            continue
        if group["kind"] == "required":
            for c in members:
                model.add(done(c) == 1)
            continue
        if group["required_credits"] is not None:
            model.add(sum(credits[c] * done(c) for c in members) >= group["required_credits"])
        if group["required_count"] is not None:
            model.add(sum(done(c) for c in members) >= group["required_count"])

    # --- Quan he giua cac mon (QD 285 Dieu 2) ----------------------------
    kn_terms = []
    for rel in fixture["course_relations"]:
        c, r, kind = rel["course_code"], rel["related_course_code"], rel["type"]
        if c not in taken or r in passed:
            continue
        if kind == "prerequisite":  # r phai dat o ky truoc
            for i in sems:
                if free(c, i):
                    model.add(x[c, i] <= before(r, i))
        elif kind == "corequisite":  # r dat truoc hoac hoc cung ky
            for i in sems:
                if free(c, i):
                    model.add(x[c, i] <= before(r, i, inclusive=True))
        elif kind == "recommended":  # S6: pha khi c hoc ma r chua hoc o ky truoc
            broken = model.new_bool_var(f"kn_{c}_{r}")
            for i in sems:
                model.add(broken >= x[c, i] - before(r, i))
            kn_terms.append(broken)
        # "prior" bi bo theo quyet dinh 18/11

    # --- Mo mon, khoa mon, han tot nghiep, cap do mon ---------------------
    blocked = [r for r in fixture["offerings"]["records"] if r["status"] == "not-offered"]
    blocked += scenario.get("not_offered", [])
    for rec in blocked:
        key = (rec["course_code"], index.get(rec["semester_code"]))
        if key in x and free(*key):
            model.add(x[key] == 0)
    for c, f in fails.items():  # hoc lai phai sau ky rot
        for i in sems:
            if i <= f:
                model.add(x[c, i] == 0)
    for item in scenario.get("locked", []):
        key = (item["course_code"], index[item["semester_code"]])
        if fails.get(key[0]) == key[1]:
            continue  # ghim dung ky gia dinh rot: lan hoc do la lan rot, da tinh o ``fails``
        if key in x:
            model.add(x[key] == 1)
        elif not absolute:
            model.add_bool_or([])  # khoa mon da dat: khong the thoa
        # absolute: ghim mon da dat = hoc cai thien (Q20), xu ly o "retakes" ben duoi
    if scenario.get("graduate_by"):
        deadline = index[scenario["graduate_by"]]
        for (c, i), var in x.items():
            if i > deadline and free(c, i):
                model.add(var == 0)
    # Nghi ky (Q13) va khoa ky (Q15): mon khong ghim thi khong xep vao.
    skipped = {index[s] for s in scenario.get("skip_semesters", []) if s in index}
    frozen = {index[s] for s in scenario.get("frozen_semesters", []) if s in index}
    for (c, i), var in x.items():
        if (i in skipped or i in frozen) and pins.get(c) != i:
            model.add(var == 0)

    # --- Tin chi moi ky ---------------------------------------------------
    # Hoc cai thien (Q20, nguoi duyet 22/11 "no muon hoc cu cho no hoc"): mon da dat ma sinh vien
    # ghim van hoc o ky do; tinh vao tai cua ky, KHONG cong vao TC tich luy hay yeu cau khoi.
    retakes = [(c, index[sem]) for c, sem in pinned(scenario).items()
               if absolute and c in passed and c in credits and sem in index]
    retake_load = {i: sum(credits[c] for c, j in retakes if j == i)
                      + sum(credits[c] for c, j in fails.items() if j == i) for i in sems}
    load = {i: sum(credits[c] * x[c, i] for c in open_courses) + retake_load[i] for i in sems}
    base_acc = sum(credits[c] for c in passed if c in credits) + fixture.get("_free_outside_credits", 0)

    def acc_before(i: int):
        return base_acc + sum(load[j] - retake_load[j] for j in sems if j < i)

    thresholds = year_thresholds(fixture)
    if level_enabled(fixture):
        cohort = fixture["curriculum"]["cohort"]
        for (c, i), var in x.items():
            level = course_level(c)
            if level is None or not free(c, i):
                continue
            year = required_year(level)
            if thresholds:  # Q6: nam hoc theo TC tich luy (QD 285 Dieu 24)
                if year >= 2:
                    model.add(acc_before(i) >= thresholds[min(year - 2, len(thresholds) - 1)]).only_enforce_if(var)
            elif semester_year(semesters[i - 1], cohort) < year:
                model.add(var == 0)

    # --- Ky he (H14): thuc tap luon duoc; mon khac chi khi sinh vien bat ky he --
    for (c, i), var in x.items():
        if is_summer(semesters[i - 1]) and free(c, i) and not summer_allowed(fixture, scenario, c, semesters[i - 1]):
            model.add(var == 0)

    # --- Mon tot nghiep: du TC tich luy truoc ky hoc (QD 285 Dieu 15.5) -----
    for g, need_credits in graduation_needs(fixture).items():
        if g not in taken:
            continue
        for i in sems:
            if free(g, i):
                model.add(acc_before(i) >= need_credits).only_enforce_if(x[g, i])
    used = {i: model.new_bool_var(f"used_{i}") for i in sems}
    targets = {index[s]: v for s, v in (scenario.get("semester_targets") or {}).items() if s in index}
    # caps: muc toi da THAT cua tung ky (sau khi noi theo o TC dau ky va ghim). Moi bien phu ben
    # duoi (max_load, over, s_over) phai lay can tren tu day, khong lay tu ``limits``; neu khong
    # thi phan noi bi chan lai im lang (loi 23/11: muon 14 TC, toi da 11 -> chi xep 11).
    caps: dict[int, int] = {}
    for i in sems:
        hi = limits[semesters[i - 1]][1]
        if i in targets:  # Q5: duoc lech toi 2 TC so voi so sinh vien muon
            hi = max(hi, targets[i] + 2)
        if absolute:  # ghim vuot muc toi da van giu
            hi = max(hi, sum(credits[c] for c, j in pins.items() if j == i) + retake_load[i])
        caps[i] = hi
        model.add(load[i] <= hi)
        for c in open_courses:
            model.add_implication(x[c, i], used[i])
        if retake_load[i]:
            model.add(used[i] == 1)
        else:
            model.add(sum(x[c, i] for c in open_courses) >= used[i])
    # Muc toi thieu ap dung cho moi ky tru ky cuoi cung co mon.
    used_after: dict[int, Any] = {}
    for i in sems:
        later = [used[j] for j in sems if j > i]
        if not later:
            continue
        used_after[i] = model.new_bool_var(f"used_after_{i}")
        model.add_max_equality(used_after[i], later)
        model.add(load[i] >= limits[semesters[i - 1]][0]).only_enforce_if(used_after[i])

    # S11: ky chinh (tru ky cuoi) thieu so voi muc chung 11 TC; mem, duoi S2.
    base_min = base_credit_limits(fixture)[0]
    deficits = []
    for i, flag in used_after.items():
        if is_summer(semesters[i - 1]):
            continue
        short = model.new_int_var(0, base_min, f"deficit_{i}")
        model.add(short >= base_min - load[i]).only_enforce_if(flag)
        deficits.append(short)

    # S8: ky chinh lech khoi khoang dep; ky cuoi khong tinh phan thieu.
    band = preferred_load(fixture, scenario)
    deviation = []
    if band:
        lo_pref, hi_pref = band
        for i in sems:
            if is_summer(semesters[i - 1]):
                continue
            over = model.new_int_var(0, caps[i], f"over_{i}")
            model.add(over >= load[i] - hi_pref)
            deviation.append(over)
            if i in used_after:
                under = model.new_int_var(0, lo_pref, f"under_{i}")
                model.add(under >= lo_pref - load[i]).only_enforce_if(used_after[i])
                deviation.append(under)
    # S10: tin chi hoc o ky he (tru thuc tap). S7: ky he co hoc lech khoi khoang dep.
    internships = summer_courses(fixture)
    summer_load = sum(credits[c] * x[c, i] for (c, i) in x
                      if is_summer(semesters[i - 1]) and c not in internships)
    s_lo, s_hi = summer_preferred_load(fixture)
    summer_dev = []
    regular = [c for c in open_courses if c not in internships]
    for i in sems:
        if not is_summer(semesters[i - 1]):
            continue
        s_load = sum(credits[c] * x[c, i] for c in regular)
        studied = model.new_bool_var(f"summer_used_{i}")
        for c in regular:
            model.add_implication(x[c, i], studied)
        model.add(sum(x[c, i] for c in regular) >= studied)
        s_over = model.new_int_var(0, caps[i], f"s_over_{i}")
        s_under = model.new_int_var(0, s_lo, f"s_under_{i}")
        model.add(s_over >= s_load - s_hi)
        model.add(s_under >= s_lo * studied - s_load)
        summer_dev += [s_over, s_under]
    # S9: tin chi mon cap 3+ (khong phai thuc tap) xep vao ky he.
    summer_specialized_load = sum(credits[c] * x[c, i] for (c, i) in x
                                  if is_summer(semesters[i - 1]) and summer_specialized(fixture, c))

    # --- Muc tieu: cac muc uu tien gop thanh mot tong co trong so ----------
    # Moi muc co can tren ub; trong so cua muc k = tich (ub_j + 1) cua cac muc thap hon,
    # nen muc cao luon thang muc thap (thu tu tu dien).
    last = model.new_int_var(0, n, "last")
    for i in sems:
        model.add(last >= i * used[i])
    total_credits = sum(credits[c] * taken[c] for c in open_courses)
    max_cap = max(caps.values(), default=0)
    max_load = model.new_int_var(0, max_cap, "max_load")
    for i in sems:
        model.add(max_load >= load[i])
    wanted = [c for c in prefs["wanted_courses"] if c not in passed]
    # ST (Q5): lech so TC sinh vien muon o tung ky. OH (Q9): xep vao loai ky mon chua tung mo.
    target_dev = []
    for i, want in targets.items():
        d = model.new_int_var(0, max(want, max_cap) + 2, f"target_dev_{i}")
        model.add(d >= load[i] - want)
        model.add(d >= want - load[i])
        target_dev.append(d)
    off_history = []
    if offering_soft(fixture):
        for (c, i), var in x.items():
            terms_ok = offered_terms(fixture, c)
            if terms_ok is not None and semesters[i - 1][-1] not in terms_ok and pins.get(c) != i                     and (c, semesters[i - 1]) not in offered_pairs(scenario):
                off_history.append(var)
    prev = [(c, index[s]) for c, s in (previous_plan or {}).items() if s in index]
    terms = {
        "ST": (sum(target_dev), sum(max(w, max_cap) + 2 for w in targets.values())),
        "OH": (sum(off_history), len(off_history)),
        "S1": (last, n),
        "S6": (sum(kn_terms), len(kn_terms)),
        "S4": (sum(1 - done(c) for c in wanted), len(wanted)),
        "S2": (total_credits, sum(credits[c] for c in open_courses)),
        "S5": (max_load, max_cap),
        "S3": (sum((1 - x[c, i]) if (c, i) in x else 1 for c, i in prev), len(prev)),
        "S7": (sum(summer_dev), n * (max_cap + s_lo)),
        "S10": (summer_load, sum(credits[c] for c in open_courses)),
        "S9": (summer_specialized_load, sum(credits[c] for c in open_courses)),
        "S8": (sum(deviation), n * (max_cap + (band[0] if band else 0))),
        "S11": (sum(deficits), n * base_min),
    }
    objective, weight = 0, 1
    for name in reversed(preference_order(fixture, scenario)):
        expr, ub = terms[name]
        objective += weight * expr
        weight *= ub + 1
    model.minimize(objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_workers = 1  # mot luong de so sanh cong bang va lap lai duoc
    if linearization_level is not None:
        solver.parameters.linearization_level = linearization_level
    code = solver.solve(model)

    if code == cp_model.INFEASIBLE:
        return make_result(fixture, scenario, "cp-sat", "UNSAT", None, previous_plan)
    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return make_result(fixture, scenario, "cp-sat", "TIMEOUT", None, previous_plan)
    takes = [(c, i) for (c, i), var in x.items() if solver.value(var)] + retakes
    status = "OPTIMAL" if code == cp_model.OPTIMAL else "SAT_NOT_PROVEN_OPTIMAL"
    return make_result(fixture, scenario, "cp-sat", status, takes, previous_plan, attempts=sorted(fails.items()))
