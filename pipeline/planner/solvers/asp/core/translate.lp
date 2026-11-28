% =====================================================================
% translate.lp : student input -> engine vocabulary
%
% This is the only file that reads the raw student record.  It turns the
% transcript facts into the set/attempt vocabulary of extension.lp, so a new
% input format only needs a new translate.lp.
%
% Raw student facts read here:
%   taken(X,I)          attempt X was enrolled in term I (I <= t)
%   map(g,X,G)          final grade of attempt X
%   raw_score(X,V)      raw score of attempt X on the score scale (score_10),
%                       fixed-point (7.3 -> 730).  When present it gives the
%                       grade (grade_min_score/3, policy facts) and map(g,X,G)
%                       is ignored; the score itself is the score_10 GPA
%                       value (extension.lp section 11) unless the retake
%                       cap lowered the grade (capped/1).
%   result(X,S)         direct status of a pass/fail attempt (passed|failed)
%   course_kind(X,K) + kind_known(X)   regular / summer / transfer / ...
%   attempt_count(E,N)  number of recorded attempts of course E
%   last_attempt(E,X)   latest attempt (status / retake logic)
%   gpa_last(E,X)       latest attempt that carries a final grade
%   enroll_part_in(Q)   term part of the enrollment term
%   external_progress(R,I,A)  amount A of external requirement R in term I
%
% Attempt objects:
%   E          first attempt of course E (E in m)
%   rt(E,K)    K-th retake of course E   (K = 1,2,...)
%
% Exported vocabulary (used by extension.lp / optimize.lp):
%   in(X,s(I)) for I <= t, hist/2, base/2 (history part), retake_no/2,
%   effective_grade/2, status/2, failed_last/1, earned/1, passed_course/1,
%   assumed_pass/1, open_course/1, open_retake/1, in(E,ok(I)) for I <= t,
%   gpa_sel/2, course_kind/2, enroll_part/1, ext_have/3
% =====================================================================

#defined taken/2.          #defined result/2.
#defined kind_known/1.     #defined course_kind/2.
#defined attempt_count/2.  #defined last_attempt/2.
#defined gpa_last/2.       #defined enroll_part_in/1.
#defined external_progress/3.
#defined raw_score/2.      #defined grade_min_score/3.

% ---------- enrollment term part ----------------------------------------
enroll_part(Q) :- enroll_part_in(Q).
enroll_part(1) :- not enroll_part_in(_).
:- enroll_part_in(Q1), enroll_part_in(Q2), Q1 != Q2.

% ---------- history into the semester sets ------------------------------
:- taken(_, I), I > t.
in(X, s(I)) :- taken(X, I).

% ---------- attempts of a course ----------------------------------------
hist(E, E)        :- taken(E, _), in(E, m).
hist(rt(E, K), E) :- taken(rt(E, K), _).
base(X, E)        :- hist(X, E).

% rt(E,N) is the next (not yet recorded) attempt object of course E.
retake_no(E, N) :- attempt_count(E, N).

% ---------- effective grade ---------------------------------------------
% Every recorded grade is final.  A retake's effective grade is capped at
% retake_grade_cap/1 (policy facts) when defined; first attempts never are.
% Score -> letter: the grade whose lowest score is the largest one <= V.
% A score, when given, wins over the letter map(g,X,G) of the same attempt.
has_score(X) :- taken(X, _), raw_score(X, _).
score_floor(X, M) :- has_score(X), raw_score(X, V), scale_role(S, score),
    M = #max{ Lo : grade_min_score(S, _, Lo), Lo <= V }.
grade_of(X, G) :- score_floor(X, M), scale_role(S, score),
    grade_min_score(S, G, M).
grade_of(X, G) :- taken(X, _), map(g, X, G), not has_score(X).

grade_present(X, G) :- taken(X, _), grade_of(X, G).

retake_attempt(rt(E, K)) :- hist(rt(E, K), E).

effective_grade(X, G) :-
    taken(X, _), grade_of(X, G), not retake_attempt(X).
effective_grade(X, G) :-
    retake_attempt(X), grade_of(X, G), not retake_grade_cap(_).
% capped(X): the cap lowered the grade of retake X (extension.lp section 11
% then also drops its raw score on the score scale).
capped(X) :-
    retake_attempt(X), grade_of(X, Raw), retake_grade_cap(Cap),
    grade_rank(Raw, RawRank), grade_rank(Cap, CapRank), RawRank < CapRank.
effective_grade(X, Cap) :- capped(X), retake_grade_cap(Cap).
effective_grade(X, G) :-
    retake_attempt(X), grade_of(X, G), retake_grade_cap(Cap),
    grade_rank(G, GradeRank), grade_rank(Cap, CapRank), GradeRank >= CapRank.

% ---------- status: passed / failed / unknown ---------------------------
% The letter (from the score when there is one) decides the status.
status(X, passed) :-
    taken(X, _), effective_grade(X, G), grade_passing(G), not result(X, _).
status(X, failed) :-
    taken(X, _), effective_grade(X, G), not grade_passing(G), not result(X, _).
status(X, unknown) :-
    taken(X, _), not grade_present(X, _), not result(X, _).
status(X, S) :- taken(X, _), result(X, S).

failed_last(E) :- last_attempt(E, X), status(X, failed).

passed_course(E) :-
    taken(X, _), base(X, E), status(X, passed),
    effective_grade(X, G), grade_passing(G).
passed_course(E) :- taken(X, _), base(X, E), result(X, passed).

earned(E) :-
    taken(X, _), base(X, E), status(X, passed),
    effective_grade(X, G), grade_earns_credit(G).
earned(E) :- taken(X, _), base(X, E), result(X, passed).

% In-progress attempts are credited optimistically (planning assumption).
assumed_pass(E) :- taken(X, _), base(X, E), status(X, unknown), not earned(E).
open_course(E)  :- taken(X, _), base(X, E), status(X, unknown).
open_retake(E)  :- taken(rt(E, K), _), status(rt(E, K), unknown).

% Backwards-compatible display atom: "passed in the transcript".
pass(E) :- passed_course(E).

% ---------- credited sets: the history part -----------------------------
in(E, ok(I)) :-
    taken(X, I), base(X, E), status(X, passed),
    effective_grade(X, G), grade_earns_credit(G).
in(E, ok(I)) :- taken(X, I), base(X, E), result(X, passed).
in(E, ok(I)) :- taken(X, I), base(X, E), status(X, unknown).

% ---------- GPA attempt selection ---------------------------------------
course_kind(X, regular) :- taken(X, _), not kind_known(X).

gpa_mode(latest)    :- not gpa_attempt_selection(_).
gpa_mode(Selection) :- gpa_attempt_selection(Selection).
:- gpa_mode(First), gpa_mode(Second), First != Second.

gpa_input :- gpa_last(_, _).

% Attempt number: the base attempt is 1, retake rt(E,K) is K+1.
attempt_no(E, E, 1)        :- hist(E, E).
attempt_no(E, rt(E, K), N) :- hist(rt(E, K), E), N = K + 1.

gpa_candidate(E, X, Scale) :-
    taken(X, _), hist(X, E), effective_grade(X, G),
    grade_in_gpa(Scale, G), grade_points(Scale, G, _),
    course_kind(X, K), included_course_kind(K).
candidate_points(Scale, X, P) :-
    gpa_candidate(E, X, Scale), effective_grade(X, G), grade_points(Scale, G, P).
best_candidate_points(E, Scale, P) :-
    gpa_candidate(E, _, Scale),
    P = #max{ Q : gpa_candidate(E, X, Scale), candidate_points(Scale, X, Q) }.
best_candidate_number(E, Scale, P, N) :-
    best_candidate_points(E, Scale, P),
    N = #max{ M : gpa_candidate(E, X, Scale), candidate_points(Scale, X, P),
                  attempt_no(E, X, M) }.
gpa_best_attempt(E, X) :-
    best_candidate_points(E, Scale, P), best_candidate_number(E, Scale, P, N),
    gpa_candidate(E, X, Scale), candidate_points(Scale, X, P),
    attempt_no(E, X, N).

% latest: latest finally graded attempt (falls back to last_attempt/2 for
% inputs without gpa_last/2); best: highest effective grade, later on ties.
gpa_sel(E, X) :- gpa_mode(latest), gpa_last(E, X).
gpa_sel(E, X) :- gpa_mode(latest), last_attempt(E, X), not gpa_input.
gpa_sel(E, X) :- gpa_mode(best), gpa_best_attempt(E, X).

% ---------- external requirements progress ------------------------------
ext_have(R, J, S) :- external_requirement(R, _, _, _), J = 0..n,
    S = #sum{ A, I : external_progress(R, I, A), I <= J }.
