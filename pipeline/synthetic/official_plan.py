"""Step 0: check the transcribed official plan (``official_plan.json``) against the fixture.

    .venv/Scripts/python -m synthetic.official_plan

Checks:
* the required courses are exactly the fixture's required group, each once;
* each required course sits at the fixture's recommended semester;
* the elective slots cover each group's requirement (count and credits);
* each semester's credits equal the PDF total, and the totals add to ``total_credits``;
* for every specialization (first members of each group as electives), the whole plan
  passes ``evaluation.validate`` from enrollment, completes the degree and respects the
  internship's fills_next rule.
"""

from __future__ import annotations

import json
import sys

from synthetic.curriculum import Curriculum, load_config


def check(cfg=None) -> list[str]:
    from synthetic.plans import (load_official, official_spec, plan_completes, plan_errors,
                                 spec_plan)
    from synthetic.population import Student
    cfg = cfg or load_config()
    cur = Curriculum(cfg)
    off = load_official(cfg)
    problems = []
    spec0 = cur.specializations[0]
    credits = cur.credits(spec0)
    required = next(g for g in cur.groups(spec0) if g["kind"] == "required" and not g.get("_free_slots"))
    listed = [c for s in off["semesters"] for c in s["required"]]
    if len(listed) != len(set(listed)):
        problems.append("a required course is listed twice")
    # Condition courses (e.g. PE1003, PE1005: external requirements) are in the PDF but not planned.
    listed = [c for c in listed if c not in set(cur.raw.get("conditions", []))]
    if set(listed) != set(required["members"]):
        problems.append(f"required set differs: missing {sorted(set(required['members']) - set(listed))}, "
                        f"extra {sorted(set(listed) - set(required['members']))}")
    rec = cur.recommended(spec0)
    for s in off["semesters"]:
        for c in s["required"]:
            if rec.get(c) != s["semester"]:
                problems.append(f"{c}: semester {s['semester']} in the PDF, {rec.get(c)} in the fixture")
    slots: dict[str, int] = {}
    for s in off["semesters"]:
        for k, n in s["slots"].items():
            slots[k] = slots.get(k, 0) + n
    for g in cur.groups(spec0):
        key = cur.elective_group_key(g)
        if g["kind"] != "elective" or not key:
            continue
        cr = sorted(credits[c] for c in g["members"])
        n = slots.get(key, 0)
        if g.get("required_count") and n < g["required_count"]:
            problems.append(f"group {key}: {n} slots < {g['required_count']} courses")
        if g.get("required_credits") and sum(cr[-n:] if n else []) < g["required_credits"]:
            problems.append(f"group {key}: slots cannot reach {g['required_credits']} credits")
    free_group = next(g for g in cur.raw["course_groups"] if g.get("pool_scope") == "any")
    if slots.get(cur.free_group, 0) * cur.free_credits != free_group["required_credits"]:
        problems.append("free-elective slots do not match the free-elective credits")

    for spec in cur.specializations:
        order = {}
        for g in cur.groups(spec):
            key = cur.elective_group_key(g)
            if g["kind"] == "elective" and key:
                order[key] = list(g["members"])
        plan = spec_plan(cur, official_spec(cur, off, order))
        if spec == spec0:
            for s in off["semesters"]:
                got = sum(credits.get(c, cur.free_credits) for c in plan[cur.main_code(s["semester"])])
                if got != s["credits"]:
                    problems.append(f"semester {s['semester']}: {got} credits, PDF {s['credits']}")
            if sum(s["credits"] for s in off["semesters"]) != off["total_credits"]:
                problems.append("semester totals do not add to total_credits")
        stu = Student(0, 0.0, spec, (15, 18), 0.0, 0.0, False)
        problems += [f"{spec}: {e}" for e in plan_errors(cur, stu, plan)]
        if not plan_completes(cur, stu, plan):
            problems.append(f"{spec}: plan does not complete the degree")
    return problems


def main() -> None:
    problems = check()
    print(json.dumps({"ok": not problems, "problems": problems}, indent=2, ensure_ascii=False))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
