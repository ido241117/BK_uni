% =====================================================================
% curriculum data and mappings
% Curriculum: Computer Science 2023 (cs_2023)
% Default file name: cs-2023.lp
% Generated from curriculum.json by the planner CLI -- do not edit by hand.
% Load together with policy.lp, encoding.lp, extension.lp and plan.lp.
% =====================================================================

% Total degree credit requirement: 128
% This file contains only curriculum facts and mappings. Generic
% derivations and constraints live in extension.lp; school-specific
% loads, tuition, objectives and display live in plan.lp.

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

% group/1, in(E,m) and in(E,comp) are derived generically in
% extension.lp from the membership and bound facts below.
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
prereq(co4337, eng_gc).
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
% Co-requisites: coreq(C, A): A credited in the same or an earlier term
% ------------------------------------------------------------------
coreq(co4029, co3335).

% ------------------------------------------------------------------
% Offering: offered_slot(E, P) = course E runs in term part P
% (1 = fall, 2 = spring, 3 = summer) of every academic year.
% ------------------------------------------------------------------
offered_slot((ch1003; co1005; co1007; co1023; co1027; co2001; co2003; co2007), 1).
offered_slot((co2011; co2013; co2017; co2039; co3001; co3005; co3011; co3013), 1).
offered_slot((co3015; co3017; co3021; co3023; co3027; co3029; co3031; co3033), 1).
offered_slot((co3035; co3037; co3041; co3043; co3045; co3047; co3049; co3051), 1).
offered_slot((co3057; co3059; co3061; co3065; co3067; co3069; co3071; co3083), 1).
offered_slot((co3085; co3089; co3093; co3101; co3103; co3105; co3107; co3109), 1).
offered_slot((co3111; co3115; co3117; co3119; co3127; co3129; co3131; co3133), 1).
offered_slot((co3135; co3137; co3139; co3151; co3153; co3335; co4025; co4029), 1).
offered_slot((co4031; co4033; co4035; co4037; co4039; co4337; eng_gc; im1013), 1).
offered_slot((im1023; im1025; im1027; im3001; la1003; la1005; la1007; la1009), 1).
offered_slot((mt1003; mt1005; mt1007; mt2013; ph1003; ph1007; sa4001; sp1007), 1).
offered_slot((sp1031; sp1033; sp1035; sp1037; sp1039), 1).
offered_slot((ch1003; co1005; co1007; co1023; co1027; co2001; co2003; co2007), 2).
offered_slot((co2011; co2013; co2017; co2039; co3001; co3005; co3011; co3013), 2).
offered_slot((co3015; co3017; co3021; co3023; co3027; co3029; co3031; co3033), 2).
offered_slot((co3035; co3037; co3041; co3043; co3045; co3047; co3049; co3051), 2).
offered_slot((co3057; co3059; co3061; co3065; co3067; co3069; co3071; co3083), 2).
offered_slot((co3085; co3089; co3093; co3101; co3103; co3105; co3107; co3109), 2).
offered_slot((co3111; co3115; co3117; co3119; co3127; co3129; co3131; co3133), 2).
offered_slot((co3135; co3137; co3139; co3151; co3153; co3335; co4025; co4029), 2).
offered_slot((co4031; co4033; co4035; co4037; co4039; co4337; eng_gc; im1013), 2).
offered_slot((im1023; im1025; im1027; im3001; la1003; la1005; la1007; la1009), 2).
offered_slot((mt1003; mt1005; mt1007; mt2013; ph1003; ph1007; sa4001; sp1007), 2).
offered_slot((sp1031; sp1033; sp1035; sp1037; sp1039), 2).
offered_slot((ch1003; co1005; co1007; co1023; co1027; co2001; co2003; co2007), 3).
offered_slot((co2011; co2013; co2017; co2039; co3001; co3005; co3011; co3013), 3).
offered_slot((co3015; co3017; co3021; co3023; co3027; co3029; co3031; co3033), 3).
offered_slot((co3035; co3037; co3041; co3043; co3045; co3047; co3049; co3051), 3).
offered_slot((co3057; co3059; co3061; co3065; co3067; co3069; co3071; co3083), 3).
offered_slot((co3085; co3089; co3093; co3101; co3103; co3105; co3107; co3109), 3).
offered_slot((co3111; co3115; co3117; co3119; co3127; co3129; co3131; co3133), 3).
offered_slot((co3135; co3137; co3139; co3151; co3153; co3335; co4025; co4029), 3).
offered_slot((co4031; co4033; co4035; co4037; co4039; co4337; eng_gc; im1013), 3).
offered_slot((im1023; im1025; im1027; im3001; la1003; la1005; la1007; la1009), 3).
offered_slot((mt1003; mt1005; mt1007; mt2013; ph1003; ph1007; sp1007; sp1031), 3).
offered_slot((sp1033; sp1035; sp1037; sp1039), 3).

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

% Total degree bounds are a graduation requirement and live in policy.lp.

% ------------------------------------------------------------------
% Majors: earned by crediting at least major_min(M, K) courses
% from major_course(M, E).
% ------------------------------------------------------------------
% AI: Applied Artificial Intelligence
major(ai).
major_min(ai, 5).
major_course(ai, (co3029; co3035; co3037; co3041; co3043; co3045; co3049; co3051)).
major_course(ai, (co3061; co3085; co3089; co3117; co3133; co3135; co3137; co4025)).
% ASE: Advanced Software Engineering
major(ase).
major_min(ase, 5).
major_course(ase, (co3011; co3013; co3015; co3017; co3041; co3065; co3089; co3115)).
major_course(ase, (co3131)).
% CYB: Cybersecurity
major(cyb).
major_min(cyb, 5).
major_course(cyb, (co3047; co3049; co3051; co3069; co3083; co3089; co3151; co3153)).
% DSE: Data, Security Engineering and Business Intelligence Data Engineering
major(dse).
major_min(dse, 5).
major_course(dse, (co3021; co3023; co3027; co3029; co3033; co3115; co3129; co3137)).
major_course(dse, (co3139; co4031; co4033; co4035; co4039)).
% IPCV: Image Processing and Computer Vision
major(ipcv).
major_min(ipcv, 5).
major_course(ipcv, (co3043; co3045; co3049; co3051; co3057; co3059; co3089; co3117)).

% ------------------------------------------------------------------
% Milestone thresholds (credits accumulated before the course)
% from curriculum.json 'milestones'. plan.lp enforces the generic
% milestone constraint.
% ------------------------------------------------------------------
% CO3335: 65% of 128 -> 84
milestone(co3335, 84).
% CO4029: 70% of 128 -> 90
milestone(co4029, 90).
% CO4337: 85% of 128 -> 109
milestone(co4337, 109).

% ------------------------------------------------------------------
% Planning attributes. tag(E, K): keyword K (major lists are added
% as tags in extension.lp). typical_term(E, K): usually taken in the
% K-th regular term. fills_next(E): E also occupies the following
% term. map(note, E, Text): shown whenever E is planned.
% ------------------------------------------------------------------
typical_term(co3101, 5).
map(note, co3101, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3103, 5).
map(note, co3103, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3105, 5).
map(note, co3105, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3107, 6).
map(note, co3107, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3109, 6).
map(note, co3109, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3111, 6).
map(note, co3111, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3119, 5).
map(note, co3119, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3127, 5).
map(note, co3127, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co3335, 6).
fills_next(co3335).
map(note, co3335, "Needs faculty information: registered in this term, carried out in the following summer; the faculty sets the requirements each term.").
typical_term(co4029, 7).
map(note, co4029, "Faculty regulations for this term may add requirements; confirm with the faculty.").
typical_term(co4337, 8).
map(note, co4337, "Faculty regulations for this term may add requirements; confirm with the faculty.").

% ------------------------------------------------------------------
% Popularity: popularity(E, Count) from elective_popularity.json.
% No facts means the popularity tie-breaker is inactive.
% ------------------------------------------------------------------

% ------------------------------------------------------------------
% Interchangeable electives: elective_class(E, Class, Rank). Members
% of one class have identical curriculum facts; extension.lp uses
% the rank to keep one plan per permutation.
% ------------------------------------------------------------------
elective_class(co3011, 1, 1).
elective_class(co3013, 1, 2).
elective_class(co3017, 1, 3).
elective_class(co3065, 1, 4).
elective_class(co3131, 1, 5).
elective_class(co3021, 2, 1).
elective_class(co3033, 2, 2).
elective_class(co3023, 3, 1).
elective_class(co3027, 3, 2).
elective_class(co3129, 3, 3).
elective_class(co3139, 3, 4).
elective_class(co3035, 4, 1).
elective_class(co3037, 4, 2).
elective_class(co3085, 4, 3).
elective_class(co3043, 5, 1).
elective_class(co3045, 5, 2).
elective_class(co3117, 5, 3).
elective_class(co3047, 6, 1).
elective_class(co3069, 6, 2).
elective_class(co3083, 6, 3).
elective_class(co3151, 6, 4).
elective_class(co3153, 6, 5).
elective_class(co3049, 7, 1).
elective_class(co3051, 7, 2).
elective_class(co3057, 8, 1).
elective_class(co3059, 8, 2).
elective_class(co3067, 9, 1).
elective_class(co3071, 9, 2).
elective_class(co3101, 10, 1).
elective_class(co3103, 10, 2).
elective_class(co3105, 10, 3).
elective_class(co3119, 10, 4).
elective_class(co3127, 10, 5).
elective_class(co3107, 11, 1).
elective_class(co3109, 11, 2).
elective_class(co3111, 11, 3).
elective_class(co4031, 12, 1).
elective_class(co4035, 12, 2).
elective_class(co4033, 13, 1).
elective_class(co4039, 13, 2).
elective_class(im1013, 14, 1).
elective_class(im1023, 14, 2).
elective_class(im1025, 14, 3).
elective_class(im1027, 14, 4).

% Curriculum-derived file ends here; see policy.lp and plan.lp.
