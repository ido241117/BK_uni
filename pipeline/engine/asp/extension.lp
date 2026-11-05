% =====================================================================
% extension.lp : student record + retake policy + flexible offering
% Works on top of encoding.lp. Curriculum-independent.
%
% Terms for "attempt objects":
%   E          first attempt of course E (E in m)
%   rt(E,K)    K-th retake of course E   (K = 1,2,...)
% Student input (facts):
%   taken(X,I)   attempt X was enrolled in semester I (I <= t)
%   map(g,X,V)   grade of attempt X, integer, scale x10 (7.5 -> 75)
%   result(X,S)  direct status for pass/fail courses (S = passed|failed)
%   request(E)   student explicitly asks to retake E
%   offer(E,I) / closed(E,I)   student/registrar offering overrides
% =====================================================================

#const t        = 0.    % number of semesters already studied
#const passmin  = 50.   % grade >= passmin  -> passed
#const impr     = 70.   % passed but grade < impr -> may retake to improve
#const maxtries = 3.    % max attempts per course
#const shift    = 0.    % calendar shift of semester index (parity etc.)

% ---------- history ----------------------------------------------------
:- taken(_,I), I > t.
in(X,s(I)) :- taken(X,I).                  % fixed prefix of the plan

% ---------- status: passed / failed / unknown --------------------------
status(X,passed) :- taken(X,_), map(g,X,V), V >= passmin, not result(X,_).
status(X,failed) :- taken(X,_), map(g,X,V), V <  passmin, not result(X,_).
status(X,S)      :- taken(X,_), result(X,S).
status(X,unknown):- taken(X,_), not map(g,X,_), not result(X,_).

% ---------- attempts of a course ---------------------------------------
hist(E,E)        :- taken(E,_), in(E,m).
hist(rt(E,K),E)  :- taken(rt(E,K),_).
natt(E,N)        :- in(E,m), N = #count{ X : hist(X,E) }.

latest(E,E)         :- natt(E,1).
latest(E,rt(E,N-1)) :- natt(E,N), N >= 2.

% ---------- retake eligibility -----------------------------------------
elig(E,failed)  :- latest(E,X), status(X,failed), natt(E,N), N < maxtries.
elig(E,improve) :- latest(E,X), status(X,passed), map(g,X,V), V < impr,
                   natt(E,N), N < maxtries.
elig(E) :- elig(E,_).

% a retake is a scheduled "retaken version" of the course
{ in(rt(E,N),s(I)) } :- elig(E), natt(E,N), I = t+1..n.
map(c,rt(E,K),C) :- map(c,E,C), taken(rt(E,K),_).
map(c,rt(E,N),C) :- map(c,E,C), elig(E), natt(E,N).

% base course of every attempt object (used for credits and offering)
base(X,E)        :- hist(X,E).
base(E,E)        :- in(E,m).
base(rt(E,N),E)  :- elig(E), natt(E,N).

% obligation to retake
must(E) :- elig(E,failed), in(E,comp).      % failed compulsory
must(E) :- elig(E), request(E).             % explicit request (elective or improvement)
:- must(E), natt(E,N), not in(rt(E,N),s).
rejected_request(E) :- request(E), not elig(E).   % ignored, reported only

% an improvement retake (course already passed) only happens on request;
% a voluntary retake of a failed elective is allowed but penalised
:- in(rt(E,N),s), natt(E,N), not elig(E,failed), not request(E).
#minimize{ 1@2,E : in(rt(E,N),s), natt(E,N), not must(E) }.

% ---------- credited sets (credits only count once passed) -------------
% ok(I): courses credited in semester I.  Past: passed (or in progress,
% optimistic).  Future: planned = assumed passed.
in(E,ok(I)) :- in(X,s(I)), base(X,E), I > t.
in(E,ok(I)) :- taken(X,I), base(X,E), status(X,passed).
in(E,ok(I)) :- taken(X,I), base(X,E), status(X,unknown).
in(E,ok)    :- in(E,ok(I)).

% "credited before" : analogue of before(A) but counts only credited modules
set(A) :- set(cbefore(A)).
in(E1,cbefore(A)) :- set(cbefore(A)), in(E1,ok(I)), in(E2,A), in(E2,s(J)), I < J.

% prerequisite: prereq(B,A) = A must be credited in an earlier semester than B
precred(A,J) :- in(A,ok(I)), I < J, J = 1..n.
:- prereq(B,A), in(X,s(J)), base(X,B), J > t, not precred(A,J).

% ---------- offering frequency -----------------------------------------
% freq(E,K,O): offered in every semester I with (I+shift) mod K = O
%   K=1,O=0 every semester | K=2,O=1 odd | K=2,O=0 even | K=3,O=0 every 3rd
freq(E,2,1) :- map(s,E,w).                 % paper's w
freq(E,2,0) :- map(s,E,s).                 % paper's s
freq(E,1,0) :- map(s,E,e).                 % paper's e (unrestricted)
offered(E,I) :- freq(E,K,O), I = 1..n, (I+shift) \ K == O.
offered(E,I) :- offer(E,I).
declared(E)  :- freq(E,_,_).
declared(E)  :- offer(E,_).
offered(E,I) :- in(E,m), not declared(E), I = 1..n.   % default: always offered
avail(E,I)   :- offered(E,I), not closed(E,I).        % closed/2 = override

% temporal constraint: a module may not be scheduled where it is not offered
in(X,noff(I)) :- base(X,E), I = t+1..n, not avail(E,I).
empty(int(noff(I),s(I))) :- I = t+1..n.

% ---------- GPA (credit-weighted, latest attempt counts) ---------------
% 0-credit courses vanish automatically because their weight is 0.
gpa_den(D) :- D = #sum{ C,E   : latest(E,X), map(g,X,_), map(c,E,C) }.
gpa_num(N) :- N = #sum{ C*V,E : latest(E,X), map(g,X,V), map(c,E,C) }.
gpa(G)     :- gpa_den(D), D > 0, gpa_num(N), G = N / D.   % scale x10, truncated
