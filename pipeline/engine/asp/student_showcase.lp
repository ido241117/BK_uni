% =====================================================================
% student_showcase.lp : a full, realistic transcript for the cs-2023 curriculum
%
% Twelve terms are enough to see the whole pipeline:
%   * 118 attempted credits across semesters 1-8 (114 credited, 14 remain)
%   * pass/fail results for ENG_GC and SA4001, a failed MT2013, an
%     in-progress CO3005, and an in-progress LA1009 (assumed pass)
%   * semester 3 and semester 6 are summer terms; semester 8 is in progress
%   * declared AI major plus a request to improve CO3035 (C)
%   * 15 social-work days: all external milestones are met
%   * a 20.000 million VND budget
%
% The facts below were generated from the JSON-equivalent transcript with
% translation.student_to_facts, so retake numbering, last_attempt/gpa_last
% and the in-progress distinction are exactly what the engine sees.
%
% To keep this showcase deterministic, the scenario below closes every
% remaining elective slot except CO3057 (the preferred IPCV course) and
% CO3061 (the AI course that completes the major).  Remove the rule to let
% the solver choose from the full 44-course B3.4/C pool; that version is
% noticeably slower.
%
% The remaining 14 credits are CO4337 (4), MT2013 (4) and two electives (6),
% plus the requested CO3035 retake (3).  Terms 9 and 10 are 2026-3 (summer)
% and 2027-1 (regular).  n=12 is the full curriculum horizon; the plan ends
% in term 10, so --semesters 10 is also enough.
%
% Solve from this folder (an optimality proof takes roughly 80 seconds):
%   python cli.py --solve student_showcase.lp --t 8 --semesters 12 --plans 1 \
%       --time-limit 120
%
% The tight-budget variant drops the summer term and fits all 17 attempted
% credits into one regular term:
%   python cli.py --solve student_showcase.lp --t 8 --semesters 12 --plans 1 \
%       --max-budget 14 --time-limit 120 --no-report
% =====================================================================

% Scenario: the student has already chosen the two remaining electives.
:- in(E, s(I)), I > t, elective_group(B), in(E, B),
   E != co3057, E != co3061.

enroll_part_in(1).

taken(ch1003, 1).
map(g, ch1003, b).
taken(co1005, 1).
map(g, co1005, a).
taken(co1007, 1).
map(g, co1007, a).
taken(co1023, 3).
map(g, co1023, b).
taken(co1027, 3).
map(g, co1027, b_plus).
taken(co2001, 3).
map(g, co2001, a).
taken(co2003, 4).
map(g, co2003, a).
taken(co2007, 4).
map(g, co2007, b).
taken(co2011, 4).
map(g, co2011, b).
taken(co2013, 5).
map(g, co2013, b_plus).
taken(co2017, 5).
map(g, co2017, b).
taken(co2039, 5).
map(g, co2039, a).
taken(co3001, 5).
map(g, co3001, a).
taken(co3005, 6).
taken(co3011, 7).
map(g, co3011, b_plus).
taken(co3013, 7).
map(g, co3013, b).
taken(co3029, 7).
map(g, co3029, a).
taken(co3035, 7).
map(g, co3035, c).
taken(co3037, 7).
map(g, co3037, b_plus).
taken(co3041, 7).
map(g, co3041, a).
taken(co3093, 6).
map(g, co3093, b_plus).
taken(co3101, 6).
map(g, co3101, a).
taken(co3107, 6).
map(g, co3107, a).
taken(co3335, 6).
map(g, co3335, a).
taken(co4029, 6).
map(g, co4029, a).
taken(eng_gc, 8).
result(eng_gc, passed).
taken(im1013, 6).
map(g, im1013, b).
taken(la1003, 1).
map(g, la1003, b).
taken(la1005, 2).
map(g, la1005, b).
taken(la1007, 4).
map(g, la1007, b).
taken(la1009, 8).
taken(mt1003, 1).
map(g, mt1003, b_plus).
taken(mt1005, 2).
map(g, mt1005, a).
taken(mt1007, 2).
map(g, mt1007, a).
taken(mt2013, 6).
map(g, mt2013, f).
taken(ph1003, 1).
map(g, ph1003, b_plus).
taken(ph1007, 2).
map(g, ph1007, a).
taken(sa4001, 8).
result(sa4001, passed).
taken(sp1007, 2).
map(g, sp1007, b).
taken(sp1031, 2).
map(g, sp1031, b_plus).
taken(sp1033, 3).
map(g, sp1033, b).
taken(sp1035, 4).
map(g, sp1035, b_plus).
taken(sp1037, 7).
map(g, sp1037, b_plus).
taken(sp1039, 5).
map(g, sp1039, a).

attempt_count(ch1003, 1).
last_attempt(ch1003, ch1003).
attempt_count(co1005, 1).
last_attempt(co1005, co1005).
attempt_count(co1007, 1).
last_attempt(co1007, co1007).
attempt_count(co1023, 1).
last_attempt(co1023, co1023).
attempt_count(co1027, 1).
last_attempt(co1027, co1027).
attempt_count(co2001, 1).
last_attempt(co2001, co2001).
attempt_count(co2003, 1).
last_attempt(co2003, co2003).
attempt_count(co2007, 1).
last_attempt(co2007, co2007).
attempt_count(co2011, 1).
last_attempt(co2011, co2011).
attempt_count(co2013, 1).
last_attempt(co2013, co2013).
attempt_count(co2017, 1).
last_attempt(co2017, co2017).
attempt_count(co2039, 1).
last_attempt(co2039, co2039).
attempt_count(co3001, 1).
last_attempt(co3001, co3001).
attempt_count(co3005, 1).
last_attempt(co3005, co3005).
attempt_count(co3011, 1).
last_attempt(co3011, co3011).
attempt_count(co3013, 1).
last_attempt(co3013, co3013).
attempt_count(co3029, 1).
last_attempt(co3029, co3029).
attempt_count(co3035, 1).
last_attempt(co3035, co3035).
attempt_count(co3037, 1).
last_attempt(co3037, co3037).
attempt_count(co3041, 1).
last_attempt(co3041, co3041).
attempt_count(co3093, 1).
last_attempt(co3093, co3093).
attempt_count(co3101, 1).
last_attempt(co3101, co3101).
attempt_count(co3107, 1).
last_attempt(co3107, co3107).
attempt_count(co3335, 1).
last_attempt(co3335, co3335).
attempt_count(co4029, 1).
last_attempt(co4029, co4029).
attempt_count(eng_gc, 1).
last_attempt(eng_gc, eng_gc).
attempt_count(im1013, 1).
last_attempt(im1013, im1013).
attempt_count(la1003, 1).
last_attempt(la1003, la1003).
attempt_count(la1005, 1).
last_attempt(la1005, la1005).
attempt_count(la1007, 2).
last_attempt(la1007, la1007).
attempt_count(la1009, 1).
last_attempt(la1009, la1009).
attempt_count(mt1003, 1).
last_attempt(mt1003, mt1003).
attempt_count(mt1005, 1).
last_attempt(mt1005, mt1005).
attempt_count(mt1007, 1).
last_attempt(mt1007, mt1007).
attempt_count(mt2013, 1).
last_attempt(mt2013, mt2013).
attempt_count(ph1003, 1).
last_attempt(ph1003, ph1003).
attempt_count(ph1007, 1).
last_attempt(ph1007, ph1007).
attempt_count(sa4001, 1).
last_attempt(sa4001, sa4001).
attempt_count(sp1007, 1).
last_attempt(sp1007, sp1007).
attempt_count(sp1031, 1).
last_attempt(sp1031, sp1031).
attempt_count(sp1033, 1).
last_attempt(sp1033, sp1033).
attempt_count(sp1035, 1).
last_attempt(sp1035, sp1035).
attempt_count(sp1037, 1).
last_attempt(sp1037, sp1037).
attempt_count(sp1039, 1).
last_attempt(sp1039, sp1039).
gpa_last(ch1003, ch1003).
gpa_last(co1005, co1005).
gpa_last(co1007, co1007).
gpa_last(co1023, co1023).
gpa_last(co1027, co1027).
gpa_last(co2001, co2001).
gpa_last(co2003, co2003).
gpa_last(co2007, co2007).
gpa_last(co2011, co2011).
gpa_last(co2013, co2013).
gpa_last(co2017, co2017).
gpa_last(co2039, co2039).
gpa_last(co3001, co3001).
gpa_last(co3011, co3011).
gpa_last(co3013, co3013).
gpa_last(co3029, co3029).
gpa_last(co3035, co3035).
gpa_last(co3037, co3037).
gpa_last(co3041, co3041).
gpa_last(co3093, co3093).
gpa_last(co3101, co3101).
gpa_last(co3107, co3107).
gpa_last(co3335, co3335).
gpa_last(co4029, co4029).
gpa_last(im1013, im1013).
gpa_last(la1003, la1003).
gpa_last(la1005, la1005).
gpa_last(la1007, la1007).
gpa_last(mt1003, mt1003).
gpa_last(mt1005, mt1005).
gpa_last(mt1007, mt1007).
gpa_last(mt2013, mt2013).
gpa_last(ph1003, ph1003).
gpa_last(ph1007, ph1007).
gpa_last(sp1007, sp1007).
gpa_last(sp1031, sp1031).
gpa_last(sp1033, sp1033).
gpa_last(sp1035, sp1035).
gpa_last(sp1037, sp1037).
gpa_last(sp1039, sp1039).
external_progress(social_work_days, 2, 3).
external_progress(social_work_days, 4, 3).
external_progress(social_work_days, 5, 3).
external_progress(social_work_days, 7, 3).
external_progress(social_work_days, 8, 3).
student_major(ai).
request(co3035).
avoid(co3137).
pref(co3057).
budget(20000).
