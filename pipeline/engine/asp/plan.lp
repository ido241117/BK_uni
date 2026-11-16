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

#const n = 12.         % planning horizon; engine.py overrides this with -c n=...
% min_load, max_load, summer bounds and shift are policy constants in policy.lp.

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

% Semester load bounds, using the generic sum/4 constraints from encoding.lp.
% Only future semesters are bounded: history is fixed input, not a plan.
load_bearing(I) :- used(I), semester_credits(I, C), C > 0.

sum(s(I), c, bw, (0, max_load)) :-
    I = t+1..n, semester_type(I, regular).
sum(s(I), c, bw, (0, max_load_summer)) :-
    I = t+1..n, semester_type(I, summer).
sum(s(I), c, geq, min_load_summer) :-
    load_bearing(I), semester_type(I, summer).

max_used(M) :- used(_), M = #max{ I : used(I) }.     % also fixes #max over an empty set (#inf in the objective)
sum(s(I), c, geq, min_load) :- load_bearing(I), semester_type(I,regular), max_used(M), I < M.

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
% semester; the minimum load is only applied to used semesters, so
% trailing empty semesters are never forced.
% ---------------------------------------------------------------------
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
group_met(G) :- group(G), map(l, G, L),
    L <= #sum{ C, E : in(E, credit(G)), map(c, E, C) }.
group_unmet(G) :- group(G), not group_met(G).

any_group_unmet :- group_unmet(_).

total_credit(S) :- S = #sum{ C, E : in(E, credit(total_degree)), map(c, E, C) }.
total_met :- map(l, total_degree, L), total_credit(S), S >= L.

degree_complete :- total_met, not any_group_unmet.

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Minimum cumulative GPA requirement.
planned_course(E) :- in(X, s(I)), I > t, base(X, E).
planned_retake(E) :- in(rt(E,_), s(I)), I > t.

max_points(S,M)  :- default_scale(S), M = #max{ P : grade_in_gpa(S,G), grade_points(S,G,P) }.
retake_best(S,P) :- default_scale(S), retake_grade_cap(Cap), grade_points(S,Cap,P).
retake_best(S,P) :- default_scale(S), not retake_grade_cap(_), max_points(S,P).
future_best(E,P) :- planned_course(E), not planned_retake(E), default_scale(S), max_points(S,P).
future_best(E,P) :- planned_retake(E), default_scale(S), retake_best(S,P).

kept_num(N) :- default_scale(S),
    N = #sum{ C*P,E : gpa_attempt(E,X,S), map(c,E,C), effective_points(S,X,P), not planned_course(E) }.
kept_den(D) :- default_scale(S),
    D = #sum{ C,E : gpa_attempt(E,X,S), map(c,E,C), not planned_course(E) }.
best_num(N) :- kept_num(K), N = K + #sum{ C*P,E : planned_course(E), map(c,E,C), future_best(E,P) }.
best_den(D) :- kept_den(K), D = K + #sum{ C,E : planned_course(E), map(c,E,C) }.

:- min_gpa(S,Min), default_scale(S), best_den(D), D > 0, best_num(N), (2*N+D)/(2*D) < Min.

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% Milestone courses (e.g. internship, project, capstone) require a minimum
% number of credits accumulated strictly before the milestone semester.
% cs-2023.lp supplies milestone(Course, MinimumCredits).
:- milestone(C, Min), in(X, s(J)), base(X, C), J > t,
   #sum{ Cr, E : credited_before(E, J), map(c, E, Cr) } < Min.

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

% ---------------------------------------------------------------------
% Tuition and budget
% ---------------------------------------------------------------------
% Only future terms are billed; history is fixed input.  fee_rule/5 is
% deterministic per term after the load bounds are fixed.  The uniqueness
% constraint keeps one fee per term if a policy accidentally overlaps tiers.
fee(I, F) :-
    I = t+1..n, semester_type(I, Type), semester_credits(I, C), C > 0,
    fee_rule(Type, flat, Min, Max, F), C >= Min, C <= Max.
fee(I, F) :-
    I = t+1..n, semester_type(I, Type), semester_credits(I, C), C > 0,
    fee_rule(Type, per_credit, Min, Max, Rate), C >= Min, C <= Max,
    F = C * Rate.
semester_fee(I, F) :- fee(I, F).
:- semester_fee(I, F1), semester_fee(I, F2), F1 < F2.

% Keep cost as an aggregate in the objective and budget constraint.  A
% materialized total_cost/1 set makes grounding enumerate every possible
% intermediate sum, which is too large for a 12-term horizon.  The Python
% renderer sums semester_fee/2 when it needs the reported total.
:- budget(B), #sum{ F, I : fee(I, F) } > B.

% ---------------------------------------------------------------------
% Optimization
%
% clingo reports the objective vector by descending priority.  The solver labels
% the entries as:
%   @6 last_semester, @5 retakes, @4 cost, @3 level_order, @2 balance,
%   @1 taste.
% ---------------------------------------------------------------------

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
#show degree_complete.
#show pass/1.
#show passed_course/1.
#show credited/1.
#show pending/1.
#show must/1.
#show elig/2.
#show rejected_request/1.
#show gpa/2.
#show gpa/1.
#show semester_type/2.
