% =====================================================================
% extension.lp : curriculum-independent semantic layer
% Works on top of encoding.lp and policy.lp, and consumes the data facts in
% the generated curriculum file and student.lp.  It defines the generic calendar, history,
% status, retake, group/credit, major, prerequisite/co-requisite, offering
% and GPA semantics.  School-specific loads, tuition, objectives and display
% rules live in plan.lp.
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
%   attempt_count(E,N)  all recorded attempts of course E
%   last_attempt(E,X)   latest attempt: status / retake logic
%   gpa_last(E,X)       latest attempt that carries a final grade
%                       (skips in-progress attempts)
%   enroll_part_in(Q)   term part (1/2/3) of the student's enrollment term
%   student_major(M)    declared major (optional)
%   request(E)          student explicitly asks to retake E
%   avoid(E) / pref(E)  elective taste
%   offer(E,I) / closed(E,I)   student/registrar offering overrides
%
% Curriculum input (facts, from the generated curriculum file):
%   offered_slot(E,P)   course E is offered in term part P (1/2/3)
%   major(M), major_min(M,K), major_course(M,E)
%
% Grade symbols, numeric scales and retake rules are facts in policy.lp.
% Everything below is scale-agnostic: the engine only asks whether a grade
% passes, earns credit, or carries points on a given scale.
% =====================================================================

#const t = 0.    % number of studied terms

% ---------- three-term calendar ---------------------------------------
% Term index 1 is the student's enrollment term, whose part (1 = fall,
% 2 = spring, 3 = summer) is enroll_part_in(Q).  Without that fact the
% enrollment is assumed to be in part 1.  Parts then cycle 1, 2, 3, 1, ...
enroll_part(Q) :- enroll_part_in(Q).
enroll_part(1) :- not enroll_part_in(_).
:- enroll_part_in(Q1), enroll_part_in(Q2), Q1 != Q2.

part(I, P) :- I = 1..n, enroll_part(Q), P = ((I + Q - 2) \ 3) + 1.
semester_type(I, summer)  :- part(I, 3).
semester_type(I, regular) :- part(I, P), P != 3.

% ---------- history ----------------------------------------------------
:- taken(_, I), I > t.
in(X, s(I)) :- taken(X, I).

% ---------- effective grade --------------------------------------------
% Every recorded grade is final.  Retakes are not filtered by an eligibility
% threshold, but a retake's effective grade is capped at retake_grade_cap/1
% when the policy defines one.  First attempts are never capped.  The cap can
% only lower a grade; a grade already at or below the cap is unchanged.
grade_present(X, G) :- taken(X, _), map(g, X, G).

retake_attempt(rt(E, K)) :- hist(rt(E, K), E).
retake_attempt(rt(E, K)) :- in(rt(E, K), s(I)), I > t.

effective_grade(X, G) :-
    taken(X, _), map(g, X, G), not retake_attempt(X).
effective_grade(X, G) :-
    retake_attempt(X), map(g, X, G), not retake_grade_cap(_).
effective_grade(X, Cap) :-
    retake_attempt(X), map(g, X, Raw), retake_grade_cap(Cap),
    grade_rank(Raw, RawRank), grade_rank(Cap, CapRank), RawRank < CapRank.
effective_grade(X, G) :-
    retake_attempt(X), map(g, X, G), retake_grade_cap(Cap),
    grade_rank(G, GradeRank), grade_rank(Cap, CapRank), GradeRank >= CapRank.

% ---------- status: passed / failed / unknown --------------------------
status(X, passed) :-
    taken(X, _), effective_grade(X, G), grade_passing(G),
    not result(X, _).
status(X, failed) :-
    taken(X, _), effective_grade(X, G), not grade_passing(G),
    not result(X, _).
status(X, unknown) :-
    taken(X, _), not grade_present(X, _), not result(X, _).
status(X, S) :- taken(X, _), result(X, S).

% ---------- attempts of a course ---------------------------------------
hist(E, E)       :- taken(E, _), in(E, m).
hist(rt(E, K), E) :- taken(rt(E, K), _).

% ---------- retakes ----------------------------------------------------
% There is no eligibility rule and no attempt limit: a course may be
% retaken at any time.  The planner only generates the retakes that have a
% reason to exist, namely when the latest attempt failed or the student
% explicitly requested one.  This keeps the search small without modelling
% a policy restriction.
failed_last(E) :-
    last_attempt(E, X), status(X, failed).

% attempt_count(E,N) is the number of recorded attempts, so rt(E,N) is the
% next attempt object.  Only one future retake per course is modelled; if
% that attempt also fails, the next retake is a new planning problem.
{ in(rt(E, N), s(I)) } :-
    failed_last(E), attempt_count(E, N), I = t+1..n.
{ in(rt(E, N), s(I)) } :-
    request(E), not failed_last(E), attempt_count(E, N), I = t+1..n.

map(c, rt(E, N), C) :-
    in(rt(E, N), s(_)), map(c, E, C), attempt_count(E, N).

% Base course of every attempt object (used for credits and offering).
base(X, E)       :- hist(X, E).
base(E, E)       :- in(E, m).
base(rt(E, N), E) :-
    in(rt(E, N), s(_)), in(E, m), attempt_count(E, N).

% ---------- obligation to retake ---------------------------------------
% A failed compulsory course must be retaken unless credit was already
% earned by an earlier attempt (credit counts once per course).  Explicit
% requests are mandatory as well.
must(E) :- failed_last(E), in(E, comp), not earned(E).
must(E) :- request(E), attempt_count(E, _).
:- must(E), attempt_count(E, N), not in(rt(E, N), s).

% ---------- credited sets (credits count once) -------------------------
% Past: passed with a credit-earning grade.  Unknown (in progress) attempts
% are treated optimistically, matching the planner's planning assumption;
% assumed_pass/1 reports them.
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
earned(E) :-
    taken(X, _), base(X, E), status(X, passed),
    effective_grade(X, G), grade_earns_credit(G).
earned(E) :- taken(X, _), base(X, E), result(X, passed).

assumed_pass(E) :- taken(X, _), base(X, E), status(X, unknown), not earned(E).

% Backwards-compatible display atom.  It now means "passed in the
% transcript", not "credited optimistically by the future plan".
pass(E) :- passed_course(E).

% "credited before" is a set predicate, so an improvement retake cannot
% count the same course twice in a milestone sum.
credited_before(E, J) :- in(E, ok(I)), I < J, J = 1..n.
precred(A, J) :- in(A, ok(I)), I < J, J = 1..n.

% ---------- curriculum groups and credit accounting --------------------
% The generated curriculum file supplies group membership, bounds, map(c,...), and
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

% ---------- majors -------------------------------------------------------
% A major is earned by crediting at least major_min(M,K) courses from its
% list; the courses may sit in any elective bucket (or none).  When the
% student declares a major the plan must earn it; major_earned/1 reports
% every major the final transcript happens to qualify for.
major_count(M, N) :- major(M), N = #count{ E : major_course(M, E), in(E, ok) }.
major_earned(M)   :- major_min(M, K), major_count(M, N), N >= K.
:- student_major(M), not major_earned(M).

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

% ---------- offering ----------------------------------------------------
% offered_slot(E,P): the course runs in term part P of every academic
% year (1 = fall, 2 = spring, 3 = summer), so a fall-only course is not
% available in spring.  A course with no declaration is always offered.
offered(E, I) :- offered_slot(E, P), part(I, P), I = 1..n.
offered(E, I) :- offer(E, I).
declared(E) :- offered_slot(E, _).
declared(E) :- offer(E, _).
offered(E, I) :- in(E, m), not declared(E), I = 1..n.
avail(E, I) :- offered(E, I), not closed(E, I).

% A module may not be scheduled where it is not offered.
in(X, noff(I)) :- base(X, E), I = t+1..n, not avail(E, I).
empty(int(noff(I), s(I))) :- I = t+1..n.

% ---------- GPA (credit-weighted, selected attempt) --------------------
% Points are fixed-point integers per scale.  The result is rounded
% half-up once, after the weighted sum, using integer arithmetic.
% ``kind_known/1`` is an input fact emitted beside course_kind/2.  Do not
% default from course_kind/2 itself: that would be a negative self-cycle.
course_kind(X, regular) :- taken(X, _), not kind_known(X).

% gpa_attempt_selection/1 comes from policy.lp: latest (default) keeps the
% latest finally graded attempt; best selects the attempt with the highest
% effective grade, breaking ties toward the later attempt.
gpa_mode(latest) :- not gpa_attempt_selection(_).
gpa_mode(Selection) :- gpa_attempt_selection(Selection).
:- gpa_mode(First), gpa_mode(Second), First != Second.

gpa_input :- gpa_last(_, _).

gpa_candidate(E, X, Scale) :-
    taken(X, _), hist(X, E), effective_grade(X, G),
    grade_in_gpa(Scale, G), grade_points(Scale, G, _),
    course_kind(X, K), included_course_kind(K).

candidate_points(Scale, X, P) :-
    gpa_candidate(E, X, Scale), effective_grade(X, G),
    grade_points(Scale, G, P).

best_candidate_points(E, Scale, P) :-
    gpa_candidate(E, _, Scale),
    P = #max{ Q : gpa_candidate(E, X, Scale), candidate_points(Scale, X, Q) }.

best_candidate_number(E, Scale, P, N) :-
    best_candidate_points(E, Scale, P),
    N = #max{ M : gpa_candidate(E, X, Scale), candidate_points(Scale, X, P),
                    attempt_no(E, X, M) }.

gpa_best_attempt(E, X) :-
    best_candidate_points(E, Scale, P),
    best_candidate_number(E, Scale, P, N),
    gpa_candidate(E, X, Scale), candidate_points(Scale, X, P),
    attempt_no(E, X, N).

% Attempt number: the base attempt is 1, retake rt(E,K) is K+1.
attempt_no(E, E, 1) :- hist(E, E).
attempt_no(E, rt(E, K), N) :- hist(rt(E, K), E), N = K + 1.

% Latest mode keeps the latest finally graded attempt, so an in-progress
% retake does not hide an earlier F.  Inputs that predate gpa_last/2 fall
% back to last_attempt/2.  Best mode is derived from the recorded attempts.
gpa_sel(E, X) :- gpa_mode(latest), gpa_last(E, X).
gpa_sel(E, X) :- gpa_mode(latest), last_attempt(E, X), not gpa_input.
gpa_sel(E, X) :- gpa_mode(best), gpa_best_attempt(E, X).

gpa_attempt(E, X, Scale) :-
    gpa_sel(E, X), effective_grade(X, G),
    grade_in_gpa(Scale, G), grade_points(Scale, G, _),
    course_kind(X, K), included_course_kind(K).

effective_points(Scale, X, P) :-
    gpa_attempt(E, X, Scale), effective_grade(X, G),
    grade_points(Scale, G, P).

gpa_den(Scale, D) :-
    scale(Scale, _, _),
    D = #sum{ C, E : gpa_sel(E, X), gpa_attempt(E, X, Scale), map(c, E, C) }.
gpa_num(Scale, N) :-
    scale(Scale, _, _),
    N = #sum{ C*P, E : gpa_sel(E, X), gpa_attempt(E, X, Scale),
                        map(c, E, C), effective_points(Scale, X, P) }.
gpa(Scale, G) :-
    gpa_den(Scale, D), D > 0, gpa_num(Scale, N),
    G = (2*N + D) / (2*D).
gpa(G) :- default_scale(Scale), gpa(Scale, G).
