"""Markdown report of one curriculum's candidates (reports/02-candidates/<code>.md)."""

from __future__ import annotations

from typing import Any


def _courses(codes: list[str], n: int = 6) -> str:
    return ", ".join(codes[:n]) + (f" … (+{len(codes) - n})" if len(codes) > n else "")


def _english(c: dict[str, Any]) -> str:
    if c.get("label_en"):
        return c["label_en"] + (f" † ({c['label_en_from']})" if c.get("label_en_from") else "")
    s = c.get("label_en_suggested")
    return f"*suggested: {s['phrase']} ({s['similarity']:.2f})*" if s else ""


def _evidence(c: dict[str, Any]) -> str:
    ev = c["evidence"][0] if c["evidence"] else None
    if ev is None:
        prof = next((s for s in c["sources"] if s.get("evidence")), None)
        ev = {"course": "profile", "text": prof["evidence"]} if prof else None
    return f"{ev['course']}: {ev['text'][:90]}".replace("|", "/") if ev else ""


def _verdicts(rows: list[dict[str, Any]], n: int = 30) -> str:
    return ", ".join(f"{v['phrase']} (best {v['best_match']:.2f}, peak {v['peak']:.2f}, near {v['near_courses']})"
                     for v in rows[:n])


def render(r: dict[str, Any]) -> str:
    q = r["quality"]
    lines = [
        f"# Candidate tags: {r['curriculum']}",
        "",
        f"{r['name']} ({r['faculty']}); cohorts {', '.join(r.get('cohorts') or []) or '-'}. "
        f"{r.get('seeded', 0)} candidates kept from the previous run (key and names unchanged). "
        f"{r['courses_usable']} of its {r['courses_total']} courses are used "
        f"({'electives with a usable syllabus' if r.get('electives_only') else 'usable syllabus'}). "
        f"Raw candidates by source: {r['raw_counts']}; after merging and filtering: **{len(r['candidates'])}**, "
        f"dropped {len(r['dropped'])}.",
        "",
        "Coverage = courses of this curriculum: faculty members (structure), courses close in meaning (profile), "
        "courses where the cluster's phrases are top phrases or appear verbatim (syllabus). No machine translation: "
        "† = English label taken from a merged English phrase of this curriculum; *suggested* = closest English "
        "phrase of this curriculum, to confirm in the review workbook.",
        "",
        "| Key | Vietnamese label | English label | Sources | Coverage | Example courses | Evidence |",
        "|---|---|---|---|---|---|---|",
    ]
    for c in r["candidates"]:
        extra = c.get("phrases") or c.get("merged_from") or []
        merged = f" (also: {'; '.join(x for x in extra if x != c.get('label_en'))[:120]})" if len(extra) > (1 if c.get("phrases") else 0) else ""
        lines.append(f"| `{c['key']}` | {c['label_vi'] or ''} | {_english(c)}{merged} | {', '.join(c['source_types'])} "
                     f"| {c['coverage_count']} | {_courses(c['coverage'])} | {_evidence(c)} |")
    lines += [
        "",
        "## Quality",
        "",
        f"- Candidates by origin: {q['by_origin']}; with evidence sentence: {q['with_evidence']}/{len(r['candidates'])}; "
        f"without English label: {q['without_english_label']} (suggested: {q['with_suggested_label']})",
        f"- Syllabus cluster purity (share of a cluster's specialization courses inside its best specialization; "
        f"1.0 = stays in one faculty grouping): mean {q['syllabus_purity_mean']}, per candidate {q['syllabus_purity']}",
        f"- Candidate pairs sharing ≥ 60% of courses: {q['high_overlap_pairs'] or 'none'}",
    ]
    if r["dropped"]:
        lines += ["", "## Dropped (too few courses)", ""]
        lines += [f"- {c['label_en'] or c['label_vi']} ({', '.join(c['source_types'])}): {c['drop_reason']}" for c in r["dropped"]]
    for title, key in (("Profile phrases not kept", "profile_rejected"), ("Syllabus clusters not kept", "syllabus_rejected")):
        if r.get(key):
            lines += ["", f"## {title} ({len(r[key])})", "", _verdicts(r[key])]
    return "\n".join(lines) + "\n"
