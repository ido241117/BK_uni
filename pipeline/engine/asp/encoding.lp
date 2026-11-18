% =====================================================================
% encoding.lp : the base layer -- generic sets, mappings and set constraints
%
% Nothing here knows about courses, terms or students.  Everything is
% expressed with
%   in(E, A)        element E belongs to set A
%   map(F, E, V)    attribute F of element E has value V
% and a small vocabulary of set declarations that other files emit as facts.
%
% Expected constants (defined in extension.lp): t (fixed prefix), n (horizon).
% =====================================================================

% ---------- generate ---------------------------------------------------
{ in(E,s(I)) } :- in(E,m), I=t+1..n.

% s = s(1) U ... U s(n)
in(E,s) :- in(E,s(I)).

% m(w) and m(s)
in(E,m(X)) :- X = (s;w), in(E,m), map(s,E,X).

% ---------- set declarations -------------------------------------------
%   empty(A)              A has no element
%   subseteq(A,B)         A is a subset of B
%   equal(A,B)            A = B
%   card(A,leq,U)         |A| <= U
%   card(A,geq,L)         |A| >= L
%   card(A,bw,(L,U))      L <= |A| <= U
%   sum(A,F,leq,U)        sum of map(F,E,_) over A is <= U
%   sum(A,F,geq,L)        ... >= L
%   sum(A,F,bw,(L,U))     ... between L and U
%   sum_dom(A,F,L,U)      request sum_val(A,F,V) for the value V of that sum,
%                         enumerated only on L..U (keeps grounding small;
%                         no sum_val atom is derived if the sum is outside)
#defined empty/1.  #defined subseteq/2.  #defined equal/2.
#defined card/3.   #defined sum/4.       #defined sum_dom/4.

set(A) :-      empty(A).
set(A) :- subseteq(A,B).    set(A) :-   equal(A,B).
set(B) :- subseteq(A,B).    set(B) :-   equal(A,B).
set(A) :-   card(A,R,L).    set(A) :- sum(A,E,R,L).
set(A) :- sum_dom(A,F,L,U).
%
set(A) :- set( int(A,B)).   set(B) :- set(int(A,B)).
set(A) :- set(before(A)).
%
in( E, int(A,B)) :- set( int(A,B)), in(E,A), in(E,B).
in(E1,before(A)) :- set(before(A)), in(E1,s(I)), in(E2,A), in(E2,s(J)), I < J.

% ---------- derived values ----------------------------------------------
sum_val(A,F,V) :- sum_dom(A,F,L,U), V = L..U,
                  V #sum{ W,E : in(E,A), map(F,E,W) } V.

% ---------- constraints -------------------------------------------------
:- empty(A), in(E,A).
%
:- subseteq(A,B), in(E,A), not in(E,B).
%
:- equal(A,B), in(E,A), not in(E,B).
:- equal(A,B), not in(E,A), in(E,B).
%
:- card(A,leq,U),     not   { in(E,A) } U.
:- card(A,geq,L),     not L { in(E,A) }.
:- card(A,bw,(L,U)),  not L { in(E,A) } U.
%
:- sum(A,F,bw,(L,U)), not L #sum{ V,E : in(E,A), map(F,E,V) } U.
:- sum(A,F,geq,   L), not L #sum{ V,E : in(E,A), map(F,E,V) }.
:- sum(A,F,leq,   U), not   #sum{ V,E : in(E,A), map(F,E,V) } U.
