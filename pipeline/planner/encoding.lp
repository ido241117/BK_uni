% =====================================================================
% Encoding lap lo trinh. Chi chua LUAT; du lieu (facts) do planner/facts.py
% sinh ra tu JSON. Luat doi chieu QD 285: docs/2026-11-18-luat-qd285.md
%
% Facts dau vao:
%   course(C, Credits).            mon thuoc chuong trinh
%   required(C).                   mon thuoc khoi bat buoc
%   group_credits(G, N).           khoi tu chon can it nhat N tin chi
%   group_count(G, N).             khoi tu chon can it nhat N mon
%   member(G, C).                  mon C thuoc khoi tu chon G
%   relation(C, R, Type).          Type: "prerequisite" | "corequisite" | "recommended"
%                                  ("prior" bi bo theo quyet dinh 18/11, khong xuat ra)
%   status(C, St).                 St: "completed" | "failed" | "in-progress"
%   assume_result(C, "pass"|"fail").   gia dinh cho mon dang hoc
%   plan_semester(I, Code).        ky se xep, I tang dan theo thoi gian
%   sem_min(I, N). sem_max(I, N).  toi thieu (chi khi sinh vien tu dat) / toi da cua ky I
%   base_min_credits(N).           11 TC ky chinh: mong muon mem S11, khong phai rang buoc
%   deadline(I).                   phai xong truoc hoac trong ky I
%   need_year(C, Y). sem_year(I, Y).   cap do mon (chi khi bat rules.course_level)
%   not_offered(C, I).             mon C khong mo o ky I
%   locked(C, I).                  sinh vien khoa mon C vao ky I
%   wanted(C).                     sinh vien muon hoc C (S4)
%   prev(C, I).                    lo trinh truoc do (S3)
%   summer(I). summer_ok(C, I).    ky he; mon C duoc xep vao ky he I
%   internship(C).                 thuc tap (khong tinh vao S7)
%   summer_specialized(C).         mon cap 3+ khong phai thuc tap (S9 tranh xep he)
%   pref_lo(N). pref_hi(N).        khoang tin chi dep cua ky chinh (S8)
%   spref_lo(N). spref_hi(N).      khoang tin chi dep cua ky he co hoc (S7)
%   grad_need(C, N).               mon tot nghiep C can N TC tich luy truoc ky hoc
%   outside_credits(B).            TC da dat ngoai chuong trinh, tinh vao tu chon tu do
%   priority(S, P).                muc uu tien cua mong muon mem S (s1..s6)
% =====================================================================

sem(I) :- plan_semester(I, _).

% --- Tinh trang sau ky hien tai -------------------------------------
% passed = da dat. Mon dang hoc duoc xem nhu dat neu kich ban gia dinh dau
% (QD 285 Dieu 15.1).
passed(C) :- status(C, "completed").
passed(C) :- status(C, "in-progress"), assume_result(C, "pass").

% --- Lua chon: moi mon chua dat duoc xep vao NHIEU NHAT mot ky -------
{ take(C, I) : sem(I) } 1 :- course(C, _), not passed(C).

% Gia dinh cua mo hinh: mon xep trong tuong lai se dat.
done(C) :- passed(C).
done(C) :- take(C, _).

% take_before(C, I): C duoc xep o mot ky truoc ky I.
take_before(C, I) :- take(C, J), sem(I), J < I.

% --- Yeu cau tot nghiep ---------------------------------------------
:- required(C), not done(C).
:- group_credits(G, N), #sum   { Cr, C : member(G, C), done(C), course(C, Cr) } < N.
:- group_count(G, N),   #count { C     : member(G, C), done(C) } < N.

% --- Quan he giua cac mon (QD 285 Dieu 2) ---------------------------
% Tien quyet: R phai DAT truoc ky hoc C.
:- take(C, I), relation(C, R, "prerequisite"), not passed(R), not take_before(R, I).
% Song hanh: R da DAT truoc, hoac R hoc cung ky voi C. Mon da rot khong thoa.
:- take(C, I), relation(C, R, "corequisite"),
   not passed(R), not take_before(R, I), not take(R, I).

% --- Mo mon, khoa mon, han tot nghiep --------------------------------
:- take(C, I), not_offered(C, I).
:- locked(C, I), not take(C, I).
:- take(C, I), deadline(D), I > D.

% --- Cap do mon (QD 285 Dieu 15.4), nam hoc tinh theo khoa -----------
:- take(C, I), need_year(C, Y), sem_year(I, YS), YS < Y.

% --- Ky he (H14): thuc tap luon duoc; mon khac chi khi sinh vien bat ky he do
% va mon tung mo he (summer_ok do facts.py tinh tu du lieu, quyet dinh 19/11) --
:- take(C, I), summer(I), not summer_ok(C, I).

% --- Mon tot nghiep can du TC tich luy truoc ky hoc (QD 285 Dieu 15.5) --
% Tich luy = mon da dat + mon xep o cac ky truoc + TC ngoai chuong trinh tinh vao tu chon tu do.
% Mon xep o ky ngay truoc tinh nhu da dat khi dang ky (Dieu 15.1).
:- take(G, I), grad_need(G, N), outside_credits(B),
   #sum { Cr, C : passed(C), course(C, Cr) ; Cr, C : take(C, J), J < I, course(C, Cr) } < N - B.

% --- Tin chi moi ky --------------------------------------------------
load(I, L) :- sem(I), L = #sum { Cr, C : take(C, I), course(C, Cr) }.
:- load(I, L), sem_max(I, M), L > M.

used(I)       :- take(_, I).
used_after(I) :- sem(I), used(J), J > I.
last(I)       :- used(I), not used_after(I).
% Toi thieu sinh vien tu dat cho mot ky: cung (tru ky cuoi cung co mon).
:- used_after(I), load(I, L), sem_min(I, M), L < M.
% S11: ky chinh (tru ky cuoi) thieu so voi 11 TC. Dung duoi S2 nen khong hoc thua de du.
deficit(I, D) :- sem(I), not summer(I), used_after(I), load(I, L), base_min_credits(M), L < M, D = M - L.

% --- Mong muon mem ---------------------------------------------------
% S6: khuyen nghi "nen hoc R truoc C" bi pha.
kn_broken(C, R) :- take(C, I), relation(C, R, "recommended"), not passed(R), not take_before(R, I).
% S4: mon sinh vien muon hoc nhung khong co trong lo trinh.
wanted_missing(C) :- wanted(C), not done(C).
% S5: ky nang nhat.
max_load(M) :- priority(s5, _), M = #max { L : load(I, L) }.
% S7: ky he co hoc (khong tinh thuc tap) lech khoi khoang dep [spref_lo, spref_hi].
% S10: tin chi hoc o ky he (tru thuc tap): uu tien ky chinh hon ky he.
sload(I, L) :- summer(I), L = #sum { Cr, C : take(C, I), course(C, Cr), not internship(C) }.
s_over(I, D)  :- sload(I, L), spref_hi(H), L > H, D = L - H.
s_under(I, D) :- sload(I, L), L > 0, spref_lo(Lo), L < Lo, D = Lo - L.
% S8: ky chinh lech khoi khoang dep [pref_lo, pref_hi]; ky cuoi khong tinh phan thieu.
under(I, D) :- sem(I), not summer(I), used_after(I), load(I, L), pref_lo(Lo), L < Lo, D = Lo - L.
over(I, D)  :- sem(I), not summer(I), load(I, L), pref_hi(H), L > H, D = L - H.

% --- Muc tieu: so uu tien lay tu priority/2 (so lon hon uu tien hon) --
#minimize { I @ P : last(I), priority(s1, P) }.                        % S1 xong som nhat
#minimize { 1 @ P, C, R : kn_broken(C, R), priority(s6, P) }.          % S6 it pha khuyen nghi
#minimize { 1 @ P, C : wanted_missing(C), priority(s4, P) }.           % S4 hoc mon muon hoc
#minimize { D @ P, I, o : s_over(I, D), priority(s7, P) ;
            D @ P, I, u : s_under(I, D), priority(s7, P) }.             % S7 ky he 6-9 TC
#minimize { Cr @ P, C : take(C, I), summer(I), not internship(C), course(C, Cr), priority(s10, P) }. % S10 it hoc he
#minimize { Cr @ P, C : take(C, I), summer(I), summer_specialized(C), course(C, Cr), priority(s9, P) }. % S9 he uu tien dai cuong, co so nganh
#minimize { Cr @ P, C : take(C, _), course(C, Cr), priority(s2, P) }.  % S2 khong hoc thua
#minimize { D @ P, I : deficit(I, D), priority(s11, P) }.                % S11 ky chinh du 11 TC
#minimize { D @ P, I, u : under(I, D), priority(s8, P) ;
            D @ P, I, o : over(I, D), priority(s8, P) }.                % S8 ky chinh 15-18 TC
#minimize { M @ P : max_load(M), priority(s5, P) }.                    % S5 deu tai
#minimize { 1 @ P, C, I : prev(C, I), not take(C, I), priority(s3, P) }. % S3 it doi lo trinh

#show take/2.
