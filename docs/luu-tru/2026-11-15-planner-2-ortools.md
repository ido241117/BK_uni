# Planner 2/3 — OR-Tools CP-SAT: lý thuyết và code

Ngày viết: 15/11/2026. Bộ ba tài liệu, đọc theo thứ tự:

1. [Clingo](2026-11-15-planner-1-clingo.md): mô tả bài toán bằng luật logic.
2. **OR-Tools CP-SAT** (file này): mô tả cùng bài toán bằng bất đẳng thức.
3. [So sánh và định hướng](2026-11-15-planner-3-so-sanh.md): kết quả đo, kết luận, việc tiếp theo.

File này giả định bạn đã đọc tài liệu 1: bài toán, sinh viên mẫu và các ràng buộc được giới thiệu ở đó. Ở đây ta viết lại **đúng những ràng buộc ấy** theo cách khác. Đọc xong bạn sẽ hiểu: CP-SAT là gì, cách đổi một quy định thành bất đẳng thức, từng khối trong `solve_cpsat.py` làm gì, và vì sao nó chứng minh tối ưu nhanh.

**Phạm vi:** như tài liệu 1, bản mẫu trên dữ liệu bịa, luật chưa đối chiếu quy chế trường.

---

## 1. OR-Tools và CP-SAT là gì

OR-Tools là thư viện tối ưu hóa mã nguồn mở của Google, gồm nhiều bộ giải cho các loại bài toán khác nhau (định tuyến xe, quy hoạch tuyến tính, lập lịch...). Ta chỉ dùng một bộ giải trong đó: **CP-SAT**, dành cho bài toán có biến nguyên và ràng buộc tổ hợp.

Cũng như Clingo, CP-SAT là mô tả chứ không ra lệnh. Khác ở **ngôn ngữ mô tả**:

| | Clingo | CP-SAT |
|---|---|---|
| Mô tả bằng | Luật logic: "nếu ... thì ...", "không được phép ..." | Biến số và bất đẳng thức: `x + y <= 12` |
| Viết ở đâu | File `.lp` riêng | Code Python gọi thư viện |
| Thứ chưa nói tới | Mặc định là sai | Không có mặc định; mọi biến phải được khai báo |

---

## 2. Lý thuyết

### 2.1 Ba thành phần của một mô hình

1. **Biến:** mỗi biến có một miền giá trị. Ở đây gần như toàn biến 0/1.
2. **Ràng buộc:** quan hệ giữa các biến mà nghiệm phải thỏa. Ở đây gần như toàn bất đẳng thức tuyến tính.
3. **Mục tiêu:** một biểu thức cần nhỏ nhất.

Nghiệm là một cách gán giá trị cho mọi biến thỏa mọi ràng buộc.

### 2.2 Biến quyết định của bài toán

```
x[c, i] = 1  nếu môn c được xếp vào kỳ thứ i
x[c, i] = 0  nếu không
```

Chỉ tạo biến cho môn **chưa đạt**. Với sinh viên mẫu ở kịch bản cơ sở: 9 môn chưa đạt × 3 kỳ = 27 biến. Chúng tương ứng chính xác với các `take(C, I)` của Clingo.

### 2.3 Cách đổi quy định thành bất đẳng thức

Toàn bộ kỹ năng mô hình hóa nằm ở bốn mẫu sau. Mọi ràng buộc trong code đều là một trong số chúng.

**Mẫu 1 — "Nhiều nhất một".** Vì các biến là 0/1, tổng của chúng chính là số biến bằng 1.

```
x[c,1] + x[c,2] + x[c,3] <= 1        môn c nằm ở nhiều nhất một kỳ
```

**Mẫu 2 — "Nếu A thì B".** Với hai biến 0/1, `A <= B` cấm đúng một trường hợp: A = 1 mà B = 0.

```
x[CS401, 2] <= x[CS301, 1]           muốn học CS401 ở kỳ 2 thì CS301 phải ở kỳ 1
```

Tổng quát: `x[c, i] <= tổng x[r, j] với j < i`. Vế phải bằng 1 khi r được xếp ở một kỳ trước i, bằng 0 khi không.

**Mẫu 3 — Tổng có trọng số.** Nhân biến 0/1 với số tín chỉ rồi cộng lại là ra tổng tín chỉ.

```
3·x[CS301,1] + 3·x[CS302,1] + 3·x[MA102,1] + ... <= 12      tải kỳ 1 không quá 12
```

**Mẫu 4 — Ràng buộc có điều kiện.** Đôi khi một ràng buộc chỉ áp dụng trong một hoàn cảnh. CP-SAT cho gắn một biến 0/1 làm công tắc:

```python
model.add(load[i] >= 3).only_enforce_if(used_after)
```

Ràng buộc chỉ có hiệu lực khi `used_after = 1`.

### 2.4 CP-SAT giải như thế nào

CP-SAT kết hợp ba kỹ thuật. Hiểu ở mức ý tưởng là đủ để đọc kết quả.

**a) Lõi CDCL.** Giống Clingo: đoán, lan truyền, gặp mâu thuẫn thì học thêm ràng buộc và quay lui (tài liệu 1, mục 2.5).

**b) Lan truyền trên số nguyên.** Mỗi ràng buộc số học tự thu hẹp miền giá trị. Ví dụ kỳ 1 đã xếp 10 TC và trần là 12: mọi môn 3 TC còn lại bị loại khỏi kỳ 1 ngay, không cần thử.

**c) Nới lỏng tuyến tính (LP relaxation).** Đây là khác biệt quyết định. CP-SAT tạm cho phép biến nhận giá trị thập phân trong khoảng 0 đến 1, khi đó bài toán thành quy hoạch tuyến tính và giải được rất nhanh. Lời giải thập phân không dùng được trực tiếp, nhưng giá trị mục tiêu của nó là **cận dưới chắc chắn**: bài toán thật không thể tốt hơn con số đó.

Ví dụ với sinh viên mẫu: còn 20 TC, mỗi kỳ tối đa 12. Chỉ từ phép chia 20 / 12 ≈ 1,67, bài toán nới lỏng đã kết luận cần hơn 1 kỳ, tức ít nhất 2 kỳ. Không cần thử một cách xếp nào.

### 2.5 Tối ưu: hai cận ép vào nhau

CP-SAT theo dõi đồng thời hai con số:

- **Cận trên:** giá trị của lộ trình tốt nhất đã tìm được.
- **Cận dưới:** giá trị mà không lộ trình nào có thể tốt hơn (từ LP và từ suy luận).

Khi hai cận bằng nhau, lộ trình hiện có được chứng minh là tối ưu.

So với Clingo (tài liệu 1, mục 2.6): Clingo chỉ có cận trên và phải chứng minh "không còn gì tốt hơn" bằng tìm kiếm. CP-SAT có thêm cận dưới tính bằng số học, nên thường dừng được ngay khi tìm thấy lộ trình chạm cận.

---

## 3. Code: `solve_cpsat.py`

[solve_cpsat.py](../pipeline/planner/solve_cpsat.py) nhận cùng đầu vào và trả cùng dạng đầu ra với `solve.py`:

```
toy.json ──► solve_cpsat.py ──► JSON lộ trình
```

Nó **đọc thẳng JSON**, không qua `facts.py` hay `encoding.lp`. Đây là chủ ý: hai bộ giải được viết độc lập để có thể kiểm tra chéo nhau. Chỉ dùng chung hai thứ không liên quan tới logic giải: `validate_input` (kiểm tra đầu vào) và `make_result` (đóng gói đầu ra).

Bảng dưới là bản đồ của cả file, đối chiếu với Clingo:

| Quy định | Clingo (`encoding.lp`) | CP-SAT (`solve_cpsat.py`) | Mẫu |
|---|---|---|---|
| Mỗi môn nhiều nhất một kỳ | `{ take(C,I) : sem(I) } 1` | `taken[c] <= 1` | 1 |
| Đủ môn bắt buộc | `:- required(C), not done(C).` | `done(c) == 1` | — |
| Đủ tín chỉ tự chọn | `#sum {...} < N` bị cấm | `sum(credits·done) >= N` | 3 |
| Tiên quyết, học trước | `not take_before(R, I)` bị cấm | `x[c,i] <= before(r, i)` | 2 |
| Song hành | thêm `not take(R, I)` | `x[c,i] <= before(r, i, inclusive=True)` | 2 |
| Môn không mở | `:- take(C,I), not_offered(C,I).` | `x[c,i] == 0` | — |
| Môn bị khóa | `:- locked(C,I), not take(C,I).` | `x[c,i] == 1` | — |
| Tối đa tín chỉ | `:- load(I,L), L > M.` | `load[i] <= max` | 3 |
| Tối thiểu tín chỉ | `:- used_after(I), load(I,L), L < M.` | `load[i] >= min` nếu `used_after` | 4 |

### 3.1 Tình trạng hiện tại: tính bằng Python

```python
passed, attempted = set(), set()
for sc in fixture["student"]["student_courses"]:
    code, status = sc["course_code"], sc["status"]
    if status == "not-started":
        continue
    attempted.add(code)
    if status == "completed" or (
        status == "in-progress" and scenario["in_progress_results"][code] == "pass"
    ):
        passed.add(code)
```

Khác biệt đầu tiên với Clingo: ở đó `passed` và `attempted` là luật, bộ giải tự suy ra. Ở đây chúng là **dữ liệu đã biết trước khi giải**, nên tính luôn bằng Python và không tốn biến nào. Bộ giải chỉ nhận phần thật sự cần quyết định.

### 3.2 Biến

```python
x = {(c, i): model.new_bool_var(f"x_{c}_{i}")
     for c in credits if c not in passed for i in sems}
open_courses = [c for c in credits if c not in passed]
taken = {c: sum(x[c, i] for i in sems) for c in open_courses}
for c in open_courses:
    model.add(taken[c] <= 1)
```

`taken[c]` không phải biến mới mà là một **biểu thức**: tổng các `x` của môn c. Nó bằng 1 nếu môn được xếp, 0 nếu không. Dòng cuối là mẫu 1.

Hai hàm tiện ích dùng khắp file:

```python
def done(c):                       # môn c sẽ hoàn thành khi kết thúc lộ trình?
    return 1 if c in passed else taken[c]

def before(c, i, inclusive=False): # c được xếp trước kỳ i? (hoặc cả kỳ i)
    if c not in taken:
        return 0
    return sum(x[c, j] for j in sems if j < i or (inclusive and j == i))
```

`done` trả về số `1` cho môn đã đạt và một biểu thức cho môn chưa đạt. Nhờ vậy các ràng buộc tốt nghiệp viết một lần cho cả hai trường hợp. Cũng như ở Clingo, `done` chứa giả định "môn đã xếp thì sẽ đậu".

### 3.3 Tốt nghiệp

```python
for group in fixture["course_groups"]:
    members = [c for c in group["members"] if c in credits]
    if group["kind"] == "required":
        for c in members:
            model.add(done(c) == 1)
        continue
    if group["required_credits"] is not None:
        model.add(sum(credits[c] * done(c) for c in members) >= group["required_credits"])
    if group["required_count"] is not None:
        model.add(sum(done(c) for c in members) >= group["required_count"])
```

Với sinh viên mẫu, ràng buộc khối tự chọn là:

```
3·taken[EL301] + 3·taken[EL302] + 3·taken[EL303] + 3·taken[EL304] >= 6
```

So với Clingo: ở đó phải nhớ viết `{ Cr, C : ... }` để hai môn cùng tín chỉ không bị gộp. Ở đây không có bẫy đó, vì mỗi môn là một số hạng riêng trong tổng.

### 3.4 Quan hệ giữa các môn

```python
for rel in fixture["course_relations"]:
    c, r, kind = rel["course_code"], rel["related_course_code"], rel["type"]
    if c not in taken or kind == "recommended":
        continue
    if kind == "prerequisite":
        satisfied, inclusive = r in passed, False
    elif kind == "prior":
        satisfied, inclusive = r in attempted, False
    else:  # corequisite
        satisfied, inclusive = r in attempted, True
    if satisfied:
        continue
    for i in sems:
        model.add(x[c, i] <= before(r, i, inclusive))
```

Ba loại quan hệ chỉ khác nhau ở hai tham số, đúng như bảng trong tài liệu 1:

| Loại | Đã thỏa sẵn khi | Cùng kỳ có được không |
|---|---|---|
| Tiên quyết | r đã **đạt** | Không |
| Học trước | r đã **học** | Không |
| Song hành | r đã **học** | Có (`inclusive=True`) |

Nếu quan hệ đã thỏa sẵn thì **không tạo ràng buộc nào**. Nếu chưa, dòng cuối là mẫu 2, lặp cho từng kỳ.

Ví dụ: MA201 cần tiên quyết MA102, và MA102 đã rớt nên chưa thỏa sẵn. Code sinh ra ba bất đẳng thức:

```
x[MA201,1] <= 0                               không thể học MA201 ở kỳ 1
x[MA201,2] <= x[MA102,1]                      kỳ 2 chỉ khi MA102 ở kỳ 1
x[MA201,3] <= x[MA102,1] + x[MA102,2]         kỳ 3 chỉ khi MA102 ở kỳ 1 hoặc 2
```

### 3.5 Mở môn và lựa chọn của sinh viên

```python
for rec in blocked:                                  # not-offered trong fixture + kịch bản
    key = (rec["course_code"], index.get(rec["semester_code"]))
    if key in x:
        model.add(x[key] == 0)
for item in scenario.get("locked", []):
    key = (item["course_code"], index[item["semester_code"]])
    if key in x:
        model.add(x[key] == 1)
    else:
        model.add_bool_or([])    # khóa một môn đã đạt: không thể thỏa
```

What-if ở đây cũng đơn giản như ở Clingo: mỗi giả định là một dòng ghim biến về 0 hoặc 1.

Dòng cuối xử lý một trường hợp biên: sinh viên khóa một môn đã đạt. Môn đó không có biến, nên code thêm một ràng buộc luôn sai để mô hình vô nghiệm, khớp với hành vi của Clingo.

### 3.6 Tín chỉ mỗi kỳ

```python
load = {i: sum(credits[c] * x[c, i] for c in open_courses) for i in sems}
used = {i: model.new_bool_var(f"used_{i}") for i in sems}
for i in sems:
    model.add(load[i] <= cur["max_semester_credits"])        # mẫu 3
    for c in open_courses:
        model.add_implication(x[c, i], used[i])              # có môn  => kỳ được dùng
    model.add(sum(x[c, i] for c in open_courses) >= used[i]) # được dùng => có môn
```

`used[i]` là biến phụ: kỳ i có môn hay không. Ở Clingo chỉ cần một luật `used(I) :- take(_, I).` vì ASP tự hiểu "không có lý do thì sai". CP-SAT không có mặc định đó, nên phải ràng buộc **cả hai chiều**: có môn thì `used = 1`, và `used = 1` thì phải có môn. Thiếu chiều thứ hai, bộ giải được tự do đặt `used = 1` cho một kỳ trống.

```python
for i in sems:
    later = [used[j] for j in sems if j > i]
    if not later:
        continue
    used_after = model.new_bool_var(f"used_after_{i}")
    model.add_max_equality(used_after, later)                # = 1 nếu có kỳ sau được dùng
    model.add(load[i] >= cur["min_semester_credits"]).only_enforce_if(used_after)   # mẫu 4
```

Mức tối thiểu chỉ áp dụng khi còn kỳ sau có môn. `add_max_equality` đặt `used_after` bằng giá trị lớn nhất trong các `used` phía sau, tức là phép "hoặc".

### 3.7 Mục tiêu: gộp ba mức ưu tiên thành một số

Clingo có sẵn cú pháp `@3`, `@2`, `@1`. CP-SAT chỉ tối ưu **một** biểu thức, nên ba mức được gộp bằng trọng số:

```python
last = model.new_int_var(0, n, "last")
for i in sems:
    model.add(last >= i * used[i])           # last >= chỉ số của mọi kỳ được dùng
total_credits = sum(credits[c] * taken[c] for c in open_courses)
prev = [(c, index[s]) for c, s in (previous_plan or {}).items() if s in index]
changes = sum((1 - x[c, i]) if (c, i) in x else 1 for c, i in prev)

w_credits = len(prev) + 1
w_last = w_credits * (sum(credits[c] for c in open_courses) + 1)
model.minimize(w_last * last + w_credits * total_credits + changes)
```

Biến `last` chỉ bị chặn dưới, nhưng vì ta đang tối thiểu hóa nên bộ giải sẽ tự đẩy nó xuống đúng bằng chỉ số kỳ cuối.

**Vì sao trọng số này đúng.** Yêu cầu: mức cao phải luôn thắng mức thấp, dù mức thấp tệ đến đâu.

- `changes` lớn nhất là `len(prev)`, nhỏ hơn `w_credits`. Nên giảm 1 tín chỉ luôn có lợi hơn mọi mức tăng số thay đổi.
- `w_credits · total_credits + changes` lớn nhất vẫn nhỏ hơn `w_last`. Nên xong sớm 1 kỳ luôn có lợi hơn mọi mức tăng tín chỉ và số thay đổi.

Ví dụ ở kịch bản khóa hai môn tự chọn: `len(prev) = 7` nên `w_credits = 8`; tổng tín chỉ các môn chưa đạt là 26 nên `w_last = 8 × 27 = 216`. Lộ trình (kỳ cuối 3, 20 TC, 4 thay đổi) có giá trị `216×3 + 8×20 + 4 = 812`.

**Cái giá của cách này:** với chương trình rất lớn, trọng số có thể thành số rất to. Ở cỡ đồ án thì không đáng lo. Cách sạch hơn là giải ba lần, mỗi lần một mức, và ghim kết quả mức trước; chưa cần làm ở bản mẫu.

### 3.8 Giải và đọc kết quả

```python
solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = time_limit
solver.parameters.num_workers = 1
code = solver.solve(model)

if code == cp_model.INFEASIBLE:
    return make_result(fixture, scenario, "cp-sat", "UNSAT", None)
if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    return make_result(fixture, scenario, "cp-sat", "TIMEOUT", None)
takes = [(c, i) for (c, i), var in x.items() if solver.value(var)]
status = "OPTIMAL" if code == cp_model.OPTIMAL else "SAT_NOT_PROVEN_OPTIMAL"
```

| CP-SAT trả về | Trạng thái chung | Ý nghĩa |
|---|---|---|
| `OPTIMAL` | `OPTIMAL` | Hai cận đã gặp nhau |
| `FEASIBLE` | `SAT_NOT_PROVEN_OPTIMAL` | Có lộ trình, hết giờ trước khi chứng minh |
| `INFEASIBLE` | `UNSAT` | Chắc chắn không có lộ trình |
| Khác | `TIMEOUT` | Chưa kết luận được |

`num_workers = 1` là chủ ý. Mặc định CP-SAT chạy nhiều chiến lược song song trên mọi nhân CPU, nhanh hơn nhưng kết quả giữa các nghiệm ngang điểm có thể đổi giữa các lần chạy, và so thời gian với Clingo (một luồng) sẽ không công bằng.

---

## 4. Những lỗi dễ mắc khi mô hình hóa CP-SAT

| Lỗi | Hậu quả | Cách phòng |
|---|---|---|
| Biến phụ chỉ ràng buộc một chiều | Bộ giải tự đặt giá trị có lợi cho nó, ví dụ `used = 1` ở kỳ trống | Luôn hỏi: biến này có bị ép cả lúc bằng 0 lẫn lúc bằng 1 không? |
| Trọng số gộp mục tiêu quá nhỏ | Mức ưu tiên thấp lấn mức cao, kết quả sai mà không báo lỗi | Chứng minh bằng cận như mục 3.7; test đối chiếu với Clingo |
| Quên trường hợp không có biến | Lỗi `KeyError`, hoặc tệ hơn là bỏ sót ràng buộc | Kiểm tra `if key in x` và quyết định rõ nghĩa của nhánh còn lại |
| Hiểu sai mẫu 2 khi vế phải là tổng | Tổng có thể lớn hơn 1 nếu quên ràng buộc "nhiều nhất một" | Giữ `taken[c] <= 1` ngay cạnh định nghĩa biến |
| Dịch sai quy định sang bất đẳng thức | Mô hình giải đúng một bài toán khác | Viết bảng chân trị cho ví dụ nhỏ; đối chiếu với bộ giải thứ hai |

So với Clingo, lỗi ở đây dịch chuyển: Clingo dễ sai vì **thiếu dữ liệu lặng lẽ thành sai**; CP-SAT dễ sai vì **bước dịch từ lời sang bất đẳng thức** do người làm, và bất đẳng thức khó đọc lại hơn luật.

---

## 5. Đúc kết

**CP-SAT làm tốt:**
- Số học là tự nhiên: trần tín chỉ, tổng tín chỉ, đếm số thay đổi đều là một dòng.
- Có cận dưới từ nới lỏng tuyến tính, nên chứng minh tối ưu nhanh. Ở cỡ 80 môn vẫn dưới 1 giây.
- Dữ liệu đã biết được xử lý bằng Python trước, bộ giải chỉ nhận phần cần quyết định.

**CP-SAT làm chưa tốt:**
- Mô hình khó đọc hơn. `x[c,i] <= before(r,i)` cần giải thích; luật ASP tương ứng thì gần như tự nói.
- Mọi khái niệm phụ phải tự dựng bằng biến và ràng buộc hai chiều.
- Quy định kiểu logic lồng nhau (ví dụ "(A hoặc B) và C") phải tự đổi sang biến phụ, dễ sai hơn viết luật.

**Ba điều nên nhớ:**
1. Mọi ràng buộc trong file là một trong bốn mẫu ở mục 2.3.
2. CP-SAT không có "mặc định là sai": biến phụ phải được ràng buộc cả hai chiều.
3. Nó nhanh vì có cận dưới bằng số học, không phải vì tìm kiếm giỏi hơn.

**Đọc tiếp:** [So sánh và định hướng](2026-11-15-planner-3-so-sanh.md) đặt hai bộ giải cạnh nhau trên cùng dữ liệu, chỉ ra chính xác chỗ Clingo chậm, và đề xuất dùng mỗi bộ giải vào việc gì.
