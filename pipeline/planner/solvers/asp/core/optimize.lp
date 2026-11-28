% =====================================================================
% optimize.lp : preferences (objectives) and output
%
% Hard rules live in extension.lp; this file only ranks the valid plans and
% chooses what is displayed.  Which goals are active, and in which order, is
% decided by the request, as for every solver (docs/SOLVER-PARITY.md D7):
% the adapter emits goal(Id, P) for each active goal this engine implements,
% P = priority (higher first).  A goal without a goal/2 fact is off.
%   s1  earliest graduation          s6  keep recommended order (KN)
%   s2  no surplus credits           s4  wanted courses planned
%   s3  close to the previous plan   s5  balanced load (heaviest term)
%   s7  summer load in its band      s8  regular load in its band
%   s9  summer: low-level courses    s10 few summer credits
%   s11 regular terms reach the      oh  offering history (soft)
%       soft minimum load
%   rt  retakes early                fee lowest tuition
%   lo  lower-level courses first    ta  electives matching interests
% Goal ids are the planner's (planner/model/facts.py), lower-cased.
% =====================================================================

#defined course_level/2.  #defined goal/2.

% S1 earliest graduation: minimise the last used term.
#minimize{ M@P : max_used(M), goal(s1, P) }.

% S6 recommended order: a recommended relation is a soft prerequisite.
#minimize{ 1@P,B,A : kn_broken(B, A), goal(s6, P) }.

% S11 soft minimum load of regular terms (extension.lp section 9).
#minimize{ D@P,I : deficit(I, D), goal(s11, P) }.

% The goals below have the definitions of planner/solvers/cpsat.py.
#defined pref_band/2.  #defined summer_band/2.  #defined internship/1.
#defined summer_heavy/1.  #defined wanted/1.  #defined prev/2.
#defined regular_plan/1.  #defined summer_plan/1.

% S2 no surplus: credits of every planned attempt.
#minimize{ C@P,X : in(X, s(I)), I > t, map(c, X, C), goal(s2, P) }.

% S3 previous plan: its (course, term) pairs the new plan does not keep.
#minimize{ 1@P,E,I : prev(E, I), not placed(E, I), goal(s3, P) }.

% S4 wanted courses (not passed yet) that are not planned.
#minimize{ 1@P,E : wanted(E), not placed(E, _), goal(s4, P) }.

% S8 regular terms in the preferred band: credits above it, and below it for
% every term before the last used one.
s8_dev(I, over, C - Hi) :- regular_plan(I), pref_band(_, Hi), sum_val(s(I), c, C), C > Hi.
s8_dev(I, under, Lo - C) :- regular_plan(I), pref_band(Lo, _), max_used(M), I < M,
                            sum_val(s(I), c, C), C < Lo.
#minimize{ D@P,I,K : s8_dev(I, K, D), goal(s8, P) }.

% Summer load without internships, per summer term.
summer_load(I, L) :- summer_plan(I),
    L = #sum{ C, X : in(X, s(I)), base(X, E), not internship(E), map(c, X, C) }.

% S7 a summer with study is in its band: credits above it, or below it when
% the term has any study.
s7_dev(I, over, L - Hi) :- summer_load(I, L), summer_band(_, Hi), L > Hi.
s7_dev(I, under, Lo - L) :- summer_load(I, L), summer_band(Lo, _), L > 0, L < Lo.
#minimize{ D@P,I,K : s7_dev(I, K, D), goal(s7, P) }.

% S10 few summer credits (internships excluded).
#minimize{ L@P,I : summer_load(I, L), goal(s10, P) }.

% S9 summer: credits of level-3+ courses (not internships) planned in summer.
#minimize{ C@P,X : in(X, s(I)), summer_plan(I), base(X, E), summer_heavy(E), map(c, X, C), goal(s9, P) }.

% S5 balanced workload: minimise the heaviest future term.  Counting the
% thresholds 1..C reached by some term equals the maximum load, without
% materialising a #max over all possible load values.
heavy(V) :- goal(s5, _), semester_credits(I, C), I > t, V = 1..C.
#minimize{ 1@P,V : heavy(V), goal(s5, P) }.

% OH offering history: placements in a term part where the course has not run.
#minimize{ 1@P,E,I : oh(E, I), goal(oh, P) }.

% RT fail-recovery: retake failed/requested courses as early as possible,
% and avoid unnecessary/voluntary retakes.
#minimize{ I@P,E : in(rt(E,N), s(I)), retake_no(E,N), must(E), goal(rt, P) }.
#minimize{ 1@P,E : in(rt(E,N), s), retake_no(E,N), not must(E), goal(rt, P) }.

% FEE future tuition (inactive without fee_rule/6).
#minimize{ F@P,I : fee(I, F), goal(fee, P) }.

% LO lower-level courses first: pull 1xxx/2xxx courses into earlier terms.
#minimize{ I@P,X : in(X, s(I)), I > t, base(X, E), course_level(E, L), L <= 2, goal(lo, P) }.

% TA student taste: maximise the interest score of the planned electives
% (sum of the weights of their matching tags).
#minimize{ -S@P,E : placed(E, _), score(E, S), goal(ta, P) }.

% ---------------------------------------------------------------------
% Output
% ---------------------------------------------------------------------
#show.
#show plan(X, I) : in(X, s(I)), I > t.
#show semester_type/2.
#show semester_credits/2.
#show semester_earned/2.
#show semester_fee/2.
#show total_planned/1.
#show total_attempted/1.
#show total_credit/1.
#show degree_complete/0.
#show ready_to_graduate/0.
#show pass/1.
#show passed_course/1.
#show credited/1.
#show assumed_pass/1.
#show must/1.
#show gpa/2.
#show gpa/1.
#show gpa_best_case/1.
#show gpa_required_avg/1.
#show gpa_already_satisfied/0.
#show gpa_requirement_impossible/0.
#show major_earned/1.
#show major_count/2.
#show ext_missed/2.
#show ext_pending/3.
#show graduation_blocked/1.
#show student_major/1.
#show elective_slot/2.
#show slot_option/2.
#show interest_match/2.
#show course_note/2.
#show oh/2.
#show kn_broken/2.
#show deficit/2.
