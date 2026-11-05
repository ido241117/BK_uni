% =====================================================================
% cs-2023.lp : curriculum facts and constraints
% Generated from curriculum.json by solver.py -- do not edit by hand.
% Load together with encoding.lp and extension.lp.
% =====================================================================

% Total degree credit requirement: 128
% Semester load bounds, completion test, display and optimization
% are in plan.lp, which does not depend on this JSON file.

% ------------------------------------------------------------------
% Course groups and membership (in/2)
% ------------------------------------------------------------------
in((ch1003; co1007; co2011; mt1003; mt1005; mt1007; mt2013; ph1003), a1).
in((ph1007), a1).
in((sp1007; sp1031; sp1033; sp1035; sp1037; sp1039), a2).
in((co1005; co2001), a3).
in((la1003; la1005; la1007; la1009), a4).
in((co1023; co1027; co2003; co2007; co2013; co2017; co2039), a5).
in((co3001; co3005; co3093), b3_1).
in((co3101; co3103; co3105; co3119; co3127), b3_2).
in((co3107; co3109; co3111), b3_3).
in((co3011; co3013; co3015; co3017; co3021; co3023; co3027; co3029), b3_4).
in((co3031; co3033; co3035; co3037; co3041; co3043; co3045; co3047), b3_4).
in((co3049; co3051; co3057; co3059; co3061; co3065; co3067; co3069), b3_4).
in((co3071; co3083; co3085; co3089; co3115; co3117; co3129; co3131), b3_4).
in((co3133; co3135; co3137; co3139; co3151; co3153; co4025; co4031), b3_4).
in((co4033; co4035; co4037; co4039), b3_4).
in((im1013; im1023; im1025; im1027; im3001), b3_5).
in((co3011; co3013; co3015; co3017; co3021; co3023; co3027; co3029), c).
in((co3031; co3033; co3035; co3037; co3041; co3043; co3045; co3047), c).
in((co3049; co3051; co3057; co3059; co3061; co3065; co3067; co3069), c).
in((co3071; co3083; co3085; co3089; co3115; co3117; co3129; co3131), c).
in((co3133; co3135; co3137; co3139; co3151; co3153; co4025; co4031), c).
in((co4033; co4035; co4037; co4039), c).
in((co3335; co4029; co4337), d).
in((eng_gc; sa4001), e).

% A module is any course that belongs to at least one group.
in(E, m) :- group(G), in(E, G).

% Groups are exactly the entities with lower and upper bounds.
group(G) :- map(l, G, _), map(u, G, _), G != total_degree.
elective_group(b3_2).
elective_group(b3_3).
elective_group(b3_4).
elective_group(b3_5).
elective_group(c).

% ------------------------------------------------------------------
% Course credits (map/3 with key 'c')
% ------------------------------------------------------------------
map(c, (eng_gc; sa4001), 0).
map(c, (co3101; co3103; co3105; co3107; co3109; co3111; co3119; co3127), 1).
map(c, (ph1007), 1).
map(c, (co3335; co4029; la1003; la1005; la1007; la1009; sp1007; sp1033), 2).
map(c, (sp1035; sp1037; sp1039), 2).
map(c, (ch1003; co1005; co1023; co1027; co2001; co2011; co2017; co2039), 3).
map(c, (co3001; co3011; co3013; co3015; co3017; co3021; co3023; co3027), 3).
map(c, (co3029; co3031; co3033; co3035; co3037; co3041; co3043; co3045), 3).
map(c, (co3047; co3049; co3051; co3057; co3059; co3061; co3065; co3067), 3).
map(c, (co3069; co3071; co3083; co3085; co3089; co3093; co3115; co3117), 3).
map(c, (co3129; co3131; co3133; co3135; co3137; co3139; co3151; co3153), 3).
map(c, (co4025; co4031; co4033; co4035; co4037; co4039; im1013; im1023), 3).
map(c, (im1025; im1027; im3001; mt1007; sp1031), 3).
map(c, (co1007; co2003; co2007; co2013; co3005; co4337; mt1003; mt1005), 4).
map(c, (mt2013; ph1003), 4).

% ------------------------------------------------------------------
% Course levels (first digit of the course code)
% ------------------------------------------------------------------
course_level((ch1003; co1005; co1007; co1023; co1027; im1013; im1023; im1025), 1).
course_level((im1027; la1003; la1005; la1007; la1009; mt1003; mt1005; mt1007), 1).
course_level((ph1003; ph1007; sp1007; sp1031; sp1033; sp1035; sp1037; sp1039), 1).
course_level((co2001; co2003; co2007; co2011; co2013; co2017; co2039; mt2013), 2).
course_level((co3001; co3005; co3011; co3013; co3015; co3017; co3021; co3023), 3).
course_level((co3027; co3029; co3031; co3033; co3035; co3037; co3041; co3043), 3).
course_level((co3045; co3047; co3049; co3051; co3057; co3059; co3061; co3065), 3).
course_level((co3067; co3069; co3071; co3083; co3085; co3089; co3093; co3101), 3).
course_level((co3103; co3105; co3107; co3109; co3111; co3115; co3117; co3119), 3).
course_level((co3127; co3129; co3131; co3133; co3135; co3137; co3139; co3151), 3).
course_level((co3153; co3335; im3001), 3).
course_level((co4025; co4029; co4031; co4033; co4035; co4037; co4039; co4337), 4).
course_level((sa4001), 4).

% ------------------------------------------------------------------
% Prerequisites: prereq(B, A) means A is credited before B
% ------------------------------------------------------------------
prereq(co2001, co1005).
prereq(co2003, co1027).
prereq(co2003, co1007).
prereq(co2007, co1005).
prereq(co2011, co1007).
prereq(co3001, co1027).
prereq(co3005, co1027).
prereq(co3015, co3001).
prereq(co3015, co1027).
prereq(co3021, co2013).
prereq(co3031, co2003).
prereq(co3033, co2013).
prereq(co3041, co3001).
prereq(co3133, co3061).
prereq(co3135, co2003).
prereq(co3135, co1027).
prereq(co3137, co2017).
prereq(co4031, co2013).
prereq(co4035, co2013).
prereq(co4337, co3335).
prereq(co4337, co4029).
prereq(la1005, la1003).
prereq(la1007, la1005).
prereq(la1009, la1007).
prereq(mt1005, mt1003).
prereq(mt2013, mt1007).
prereq(sp1033, sp1031).
prereq(sp1035, sp1033).
prereq(sp1037, sp1039).
prereq(sp1039, sp1035).

% ------------------------------------------------------------------
% Co-requisites: co/2 must be credited in the same or an earlier term
% ------------------------------------------------------------------
coreq(co4029, co3335).

:- coreq(C, A), in(X, s(J)), base(X, C), J > t,
   not in(A, ok(J)), not precred(A, J).

% ------------------------------------------------------------------
% Offering frequency: freq(E,K,O) = every I with (I+shift) mod K = O
% ------------------------------------------------------------------
freq((sa4001), 3, 1).
freq((sa4001), 3, 2).

% ------------------------------------------------------------------
% Group credit bounds: map(l, Group, Lower) and map(u, Group, Upper)
% ------------------------------------------------------------------
map(l, a1, 30).
map(u, a1, 30).
map(l, a2, 13).
map(u, a2, 13).
map(l, a3, 6).
map(u, a3, 6).
map(l, a4, 8).
map(u, a4, 8).
map(l, a5, 24).
map(u, a5, 24).
map(l, b3_1, 10).
map(u, b3_1, 10).
map(l, b3_2, 1).
map(u, b3_2, 1).
map(l, b3_3, 1).
map(u, b3_3, 1).
map(l, b3_4, 15).
map(u, b3_4, 132).
map(l, b3_5, 3).
map(u, b3_5, 3).
map(l, c, 9).
map(u, c, 132).
map(l, d, 8).
map(u, d, 8).
map(l, e, 0).
map(u, e, 0).

% Total degree requirement
map(l, total_degree, 128).
map(u, total_degree, 128).

% ------------------------------------------------------------------
% Credit accounting
% ------------------------------------------------------------------
% extension.lp uses comp to force retakes of failed compulsory courses.
in(E, comp) :- group(G), in(E, G), not elective_group(G).
subseteq(comp, ok).

in(E, credit(a1)) :- in(E, a1), in(E, ok).
in(E, credit(a2)) :- in(E, a2), in(E, ok).
in(E, credit(a3)) :- in(E, a3), in(E, ok).
in(E, credit(a4)) :- in(E, a4), in(E, ok).
in(E, credit(a5)) :- in(E, a5), in(E, ok).
in(E, credit(b3_1)) :- in(E, b3_1), in(E, ok).
in(E, credit(d)) :- in(E, d), in(E, ok).
in(E, credit(e)) :- in(E, e), in(E, ok).

% A credited elective may count towards at most one quota bucket.
% Extra passed electives are left uncounted instead of violating
% a group upper bound.
candidate(E, B) :- elective_group(B), in(E, B).
{ counted(E, B) : candidate(E, B) } <= 1 :- candidate(E, _), in(E, ok).
in(E, credit(b3_2)) :- counted(E, b3_2), in(E, ok).
in(E, credit(b3_3)) :- counted(E, b3_3), in(E, ok).
in(E, credit(b3_4)) :- counted(E, b3_4), in(E, ok).
in(E, credit(b3_5)) :- counted(E, b3_5), in(E, ok).
in(E, credit(c)) :- counted(E, c), in(E, ok).

in(E, credit(total_degree)) :- group(G), in(E, credit(G)).
% Only courses that count towards a requirement group are scheduled.
counted_course(E) :- group(G), in(E, credit(G)).
:- in(E, s(I)), I > t, in(E, m), not counted_course(E).
sum(credit(G), c, bw, (L, U)) :- group(G), map(l, G, L), map(u, G, U).
sum(credit(total_degree), c, bw, (L, U)) :- map(l, total_degree, L), map(u, total_degree, U).

% ------------------------------------------------------------------
% Milestone thresholds (credits accumulated before the course)
% Internship        : 65% of 128 -> 84
% Specialized project: 70% of 128 -> 90
% Capstone          : 85% of 128 -> 109
% ------------------------------------------------------------------
:- in(X, s(J)), base(X, co3335), J > t,
   #sum{ C, E : in(E, ok(I)), map(c, E, C), I < J } < 84.
:- in(X, s(J)), base(X, co4029), J > t,
   #sum{ C, E : in(E, ok(I)), map(c, E, C), I < J } < 90.
:- in(X, s(J)), base(X, co4337), J > t,
   #sum{ C, E : in(E, ok(I)), map(c, E, C), I < J } < 109.

% Capstone additionally requires ENG_GC to be passed beforehand.
prereq(co4337, eng_gc).

% Curriculum-derived file ends here; see plan.lp for the
% curriculum-independent load bounds, display and optimization.
