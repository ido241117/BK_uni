% =====================================================================
% extension.lp : curriculum-independent semantic layer
% Works on top of encoding.lp and policy.lp, and consumes the data facts in
% cs-2023.lp and student.lp.  It defines the generic calendar, history,
% status, retake, group/credit, prerequisite/co-requisite, offering and GPA
% semantics.  School-specific loads, tuition, objectives and display rules
% live in plan.lp.
%
% Terms for "attempt objects":
%   E          first attempt of course E (E in m)
%   rt(E,K)    K-th retake of course E   (K = 1,2,...)
%
% Student input (facts):
%   taken(X,I)          attempt X was enrolled in semester I (I <= t)
%   map(g,X,V)          grade of attempt X
%   result(X,S)         direct status for pass/fail courses (passed|failed)
%   course_kind(X,K)    regular / summer / transfer / ...
%   attempt_count(E,N)  all kept attempts of course E
%   last_attempt(E,X)   latest attempt used for status/GPA
%   request(E)          student explicitly asks to retake E
%   offer(E,I) / closed(E,I)   student/registrar offering overrides
%
% Grade symbols, numeric scales and retake rules are facts in policy.lp.
% Everything below is scale-agnostic: the engine only asks whether a grade
% passes, earns credit, is provisional, or carries points on a given scale.
% =====================================================================

#const t = 0.    % number of studied terms (shift/term_offset are in policy.lp)

% ---------- three-term calendar ---------------------------------------
% term index 1 = first term after the recorded history.  The pattern is
% regular, regular, summer, regular, regular, summer, ...
part(I, P) :- I = 1..n, P = ((I + term_offset - 1) \ 3) + 1.
semester_type(I, summer)  :- part(I, 3).
semester_type(I, regular) :- part(I, P), P != 3.

% ---------- history ----------------------------------------------------
:- taken(_, I), I > t.
in(X, s(I)) :- taken(X, I).

% ---------- effective grade (retake cap) -------------------------------
retake_attempt(rt(E, K)) :- taken(rt(E, K), _).

grade_present(X, G) :- taken(X, _), map(g, X, G).
provisional_attempt(X) :- grade_present(X, G), grade_provisional(G).
withdrawn_attempt(X)   :- grade_present(X, w).

grade_at_most(G, Cap) :-
    grade_rank(G, R), grade_rank(Cap, RC), R >= RC.

effective_grade(X, Raw) :-
    taken(X, _), map(g, X, Raw), not retake_attempt(X).

effective_grade(X, Raw) :-
    taken(X, _), retake_attempt(X), map(g, X, Raw),
    not retake_grade_cap(_).

effective_grade(X, Cap) :-
    taken(X, _), retake_attempt(X), map(g, X, Raw),
    retake_grade_cap(Cap),
    grade_rank(Raw, RR), grade_rank(Cap, RC), RR < RC.

effective_grade(X, Raw) :-
    taken(X, _), retake_attempt(X), map(g, X, Raw),
    retake_grade_cap(Cap),
    grade_rank(Raw, RR), grade_rank(Cap, RC), RR >= RC.

% ---------- status: passed / failed / pending / withdrawn --------------
status(X, passed) :-
    taken(X, _), effective_grade(X, G), grade_passing(G),
    not provisional_attempt(X), not withdrawn_attempt(X), not result(X, _).
status(X, failed) :-
    taken(X, _), effective_grade(X, G), not grade_passing(G),
    not provisional_attempt(X), not withdrawn_attempt(X), not result(X, _).
status(X, pending) :-
    taken(X, _), provisional_attempt(X), not result(X, _).
status(X, withdrawn) :-
    taken(X, _), withdrawn_attempt(X), not result(X, _).
status(X, unknown) :-
    taken(X, _), not grade_present(X, _), not result(X, _).
status(X, S) :- taken(X, _), result(X, S).

% ---------- attempts of a course ---------------------------------------
hist(E, E)       :- taken(E, _), in(E, m).
hist(rt(E, K), E) :- taken(rt(E, K), _).

% ---------- retake eligibility -----------------------------------------
has_retake_eligibility :- retake_eligibility(_).

elig(E, improve) :-
    last_attempt(E,X), status(X,passed), effective_grade(X,G),
    default_scale(S), grade_in_gpa(S,G),
    retake_eligibility(Cap), grade_at_most(G,Cap),
    attempt_count(E,N), N < maxtries.
elig(E, improve) :-
    last_attempt(E,X), status(X,passed), effective_grade(X,G),
    default_scale(S), grade_in_gpa(S,G),
    attempt_count(E,N), N < maxtries, not has_retake_eligibility.

elig(E, failed) :-
    last_attempt(E, X), status(X, failed),
    attempt_count(E, N), N < maxtries.
elig(E, failed) :-
    last_attempt(E, X), status(X, withdrawn),
    attempt_count(E, N), N < maxtries.
elig(E) :- elig(E, _).

% A retake is a scheduled "retaken version" of the course.
{ in(rt(E, N), s(I)) } :- elig(E), attempt_count(E, N), I = t+1..n.
map(c, rt(E, K), C) :- map(c, E, C), taken(rt(E, K), _).
map(c, rt(E, N), C) :- map(c, E, C), elig(E), attempt_count(E, N).

% Base course of every attempt object (used for credits and offering).
base(X, E)       :- hist(X, E).
base(E, E)       :- in(E, m).
base(rt(E, N), E) :- elig(E), attempt_count(E, N).

% ---------- obligation to retake ---------------------------------------
must(E) :- elig(E, failed), in(E, comp), not earned(E).      % failed compulsory
must(E) :- elig(E), request(E).               % explicit request
:- must(E), attempt_count(E, N), not in(rt(E, N), s).

rejected_request(E) :- request(E), not elig(E).

% An improvement retake only happens on request; a voluntary retake of a
% failed elective is allowed but the school's objective penalises it.
:- in(rt(E, N), s), attempt_count(E, N), not elig(E, failed), not request(E).

% ---------- credited sets (credits count once) -------------------------
% Past: passed with a credit-earning grade.  Unknown (in progress) is
% treated optimistically, matching the planner's planning assumption.
% Future: a scheduled base/retake attempt is assumed passed.
in(E, ok(I)) :- in(X, s(I)), base(X, E), I > t.
in(E, ok(I)) :-
    taken(X, I), base(X, E), status(X, passed),
    effective_grade(X, G), grade_earns_credit(G).
in(E, ok(I)) :- taken(X, I), base(X, E), result(X, passed).
in(E, ok(I)) :- taken(X, I), base(X, E), status(X, unknown).
in(E, ok) :- in(E, ok(I)).

credited(E) :- in(E, ok).
passed_course(E) :-
    taken(X, _), base(X, E), status(X, passed),
    effective_grade(X, G), grade_passing(G).
passed_course(E) :- taken(X, _), base(X, E), result(X, passed).
pending(E) :- taken(X, _), base(X, E), status(X, pending).
earned(E) :-
    taken(X, _), base(X, E), status(X, passed),
    effective_grade(X, G), grade_earns_credit(G).
earned(E) :- taken(X, _), base(X, E), result(X, passed).

% Backwards-compatible display atom.  It now means "passed in the
% transcript", not "credited optimistically by the future plan".
pass(E) :- passed_course(E).

% "credited before" is a set predicate, so an improvement retake cannot
% count the same course twice in a milestone sum.
credited_before(E, J) :- in(E, ok(I)), I < J, J = 1..n.
precred(A, J) :- in(A, ok(I)), I < J, J = 1..n.

% ---------- curriculum groups and credit accounting --------------------
% cs-2023.lp supplies group membership, bounds, map(c,...), and
% elective_group/1.  Everything here is generic to any curriculum.
in(E, m) :- group(G), in(E, G).

group(G) :- map(l, G, _), map(u, G, _), G != total_degree.

% Compulsory courses are the non-elective groups.  A failed compulsory
% course must be retaken; the subset constraint also forces every
% compulsory course to appear in the credited set.
in(E, comp) :- group(G), in(E, G), not elective_group(G).
subseteq(comp, ok).

% Mandatory groups count every credited member.  Elective quota buckets
% compete for a single bucket per course, so an extra passed elective is
% left uncounted instead of violating a group upper bound.
in(E, credit(G)) :- group(G), in(E, G), in(E, ok), not elective_group(G).
candidate(E, B) :- elective_group(B), in(E, B).
{ counted(E, B) : candidate(E, B) } <= 1 :- candidate(E, _), in(E, ok).
in(E, credit(B)) :- elective_group(B), counted(E, B), in(E, ok).
in(E, credit(total_degree)) :- group(G), in(E, credit(G)).

% Only courses that count toward a requirement group may be scheduled.
counted_course(E) :- group(G), in(E, credit(G)).
:- in(E, s(I)), I > t, in(E, m), not counted_course(E).

% Group and total-degree credit bounds, evaluated by encoding.lp.
sum(credit(G), c, bw, (L, U)) :- group(G), map(l, G, L), map(u, G, U).
sum(credit(total_degree), c, bw, (L, U)) :-
    map(l, total_degree, L), map(u, total_degree, U).
:- map(min_courses, G, M), #count{ E : in(E, credit(G)) } < M.
card(credit(G), leq, M) :- map(max_courses, G, M).

% ---------- prerequisite and co-requisite constraints ------------------
% prereq(B,A): A must be credited in an earlier semester than B.
:- prereq(B, A), in(X, s(J)), base(X, B), J > t, not precred(A, J).

% One alternative from each prerequisite OR-group is enough.
:- in(X, s(J)), base(X, C), J > t, prereq_group(C, G),
   #count{ A : prereq_option(C, G, A), precred(A, J) } < 1.

% coreq(C,A): A must be credited in the same or an earlier semester as C.
coreq_met(C, G, J) :- coreq_option(C, G, A), in(A, ok(J)).
coreq_met(C, G, J) :- coreq_option(C, G, A), precred(A, J).
:- coreq_group(C, G), in(X, s(J)), base(X, C), J > t,
   not coreq_met(C, G, J).
:- coreq(C, A), in(X, s(J)), base(X, C), J > t,
   not in(A, ok(J)), not precred(A, J).

% ---------- offering frequency -----------------------------------------
% offered_in/2 (term type) is preferred when present.  freq/3 remains for
% older curricula that only describe fall/spring parity.
freq(E, 2, 1) :- map(s, E, w).
freq(E, 2, 0) :- map(s, E, s).
freq(E, 1, 0) :- map(s, E, e).
offered(E, I) :- offered_in(E, T), semester_type(I, T), I = 1..n.
offered(E, I) :- freq(E, K, O), I = 1..n, (I + shift) \ K == O,
                 not offered_in(E, _).
offered(E, I) :- offer(E, I).
declared(E) :- offered_in(E, _).
declared(E) :- freq(E, _, _).
declared(E) :- offer(E, _).
offered(E, I) :- in(E, m), not declared(E), I = 1..n.
avail(E, I) :- offered(E, I), not closed(E, I).

% A module may not be scheduled where it is not offered.
in(X, noff(I)) :- base(X, E), I = t+1..n, not avail(E, I).
empty(int(noff(I), s(I))) :- I = t+1..n.

% ---------- GPA (credit-weighted, latest attempt counts) ----------------
% Points are fixed-point integers per scale.  The result is rounded
% half-up once, after the weighted sum, using integer arithmetic.
% ``kind_known/1`` is an input fact emitted beside course_kind/2.  Do not
% default from course_kind/2 itself: that would be a negative self-cycle.
course_kind(X, regular) :- taken(X, _), not kind_known(X).

gpa_attempt(E, X, Scale) :-
    last_attempt(E, X), effective_grade(X, G),
    grade_in_gpa(Scale, G), grade_points(Scale, G, _),
    course_kind(X, K), included_course_kind(K),
    not provisional_attempt(X).

effective_points(Scale, X, P) :-
    gpa_attempt(E, X, Scale), effective_grade(X, G),
    grade_points(Scale, G, P).

gpa_den(Scale, D) :-
    scale(Scale, _, _),
    D = #sum{ C, E : last_attempt(E, X), gpa_attempt(E, X, Scale), map(c, E, C) }.
gpa_num(Scale, N) :-
    scale(Scale, _, _),
    N = #sum{ C*P, E : last_attempt(E, X), gpa_attempt(E, X, Scale),
                        map(c, E, C), effective_points(Scale, X, P) }.
gpa(Scale, G) :-
    gpa_den(Scale, D), D > 0, gpa_num(Scale, N),
    G = (2*N + D) / (2*D).
gpa(G) :- default_scale(Scale), gpa(Scale, G).
