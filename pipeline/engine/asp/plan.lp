% =====================================================================
% plan.lp : curriculum-independent planning rules
%
% Load after encoding.lp, extension.lp, cs-2023.lp and student.lp:
%   clingo encoding.lp extension.lp cs-2023.lp student.lp plan.lp -c t=2
%
% This file contains no course codes or credit values.  It only uses the
% generic predicates exported by cs-2023.lp (group/1, credit/1, map/3, ...)
% and by extension.lp (in/2, base/2, must/1, ...).
% =====================================================================

#const n = 8.          % planning horizon; solver.py overrides this with -c n=...
#const min_load = 14.
#const max_load = 21.

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

total_planned(T) :- T = #sum{ C, X : in(X, s(I)), I > t, map(c, X, C) }.

% ---------------------------------------------------------------------
% Hard constraints
% ---------------------------------------------------------------------
% No course/attempt object may appear in two different semesters.  This
% also prevents re-scheduling a course already taken in the past as its
% original node; failed courses must use a retake object instead.
empty(int(s(I), s(J))) :- I = 1..n, J = 1..n, I < J.

% Semester load bounds, using the generic sum/4 constraints from encoding.lp.
% Only future semesters are bounded: history is fixed input, not a plan.
sum(s(I), c, bw, (0, max_load)) :- I = t+1..n.
sum(s(I), c, geq, min_load) :- used(I).

% A plan is one contiguous block of future semesters.  This prevents a
% course from jumping over an empty semester just because the objective
% only counts used semesters.
:- used(I), I > t+1, not used(I-1).

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
group_met(G) :- group(G), map(l, G, L),
    L <= #sum{ C, E : in(E, credit(G)), map(c, E, C) }.
group_unmet(G) :- group(G), not group_met(G).

any_group_unmet :- group_unmet(_).

total_credit(S) :- S = #sum{ C, E : in(E, credit(total_degree)), map(c, E, C) }.
total_met :- map(l, total_degree, L), total_credit(S), S >= L.

degree_complete :- total_met, not any_group_unmet.

% ---------------------------------------------------------------------
% Optimization
% ---------------------------------------------------------------------

% earliest graduation: minimise the last used semester.  Together with the
% contiguity constraint this also minimises the number of planned semesters.
max_used(M) :- M = #max{ I : used(I) }.
#minimize{ M@5 : max_used(M) }.

% fail-recovery first: retake failed compulsory courses as early as possible
#minimize{ I@4,E : in(rt(E,N), s(I)), natt(E,N), must(E) }.

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
#show total_planned/1.
#show total_credit/1.
#show degree_complete.
#show must/1. #show elig/2. #show rejected_request/1. #show gpa/1.
