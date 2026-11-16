% =====================================================================
% policy.lp : grading, graduation and tuition policy
% Generated from grading_policy.json, graduation_requirements.json
% and tuition_policy.json by the planner CLI -- do not edit by hand.
% =====================================================================

% Grading policy: policy_2020
% Effective cohorts: 2024..open

% ------------------------------------------------------------------
% Planner constants
% ------------------------------------------------------------------
#const maxtries = 3.
#const shift = 0.
#const term_offset = 0.
#const min_load = 14.
#const max_load = 21.
#const min_load_summer = 0.
#const max_load_summer = 9.

% ------------------------------------------------------------------
% Numeric scales (all values are fixed-point integers)
% ------------------------------------------------------------------
scale(gpa_4, 0, 400).
scale_precision(gpa_4, 2).
scale_role(gpa_4, gpa).
default_scale(gpa_4).
scale(score_10, 0, 1000).
scale_precision(score_10, 2).
scale_role(score_10, score).

% ------------------------------------------------------------------
% Grade scale
% ------------------------------------------------------------------
grade(a_plus).
grade_symbol(a_plus, "A+").
grade_rank(a_plus, 0).
grade_passing(a_plus).
grade_earns_credit(a_plus).
grade_points(gpa_4, a_plus, 400).
grade_in_gpa(gpa_4, a_plus).
grade_points(a_plus, 400).
grade_in_gpa(a_plus).
grade_points(score_10, a_plus, 975).
grade_in_gpa(score_10, a_plus).
grade(a).
grade_symbol(a, "A").
grade_rank(a, 1).
grade_passing(a).
grade_earns_credit(a).
grade_points(gpa_4, a, 400).
grade_in_gpa(gpa_4, a).
grade_points(a, 400).
grade_in_gpa(a).
grade_points(score_10, a, 895).
grade_in_gpa(score_10, a).
grade(b_plus).
grade_symbol(b_plus, "B+").
grade_rank(b_plus, 2).
grade_passing(b_plus).
grade_earns_credit(b_plus).
grade_points(gpa_4, b_plus, 350).
grade_in_gpa(gpa_4, b_plus).
grade_points(b_plus, 350).
grade_in_gpa(b_plus).
grade_points(score_10, b_plus, 820).
grade_in_gpa(score_10, b_plus).
grade(b).
grade_symbol(b, "B").
grade_rank(b, 3).
grade_passing(b).
grade_earns_credit(b).
grade_points(gpa_4, b, 300).
grade_in_gpa(gpa_4, b).
grade_points(b, 300).
grade_in_gpa(b).
grade_points(score_10, b, 745).
grade_in_gpa(score_10, b).
grade(c_plus).
grade_symbol(c_plus, "C+").
grade_rank(c_plus, 4).
grade_passing(c_plus).
grade_earns_credit(c_plus).
grade_points(gpa_4, c_plus, 250).
grade_in_gpa(gpa_4, c_plus).
grade_points(c_plus, 250).
grade_in_gpa(c_plus).
grade_points(score_10, c_plus, 670).
grade_in_gpa(score_10, c_plus).
grade(c).
grade_symbol(c, "C").
grade_rank(c, 5).
grade_passing(c).
grade_earns_credit(c).
grade_points(gpa_4, c, 200).
grade_in_gpa(gpa_4, c).
grade_points(c, 200).
grade_in_gpa(c).
grade_points(score_10, c, 595).
grade_in_gpa(score_10, c).
grade(d_plus).
grade_symbol(d_plus, "D+").
grade_rank(d_plus, 6).
grade_passing(d_plus).
grade_earns_credit(d_plus).
grade_points(gpa_4, d_plus, 150).
grade_in_gpa(gpa_4, d_plus).
grade_points(d_plus, 150).
grade_in_gpa(d_plus).
grade_points(score_10, d_plus, 520).
grade_in_gpa(score_10, d_plus).
grade(d).
grade_symbol(d, "D").
grade_rank(d, 7).
grade_passing(d).
grade_earns_credit(d).
grade_points(gpa_4, d, 100).
grade_in_gpa(gpa_4, d).
grade_points(d, 100).
grade_in_gpa(d).
grade_points(score_10, d, 445).
grade_in_gpa(score_10, d).
grade(f).
grade_symbol(f, "F").
grade_rank(f, 8).
grade_points(gpa_4, f, 0).
grade_in_gpa(gpa_4, f).
grade_points(f, 0).
grade_in_gpa(f).
grade_points(score_10, f, 195).
grade_in_gpa(score_10, f).
grade(p).
grade_symbol(p, "P").
grade_rank(p, 9).
grade_passing(p).
grade_earns_credit(p).
grade(w).
grade_symbol(w, "W").
grade_rank(w, 10).
grade(i).
grade_symbol(i, "I").
grade_rank(i, 11).
grade_provisional(i).
grade(x).
grade_symbol(x, "X").
grade_rank(x, 12).
grade_provisional(x).
grade(r).
grade_symbol(r, "R").
grade_rank(r, 13).
grade_passing(r).
grade_earns_credit(r).

% ------------------------------------------------------------------
% GPA course-kind filter
% ------------------------------------------------------------------
included_course_kind(regular).

% ------------------------------------------------------------------
% Retake policy
% ------------------------------------------------------------------
retake_eligibility(c).
retake_grade_cap(b).
% gpa_attempt_selection = latest
% credit_counting = once_per_course
% equivalence = use_course_equivalents

% ------------------------------------------------------------------
% Graduation requirements
% ------------------------------------------------------------------
graduation_requirement(all_groups_satisfied).
graduation_requirement(min_total_credits, 128).
graduation_requirement(min_cumulative_gpa, 250).
map(l, total_degree, 128).
map(u, total_degree, 128).
min_gpa(gpa_4, 250).

% ------------------------------------------------------------------
% External requirements (reported; not yet planned)
% ------------------------------------------------------------------
external_requirement(social_work_days, days, cumulative, blocking).
external_milestone(social_work_days, end_of_year, 1, 3).
external_milestone(social_work_days, end_of_year, 2, 6).
external_milestone(social_work_days, graduation, 15).

% =====================================================================
% tuition.lp : generated from tuition_policy.json
% =====================================================================

money_scale(1000).
money_currency(vnd).
money_unit(million).
fee_rule(regular, flat, 0, 6, 11688).
fee_rule(regular, flat, 7, 9, 9625).
fee_rule(regular, flat, 10, 12, 7563).
fee_rule(regular, flat, 13, 18, 13750).
fee_rule(regular, per_credit, 19, 999, 805).
fee_rule(summer, per_credit, 0, 999, 1230).
