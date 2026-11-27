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
#defined extra_semester_type/1.  #defined soft_order/1.  #defined course_level/2.
#defined external_requirement/4.  #defined external_milestone/3.
#defined external_milestone/4.
#defined pin/2.              #defined ban/1.          #defined ban/2.
#defined interest/2.         #defined tag/2.
#defined typical_term/2.     #defined fills_next/1.
#defined elective_class/3.
#defined sem_min/2.          #defined sem_max/2.      #defined skip/1.
#defined fee_rule/6.         #defined offer_hist/3.   #defined offer_seen/2.
#defined raw_score/2.            #defined scale_role/2.

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
in(E, ok_hist)      :- in(E, ok(I)), I <= t.
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
% 8. Milestones (credits accumulated through the course's own term)
% =====================================================================
% milestone(C, Min): when C is in term J, the credits passed before J plus
% the other courses of term J itself (C excluded) reach Min.
in(E, ok_through(C, J)) :-
    milestone(C, _), in(E, ok(I)), I <= J, J = 1..n, E != C.
sum(ok_through(C, J), c, geq, Min) :-
    milestone(C, Min), in(X, s(J)), base(X, C), J > t.

% =====================================================================
% 9. Term loads and calendar shape
% =====================================================================
% load_bound(Type, Min, Max) comes from policy.lp.
used(I)     :- in(_, s(I)), I > t.
max_used(M) :- used(_), M = #max{ I : used(I) }.

% Per-term bounds.  sem_max(I,M) / sem_min(I,M) (student input, optional)
% narrow the policy bound of term I: a student may lower the maximum or raise
% the minimum, never the other way.  If a student's maximum falls below the
% minimum, the minimum follows it down (the term is meant to be light).
term_max(I, M) :- I = t+1..n, semester_type(I, T), load_bound(T, _, D),
                  M = #min{ D ; X : sem_max(I, X) }.
term_lo(I, M)  :- I = t+1..n, semester_type(I, T), load_bound(T, D, _),
                  M = #max{ D ; X : sem_min(I, X) }.
term_min(I, L) :- term_lo(I, L), term_max(I, M), L <= M.
term_min(I, M) :- term_lo(I, L), term_max(I, M), L > M.

% Upper bound on every future term; the value is enumerated on 0..Max only.
sum(s(I), c, bw, (0, Max)) :- term_max(I, Max).
sum_dom(s(I),  c, 0, Max)  :- term_max(I, Max).
sum_dom(ok(I), c, 0, Max)  :- term_max(I, Max).

semester_credits(I, C) :- used(I), sum_val(s(I), c, C).
semester_credits(I, C) :- I = 1..t, in(_, s(I)),
    C = #sum{ Cr, X : in(X, s(I)), map(c, X, Cr) }.
semester_earned(I, C)  :- used(I), sum_val(ok(I), c, C).
semester_earned(I, C)  :- I = 1..t, in(_, s(I)),
    C = #sum{ Cr, E : in(E, ok(I)), map(c, E, Cr) }.

% Minimum load on every used future term except the last one.
load_bearing(I) :- semester_credits(I, C), I > t, C > 0.
sum(s(I), c, geq, Min) :-
    load_bearing(I), term_min(I, Min), max_used(M), I < M.

% Core (non-extra) terms should form one contiguous block from the current
% term on; extra terms may be skipped.  A future core term left empty before
% the last used core term is a gap(J) -- also right after the current term,
% since the student is enrolled there.  A gap is allowed, but penalised first
% in optimize.lp, so a plan only has one when no plan without it exists, and
% it is shown as a warning.  skip(J) (student input) means "I take term J
% off": it is kept empty and is not reported as a gap.
core_used(I) :- used(I), core_term(I).
gap(J) :- core_term(J), J > t, not core_used(J), not skip(J),
          core_used(K), J < K.
empty(s(J)) :- skip(J), J > t.

% Attempted credits of the whole plan.
in(X, planned) :- in(X, s(I)), I > t.
plan_cap(H) :- H = #sum{ Mx, I : term_max(I, Mx), not closed_term(I) }.
sum_dom(planned, c, 0, H) :- plan_cap(H).
total_planned(T)   :- sum_val(planned, c, T).
total_attempted(T) :- total_planned(T).

% Implied credit bound (search speed only; changes no answer).  The credits
% still to attempt are known from the history alone: the degree minimum,
% minus the most that history can contribute, plus required retakes of
% courses already credited.  Stated over the per-term load values, it lets
% the solver do the arithmetic ("36 credits in 2 terms of at most 21")
% instead of rediscovering it course by course.
hist_credit(H) :- H = #sum{ C, E : in(E, ok_hist), in(E, m), map(c, E, C) }.
redo_credit(R) :- R = #sum{ C, E : must(E), earned(E), map(c, E, C) }.
plan_lb(L - H + R) :- map(l, total_degree, L), hist_credit(H), redo_credit(R).

in(I, future_term) :- I = t+1..n.
map(load, I, V)    :- sum_val(s(I), c, V), I > t.
sum(future_term, load, geq, B) :- plan_lb(B), B > 0.

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
% On the score scale (scale_role(S, score), e.g. score_10) a raw_score(X,V)
% from the transcript is used as is; the grade's band midpoint is the
% fallback when no raw score is known or when the retake cap lowered the
% grade (capped/1, translate.lp), so the cap applies on this scale too.
raw_points(Scale, X) :- gpa_attempt(_, X, Scale), scale_role(Scale, score), raw_score(X, _),
    not capped(X).
effective_points(Scale, X, P) :-
    gpa_attempt(E, X, Scale), effective_grade(X, G), grade_points(Scale, G, P),
    not raw_points(Scale, X).
effective_points(Scale, X, V) :- raw_points(Scale, X), raw_score(X, V).

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
% Tuition is optional: without any fee_rule/6 there is no fee, no cost
% objective and no fee output.  When fee rules exist, a billed term without a
% matching rule would silently cost 0, so it is rejected.
tuition_known :- fee_rule(_, _, _, _, _, _).
:- tuition_known, semester_credits(I, C), I > t, C > 0, not fee(I, _).

% Budget, in money_scale units, as an encoding.lp sum constraint.
in(I, billed)  :- fee(I, _).
map(fee, I, F) :- fee(I, F).
sum(billed, fee, leq, B) :- budget(B).

% =====================================================================
% 14. Earliest possible term (static; ignores loads and milestones)
% =====================================================================
% can_at(E,J): course E could be placed in open future term J if every
% prerequisite (and one option of each OR-group) could be credited in an
% earlier term and every co-requisite in the same or an earlier term.
% ready_by(E,J): E could have been taken in some term <= J.
open_term(J)   :- J = t+1..n, not closed_term(J).
could_before(A, J) :- in(A, ok_hist), open_term(J).
could_before(A, J) :- can_at(A, I), open_term(J), I < J.
could_by(A, J)     :- could_before(A, J).
could_by(A, J)     :- can_at(A, J).

need(E, pre(A))   :- prereq(E, A).
need(E, grp(G))   :- prereq_group(E, G).
need(E, co(A))    :- coreq(E, A).
need(E, cogrp(G)) :- coreq_group(E, G).
need_count(E, N)  :- in(E, m), N = #count{ R : need(E, R) }.

met(E, pre(A), J)   :- prereq(E, A), could_before(A, J).
met(E, grp(G), J)   :- prereq_option(E, G, A), could_before(A, J).
met(E, co(A), J)    :- coreq(E, A), could_by(A, J).
met(E, cogrp(G), J) :- coreq_option(E, G, A), could_by(A, J).

can_at(E, J) :- in(E, m), open_term(J), avail(E, J), need_count(E, N),
                N <= #count{ R : met(E, R, J) }.
ready_by(E, J) :- can_at(E, I), open_term(J), I <= J.

% =====================================================================
% 15. Soft ordering (reported here, ranked in optimize.lp)
% =====================================================================
% soft_order(F) (policy.lp): a planned course should not be taken while a
% course with a smaller value of attribute map(F,E,V) -- one that could
% already have been taken by then -- is postponed to a later term.  This is
% a "soft prerequisite" between value classes; a lower course that a
% prerequisite chain forces late does not count.  F is any numeric
% attribute; course levels are exposed as map(level,E,L).
%
%   order_key(E,F,V)       course E has value V for ordering attribute F
%   key_postponed(F,V,J)   a course with value V, takeable by term J, is
%                          planned after J
%   order_violation(X,F,V) attempt X is in term J while key_postponed(F,V,J)
%                          for a smaller value V
% Only future placements are compared; history is fixed.
map(level, E, L) :- course_level(E, L).

order_key(E, F, V)     :- soft_order(F), map(F, E, V), in(E, m).
key_postponed(F, V, J) :- order_key(E, F, V), in(X, s(I)), base(X, E),
                          I > t, J = t+1..I-1, ready_by(E, J).
order_violation(X, F, V) :- in(X, s(J)), J > t, base(X, E), order_key(E, F, W),
                            key_postponed(F, V, J), V < W.

% =====================================================================
% 16. Pins and bans (student-stated, hard)
% =====================================================================
% placed(E,I): a future attempt of course E (first attempt or retake) is
% scheduled in term I.
placed(E, I) :- in(X, s(I)), I > t, base(X, E).

% pin(E,I): course E must be scheduled in future term I.  A pin also makes
% E available in I (like offer/2); closed(E,I) still wins, so pinning a
% closed term is unsatisfiable.
offered(E, I) :- pin(E, I).
:- pin(E, I), not placed(E, I).

% ban(E): course E must not be scheduled in any future term.
% ban(E,I): course E must not be scheduled in future term I.
:- ban(E), placed(E, _).
:- ban(E, I), placed(E, I).

% =====================================================================
% 17. Courses that fill the following term (fills_next/1)
% =====================================================================
% fills_next(E) (curriculum): E is registered in term I but physically
% carried out in term I+1 (the internship runs in the following summer).
% Its credits and fee stay in term I; term I+1 is kept empty.  A history
% attempt in term t reserves term t+1 as well.
occupies(E, I)     :- fills_next(E), in(X, s(I)), base(X, E).
reserved(I + 1, E) :- occupies(E, I), I + 1 > t, I < n.
empty(s(J))        :- reserved(J, _).

% =====================================================================
% 18. Typical term of special courses (reported here, ranked in optimize.lp)
% =====================================================================
% typical_term(E,K) (curriculum): E is normally taken in the K-th regular
% (core) term counted from enrollment, history included.  Positions are in
% half steps so an extra term (summer) sits between its neighbours:
% core term number K -> 2K, an extra term after core term K -> 2K+1.
core_ord(I, K)       :- core_term(I), K = #count{ J : core_term(J), J <= I }.
term_pos(I, 2*K)     :- core_ord(I, K).
term_pos(I, 2*K + 1) :- extra_term(I), K = #count{ J : core_term(J), J < I }.
typical_gap(E, |P - 2*K|) :- typical_term(E, K), placed(E, I), term_pos(I, P).

% =====================================================================
% 19. Interests, tags and offering history (reported here, ranked in
%     optimize.lp)
% =====================================================================
% tag(E,K) (curriculum) plus two automatic tags: every major list is a tag
% (major id) and every elective is tagged with its own id.  interest(K,W)
% (student) scores each elective with the sum of the weights of its tags.
in(E, el)  :- elective_group(G), in(E, G).
tag(E, M)  :- major_course(M, E).
tag(E, E)  :- in(E, el).
score(E, S) :- in(E, el), S = #sum{ W,K : tag(E, K), interest(K, W) }, S != 0.

% Offering history: which part of the year a course usually opens in.
%   offer_hist(E, P, N)  course E opened in N past terms of part P
%   offer_seen(P, M)     M past terms of part P are covered by the history
% A placement of E in a term of part P misses (M - N) / M of the observed
% terms; offer_miss/3 expresses that share in percent so parts with a
% different number of observed terms are comparable.  A course without any
% history is not penalised (missing data is not evidence), and a part with
% no observed term is not judged.
offer_known(E)       :- offer_hist(E, _, _).
offer_count(E, P, N) :- offer_hist(E, P, N).
offer_count(E, P, 0) :- offer_known(E), offer_seen(P, _), not offer_hist(E, P, _).
offer_miss(E, I, (100 * (M - N)) / M) :-
    placed(E, I), part(I, P), offer_seen(P, M), M > 0, offer_count(E, P, N), N < M.

% =====================================================================
% 20. Elective slots and symmetry breaking
% =====================================================================
% An elective is "named" when the student mentioned it by id (pin or a
% course-id interest).  Any other planned elective is reported
% as a slot of the group it counts toward.
named(E) :- pin(E, _).
named(E) :- interest(E, _), in(E, m).

% elective_class(E,K,R) (curriculum): electives of class K are
% interchangeable -- same credits, groups, majors, tags, requisites (both
% directions), offering, level, typical term, fills_next, note and
% offering history (offer_hist).  For a student who has not singled any of them out, swapping
% two members changes no constraint and no objective, so only the plan that
% uses the lowest-ranked members, in non-decreasing term order, is kept.
% This removes permutations and keeps at least one optimal plan.
student_specific(E) :- named(E).
student_specific(E) :- hist(_, E).
student_specific(E) :- ban(E).
student_specific(E) :- ban(E, _).
student_specific(E) :- request(E).
student_specific(E) :- offer(E, _).
student_specific(E) :- closed(E, _).
sym_free(E)     :- elective_class(E, _, _), not student_specific(E).
placed_by(E, J) :- sym_free(E), placed(E, I), J = I..n.
:- elective_class(A, K, RA), elective_class(B, K, RB), RA < RB,
   sym_free(A), sym_free(B), placed(B, J), not placed_by(A, J).

elective_slot(E, G)  :- in(E, s(I)), I > t, in(E, el), not named(E),
                        counted(E, G).
slot_option(E, A)    :- elective_slot(E, _), elective_class(E, K, _),
                        elective_class(A, K, _), A != E, sym_free(A),
                        not in(A, ok).
interest_match(E, K) :- elective_slot(E, _), tag(E, K), interest(K, _), K != E.

% Course notes (curriculum map(note,E,Text)) for planned courses.
course_note(E, Text) :- map(note, E, Text), placed(E, _).
