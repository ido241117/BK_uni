% =====================================================================
% student.lp : simple example student record for cs-2023.lp
%
% Run from this folder with:
%   clingo encoding.lp policy.lp extension.lp cs-2023.lp student.lp plan.lp -c t=2
%
% The student has finished semester 1 and is currently in semester 2.
% Courses in semester 2 without a grade are treated as "unknown" (in
% progress), which extension.lp optimistically counts as credited.
%
% Grades are policy symbols from grading_policy.json.  translation.py maps
% them to ASP atoms with asp_grade_name: B+ -> b_plus, C+ -> c_plus, W -> w.
% =====================================================================

% ---------- semester 1 (completed) -----------------------------------
taken((la1003; pe1003; mt1003; ph1003; co1005; co1023), 1).

% ---------- semester 2 (in progress) ---------------------------------
taken((la1005; pe1005; mt1005; mt1007; co1007; co1027; ph1007), 2).

% ---------- grades (raw grade symbols from grading_policy.json) -------
map(g, la1003, b;
      mt1003, c_plus;
      ph1003, b;
      co1005, a;
      co1023, b_plus;
      la1005, b;
      mt1005, c;
      mt1007, b).

% ---------- pass/fail courses ----------------------------------------
result(pe1003, passed).
result(pe1005, passed).

% ---------- boundary metadata ----------------------------------------
% This hand-written examp?le has one attempt per course.  A real loader keeps
% W attempts in the attempt count, renumbers retakes, then emits these two
% facts.  W is a withdrawn status, not a failed grade.
attempt_count(la1003, 1).
attempt_count(pe1003, 1).
attempt_count(mt1003, 1).
attempt_count(ph1003, 1).
attempt_count(co1005, 1).
attempt_count(co1023, 1).
attempt_count(la1005, 1).
attempt_count(pe1005, 1).
attempt_count(mt1005, 1).
attempt_count(mt1007, 1).
attempt_count(co1007, 1).
attempt_count(co1027, 1).
attempt_count(ph1007, 1).

last_attempt(la1003, la1003).
last_attempt(pe1003, pe1003).
last_attempt(mt1003, mt1003).
last_attempt(ph1003, ph1003).
last_attempt(co1005, co1005).
last_attempt(co1023, co1023).
last_attempt(la1005, la1005).
last_attempt(pe1005, pe1005).
last_attempt(mt1005, mt1005).
last_attempt(mt1007, mt1007).
last_attempt(co1007, co1007).
last_attempt(co1027, co1027).
last_attempt(ph1007, ph1007).

% co1007, co1027 and ph1007 are still in progress (no grade yet).
