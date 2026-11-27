% =====================================================================
% policy.lp : grading, graduation and tuition policy
% Originally generated from grading_policy.json, graduation_requirements.json
% and tuition_policy.json (research-pipeline branch).  On this branch the
% generator is not kept: this file is the school's policy and is edited by
% hand.  Curriculum-specific facts (total_degree) do not belong here.
% =====================================================================

% Grading policy: policy_2020
% Effective cohorts: 2023..open

% ------------------------------------------------------------------
% Planner constants
% ------------------------------------------------------------------
#const min_load = 14.
#const max_load = 21.
#const min_load_summer = 0.
#const max_load_summer = 12.

% ------------------------------------------------------------------
% Academic calendar and term loads
% ------------------------------------------------------------------
% An academic year has 3 parts, named by term_part_type/2.
% Types listed as extra_semester_type/1 are optional and used
% by the plan only when run with -c extra_sem=1.
term_parts(3).
term_part_type(1, regular).
term_part_type(2, regular).
term_part_type(3, summer).
extra_semester_type(summer).

% load_bound(Type, MinCredits, MaxCredits) per term type.
load_bound(regular, min_load, max_load).
load_bound(summer, min_load_summer, max_load_summer).

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
% Score -> letter: grade_min_score(score_10, G, Lo) is the lowest score of
% grade G (min_score of grading_policy.json, research-pipeline).  A course
% score V gets the grade with the largest Lo <= V (core/translate.lp); the
% letter then decides passed/failed and gives the gpa_4 points.
grade_min_score(score_10, a_plus, 950).
grade_min_score(score_10, a, 850).
grade_min_score(score_10, b_plus, 800).
grade_min_score(score_10, b, 700).
grade_min_score(score_10, c_plus, 650).
grade_min_score(score_10, c, 550).
grade_min_score(score_10, d_plus, 500).
grade_min_score(score_10, d, 400).
grade_min_score(score_10, f, 0).

% ------------------------------------------------------------------
% Grade scale
% ------------------------------------------------------------------
grade(a_plus).
grade_symbol(a_plus, "A+").
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
grade_passing(a).
grade_earns_credit(a).
grade_points(gpa_4, a, 400).
grade_in_gpa(gpa_4, a).
grade_points(a, 400).
grade_in_gpa(a).
grade_points(score_10, a, 900).
grade_in_gpa(score_10, a).
grade(b_plus).
grade_symbol(b_plus, "B+").
grade_passing(b_plus).
grade_earns_credit(b_plus).
grade_points(gpa_4, b_plus, 350).
grade_in_gpa(gpa_4, b_plus).
grade_points(b_plus, 350).
grade_in_gpa(b_plus).
grade_points(score_10, b_plus, 825).
grade_in_gpa(score_10, b_plus).
grade(b).
grade_symbol(b, "B").
grade_passing(b).
grade_earns_credit(b).
grade_points(gpa_4, b, 300).
grade_in_gpa(gpa_4, b).
grade_points(b, 300).
grade_in_gpa(b).
grade_points(score_10, b, 750).
grade_in_gpa(score_10, b).
grade(c_plus).
grade_symbol(c_plus, "C+").
grade_passing(c_plus).
grade_earns_credit(c_plus).
grade_points(gpa_4, c_plus, 250).
grade_in_gpa(gpa_4, c_plus).
grade_points(c_plus, 250).
grade_in_gpa(c_plus).
grade_points(score_10, c_plus, 675).
grade_in_gpa(score_10, c_plus).
grade(c).
grade_symbol(c, "C").
grade_passing(c).
grade_earns_credit(c).
grade_points(gpa_4, c, 200).
grade_in_gpa(gpa_4, c).
grade_points(c, 200).
grade_in_gpa(c).
grade_points(score_10, c, 600).
grade_in_gpa(score_10, c).
grade(d_plus).
grade_symbol(d_plus, "D+").
grade_passing(d_plus).
grade_earns_credit(d_plus).
grade_points(gpa_4, d_plus, 150).
grade_in_gpa(gpa_4, d_plus).
grade_points(d_plus, 150).
grade_in_gpa(d_plus).
grade_points(score_10, d_plus, 525).
grade_in_gpa(score_10, d_plus).
grade(d).
grade_symbol(d, "D").
grade_passing(d).
grade_earns_credit(d).
grade_points(gpa_4, d, 100).
grade_in_gpa(gpa_4, d).
grade_points(d, 100).
grade_in_gpa(d).
grade_points(score_10, d, 450).
grade_in_gpa(score_10, d).
grade(f).
grade_symbol(f, "F").
grade_points(gpa_4, f, 0).
grade_in_gpa(gpa_4, f).
grade_points(f, 0).
grade_in_gpa(f).
grade_points(score_10, f, 200).
grade_in_gpa(score_10, f).
grade_rank(a_plus, 0).
grade_rank(a, 1).
grade_rank(b_plus, 2).
grade_rank(b, 3).
grade_rank(c_plus, 4).
grade_rank(c, 5).
grade_rank(d_plus, 6).
grade_rank(d, 7).
grade_rank(f, 8).

% ------------------------------------------------------------------
% GPA course-kind filter
% ------------------------------------------------------------------
included_course_kind(regular).

% ------------------------------------------------------------------
% Retake policy
% ------------------------------------------------------------------
% gpa_attempt_selection = latest
gpa_attempt_selection(latest).
% grade cap on retakes = B
retake_grade_cap(b).
% equivalence = use_course_equivalents

% ------------------------------------------------------------------
% Graduation requirements
% ------------------------------------------------------------------
graduation_requirement(all_groups_satisfied).
graduation_requirement(min_cumulative_gpa, 250).
% total_degree (map(l/u, total_degree, _)) depends on the curriculum, so it is
% emitted with the curriculum facts (pipeline/planner/solve_asp.py), not here.
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
% fee_rule(Type, Min, Max, Base, Rate, Over):
%   Min <= credits <= Max costs Base + Rate * max(0, credits - Over)
% =====================================================================

money_scale(1000).
money_currency(vnd).
money_unit(million).
fee_rule(regular, 0, 6, 7563, 0, 0).
fee_rule(regular, 7, 9, 9625, 0, 0).
fee_rule(regular, 10, 12, 11688, 0, 0).
fee_rule(regular, 13, 18, 13750, 0, 0).
fee_rule(regular, 19, 999, 13750, 805, 18).
fee_rule(summer, 0, 999, 0, 1230, 0).
