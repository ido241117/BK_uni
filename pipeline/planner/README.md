# Planner: lập lộ trình học bằng Clingo

Bản mẫu chạy được từ đầu đến cuối: đọc JSON, sinh facts, giải bằng Clingo, trả lộ trình theo kỳ, rồi kiểm tra lại bằng một validator độc lập.

**Trạng thái:** bản mẫu trên dữ liệu bịa (14 môn). Chưa nhúng vào web, chưa đọc Supabase, luật chưa được đối chiếu với quy chế trường. Không dùng để tư vấn cho sinh viên thật.

## 1. Tổng quan pipeline

```
fixtures/toy.json ──► facts.py ──► facts (văn bản ASP) ─┐
   (dữ liệu + kịch bản)  (kiểm tra + dịch)              ├─► solve.py (Clingo) ──► JSON lộ trình
                                     encoding.lp ───────┘                             │
                                       (luật)                                         ▼
fixtures/toy.json ───────────────────────────────────────────────────────────► validate.py
   (đọc lại JSON gốc, không dùng facts hay Clingo)                              (danh sách vi phạm)
```

| File | Vai trò |
|---|---|
| `fixtures/toy.json` | Chương trình đào tạo, hồ sơ sinh viên và các kịch bản what-if |
| `facts.py` | Kiểm tra đầu vào, dịch JSON thành facts. Không suy luận gì |
| `encoding.lp` | Toàn bộ luật: lựa chọn, ràng buộc cứng, mục tiêu |
| `solve.py` | Gọi Clingo, đổi nghiệm về JSON, tính khác biệt giữa hai lộ trình |
| `validate.py` | Kiểm tra lộ trình bằng Python thuần, cố ý không dùng chung code với solver |
| `run_scenarios.py` | Chạy mọi kịch bản bằng Clingo và in kết quả |
| `solve_cpsat.py` | Bộ giải thứ hai bằng OR-Tools CP-SAT (mục 6) |
| `compare.py` | So sánh hai bộ giải và đo thời gian |
| `tests/test_planner.py` | Test với đáp án xếp tay |

Nguyên tắc tách lớp: **dữ liệu** nằm trong JSON, **luật** nằm trong `encoding.lp`. Đổi sinh viên hay đổi kịch bản thì chỉ đổi facts, không sửa luật.

## 2. Đầu vào

### 2.1 Cấu trúc fixture

Tên trường đặt theo entity của web để sau này xuất từ database ra là khớp. Khóa ngoại dùng mã môn thay cho uuid.

| Khối trong JSON | Entity web tương ứng | Nội dung |
|---|---|---|
| `curriculum` | `curricula` | Mã, khóa, `min_semester_credits`, `max_semester_credits` |
| `courses` | `courses` | `code`, `name`, `credits` |
| `curriculum_courses` | `curriculum_courses` | Môn thuộc chương trình, kỳ khuyến nghị (không phải ràng buộc) |
| `course_relations` | `course_relations` | `course_code`, `related_course_code`, `type` |
| `course_groups` | `course_groups` + members | `kind`, `required_count`, `required_credits`, `members` |
| `student.student_courses` | `student_courses` | Trạng thái từng môn |
| `semesters` | *(web chưa có)* | Danh sách kỳ theo thứ tự thời gian |
| `student.current_semester` | *(web chưa có)* | Kỳ sinh viên đang học |
| `offerings` | *(web chỉ có lịch sử)* | Môn không mở ở kỳ tương lai, và cách xử lý khi chưa biết |
| `scenarios` | *(web chưa có)* | Các kịch bản what-if |

Mã kỳ dạng `251`, `262` là quy ước tạm, chưa đối chiếu với định dạng `semester_code` thật của web.

### 2.2 Ngữ nghĩa quan hệ giữa các môn

Lấy theo comment trong enum `CourseRelationType` của web. Đây là cách web đang hiểu, chưa phải xác nhận của trường.

| `type` | Ý nghĩa | Rớt môn liên quan có thỏa không |
|---|---|---|
| `prerequisite` (TQ) | Môn liên quan phải **đạt** trước kỳ học | Không |
| `prior` (HT) | Môn liên quan phải **đã học** trước kỳ học | Có |
| `corequisite` (SHT) | Đã học trước **hoặc** học cùng kỳ | Có |
| `recommended` (KN) | Chỉ là gợi ý | Không xét, không xuất thành fact |

### 2.3 Trạng thái môn của sinh viên

| `status` | Đã đạt | Đã học |
|---|---|---|
| `completed` | Có | Có |
| `failed` | Không | Có |
| `in-progress` | Theo giả định của kịch bản | Có |
| `not-started` hoặc không có bản ghi | Không | Không |

### 2.4 Kịch bản

Mỗi kịch bản là một bộ giả định đặt lên cùng một hồ sơ:

```json
{
  "id": "fail-cs201",
  "in_progress_results": { "CS201": "fail", "CS202": "pass" },
  "locked":      [ { "course_code": "EL303", "semester_code": "262" } ],
  "not_offered": [ { "course_code": "CS302", "semester_code": "262" } ]
}
```

- `in_progress_results`: **bắt buộc** khai đậu hay rớt cho đúng từng môn đang học. Không có mặc định ngầm.
- `locked`: môn sinh viên nhất định học ở một kỳ.
- `not_offered`: giả định môn không mở ở một kỳ.

### 2.5 Kiểm tra đầu vào

`facts.py` từ chối (ném `FixtureError`) thay vì âm thầm bỏ qua khi gặp: mã môn trùng hoặc không tồn tại, loại quan hệ hay trạng thái lạ, khối tự chọn không có ngưỡng, **một môn thuộc hai khối**, thiếu giả định cho môn đang học, kỳ khóa nằm ngoài các kỳ sẽ xếp.

### 2.6 Facts sinh ra

Xem bằng `python -m planner.run_scenarios --facts base`. Kỳ được đánh số 1, 2, 3 theo thứ tự thời gian để so sánh trước sau.

```prolog
min_credits(3).  max_credits(12).
course("CS301", 3).
required("CS301").
group_credits("Tu chon", 6).
member("Tu chon", "EL301").
relation("CS301", "CS201", "prerequisite").
status("MA102", "failed").
status("CS201", "in-progress").
assume_result("CS201", "pass").
plan_semester(1, "262").  plan_semester(2, "271").  plan_semester(3, "272").
not_offered("EL303", 2).
locked("EL303", 1).        % chỉ khi kịch bản có khóa môn
prev("CS301", 1).          % lộ trình cơ sở, chỉ có ở kịch bản what-if
```

## 3. Solver và thuật toán

### 3.1 Clingo làm gì

Clingo là bộ giải Answer Set Programming. Ta không viết thuật toán xếp môn; ta **mô tả** thế nào là một lộ trình hợp lệ và thế nào là tốt hơn, Clingo tự tìm. Nó chạy hai bước:

1. **Grounding:** thay mọi biến (`C`, `I`, ...) bằng giá trị cụ thể từ facts. Luật "môn chưa đạt được xếp vào nhiều nhất một kỳ" biến thành một dòng cho từng môn chưa đạt, với từng kỳ.
2. **Solving:** tìm tổ hợp các `take(môn, kỳ)` thỏa mọi ràng buộc. Cách tìm là thử gán, khi gặp mâu thuẫn thì ghi nhớ nguyên nhân để không lặp lại (conflict-driven learning), nên không phải duyệt hết mọi tổ hợp.

Để tối ưu, mỗi lần tìm được một lộ trình, Clingo thêm yêu cầu "lộ trình sau phải tốt hơn" rồi tìm tiếp. Khi không còn lộ trình nào tốt hơn thì lộ trình cuối cùng được **chứng minh** là tối ưu.

### 3.2 Cấu trúc encoding: sinh, định nghĩa, loại

**Sinh (không gian lựa chọn).** Mỗi môn chưa đạt được xếp vào nhiều nhất một kỳ, hoặc không xếp:

```prolog
{ take(C, I) : sem(I) } 1 :- course(C, _), not passed(C).
```

**Định nghĩa (khái niệm phụ suy ra từ lựa chọn).**

```prolog
passed(C)    :- status(C, "completed").
passed(C)    :- status(C, "in-progress"), assume_result(C, "pass").
attempted(C) :- status(C, _).
done(C)      :- passed(C).
done(C)      :- take(C, _).                  % môn xếp trong tương lai được giả định đậu
take_before(C, I) :- take(C, J), sem(I), J < I.
load(I, L)   :- sem(I), L = #sum { Cr, C : take(C, I), course(C, Cr) }.
```

**Loại (ràng buộc cứng).** Dòng bắt đầu bằng `:-` đọc là "không được phép xảy ra".

| Ràng buộc | Luật |
|---|---|
| Đủ môn bắt buộc | `:- required(C), not done(C).` |
| Đủ tín chỉ khối tự chọn | `:- group_credits(G, N), #sum { Cr, C : member(G, C), done(C), course(C, Cr) } < N.` |
| Đủ số môn khối tự chọn | `:- group_count(G, N), #count { C : member(G, C), done(C) } < N.` |
| Tiên quyết | `:- take(C, I), relation(C, R, "prerequisite"), not passed(R), not take_before(R, I).` |
| Học trước | `:- take(C, I), relation(C, R, "prior"), not attempted(R), not take_before(R, I).` |
| Song hành | `:- take(C, I), relation(C, R, "corequisite"), not attempted(R), not take_before(R, I), not take(R, I).` |
| Môn không mở | `:- take(C, I), not_offered(C, I).` |
| Môn bị khóa | `:- locked(C, I), not take(C, I).` |
| Tối đa tín chỉ | `:- load(I, L), max_credits(M), L > M.` |
| Tối thiểu tín chỉ | `:- used_after(I), load(I, L), min_credits(M), L < M.` |

Mức tối thiểu áp dụng cho mọi kỳ **trừ kỳ cuối cùng có môn**, vì kỳ cuối thường chỉ còn vài môn. Hệ quả: không được bỏ trống một kỳ ở giữa.

### 3.3 Mục tiêu (ràng buộc mềm)

Vi phạm vẫn hợp lệ, chỉ kém hơn. Số sau `@` là mức ưu tiên; mức cao được tối ưu xong hẳn rồi mới xét mức thấp.

```prolog
#minimize { I @ 3 : last(I) }.                           % 1. học xong sớm nhất
#minimize { Cr @ 2, C : take(C, _), course(C, Cr) }.      % 2. không học thừa tín chỉ
#minimize { 1 @ 1, C, I : prev(C, I), not take(C, I) }.   % 3. ít khác lộ trình cũ nhất
```

Mục tiêu 3 chỉ có tác dụng ở kịch bản what-if: lộ trình cơ sở được đưa vào dưới dạng `prev`, nên lộ trình mới chỉ đổi những gì buộc phải đổi. Nhờ vậy phần khác biệt in ra phản ánh tác động thật của giả định, không phải do solver chọn ngẫu nhiên giữa các phương án ngang nhau.

Thứ tự ưu tiên này là lựa chọn của bản mẫu, chưa có căn cứ từ khảo sát sinh viên.

### 3.4 Cách chạy what-if

`run_scenarios.py` giải kịch bản đầu tiên làm cơ sở, rồi với mỗi kịch bản sau: sinh facts mới (giả định khác) kèm `prev` từ lộ trình cơ sở, giải lại, và so sánh. Không có thuật toán riêng cho từng loại what-if.

## 4. Đầu ra

### 4.1 JSON kết quả

Ghi ra file bằng `--json output/planner.json`. Một phần tử cho mỗi kịch bản:

```json
{
  "scenario_id": "fail-cs201",
  "label": "Rot CS201 dang hoc",
  "curriculum": "TOY-2025",
  "status": "OPTIMAL",
  "assumptions": [
    "Mon dang hoc CS201: gia dinh rot",
    "Moi mon xep trong tuong lai duoc gia dinh se dau",
    "Mon khong co thong tin mo lop duoc gia dinh la co mo (assume-open)"
  ],
  "semesters": [
    { "semester_code": "262", "courses": ["CS201", "MA102"], "credits": 7 },
    { "semester_code": "271", "courses": ["CS301", "CS302", "EL304", "MA201"], "credits": 12 },
    { "semester_code": "272", "courses": ["CS401", "EL303"], "credits": 5 }
  ],
  "graduation_semester": "272",
  "violations": [],
  "diff_vs_base": ["+ CS201 them vao ky 262", "~ CS301 doi 262 -> 271"]
}
```

### 4.2 Ý nghĩa của `status`

| Giá trị | Nghĩa |
|---|---|
| `OPTIMAL` | Có lộ trình và đã chứng minh không có lộ trình nào tốt hơn **theo các luật và mục tiêu đã khai** |
| `SAT_NOT_PROVEN_OPTIMAL` | Có lộ trình hợp lệ nhưng hết giờ trước khi chứng minh tối ưu |
| `UNSAT` | Không có lộ trình thỏa mọi ràng buộc **trong các kỳ còn lại của fixture, với các giả định đã nêu**. Không có nghĩa là sinh viên không thể tốt nghiệp |
| `TIMEOUT` | Hết giờ (mặc định 30 giây) mà chưa có lộ trình nào |

### 4.3 Validator

`validate.py` nhận JSON gốc, kịch bản và lộ trình, rồi tự kiểm tra lại mọi ràng buộc cứng bằng Python. Nó không import `facts.py`, `solve.py` hay Clingo, nên lỗi trong exporter hoặc encoding sẽ lộ ra dưới dạng vi phạm. `violations` rỗng nghĩa là lộ trình hợp lệ.

Giới hạn: validator chỉ kiểm tra tính hợp lệ, không kiểm tra tối ưu. Nó và solver cùng dựa trên một cách hiểu quy chế, nên nếu cách hiểu đó sai thì cả hai sai giống nhau.

### 4.4 Kết quả trên fixture mẫu

Sinh viên đang ở kỳ 261, đã đậu MA101, CS101, CS102, rớt MA102, đang học CS201 và CS202.

| Kịch bản | Trạng thái | Học xong | Lộ trình |
|---|---|---|---|
| `base` | OPTIMAL | 271 | 262: CS301, CS302, MA102 · 271: CS401, EL302, EL304, MA201 |
| `lock-electives` | OPTIMAL | 272 | 262: CS301, CS302, EL303, EL304 · 271: CS401, MA102 · 272: MA201 |
| `fail-cs201` | OPTIMAL | 272 | 262: CS201, MA102 · 271: CS301, CS302, EL304, MA201 · 272: CS401, EL303 |
| `cs302-not-offered` | OPTIMAL | 272 | 262: CS301, MA102 · 271: CS302, EL304, MA201 · 272: CS401, EL302 |
| `lock-impossible` | UNSAT | — | EL301 thiếu tiên quyết MA201 |

## 5. Cách chạy

Chạy từ thư mục `pipeline`. Lần đầu cần tạo môi trường:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r planner/requirements.txt
```

```bash
.venv/Scripts/python -m planner.run_scenarios                          # chạy mọi kịch bản
.venv/Scripts/python -m planner.run_scenarios --facts base             # xem facts của một kịch bản
.venv/Scripts/python -m planner.run_scenarios --json output/planner.json
.venv/Scripts/python -m pytest planner -q                              # 23 test
```

Lưu ý: Clingo trên Windows không mở được file có dấu tiếng Việt trong đường dẫn, nên `solve.py` đọc `encoding.lp` bằng Python rồi mới đưa nội dung vào Clingo.

## 6. Bộ giải thứ hai: OR-Tools CP-SAT

`solve_cpsat.py` giải cùng bài toán bằng OR-Tools CP-SAT. Nó nhận cùng JSON và kịch bản, trả cùng dạng JSON, nhưng viết độc lập: đọc thẳng JSON, không đi qua facts hay `encoding.lp`.

**Mô hình.** Biến `x[c, i] = 1` nếu môn `c` xếp vào kỳ thứ `i`. Mọi ràng buộc ở mục 3.2 được viết lại thành bất đẳng thức tuyến tính, ví dụ tiên quyết: `x[c, i] <= tổng x[r, j] với j < i`. Ba mức ưu tiên của mục tiêu được gộp thành một tổng có trọng số đủ lớn để mức cao luôn thắng mức thấp.

**So sánh** (`python -m planner.compare`, thêm `--benchmark` cho dữ liệu sinh ngẫu nhiên). Hai bộ giải có thể trả hai lộ trình khác nhau mà vẫn đúng, nên chỉ so bộ ba mục tiêu (kỳ cuối, tổng tín chỉ, số thay đổi), tính lại từ JSON kết quả.

| Dữ liệu | Clingo | CP-SAT (1 luồng) | Mục tiêu |
|---|---|---|---|
| 5 kịch bản `toy.json` (14 môn) | OPTIMAL/UNSAT, 4–25 ms | OPTIMAL/UNSAT, 2–14 ms | Khớp cả 5 |
| Sinh ngẫu nhiên 20 môn, 8 kỳ | OPTIMAL, 18–37 ms | OPTIMAL, 48–63 ms | Khớp cả 3 |
| 40, 60, 80 môn, 8 kỳ | Có lộ trình nhưng **không chứng minh xong tối ưu trong 20 giây** | OPTIMAL, 80–250 ms | Cùng giá trị ở cả 9 bài |

Đo ngày 15/11/2026, Clingo 5.8.3, OR-Tools 9.15, giới hạn 20 giây, 3 seed mỗi cỡ. Chế độ `--opt-strategy=usc` của Clingo còn kém hơn: không ra lộ trình nào trong 20 giây ở cỡ 40 môn trở lên.

Cách đọc kết quả này:
- Lộ trình Clingo tìm được ở cỡ lớn **có cùng giá trị mục tiêu** với nghiệm CP-SAT đã chứng minh tối ưu; cái Clingo thiếu là phần chứng minh.
- Nguyên nhân đã được xác định bằng `python -m planner.compare --diagnose`: Clingo kẹt ở việc chứng minh "không thể xong sớm hơn một kỳ", vốn là một phép đếm tín chỉ. Tắt nới lỏng tuyến tính thì CP-SAT cũng kẹt tương tự. Chi tiết: `docs/2026-11-15-planner-3-so-sanh.md`.
- So sánh chỉ đúng cho **encoding này với cấu hình mặc định**. Encoding ASP có thể còn tối ưu được; dữ liệu là sinh ngẫu nhiên, chưa phải chương trình thật.

**Mỗi bộ giải hợp với việc gì**

| | Clingo | CP-SAT |
|---|---|---|
| Luật viết ra | Gần câu chữ quy chế, dễ đọc và giải thích | Bất đẳng thức, khó đọc hơn |
| Luật logic phức tạp (AND/OR lồng nhau, ngoại lệ, suy diễn) | Tự nhiên | Phải tự đổi sang biến phụ |
| Ràng buộc và mục tiêu số học (tín chỉ, cân bằng tải) | Yếu ở cỡ lớn | Mạnh |
| Chứng minh tối ưu ở cỡ chương trình thật | Chưa đạt trong thử nghiệm | Dưới 1 giây |
| Liệt kê mọi lộ trình hợp lệ | Có sẵn | Có nhưng kém tiện |

**Lợi ích của việc có hai bộ giải**
- **Đối chiếu chéo:** hai cách viết độc lập cho cùng giá trị mục tiêu là bằng chứng mạnh hơn nhiều so với một bộ giải tự kiểm tra. Test `test_cpsat_agrees_with_clingo_*` chạy việc này tự động.
- **Dùng được ở cỡ thật:** CP-SAT trả lời what-if trong vài trăm mili giây kèm chứng minh tối ưu.
- **Có số liệu so sánh thật** giữa hai hướng mà tài liệu của nhóm đang phân vân (CP-SAT ở bản 28/10, Clingo ở bản 05/11).

Giới hạn ở mục 7 áp dụng cho cả hai bộ giải, vì chúng cùng dựa trên một cách hiểu quy chế.

## 7. Giới hạn hiện tại

**Ngữ nghĩa**
- Mọi môn xếp trong tương lai được giả định đậu; lộ trình là kịch bản lạc quan.
- Ngữ nghĩa TQ/HT/SHT lấy từ code web, chưa đối chiếu quy chế.
- Môn không rõ có mở hay không được coi là có mở.
- Môn bị khóa là ràng buộc cứng: không khả thi thì trả UNSAT, chưa gợi ý phương án gần nhất.

**Phạm vi chưa hỗ trợ**
- Tiên quyết dạng AND/OR, môn tương đương hoặc thay thế.
- Môn thuộc nhiều khối, khối chuyên ngành, khối tự chọn tự do (`pool_scope = any`).
- Kỳ hè, điều kiện ngoài môn học (ngoại ngữ, thể chất, GPA).
- Độ nặng nhẹ thực tế của môn; chỉ đếm tín chỉ.

**Kết quả**
- UNSAT chưa kèm giải thích vướng ràng buộc nào.
- Chỉ trả một lộ trình dù có thể có nhiều lộ trình tốt ngang nhau.
- Mới thử trên 14 môn bịa; chưa đo thời gian và độ đúng trên chương trình thật.
