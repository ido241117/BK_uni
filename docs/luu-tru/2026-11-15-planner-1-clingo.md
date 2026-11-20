# Planner 1/3 — Clingo: lý thuyết và code

Ngày viết: 15/11/2026. Bộ ba tài liệu, đọc theo thứ tự:

1. **Clingo** (file này): mô tả bài toán bằng luật logic.
2. [OR-Tools CP-SAT](2026-11-15-planner-2-ortools.md): mô tả cùng bài toán bằng bất đẳng thức.
3. [So sánh và định hướng](2026-11-15-planner-3-so-sanh.md): kết quả đo, kết luận, việc tiếp theo.

Đọc xong file này bạn sẽ trả lời được: ASP là gì, từng dòng trong `encoding.lp` nghĩa là gì và vì sao viết như vậy, Clingo tìm lộ trình ra sao, và nó mạnh yếu ở đâu.

**Phạm vi:** bản mẫu trên dữ liệu bịa. Luật lấy theo cách web đang hiểu, chưa đối chiếu quy chế trường.

---

## 1. Bài toán và ví dụ dùng xuyên suốt

Cho một chương trình đào tạo và tình trạng hiện tại của một sinh viên, hãy xếp các môn còn thiếu vào các kỳ còn lại sao cho hợp lệ và tốt nhất.

Cả ba tài liệu dùng chung một sinh viên giả lập trong [toy.json](../pipeline/planner/fixtures/toy.json):

| | |
|---|---|
| Đang ở kỳ | 261. Còn 3 kỳ để xếp: 262, 271, 272 |
| Đã đậu | MA101, CS101, CS102 |
| Đã rớt | MA102 |
| Đang học | CS201, CS202 |
| Giới hạn | 3–12 tín chỉ mỗi kỳ |
| Còn thiếu | 5 môn bắt buộc (14 TC) + 6 TC tự chọn = **20 TC** |

Chuỗi phụ thuộc quan trọng:

```
MA102 ──TQ──► MA201 ──TQ──► EL301
CS201 ──TQ──► CS301 ──TQ──► CS401
CS201 ──TQ──► CS302 ──TQ──► CS401
                CS302 ──TQ──► EL302
CS202 ──SHT─► CS301 ──SHT─► EL303 (không mở kỳ 271)
```

TQ = tiên quyết (phải đạt trước). SHT = song hành (đã học trước hoặc học cùng kỳ).

---

## 2. Lý thuyết: Answer Set Programming

### 2.1 Ý tưởng: mô tả, không ra lệnh

Lập trình thông thường là viết **các bước** để tìm lộ trình. Answer Set Programming (ASP) thì viết **thế nào là một lộ trình đúng**, rồi để bộ giải tự tìm. Clingo là bộ giải ASP phổ biến nhất.

Hệ quả thực tế: thêm một quy định mới là thêm một dòng luật, không phải sửa thuật toán.

### 2.2 Bốn loại câu

Một chương trình ASP chỉ gồm bốn loại câu. Chữ hoa là biến, chữ thường hoặc chuỗi trong nháy kép là hằng.

| Loại | Ví dụ | Đọc là |
|---|---|---|
| **Fact** | `course("CS301", 3).` | CS301 là môn 3 tín chỉ. Luôn đúng |
| **Luật** | `passed(C) :- status(C, "completed").` | C được coi là đã đạt **nếu** trạng thái của C là completed |
| **Luật lựa chọn** | `{ take(C, I) : sem(I) } 1 :- ...` | Được **tự do chọn** tối đa 1 trong các `take(C, I)` |
| **Ràng buộc** | `:- take(C, I), not_offered(C, I).` | **Không được phép** vừa xếp C vào kỳ I vừa có C không mở kỳ I |

Dấu `:-` đọc là "nếu". Luật có vế trái thì suy ra điều mới; ràng buộc không có vế trái thì loại bỏ nghiệm.

### 2.3 `not` nghĩa là "không chứng minh được"

Đây là điểm dễ hiểu sai nhất. Trong ASP, `not passed(C)` **không** có nghĩa "biết chắc C chưa đạt", mà là "không có luật nào suy ra được C đã đạt".

Hệ quả: thiếu dữ liệu tự động thành sai. Môn không có bản ghi `status` sẽ được coi là chưa học. Điều này tiện (không phải khai mọi thứ) nhưng nguy hiểm: gõ sai mã môn trong dữ liệu thì Clingo không báo lỗi, nó chỉ lặng lẽ coi môn đó chưa học. Vì vậy `facts.py` phải kiểm tra đầu vào trước.

### 2.4 Answer set là gì

Một **answer set** là một tập các điều được coi là đúng, thỏa hai yêu cầu:

1. Mọi luật và ràng buộc đều được tôn trọng.
2. **Không có gì đúng mà không có lý do.** Mỗi điều đúng phải là fact, là lựa chọn, hoặc được suy ra từ luật.

Yêu cầu 2 là thứ làm ASP khác logic thông thường. Ví dụ: không tồn tại answer set nào có `passed("EL301")`, vì không có fact, lựa chọn hay luật nào dẫn tới nó.

Trong bài toán của ta: **mỗi answer set là một lộ trình hợp lệ**. Phần tự do duy nhất là các `take(môn, kỳ)`; mọi thứ khác được suy ra từ đó.

### 2.5 Clingo chạy hai bước

**Bước 1: grounding.** Thay mọi biến bằng giá trị cụ thể. Ví dụ luật tiên quyết với `C = "CS401"`, `R = "CS301"`, `I = 1`:

```prolog
:- take("CS401", 1), not passed("CS301"), not take_before("CS301", 1).
```

Bộ grounding còn rút gọn luôn: CS301 chắc chắn chưa đạt, và không có kỳ nào trước kỳ 1, nên dòng trên thu lại thành:

```prolog
:- take("CS401", 1).
```

Tức là ngay từ bước này Clingo đã biết CS401 không thể nằm ở kỳ đầu tiên. Với ví dụ của ta, grounding tạo ra khoảng 390 atom và 500 luật, mất vài mili giây.

**Bước 2: solving.** Tìm cách gán đúng/sai cho các `take` sao cho không ràng buộc nào bị vi phạm. Thuật toán là CDCL (conflict-driven clause learning):

1. **Đoán** một `take` là đúng hoặc sai.
2. **Lan truyền** hệ quả: nếu đã xếp CS401 vào kỳ 2 thì CS301 và CS302 buộc phải ở kỳ 1.
3. Nếu gặp **mâu thuẫn**, phân tích nguyên nhân, ghi lại thành một ràng buộc mới để không bao giờ lặp lại sai lầm đó, rồi quay lui.
4. Lặp lại đến khi mọi thứ được gán (có nghiệm) hoặc mâu thuẫn ngay từ đầu (vô nghiệm).

Nhờ bước 3, Clingo không duyệt hết mọi tổ hợp. Ví dụ của ta giải xong sau 4 lần mâu thuẫn.

### 2.6 Tối ưu

Câu `#minimize` gán điểm phạt cho mỗi nghiệm. Clingo tối ưu theo kiểu "tìm rồi siết":

1. Tìm một lộ trình bất kỳ, giả sử xong ở kỳ thứ 3.
2. Thêm yêu cầu "lộ trình sau phải tốt hơn", tìm tiếp.
3. Khi không còn lộ trình nào tốt hơn, lộ trình cuối cùng được **chứng minh** là tối ưu.

Lưu ý bước 3: để kết luận tối ưu, Clingo phải **chứng minh vô nghiệm** cho bài toán "tốt hơn nữa". Tìm ra nghiệm tốt thường nhanh; chứng minh không còn gì tốt hơn có thể rất chậm. Tài liệu [so sánh](2026-11-15-planner-3-so-sanh.md) sẽ cho thấy đây chính là điểm yếu của Clingo trên bài toán này.

---

## 3. Code: từ JSON đến lộ trình

```
toy.json ──► facts.py ──► facts ─┐
                                 ├──► solve.py (Clingo) ──► JSON lộ trình
               encoding.lp ──────┘
```

### 3.1 `facts.py`: dịch dữ liệu, không suy luận

[facts.py](../pipeline/planner/facts.py) làm đúng hai việc.

**Kiểm tra đầu vào** (`validate_input`). Vì ASP coi thiếu là sai (mục 2.3), mọi sai sót dữ liệu phải bị chặn ở đây: mã môn không tồn tại, loại quan hệ lạ, môn thuộc hai khối, kịch bản không khai giả định cho môn đang học.

**Dịch sang facts** (`export_facts`). Một bản ghi JSON thành một fact:

| JSON | Fact |
|---|---|
| `{"code": "CS301", "credits": 3}` | `course("CS301", 3).` |
| Khối `kind: "required"` chứa CS301 | `required("CS301").` |
| Khối tự chọn cần 6 TC | `group_credits("Tu chon", 6).` và `member("Tu chon", "EL301").` ... |
| Quan hệ CS301 cần CS201, loại prerequisite | `relation("CS301", "CS201", "prerequisite").` |
| MA102 trạng thái failed | `status("MA102", "failed").` |
| Kịch bản: CS201 giả định đậu | `assume_result("CS201", "pass").` |
| Các kỳ 262, 271, 272 | `plan_semester(1, "262").` `plan_semester(2, "271").` `plan_semester(3, "272").` |
| EL303 không mở kỳ 271 | `not_offered("EL303", 2).` |

Ba quyết định thiết kế đáng nhớ:

- **Kỳ được đánh số 1, 2, 3.** Luật cần so sánh "trước" và "sau", mà mã kỳ dạng chuỗi thì không so sánh được.
- **Quan hệ `recommended` không được xuất.** Nó là gợi ý, không phải ràng buộc.
- **Mã môn đặt trong nháy kép.** Mã thật có thể chứa ký tự mà ASP không cho phép ở hằng thường.

Xem facts thật: `python -m planner.run_scenarios --facts base`.

### 3.2 `encoding.lp`: toàn bộ luật

[encoding.lp](../pipeline/planner/encoding.lp) theo khuôn mẫu chuẩn của ASP gồm ba phần: **sinh** các khả năng, **định nghĩa** khái niệm phụ, **loại** khả năng sai. Cuối cùng là mục tiêu.

#### Phần A — Tình trạng hiện tại

```prolog
passed(C)    :- status(C, "completed").
passed(C)    :- status(C, "in-progress"), assume_result(C, "pass").
attempted(C) :- status(C, _).
```

Hai luật cùng vế trái nghĩa là "hoặc": đã đạt nếu hoàn thành, **hoặc** đang học và kịch bản giả định đậu. `_` là "giá trị nào cũng được".

Tách `passed` và `attempted` vì quy chế phân biệt: tiên quyết cần **đạt**, học trước và song hành chỉ cần **đã học**. Với sinh viên mẫu: MA102 (rớt) có `attempted` nhưng không có `passed`.

#### Phần B — Sinh: không gian lựa chọn

```prolog
{ take(C, I) : sem(I) } 1 :- course(C, _), not passed(C).
```

Đọc: với mỗi môn C chưa đạt, được chọn **tối đa một** kỳ I để xếp. Số `1` bên phải là cận trên. Không có cận dưới, nên được phép không xếp (môn tự chọn không cần học hết).

Đây là dòng duy nhất tạo ra sự tự do. Mọi dòng khác chỉ suy ra hoặc loại bỏ.

#### Phần C — Định nghĩa: khái niệm phụ

```prolog
done(C) :- passed(C).
done(C) :- take(C, _).
take_before(C, I) :- take(C, J), sem(I), J < I.
```

- `done(C)`: môn sẽ hoàn thành khi kết thúc lộ trình. Luật thứ hai chứa một **giả định lớn**: môn đã xếp thì sẽ đậu.
- `take_before(C, I)`: C được xếp ở một kỳ trước kỳ I. Tách ra để các luật quan hệ bên dưới ngắn gọn.

#### Phần D — Loại: ràng buộc cứng

**Tốt nghiệp.**

```prolog
:- required(C), not done(C).
:- group_credits(G, N), #sum   { Cr, C : member(G, C), done(C), course(C, Cr) } < N.
:- group_count(G, N),   #count { C     : member(G, C), done(C) } < N.
```

Dòng đầu là thứ ngăn Clingo trả về lộ trình rỗng: không được để sót môn bắt buộc nào.

Dòng hai có một chi tiết dễ sai. `#sum { Cr, C : ... }` cộng `Cr` trên **tập** các cặp `(Cr, C)`. Nếu viết thiếu `C` thành `#sum { Cr : ... }` thì hai môn cùng 3 tín chỉ tạo ra cùng một phần tử `(3)` và chỉ được cộng một lần. Thêm `C` để mỗi môn là một phần tử riêng.

**Quan hệ giữa các môn.**

```prolog
:- take(C, I), relation(C, R, "prerequisite"), not passed(R), not take_before(R, I).
:- take(C, I), relation(C, R, "prior"),        not attempted(R), not take_before(R, I).
:- take(C, I), relation(C, R, "corequisite"),
   not attempted(R), not take_before(R, I), not take(R, I).
```

Ba luật cùng khuôn: "không được xếp C vào kỳ I nếu R chưa thỏa bằng **mọi** cách". Khác nhau ở các cách được chấp nhận:

| Loại | R đã đạt | R đã học nhưng rớt | R xếp kỳ trước | R xếp cùng kỳ |
|---|---|---|---|---|
| Tiên quyết | Được | Không | Được | Không |
| Học trước | Được | Được | Được | Không |
| Song hành | Được | Được | Được | Được |

Áp vào sinh viên mẫu: MA201 cần tiên quyết MA102, mà MA102 đã rớt, nên MA102 phải được học lại ở một kỳ trước MA201. CS301 cần song hành CS202, mà CS202 đang học (đã `attempted`), nên thỏa ngay.

**Mở môn và lựa chọn của sinh viên.**

```prolog
:- take(C, I), not_offered(C, I).
:- locked(C, I), not take(C, I).
```

Đây là hai dòng làm nên what-if: kịch bản "môn không mở" thêm một fact `not_offered`, kịch bản "kỳ tới học môn này" thêm một fact `locked`.

**Tín chỉ mỗi kỳ.**

```prolog
load(I, L) :- sem(I), L = #sum { Cr, C : take(C, I), course(C, Cr) }.
:- load(I, L), max_credits(M), L > M.

used(I)       :- take(_, I).
used_after(I) :- sem(I), used(J), J > I.
last(I)       :- used(I), not used_after(I).
:- used_after(I), load(I, L), min_credits(M), L < M.
```

Mức tối đa áp dụng cho mọi kỳ. Mức tối thiểu chỉ áp dụng cho kỳ **còn có kỳ sau** (`used_after`), vì kỳ cuối thường chỉ còn vài môn. Hệ quả kèm theo: không được bỏ trống một kỳ ở giữa.

#### Phần E — Mục tiêu

```prolog
#minimize { I @ 3 : last(I) }.                           % học xong sớm nhất
#minimize { Cr @ 2, C : take(C, _), course(C, Cr) }.      % không học thừa tín chỉ
#minimize { 1 @ 1, C, I : prev(C, I), not take(C, I) }.   % ít khác lộ trình cũ nhất
```

Số sau `@` là mức ưu tiên. Clingo tối ưu mức 3 xong hẳn rồi mới xét mức 2, rồi mức 1. Một lộ trình xong sớm hơn luôn thắng, dù học thừa bao nhiêu tín chỉ.

Mục tiêu thứ ba phục vụ what-if: `prev` là lộ trình cơ sở. Khi giả định thay đổi, lộ trình mới chỉ đổi những gì buộc phải đổi, nên phần khác biệt in ra phản ánh đúng tác động của giả định.

### 3.3 `solve.py`: gọi Clingo

Phần cốt lõi của [solve.py](../pipeline/planner/solve.py):

```python
ctl = clingo.Control(["--opt-mode=opt", *extra_args], logger=logger)
ctl.add("base", [], ENCODING.read_text(encoding="utf-8"))   # luật
ctl.add("base", [], facts)                                  # dữ liệu
ctl.ground([("base", [])])                                  # bước 1: grounding

def on_model(model):                 # được gọi mỗi lần tìm ra nghiệm tốt hơn
    nonlocal best, proven
    best = [(a.arguments[0].string, a.arguments[1].number)
            for a in model.symbols(shown=True)]
    proven = model.optimality_proven

with ctl.solve(on_model=on_model, async_=True) as handle:   # bước 2: solving
    if not handle.wait(time_limit):
        handle.cancel()
    result = handle.get()
```

Bốn điểm cần hiểu:

- **Luật và dữ liệu nạp riêng.** Đổi sinh viên hay kịch bản chỉ đổi chuỗi `facts`.
- **`on_model` được gọi nhiều lần.** Mỗi lần là một lộ trình tốt hơn lần trước (mục 2.6), nên chỉ cần giữ lần cuối.
- **Chạy không đồng bộ để có giới hạn thời gian.** Hết giờ thì hủy và dùng lộ trình tốt nhất đang có.
- **Đọc `encoding.lp` bằng Python** thay vì để Clingo tự mở, vì Clingo trên Windows không mở được đường dẫn có dấu tiếng Việt.

### 3.4 Trạng thái trả về

| Trạng thái | Điều kiện | Ý nghĩa |
|---|---|---|
| `OPTIMAL` | Có nghiệm và Clingo tìm kiếm xong | Đã chứng minh không còn lộ trình tốt hơn |
| `SAT_NOT_PROVEN_OPTIMAL` | Có nghiệm nhưng hết giờ | Lộ trình hợp lệ, chưa biết có tối ưu không |
| `UNSAT` | Không có nghiệm | Không xếp được trong các kỳ còn lại với giả định đã nêu |
| `TIMEOUT` | Hết giờ, chưa có nghiệm nào | Chưa kết luận được gì |

### 3.5 Lần theo một kết quả

Kịch bản cơ sở trả về:

```
kỳ 262 ( 9 TC): CS301, CS302, MA102
kỳ 271 (11 TC): CS401, EL302, EL304, MA201
```

Vì sao xong ở kỳ 271 mà không sớm hơn? Còn 20 TC, mỗi kỳ tối đa 12, nên cần ít nhất 2 kỳ. Vì sao MA102 phải ở 262? MA201 bắt buộc và cần MA102 đạt trước; muốn xong trong 2 kỳ thì MA102 phải ở kỳ đầu. Vì sao không chọn EL301? Nó cần MA201 đạt trước nên sớm nhất là kỳ 272, làm trễ một kỳ.

Còn việc chọn EL302 và EL304 thì **không có lý do đặc biệt**: thay EL304 bằng EL303 ở kỳ 262 (đủ 12 TC, học cùng kỳ với CS301) cũng cho lộ trình tốt ngang bằng. Khi có nhiều lộ trình cùng điểm, Clingo trả về cái nó gặp, và bộ giải khác có thể trả cái khác. Đây là lý do tài liệu 3 so sánh hai bộ giải bằng giá trị mục tiêu chứ không so từng môn.

Kịch bản đòi học EL301 ngay kỳ 262 trả `UNSAT`: EL301 cần MA201, MA201 cần MA102, cả hai đều chưa đạt và không thể nằm trước kỳ đầu tiên.

---

## 4. Những lỗi dễ mắc khi viết ASP

Đây là các lỗi làm chương trình **vẫn chạy và trả kết quả**, chỉ là kết quả sai.

| Lỗi | Hậu quả | Cách phòng |
|---|---|---|
| Gõ sai tên predicate hoặc mã môn | Coi như không có, không báo lỗi (mục 2.3) | Kiểm tra đầu vào trong `facts.py`; test với đáp án xếp tay |
| Thiếu phần phân biệt trong `#sum` | Hai môn cùng tín chỉ chỉ được cộng một lần | Luôn kèm biến định danh: `{ Cr, C : ... }` |
| Quên ràng buộc "phải hoàn thành" | Nghiệm rỗng vẫn hợp lệ | Test kiểm tra tổng tín chỉ của lộ trình |
| Nhầm `not` với phủ định chắc chắn | Thiếu dữ liệu bị hiểu thành "chưa học" hoặc "có mở" | Ghi rõ giả định trong đầu ra |
| Biến chỉ xuất hiện sau `not` | Clingo báo lỗi "unsafe variable" | Mỗi biến phải xuất hiện ở ít nhất một điều kiện khẳng định |

Lưu ý riêng cho bản mẫu này: `solve.py` đang tắt thông báo "atom không xuất hiện ở vế trái luật nào", vì các predicate tùy chọn (`locked`, `prev`) thường không có fact. Cái giá là nếu gõ sai tên một predicate trong `encoding.lp` thì cũng không còn cảnh báo.

---

## 5. Đúc kết

**Clingo làm tốt:**
- Luật đọc được gần như câu chữ quy chế. Ba loại quan hệ môn học là ba dòng cùng khuôn, chỉ khác điều kiện.
- Thêm quy định là thêm dòng, không sửa thuật toán. What-if chỉ là thêm facts.
- Có bảo đảm: `OPTIMAL` nghĩa là đã chứng minh, `UNSAT` nghĩa là chắc chắn không có.

**Clingo làm chưa tốt:**
- Thiếu dữ liệu lặng lẽ thành sai, nên phải có lớp kiểm tra đầu vào bên ngoài.
- Chứng minh tối ưu chậm khi lý do nằm ở phép đếm tín chỉ. Ở cỡ 40 môn trở lên nó không chứng minh xong trong 20 giây (chi tiết ở tài liệu 3).

**Ba điều nên nhớ:**
1. Chỉ có một dòng tạo ra lựa chọn (`{ take(C, I) ... } 1`); phần còn lại là suy ra và loại bỏ.
2. `not` là "không chứng minh được", không phải "chắc chắn sai".
3. Tìm ra lộ trình tốt và chứng minh nó tốt nhất là hai việc khác nhau, và việc thứ hai mới là việc khó.

**Đọc tiếp:** [OR-Tools CP-SAT](2026-11-15-planner-2-ortools.md) giải cùng bài toán theo cách khác hẳn, và mạnh đúng ở chỗ Clingo yếu.
