"""Automatic remarks: rules over the computed metrics, each citing the numbers it used.

These are starting points for the human remarks in the docs, not conclusions. The
thresholds below are judgment calls; change them here, not in the report.
"""

from __future__ import annotations

from typing import Any

SPARSE_HARD_PER_COURSE = 0.25     # fewer hard relations per course than this = sparse ordering
TIGHT_SLACK_TERMS = 1             # at most this many spare regular terms = tight calendar
LARGE_CHOICE_SHARE = 0.25         # electives + free credits above this share of the degree
LOW_KNOWN_SHARE = 0.5             # offering data known for less than this share of courses
HIGH_MAJOR_OVERLAP = 0.3          # mean Jaccard overlap between majors' course lists


def curriculum_remarks(p: dict[str, Any]) -> list[str]:
    out: list[str] = []
    rel, fit, choice, off, q = p["relations"], p["calendar_fit"], p["choice"], p["offering"], p["quality"]

    if rel["hard_per_course"] is not None and rel["hard_per_course"] < SPARSE_HARD_PER_COURSE:
        out.append(
            f"Sparse ordering: {rel['hard']} prerequisite/corequisite relations for {p['size']['courses']} "
            f"courses ({rel['hard_per_course']} per course); only {rel['share_of_courses_in_hard_relation']:.0%} "
            "of courses take part in one. Plans will differ mainly through load limits, groups, "
            "offering and the objective, not through course order.")
    if fit["slack_terms"] is not None:
        tight = fit["slack_terms"] <= TIGHT_SLACK_TERMS
        out.append(
            f"Calendar {'is tight' if tight else 'has room'}: {fit['nominal_regular_terms']} nominal regular terms; "
            f"lower bounds {fit['terms_needed_by_max_load']} (degree credits / max load) and "
            f"{fit['terms_needed_by_chain']} (longest prerequisite chain); slack {fit['slack_terms']} term(s). "
            f"On-time graduation needs {fit['mean_load_needed']} credits per regular term on average "
            f"(allowed {fit['min_load']}-{fit['max_load']}).")
    if choice["chosen_credit_share"] is not None and choice["chosen_credit_share"] > LARGE_CHOICE_SHARE:
        out.append(
            f"Large choice: {choice['chosen_credit_share']:.0%} of the degree credits are chosen by the student "
            "(electives and free electives), so many plans are equally good under hard rules; "
            "the soft objective and tie-breaking decide which one a solver returns.")
    for g in choice["elective_groups"]:
        if g["slack"] is not None and g["slack"] <= 1:
            out.append(f"Elective group {g['id']} ({g['name']}) leaves no choice: pool {g['pool_credits']} "
                       f"credits for {g['required_credits']} required.")
    if off["offered_terms_known"] is not None and off["offered_terms_known"] < LOW_KNOWN_SHARE \
            and (off["summer_history_known"] or 0) < LOW_KNOWN_SHARE:
        out.append(
            f"Offering mostly unknown: regular-term offering known for {off['offered_terms_known']:.0%} of courses, "
            f"summer history for {off['summer_history_known']:.0%}. Solvers must assume courses are open.")
    if p["majors"]["mean_jaccard_overlap"] is not None and p["majors"]["mean_jaccard_overlap"] > HIGH_MAJOR_OVERLAP:
        out.append(f"Majors overlap: mean Jaccard {p['majors']['mean_jaccard_overlap']} between majors' course lists.")
    if q["typical_term_contradicts_prerequisite"]:
        pairs = ", ".join(f"{a}->{b}" for a, b in q["typical_term_contradicts_prerequisite"][:5])
        out.append(f"Data issue: the official plan puts {len(q['typical_term_contradicts_prerequisite'])} "
                   f"prerequisite(s) in the same or a later term than the course needing them ({pairs}).")
    if q["prerequisite_cycles"]:
        out.append(f"Data issue: prerequisite cycle(s) {q['prerequisite_cycles'][:3]}; no plan can satisfy them.")
    if q["groups_needing_more_than_their_pool"]:
        out.append(f"Data issue: groups {q['groups_needing_more_than_their_pool']} require more credits "
                   "than their pool holds.")
    if q["courses_in_no_group"]:
        out.append(f"{len(q['courses_in_no_group'])} course(s) belong to no group or major "
                   f"({', '.join(q['courses_in_no_group'][:5])}); they never count toward the degree.")
    return out


def catalog_remarks(c: dict[str, Any]) -> list[str]:
    out: list[str] = []
    hpc = c["hard_per_course"]
    if hpc:
        out.append(
            f"Across {c['programs']} programs the median is {hpc['median']:.2f} hard relations per course "
            f"(max {hpc['max']:.2f}); {c['programs_without_hard_relations']} programs state none at all.")
    if c["mean_agreement"] is not None:
        out.append(
            f"Of {c['hard_relations_seen_in_2plus_programs']} hard relations whose two courses appear together in "
            f"two or more programs, programs agree {c['mean_agreement']:.0%} of the time on average; "
            f"{c['relations_stated_by_under_half']} are stated by fewer than half of those programs. "
            "Missing relations are more likely omissions than different rules.")
    return out


def students_remarks(s: dict[str, Any]) -> list[str]:
    out: list[str] = []
    if s["attempts"] and s["attempts_without_term"] == s["attempts"]:
        out.append("No attempt has a term: the history gives what was passed, not when.")
    if s["attempts"] and not s["attempts_with_grade"]:
        out.append("No grades: GPA-based rules (standing, retakes for grade) cannot be checked on this data.")
    if s["has_expected_answers"]:
        out.append("Has expected answers (oracle) for testing GPA and credit computations.")
    return out
