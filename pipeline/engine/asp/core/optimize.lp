% =====================================================================
% optimize.lp : preferences (objectives) and output
%
% Hard rules live in extension.lp; this file only ranks the valid plans and
% chooses what is displayed.  clingo reports the objective vector by
% descending priority:
%   @6 last_semester, @5 retakes, @4 cost, @3 level_order, @2 balance,
%   @1 taste.
% =====================================================================

#defined course_level/2.  #defined avoid/1.  #defined pref/1.

% earliest graduation: minimise the last used term.  With the core-term
% contiguity rule this also minimises the number of planned terms.
#minimize{ M@6 : max_used(M) }.

% fail-recovery first: retake failed/requested courses as early as possible.
#minimize{ I@5,E : in(rt(E,N), s(I)), retake_no(E,N), must(E) }.
% Same priority: avoid unnecessary/voluntary retakes.
#minimize{ 1@5,E : in(rt(E,N), s), retake_no(E,N), not must(E) }.

% future tuition
#minimize{ F@4,I : fee(I, F) }.

% lower-level courses first: pull 1xxx/2xxx courses into earlier terms.
#minimize{ I@3,X : in(X, s(I)), I > t, base(X, E), course_level(E, L), L <= 2 }.

% balanced workload: minimise the heaviest future term.  Counting the
% thresholds 1..C reached by some term equals the maximum load, without
% materialising a #max over all possible load values.
heavy(V) :- semester_credits(I, C), I > t, V = 1..C.
#minimize{ 1@2,V : heavy(V) }.

% student taste: avoid electives they dislike, prefer ones they like.
in(E, el) :- elective_group(G), in(E, G).
#minimize{ 1@1,E : in(E, s(I)), I > t, avoid(E) }.
#minimize{ 1@1,E : in(E, el), not in(E, s), not in(E, ok), pref(E) }.

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
