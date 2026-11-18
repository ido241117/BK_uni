% =====================================================================
% plan.lp : school-specific planning policy
%
% Load after encoding.lp, policy.lp, extension.lp, cs-2023.lp and student.lp:
%   clingo encoding.lp policy.lp extension.lp cs-2023.lp student.lp plan.lp -c t=2
%
% This is the school's planning model: semester load bounds and calendar
% shape, degree completion, milestone and GPA gates, tuition/budget, the
% optimization order, and the display surface.  It contains no concrete
% course codes or credit values; those come from policy.lp, cs-2023.lp and
% student.lp.
% =====================================================================

#const n = 12.         % planning horizon; the engine passes -c n=<t + planning.horizon>
% min_load, max_load and the summer bounds are constants in policy.lp.

% ---------------------------------------------------------------------
% Generic elective view.  cs-2023.lp marks every elective quota group
% with elective_group/1, so no particular group name is hard-coded here.
% ---------------------------------------------------------------------
in(E, el) :- elective_group(G), in(E, G).

% ---------------------------------------------------------------------
% Semester usage and per-semester credit totals
% ---------------------------------------------------------------------
used(I) :- in(_, s(I)), I > t.

semester_credits(I, C) :- in(_, s(I)),
    C = #sum{ Cr, X : in(X, s(I)), map(c, X, Cr) }.

% Earned credits are a separate notion from attempted/load credits: a
% failed course still occupies load and incurs tuition, but does not earn
% degree credit.
semester_earned(I, C) :- in(_, s(I)),
    C = #sum{ Cr, E : in(E, ok(I)), map(c, E, Cr) }.

total_planned(T) :- T = #sum{ C, X : in(X, s(I)), I > t, map(c, X, C) }.
total_attempted(T) :- total_planned(T).

% ---------------------------------------------------------------------
% Hard constraints
% ---------------------------------------------------------------------
% No course/attempt object may appear in two different semesters.  This
% also prevents re-scheduling a course already taken in the past as its
% original node; failed courses must use a retake object instead.
empty(int(s(I), s(J))) :- I = 1..n, J = 1..n, I < J.

% Last used future semester (guarded so an empty plan has no #inf).
max_used(M) :- used(_), M = #max{ I : used(I) }.

% Semester load bounds, using the generic sum/4 constraints from encoding.lp.
% Only future semesters are bounded: history is fixed input, not a plan.
load_bearing(I) :- used(I), semester_credits(I, C), C > 0.

sum(s(I), c, bw, (0, max_load)) :-
    I = t+1..n, semester_type(I, regular).
sum(s(I), c, bw, (0, max_load_summer)) :-
    I = t+1..n, semester_type(I, summer).
% The minimum load applies to every used semester except the last one: the
% final term may be light because only the remaining credits are left.
sum(s(I), c, geq, min_load) :-
    load_bearing(I), semester_type(I, regular), max_used(M), I < M.
sum(s(I), c, geq, min_load_summer) :-
    load_bearing(I), semester_type(I, summer), max_used(M), I < M.

% Regular semesters form one contiguous block.  Summer terms are optional:
% a student may skip summer, but cannot skip a regular term and then resume.
regular_used(I) :- used(I), semester_type(I, regular).
next_regular(I, J) :-
    I = 1..n, J = I+1,
    semester_type(I, regular), semester_type(J, regular).
next_regular(I, J) :-
    I = 1..n, J = I+2, M = I+1,
    semester_type(I, regular), semester_type(M, summer),
    semester_type(J, regular).
:- regular_used(I), next_regular(I, J), regular_used(K), J < K,
   not regular_used(J).

% ---------------------------------------------------------------------
% Completion test
%
% The plan stops once both conditions hold:
%   1. the total minimum credit requirement is met, and
%   2. every curriculum group has reached its lower bound.
%
% The earliest-graduation objective below minimises the last used
% semester; the minimum load is not applied to the last used semester, so
% a short final term is allowed and trailing empty semesters are never
% forced.
% ---------------------------------------------------------------------
group_met(G) :- group(G), map(l, G, L),
    L <= #sum{ C, E : in(E, credit(G)), map(c, E, C) }.
group_unmet(G) :- group(G), not group_met(G).

any_group_unmet :- group_unmet(_).

total_credit(S) :- S = #sum{ C, E : in(E, credit(total_degree)), map(c, E, C) }.
total_met :- map(l, total_degree, L), total_credit(S), S >= L.

degree_complete :- total_met, not any_group_unmet.

% ---------------------------------------------------------------------
% Minimum cumulative GPA (planning target)
%
% Future grades are unknown, so the model does not compare the *current* GPA
% with the minimum.  It reports the backward-calculated target: the average
% the remaining GPA credits must reach for the rounded cumulative GPA to meet
% the minimum.  That target is a planning guide, not a hard per-term
% constraint, so students may have weaker semesters.  The only readiness test
% is whether the minimum is still reachable; gpa_requirement_impossible/0
% reports the edge cases where even the cap-aware best case falls short.
% ---------------------------------------------------------------------
planned_course(E)  :- in(X, s(I)), I > t, base(X, E).
planned_retake(E)  :- in(rt(E, _), s(I)), I > t.

open_course(E)  :- taken(X, _), base(X, E), status(X, unknown).
open_course(E)  :- taken(X, _), base(X, E), status(X, pending).
open_retake(E)  :- taken(rt(E, K), _), status(rt(E, K), unknown).
open_retake(E)  :- taken(rt(E, K), _), status(rt(E, K), pending).

optimistic(E)   :- planned_course(E).
optimistic(E)   :- open_course(E).
retake_flag(E)  :- planned_retake(E).
retake_flag(E)  :- open_retake(E).

max_points(S, M)  :- default_scale(S),
    M = #max{ P : grade_in_gpa(S, G), grade_points(S, G, P) }.
retake_best(S, P) :- default_scale(S), retake_grade_cap(Cap), grade_points(S, Cap, P).
retake_best(S, P) :- default_scale(S), not retake_grade_cap(_), max_points(S, P).

future_best(E, P) :- optimistic(E), not retake_flag(E), default_scale(S), max_points(S, P).
future_best(E, P) :- optimistic(E), retake_flag(E), default_scale(S), retake_best(S, P).

kept_num(N) :- default_scale(S),
    N = #sum{ C*P, E : gpa_sel(E, X), gpa_attempt(E, X, S), map(c, E, C),
                       effective_points(S, X, P), not optimistic(E) }.
kept_den(D) :- default_scale(S),
    D = #sum{ C, E : gpa_sel(E, X), gpa_attempt(E, X, S), map(c, E, C),
                     not optimistic(E) }.
% Only future courses with a GPA-bearing best case enter the optimistic GPA;
% pass/fail or otherwise non-GPA credits must not dilute the denominator.
fut_num(F) :- F = #sum{ C*P, E : optimistic(E), map(c, E, C), future_best(E, P) }.
fut_den(F) :- F = #sum{ C, E : optimistic(E), map(c, E, C), future_best(E, _) }.

best_num(N) :- kept_num(K), fut_num(F), N = K + F.
best_den(D) :- kept_den(K), fut_den(F), D = K + F.

gpa_best_case(G) :- best_den(D), D > 0, best_num(N), G = (2*N + D) / (2*D).

% Average (same fixed-point scale as the GPA) that the remaining GPA credits
% must reach so that the rounded cumulative GPA meets the minimum.
gpa_target_raw(R) :-
    min_gpa(S, Min), default_scale(S), kept_num(K), kept_den(KD),
    fut_den(F), F > 0,
    Need = (2*Min*(KD + F) - (KD + F) + 1) / 2,
    R = (Need - K + F - 1) / F.

% Clamp a non-positive target to zero: no extra GPA is needed.
gpa_required_avg(R) :- gpa_target_raw(R), R >= 0.
gpa_required_avg(0)  :- gpa_target_raw(R), R < 0.

gpa_already_satisfied :- gpa_target_raw(R), R <= 0.
gpa_already_satisfied :-
    min_gpa(S, Min), default_scale(S), fut_den(0), best_den(D), D > 0,
    best_num(N), (2*N + D) / (2*D) >= Min.

gpa_required_avg(0) :-
    min_gpa(S, Min), default_scale(S), fut_den(0), best_den(D), D > 0,
    best_num(N), (2*N + D) / (2*D) >= Min.

% The best-case gate is now a report, not a hard constraint.  It catches
% both the scale-max edge case and policies whose retake cap lowers the
% maximum future GPA below the backward target.
gpa_requirement_impossible :-
    min_gpa(S, Min), default_scale(S), best_den(D), D > 0,
    best_num(N), (2*N + D) / (2*D) < Min.

% ---------------------------------------------------------------------
% Milestone courses (e.g. internship, project, capstone) require a minimum
% number of credits accumulated strictly before the milestone semester.
% cs-2023.lp supplies milestone(Course, MinimumCredits).
% ---------------------------------------------------------------------
:- milestone(C, Min), in(X, s(J)), base(X, C), J > t,
   #sum{ Cr, E : credited_before(E, J), map(c, E, Cr) } < Min.

% ---------------------------------------------------------------------
% External requirements (reported, not scheduled)
%
% Such requirements (e.g. social work days) cannot be planned like courses,
% but a blocking one must not be hidden behind degree_complete.  Deadlines
% "end_of_year Y" fall on the summer term (part 3) of the Y-th academic
% year counted from the enrollment year.
% ---------------------------------------------------------------------
ext_have(R, J, S) :- external_requirement(R, _, _, _), J = 0..n,
    S = #sum{ A, I : external_progress(R, I, A), I <= J }.
ext_deadline(R, Y, 3*Y - (Q - 1), Min) :-
    external_milestone(R, end_of_year, Y, Min), enroll_part(Q).

ext_missed(R, Y) :- external_requirement(R, _, _, blocking),
    ext_deadline(R, Y, J, Min), J <= t, ext_have(R, J, S), S < Min.
ext_pending(R, Y, Min - S) :- external_requirement(R, _, _, blocking),
    ext_deadline(R, Y, J, Min), J > t, ext_have(R, t, S), S < Min.
graduation_blocked(R) :- external_requirement(R, _, _, blocking),
    external_milestone(R, graduation, Min), ext_have(R, t, S), S < Min.

ready_to_graduate :- degree_complete, not graduation_blocked(_), not ext_missed(_, _),
    not gpa_requirement_impossible.

% ---------------------------------------------------------------------
% Tuition and budget
% ---------------------------------------------------------------------
% Only future terms are billed; history is fixed input.
%   fee_rule(Type, Min, Max, Base, Rate, Over): for Min <= credits <= Max
%   the fee is Base + Rate * max(0, credits - Over).
% A flat tier has Rate 0; a per-credit-on-everything tier has Base 0 and
% Over 0; a surcharge tier has Base = the flat fee and Over = the credit
% count that the flat fee already covers.
fee(I, F) :-
    I = t+1..n, semester_type(I, Type), semester_credits(I, C), C > 0,
    fee_rule(Type, Min, Max, Base, _, Over), C >= Min, C <= Max, C <= Over,
    F = Base.
fee(I, F) :-
    I = t+1..n, semester_type(I, Type), semester_credits(I, C), C > 0,
    fee_rule(Type, Min, Max, Base, Rate, Over), C >= Min, C <= Max, C > Over,
    F = Base + Rate * (C - Over).
semester_fee(I, F) :- fee(I, F).
:- semester_fee(I, F1), semester_fee(I, F2), F1 < F2.

% A billed semester without a matching rule would silently cost 0 and make
% every plan look affordable; refuse instead.
:- used(I), I > t, semester_credits(I, C), C > 0, not fee(I, _).

% Keep cost as an aggregate in the objective and budget constraint.  A
% materialized total_cost/1 set makes grounding enumerate every possible
% intermediate sum, which is too large for a 12-term horizon.  The Python
% renderer sums semester_fee/2 when it needs the reported total.  The
% budget is in the same fixed-point unit as the fees (money_scale).
:- budget(B), #sum{ F, I : fee(I, F) } > B.

% ---------------------------------------------------------------------
% Optimization
%
% clingo reports the objective vector by descending priority.  The solver labels
% the entries as:
%   @6 last_semester, @5 retakes, @4 cost, @3 level_order, @2 balance,
%   @1 taste.
% ---------------------------------------------------------------------

% earliest graduation: minimise the last used semester.  Together with the
% regular-term contiguity constraint this also minimises planned terms.
#minimize{ M@6 : max_used(M) }.

% fail-recovery first: retake failed compulsory courses as early as possible.
#minimize{ I@5,E : in(rt(E,N), s(I)), attempt_count(E,N), must(E) }.
% Same priority: avoid unnecessary/voluntary retakes.
#minimize{ 1@5,E : in(rt(E,N), s), attempt_count(E,N), not must(E) }.

% minimise future tuition after graduation/retake quality is fixed
#minimize{ F@4,I : fee(I, F) }.

% lower-level courses first: pull 1xxx/2xxx courses into earlier semesters
% so that 3xxx/4xxx courses do not displace them.
#minimize{ I@3,X : in(X, s(I)), I > t,
                     base(X, E), course_level(E, L), L <= 2 }.

% balanced workload: minimise the heaviest future semester
load(I, L) :- I = t+1..n, L = #sum{ C, X : in(X, s(I)), map(c, X, C) }.
maxload(M) :- M = #max{ L : load(I, L) }.
#minimize{ M@2 : maxload(M) }.

% student taste: avoid electives they dislike, prefer ones they like
#minimize{ 1@1,E : in(E, s(I)), I > t, avoid(E) }.
#minimize{ 1@1,E : in(E, el), not in(E, s), not in(E, ok), pref(E) }.

% ---------------------------------------------------------------------
% Display
% ---------------------------------------------------------------------
#show plan(X, I) : in(X, s(I)), I > t.
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
#show pending/1.
#show assumed_pass/1.
#show must/1.
#show elig/2.
#show exhausted/1.
#show rejected_request/1.
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
#show semester_type/2.
