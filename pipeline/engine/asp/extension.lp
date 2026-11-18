% =====================================================================
% extension.lp : the generic planning layer on top of encoding.lp
%
% Curriculum-, university- and student-independent.  It turns the facts of
%   policy.lp      (grades, loads, calendar shape, tuition, graduation)
%   cs-XXXX.lp     (groups, credits, prerequisites, offering, majors, ...)
%   translate.lp   (the student's history in engine vocabulary)
% into planning semantics, expressed as far as possible with the set
% declarations of encoding.lp (empty/subseteq/card/sum/sum_dom).
% Objectives and output live in optimize.lp.
%
% Load order (any order works in ASP; this is the dependency order):
%   encoding.lp extension.lp policy.lp cs-XXXX.lp translate.lp
%   <student>.lp optimize.lp
% =====================================================================

#const t = 0.          % number of studied (fixed) terms
#const n = 12.         % planning horizon; the engine passes -c n=<...>
#const extra_sem = 0.  % 1 = allow extra terms (summer) in the plan, 0 = not

% Optional inputs: silence "undefined" warnings when a file omits them.
#defined prereq/2.           #defined coreq/2.
#defined prereq_group/2.     #defined prereq_option/3.
#defined coreq_group/2.      #defined coreq_option/3.
#defined offered_slot/2.     #defined offer/2.        #defined closed/2.
#defined major/1.            #defined major_min/2.    #defined major_course/2.
#defined milestone/2.        #defined elective_group/1.
#defined student_major/1.    #defined request/1.      #defined budget/1.
#defined retake_grade_cap/1. #defined gpa_attempt_selection/1.
#defined extra_semester_type/1.
#defined external_requirement/4.  #defined external_milestone/3.
#defined external_milestone/4.

% =====================================================================
% 1. Calendar
% =====================================================================
% Term 1 is the enrollment term, whose part is enroll_part/1 (translate.lp).
% Parts cycle 1..K with K = term_parts(K); term_part_type/2 (policy.lp)
% names each part (e.g. regular / summer).
part(I, P) :- I = 1..n, enroll_part(Q), term_parts(K),
              P = ((I + Q - 2) \ K) + 1.
semester_type(I, T) :- part(I, P), term_part_type(P, T).

% Extra terms (policy: extra_semester_type/1, e.g. summer) are optional.
% With extra_sem = 0 they stay empty in the plan; history is unaffected.
extra_term(I)  :- semester_type(I, T), extra_semester_type(T).
core_term(I)   :- I = 1..n, not extra_term(I).
extra_allowed  :- extra_sem != 0.
closed_term(I) :- I = t+1..n, extra_term(I), not extra_allowed.
empty(s(I))    :- closed_term(I).

% An attempt object lives in at most one term.
empty(int(s(I), s(J))) :- I = 1..n, J = 1..n, I < J.

% =====================================================================
% 2. Curriculum groups and attempt objects
% =====================================================================
group(G) :- map(l, G, _), map(u, G, _), G != total_degree.
in(E, m) :- group(G), in(E, G).

% Compulsory = member of a non-elective group; all must end up credited.
in(E, comp) :- group(G), in(E, G), not elective_group(G).
subseteq(comp, ok).

base(E, E) :- in(E, m).

% Retakes.  No eligibility rule or attempt limit; only retakes that have a
% reason (failed latest attempt, or an explicit request) are generated, and
% only one future retake per course is modelled.
{ in(rt(E, N), s(I)) } :- failed_last(E), retake_no(E, N), I = t+1..n.
{ in(rt(E, N), s(I)) } :-
    request(E), not failed_last(E), retake_no(E, N), I = t+1..n.

map(c, rt(E, N), C)  :- in(rt(E, N), s(_)), map(c, E, C), retake_no(E, N).
base(rt(E, N), E)    :- in(rt(E, N), s(_)), in(E, m), retake_no(E, N).

% A failed compulsory course without earned credit, or a requested course,
% must be retaken.
must(E) :- failed_last(E), in(E, comp), not earned(E).
must(E) :- request(E), retake_no(E, _).
in(rt(E, N), retake_due) :- must(E), retake_no(E, N).
subseteq(retake_due, s).

% =====================================================================
% 3. Credited sets (credit counts once per course)
% =====================================================================
% History part is in translate.lp; a planned attempt is assumed passed.
in(E, ok(I))        :- in(X, s(I)), base(X, E), I > t.
in(E, ok)           :- in(E, ok(I)).
in(E, ok_before(J)) :- in(E, ok(I)), I < J, J = 1..n.

credited(E)  :- in(E, ok).
precred(A, J) :- in(A, ok_before(J)).

% =====================================================================
% 4. Group and degree credit accounting
% =====================================================================
% Mandatory groups count every credited member; an elective counts in at
% most one elective bucket (extra electives are left uncounted).
in(E, credit(G)) :- group(G), in(E, G), in(E, ok), not elective_group(G).
candidate(E, B)  :- elective_group(B), in(E, B).
{ counted(E, B) : candidate(E, B) } <= 1 :- candidate(E, _), in(E, ok).
in(E, credit(B)) :- elective_group(B), counted(E, B), in(E, ok).
in(E, credit(total_degree)) :- group(G), in(E, credit(G)).

sum(credit(G), c, bw, (L, U)) :- group(G), map(l, G, L), map(u, G, U).
sum(credit(total_degree), c, bw, (L, U)) :-
    map(l, total_degree, L), map(u, total_degree, U).
card(credit(G), geq, M) :- map(min_courses, G, M).
card(credit(G), leq, M) :- map(max_courses, G, M).

% Only courses that count toward some group may be scheduled.
in(E, planned_base) :- in(E, s(I)), I > t, in(E, m).
subseteq(planned_base, credit(total_degree)).

% =====================================================================
% 5. Majors
% =====================================================================
in(E, major_ok(M)) :- major_course(M, E), in(E, ok).
major_count(M, N)  :- major(M), N = #count{ E : in(E, major_ok(M)) }.
major_earned(M)    :- major_min(M, K), major_count(M, N), N >= K.
card(major_ok(M), geq, K) :- student_major(M), major_min(M, K).

% =====================================================================
% 6. Prerequisites and co-requisites
% =====================================================================
% prereq(B,A): A credited in an earlier term than B.
:- prereq(B, A), in(X, s(J)), base(X, B), J > t, not precred(A, J).
% OR-groups: one option suffices.
:- in(X, s(J)), base(X, C), J > t, prereq_group(C, G),
   #count{ A : prereq_option(C, G, A), precred(A, J) } < 1.

% coreq(C,A): A credited in the same or an earlier term.
coreq_met(C, G, J) :- coreq_option(C, G, A), in(A, ok(J)).
coreq_met(C, G, J) :- coreq_option(C, G, A), precred(A, J).
:- coreq_group(C, G), in(X, s(J)), base(X, C), J > t, not coreq_met(C, G, J).
:- coreq(C, A), in(X, s(J)), base(X, C), J > t,
   not in(A, ok(J)), not precred(A, J).

% =====================================================================
% 7. Offering
% =====================================================================
% offered_slot(E,P): E runs in part P of every year.  Undeclared = always.
offered(E, I) :- offered_slot(E, P), part(I, P).
offered(E, I) :- offer(E, I).
declared(E)   :- offered_slot(E, _).
declared(E)   :- offer(E, _).
offered(E, I) :- in(E, m), not declared(E), I = 1..n.
avail(E, I)   :- offered(E, I), not closed(E, I).

in(X, noff(I)) :- base(X, E), I = t+1..n, not avail(E, I).
empty(int(noff(I), s(I))) :- I = t+1..n.

% =====================================================================
% 8. Milestones (credits accumulated strictly before the course's term)
% =====================================================================
sum(ok_before(J), c, geq, Min) :-
    milestone(C, Min), in(X, s(J)), base(X, C), J > t.

% =====================================================================
% 9. Term loads and calendar shape
% =====================================================================
% load_bound(Type, Min, Max) comes from policy.lp.
used(I)     :- in(_, s(I)), I > t.
max_used(M) :- used(_), M = #max{ I : used(I) }.

% Upper bound on every future term; the value is enumerated on 0..Max only.
sum(s(I), c, bw, (0, Max)) :-
    I = t+1..n, semester_type(I, T), load_bound(T, _, Max).
sum_dom(s(I),  c, 0, Max) :-
    I = t+1..n, semester_type(I, T), load_bound(T, _, Max).
sum_dom(ok(I), c, 0, Max) :-
    I = t+1..n, semester_type(I, T), load_bound(T, _, Max).

semester_credits(I, C) :- used(I), sum_val(s(I), c, C).
semester_credits(I, C) :- I = 1..t, in(_, s(I)),
    C = #sum{ Cr, X : in(X, s(I)), map(c, X, Cr) }.
semester_earned(I, C)  :- used(I), sum_val(ok(I), c, C).
semester_earned(I, C)  :- I = 1..t, in(_, s(I)),
    C = #sum{ Cr, E : in(E, ok(I)), map(c, E, Cr) }.

% Minimum load on every used future term except the last one.
load_bearing(I) :- semester_credits(I, C), I > t, C > 0.
sum(s(I), c, geq, Min) :-
    load_bearing(I), semester_type(I, T), load_bound(T, Min, _),
    max_used(M), I < M.

% Core (non-extra) terms form one contiguous block; extra terms may be
% skipped, but a core term cannot be skipped and then resumed.
core_between(I, J) :- core_term(I), core_term(J), core_term(K), I < K, K < J.
next_core(I, J)    :- core_term(I), core_term(J), I < J, not core_between(I, J).
core_used(I)       :- used(I), core_term(I).
:- core_used(I), next_core(I, J), core_used(K), J < K, not core_used(J).

% Attempted credits of the whole plan.
in(X, planned) :- in(X, s(I)), I > t.
plan_cap(H) :- H = #sum{ Mx, I : I = t+1..n, not closed_term(I),
                                 semester_type(I, T), load_bound(T, _, Mx) }.
sum_dom(planned, c, 0, H) :- plan_cap(H).
total_planned(T)   :- sum_val(planned, c, T).
total_attempted(T) :- total_planned(T).

% =====================================================================
% 10. Degree completion
% =====================================================================
group_met(G) :- group(G), map(l, G, L),
    L <= #sum{ C, E : in(E, credit(G)), map(c, E, C) }.
any_group_unmet :- group(G), not group_met(G).

sum_dom(credit(total_degree), c, L, U) :-
    map(l, total_degree, L), map(u, total_degree, U).
total_credit(S) :- sum_val(credit(total_degree), c, S).
total_met :- map(l, total_degree, L), total_credit(S), S >= L.

degree_complete :- total_met, not any_group_unmet.

% =====================================================================
% 11. GPA (credit-weighted, selected attempt; gpa_sel/2 from translate.lp)
% =====================================================================
gpa_attempt(E, X, Scale) :-
    gpa_sel(E, X), effective_grade(X, G),
    grade_in_gpa(Scale, G), grade_points(Scale, G, _),
    course_kind(X, K), included_course_kind(K).
effective_points(Scale, X, P) :-
    gpa_attempt(E, X, Scale), effective_grade(X, G), grade_points(Scale, G, P).

gpa_den(Scale, D) :- scale(Scale, _, _),
    D = #sum{ C, E : gpa_attempt(E, X, Scale), map(c, E, C) }.
gpa_num(Scale, N) :- scale(Scale, _, _),
    N = #sum{ C*P, E : gpa_attempt(E, X, Scale), map(c, E, C),
                       effective_points(Scale, X, P) }.
% Rounded half-up once, after the weighted sum.
gpa(Scale, G) :- gpa_den(Scale, D), D > 0, gpa_num(Scale, N),
                 G = (2*N + D) / (2*D).
gpa(G) :- default_scale(Scale), gpa(Scale, G).

% Planning target: the average the remaining GPA credits must reach for the
% rounded cumulative GPA to meet min_gpa/2.  A report, not a constraint.
% A course with history can only come back as a retake (its base node is
% already in a past term), so its base node is excluded here.  This is
% implied by the one-term rule but tells the grounder, which otherwise
% enumerates GPA sums over every history course.
planned_course(E) :- in(E, s(I)), I > t, in(E, m), not hist(E, E).
planned_course(E) :- planned_retake(E).
planned_retake(E) :- in(rt(E, _), s(I)), I > t.

optimistic(E)  :- planned_course(E).
optimistic(E)  :- open_course(E).
retake_flag(E) :- planned_retake(E).
retake_flag(E) :- open_retake(E).

max_points(S, M)  :- default_scale(S),
    M = #max{ P : grade_in_gpa(S, G), grade_points(S, G, P) }.
retake_best(S, P) :- default_scale(S), retake_grade_cap(Cap),
                     grade_points(S, Cap, P).
retake_best(S, P) :- default_scale(S), not retake_grade_cap(_), max_points(S, P).

future_best(E, P) :- optimistic(E), not retake_flag(E),
                     default_scale(S), max_points(S, P).
future_best(E, P) :- optimistic(E), retake_flag(E),
                     default_scale(S), retake_best(S, P).

kept_num(N) :- default_scale(S),
    N = #sum{ C*P, E : gpa_attempt(E, X, S), map(c, E, C),
                       effective_points(S, X, P), not optimistic(E) }.
kept_den(D) :- default_scale(S),
    D = #sum{ C, E : gpa_attempt(E, X, S), map(c, E, C), not optimistic(E) }.
fut_num(F) :- F = #sum{ C*P, E : optimistic(E), map(c, E, C), future_best(E, P) }.
fut_den(F) :- F = #sum{ C, E : optimistic(E), map(c, E, C), future_best(E, _) }.

best_num(N) :- kept_num(K), fut_num(F), N = K + F.
best_den(D) :- kept_den(K), fut_den(F), D = K + F.
gpa_best_case(G) :- best_den(D), D > 0, best_num(N), G = (2*N + D) / (2*D).

gpa_target_raw(R) :-
    min_gpa(S, Min), default_scale(S), kept_num(K), kept_den(KD),
    fut_den(F), F > 0,
    Need = (2*Min*(KD + F) - (KD + F) + 1) / 2,
    R = (Need - K + F - 1) / F.

gpa_required_avg(R) :- gpa_target_raw(R), R >= 0.
gpa_required_avg(0) :- gpa_target_raw(R), R < 0.
gpa_required_avg(0) :- gpa_already_satisfied, fut_den(0).

gpa_already_satisfied :- gpa_target_raw(R), R <= 0.
gpa_already_satisfied :- min_gpa(S, Min), default_scale(S), fut_den(0),
    gpa_best_case(G), G >= Min.

gpa_requirement_impossible :- min_gpa(S, Min), default_scale(S),
    gpa_best_case(G), G < Min.

% =====================================================================
% 12. External requirements (reported, not scheduled) and readiness
% =====================================================================
% "end_of_year Y" falls on the last part of the Y-th academic year.
ext_deadline(R, Y, K*Y - (Q - 1), Min) :-
    external_milestone(R, end_of_year, Y, Min), enroll_part(Q), term_parts(K).

ext_missed(R, Y) :- external_requirement(R, _, _, blocking),
    ext_deadline(R, Y, J, Min), J <= t, ext_have(R, J, S), S < Min.
ext_pending(R, Y, Min - S) :- external_requirement(R, _, _, blocking),
    ext_deadline(R, Y, J, Min), J > t, ext_have(R, t, S), S < Min.
graduation_blocked(R) :- external_requirement(R, _, _, blocking),
    external_milestone(R, graduation, Min), ext_have(R, t, S), S < Min.

ready_to_graduate :- degree_complete, not graduation_blocked(_),
    not ext_missed(_, _), not gpa_requirement_impossible.

% =====================================================================
% 13. Tuition and budget
% =====================================================================
% fee_rule(Type, Min, Max, Base, Rate, Over) (policy.lp): for
% Min <= credits <= Max the fee is Base + Rate * max(0, credits - Over).
fee(I, F) :- semester_credits(I, C), I > t, C > 0, semester_type(I, Type),
    fee_rule(Type, Min, Max, Base, _, Over), C >= Min, C <= Max, C <= Over,
    F = Base.
fee(I, F) :- semester_credits(I, C), I > t, C > 0, semester_type(I, Type),
    fee_rule(Type, Min, Max, Base, Rate, Over), C >= Min, C <= Max, C > Over,
    F = Base + Rate * (C - Over).
semester_fee(I, F) :- fee(I, F).
:- fee(I, F1), fee(I, F2), F1 < F2.
% A billed term without a matching rule would silently cost 0.
:- semester_credits(I, C), I > t, C > 0, not fee(I, _).

% Budget, in money_scale units, as an encoding.lp sum constraint.
in(I, billed)  :- fee(I, _).
map(fee, I, F) :- fee(I, F).
sum(billed, fee, leq, B) :- budget(B).
