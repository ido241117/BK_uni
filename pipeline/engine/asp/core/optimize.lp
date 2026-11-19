% =====================================================================
% optimize.lp : preferences (objectives) and output
%
% Hard rules live in extension.lp; this file only ranks the valid plans and
% chooses what is displayed.  clingo reports the objective vector by
% descending priority:
%   @7 last_semester, @6 retakes, @5 cost, @4 typical_term, @3 level_order,
%   @2 balance, @1 taste, @0 popularity.
% =====================================================================

#defined course_level/2.

% earliest graduation: minimise the last used term.  With the core-term
% contiguity rule this also minimises the number of planned terms.
#minimize{ M@7 : max_used(M) }.

% fail-recovery first: retake failed/requested courses as early as possible.
#minimize{ I@6,E : in(rt(E,N), s(I)), retake_no(E,N), must(E) }.
% Same priority: avoid unnecessary/voluntary retakes.
#minimize{ 1@6,E : in(rt(E,N), s), retake_no(E,N), not must(E) }.

% future tuition
#minimize{ F@5,I : fee(I, F) }.

% special courses near their typical term: half-step distance from the
% typical regular term (extension.lp section 18).
#minimize{ D@4,E : typical_gap(E, D) }.

% lower-level courses first: pull 1xxx/2xxx courses into earlier terms.
#minimize{ I@3,X : in(X, s(I)), I > t, base(X, E), course_level(E, L), L <= 2 }.

% balanced workload: minimise the heaviest future term.  Counting the
% thresholds 1..C reached by some term equals the maximum load, without
% materialising a #max over all possible load values.
heavy(V) :- semester_credits(I, C), I > t, V = 1..C.
#minimize{ 1@2,V : heavy(V) }.

% student taste: maximise the interest score of the planned electives
% (sum of the weights of their matching tags).
#minimize{ -S@1,E : placed(E, _), score(E, S) }.

% popularity tie-breaker: prefer electives that more students have taken.
% Inert until data/elective_popularity.json has values.
#minimize{ M-P@0,E : placed(E, _), pop_value(E, P), pop_max(M) }.

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
#show reserved/2.
