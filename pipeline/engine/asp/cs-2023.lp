% ==========================================
% Planning Horizon
% ==========================================
#const n = 9.

% Per-semester credit loads
#const regular_min = 12.
#const regular_max = 22.
#const summer_min  = 0.
#const summer_max  = 9.

term(1..n).
season(I, fall)     :- term(I), I \ 3 = 1.
season(I, spring)   :- term(I), I \ 3 = 2.
season(I, summer)   :- term(I), I \ 3 = 0.

% ==========================================
% Module/Course Definitions & Groups (in/2)
% ==========================================
% Compulsory course group and general courses
in((mt1003; mt1005; mt1007; mt2013; ch1003; ph1003; ph1007; co1007; co2011), a1_group).
in((sp1007; sp1031; sp1033; sp1035; sp1037), a2_group).
in((co1005; co2001), a3_group).
in((la1003; la1005; la1007; la1009), a4_group).
in((co1027; co2003; co2007), core_group).

% Compulsory PE
in((pe1003; pe1005), a6_group).

% Elective pool (supports flexible credit ranges)
in((co3023; co3027; co3029; co3031; co3033; co3035; co3115; co4033), elective_pool_c).
in((im1013; im1023; im1025; im1027), elective_pool_d).

% External milestone requirements (e.g., English proficiency test)
in(eng_test, external_group).

% Compulsory course set
in(E, compulsory_courses) :- in(E, (a1_group; a2_group; a3_group; a4_group; a6_group; core_group)).

% Elective course set
in(E, elective_courses) :- in(E, (elective_pool_c; elective_pool_d)).

% Universal set of all valid modules (m) handled by the solver
in(E, m) :- in(E, (a1_group; a2_group; a3_group; a4_group; a6_group;
                   core_group; elective_pool_c; elective_pool_d; elective_pool_general;
                   external_group; retake_group)).

% ==========================================
% 2. Credit Values (map/3 with 'c')
% ==========================================
% Group a1: Mathematics and Basic Sciences
map(c, mt1003, 4).
map(c, mt1005, 4).
map(c, mt1007, 3).
map(c, mt2013, 4).
map(c, ch1003, 3).
map(c, ph1003, 4).
map(c, ph1007, 1).
map(c, co1007, 4).
map(c, co2011, 3).

% Group a2: Socials and Economics
map(c, sp1007, 2).
map(c, sp1031, 3).
map(c, sp1033, 2).
map(c, sp1035, 2).
map(c, sp1037, 2).

% Group a3: Introduction to Engineering, Humans and Environment
map(c, co1005, 3).
map(c, co2001, 3).

% Group a4: Foreign Languages
map(c, la1003, 2).
map(c, la1005, 2).
map(c, la1007, 2).
map(c, la1009, 2).

% Group a5: Core courses
map(c, co1027, 3).
map(c, co2003, 4).
map(c, co2007, 4).

% Group a6: PE
map(c, pe1003, 0).
map(c, pe1005, 0).

% Elective Pool C
map(c, co3023, 3).
map(c, co3027, 3).
map(c, co3029, 3).
map(c, co3031, 3).
map(c, co3033, 3).
map(c, co3035, 3).
map(c, co3115, 3).
map(c, co4033, 3).

% Elective Pool D
map(c, im1013, 3).
map(c, im1023, 3).
map(c, im1025, 3).
map(c, im1027, 3).

% ==========================================
% Transcript state (facts come from input.lp)
% ==========================================
attempted(C) :- grade(C, _).
% If there are several attempts, any pass wins.
passed(C)    :- grade(C, G), G >= 2.
failed(C)    :- grade(C, G), G < 2, not passed(C).

% ==========================================
% Retakes
% ==========================================
% Only failed courses may be retaken.  map(c,C,_) restricts this to real
% modules (and excludes milestones such as eng_test).
eligible(C) :- failed(C), map(c, C, _).

% Failed compulsory courses must be retaken; failed electives are retaken
% only when the student explicitly requests it.
required(C) :- eligible(C), in(C, compulsory_courses).
required(C) :- eligible(C), retake_requested(C).

% A retake is a separate module node so it can be placed in its own term.
in(retake(C), retake_group) :- eligible(C).
map(c, retake(C), Cr) :- eligible(C), map(c, C, Cr).

% A course that was already attempted (passed or failed) is not scheduled
% again as its original node; failed ones use retake(C).
:- attempted(C), in(C, s).

:- required(C), not in(retake(C), s).
% Non-required failed electives may be retaken or replaced by other electives;
% the credit bounds decide whether a retake is actually needed.

% ==========================================
% Seasonal Turnus Availability (map/3 with 's')
% default = every term, exceptions
% ==========================================
available(C, I) :- in(C, m), term(I), season(I, S), not not_offered(C, S).

not_offered(pe1003, summer).
not_offered(pe1005, summer).
not_offered(co1005, summer).
% A retake inherits the seasonal restrictions of the original course.
not_offered(retake(C), S) :- eligible(C), not_offered(C, S).

% Enforce Availability
:- in(E, s(I)), not available(E, I).

% Per-semester credit loads: fall/spring 12..22, summer 0..9.
% 0-credit PE modules and retakes are part of s(I) and therefore participate
% in these limits (PE contributes 0 credits, retakes their full credit value).
semester_load(I, regular_min, regular_max) :- term(I), not season(I, summer).
semester_load(I, summer_min, summer_max)   :- season(I, summer).

% Credit upper bound for every term.
sum(s(I), c, bw, (0, U)) :- semester_load(I, _, U).

% ==========================================
% 4. Group Credit Bounds (l and u)
% ==========================================
map(l, a1_group, 30).           map(u, a1_group, 30).
map(l, a2_group, 11).           map(u, a2_group, 11).
map(l, a3_group, 6).            map(u, a3_group, 6).
map(l, a4_group, 8).            map(u, a4_group, 8).
map(l, core_group, 11).         map(u, core_group, 11).
map(l, a6_group, 0).            map(u, a6_group, 0).
map(l, elective_pool_c, 15).    map(u, elective_pool_c, 15).
map(l, elective_pool_d, 3).     map(u, elective_pool_d, 3).
map(l, elective_pool_general, 9). map(u, elective_pool_general, 100).
% The course/credit definitions admit at most 102 credits in total
% (100 is not reachable with the current 0/1/2/3/4-credit modules).
map(l, total_degree, 100).      map(u, total_degree, 102).

group(H) :- map(l, H, _), map(u, H, _).

% ==========================================
% 5. Credit Accounting
% ==========================================
% Compulsory groups contribute scheduled courses, retakes of failed
% courses, and courses already passed before the planning horizon.
comp_group(a1_group; a2_group; a3_group; a4_group; a6_group; core_group).
leaf(H) :- comp_group(H).
leaf(elective_pool_c).
leaf(elective_pool_d).
leaf(elective_pool_general).

in(C, credit(H)) :- comp_group(H), in(C, H), in(C, s).
in(retake(C), credit(H)) :- comp_group(H), eligible(C), in(C, H), in(retake(C), s).
in(earned(C), credit(H)) :- comp_group(H), passed(C), in(C, H).
map(c, earned(C), Cr) :- passed(C), map(c, C, Cr).

% Every scheduled elective is counted in exactly one bucket: either the
% quota of its own pool or the general overflow bucket.  This prevents a
% course from being counted twice and makes elective_pool_general a real
% overflow bucket.
elective_pool(elective_pool_c).
elective_pool(elective_pool_d).
pool_of(E, B) :- elective_pool(B), in(E, B).
candidate(E, B) :- pool_of(E, B).
candidate(E, elective_pool_general) :- pool_of(E, _).
candidate(retake(C), B) :- eligible(C), candidate(C, B).

{ counted(E, B) : candidate(E, B) } = 1 :- candidate(E, _), in(E, s).
in(E, credit(B)) :- counted(E, B), in(E, s).

% Electives passed before the horizon already count towards their pool or
% towards the general overflow bucket (same accounting as scheduled ones).
{ earned_counted(C, B) : candidate(C, B) } = 1 :- passed(C), candidate(C, _).
in(earned(C), credit(B)) :- earned_counted(C, B).

% Total degree = disjoint union of all leaf buckets (each course counted once).
in(E, credit(total_degree)) :- leaf(H), in(E, credit(H)).

sum(credit(H), c, bw, (L, U)) :- group(H), map(l, H, L), map(u, H, U).

% --------------------------------------------------------------------------
% Minimum semester load
% --------------------------------------------------------------------------
% Credits already earned from passed courses.  If they satisfy every group
% lower bound, the degree is already complete and the student does not have to
% enrol in additional courses, so the minimum load is not applied.
earned_credits(H, S) :- group(H),
    S = #sum{ Cr, C : in(earned(C), credit(H)), map(c, earned(C), Cr) }.
group_unmet(H) :- group(H), map(l, H, L), earned_credits(H, S), S < L.
degree_complete :- #count{ H : group_unmet(H) } = 0.

sum(s(I), c, geq, L) :- semester_load(I, L, _), not degree_complete.

% ==========================================
% 6. Global & Hard Constraints ($R_g$)
% ==========================================
% A. External Requirements: Must be included in the total study plan ($\bar{S}$),
% but they are milestones rather than courses and are not bound to a term.
in(eng_test, s).
external(E) :- in(E, external_group).
:- external(E), in(E, s(I)).

% B. Co/Prerequisites: P must be passed before the horizon or scheduled
% strictly earlier than C (or than the retake of C).
prereq(mt1005, mt1003).
prereq(co2011, co1007).
prereq(co2001, co1005).
prereq(sp1033, sp1031).
prereq(sp1035, sp1033).
prereq(sp1037, sp1035).
prereq(la1005, la1003).
prereq(la1007, la1005).
prereq(la1009, la1007).
prereq(co2003, co1007).
prereq(co2003, co1027).
prereq(co2007, co1005).
prereq(pe1005, pe1003).

set(before(target(C))) :- prereq(C, _).
in(C, target(C))       :- prereq(C, _).

in(retake(C), target_retake(C)) :- eligible(C).
set(before(target_retake(C)))   :- eligible(C).

:- prereq(C, P), in(C, s),
   not passed(P),
   not in(P, before(target(C))),
   not in(retake(P), before(target(C))).

:- prereq(C, P), in(retake(C), s),
   not passed(P),
   not in(P, before(target_retake(C))),
   not in(retake(P), before(target_retake(C))).

% C. Zero-credit compulsory PE courses have to be scheduled explicitly,
% unless they were already passed before the planning horizon.
required_course(pe1003).
required_course(pe1005).
:- required_course(C), not passed(C), not in(C, s), not in(retake(C), s).

% ==========================================
% 7. Temporal Constraints ($R_t$)
% ==========================================
% No module can be scheduled in multiple semesters simultaneously
empty(int(s(I), s(J))) :- term(I), term(J), I < J.

% ==========================================
% 8. Soft Requirements & Target GPA (Optimization)
% ==========================================
% Enable once expected_grade/2 is provided.
% #maximize{ Grade * Credits, M : in(M, s(I)), expected_grade(M, Grade), map(c, M, Credits) }.


