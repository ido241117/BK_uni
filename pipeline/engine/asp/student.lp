% =====================================================================
% student.lp : simple example student record for cs-2023.lp
%
% Run from this folder with:
%   clingo encoding.lp extension.lp cs-2023.lp student.lp plan.lp -c t=2
%
% The student has finished semester 1 and is currently in semester 2.
% Courses in semester 2 without a grade are treated as "unknown" (in
% progress), which extension.lp optimistically counts as credited.
% =====================================================================

% ---------- semester 1 (completed) -----------------------------------
taken((la1003; pe1003; mt1003; ph1003; co1005; co1023), 1).

% ---------- semester 2 (in progress) ---------------------------------
taken((la1005; pe1005; mt1005; mt1007; co1007; co1027; ph1007), 2).

% ---------- grades, scale x10 (75 means 7.5) -------------------------
map(g, la1003, 75;
      mt1003, 68;
      ph1003, 72;
      co1005, 80;
      co1023, 77;
      la1005, 71;
      mt1005, 65;
      mt1007, 74).

% ---------- pass/fail courses ----------------------------------------
result(pe1003, passed).
result(pe1005, passed).

% co1007, co1027 and ph1007 are still in progress (no grade yet).
