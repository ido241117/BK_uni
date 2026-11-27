# Planner: lập lộ trình học (CP-SAT và engine ASP)

Bản mẫu chạy được từ đầu đến cuối: đọc JSON, giải bằng một trong hai bộ giải, trả lộ trình theo kỳ, rồi kiểm tra lại bằng một validator độc lập.

> **Từ 20/11/2026:** lựa chọn `clingo` là **engine ASP** (`pipeline/engine/asp/core`, từ nhánh `research-pipeline`) qua adapter `solve_asp.py`. Encoding Clingo cũ (`encoding.lp`, `solve.py`) đã bỏ. Đầu vào, đầu ra và khác biệt của engine ASP: [ASP-ADAPTER.md](ASP-ADAPTER.md). Các mục 2.6 và 3 dưới đây đã rút gọn tương ứng; mục 4.4 và 6 giữ số liệu của CP-SAT và encoding cũ.

**Trạng thái:** bản mẫu trên dữ liệu bịa (14 môn). Chưa nhúng vào web, chưa đọc Supabase, luật chưa được đối chiếu với quy chế trường. Không dùng để tư vấn cho sinh viên thật.

## 1. Tổng quan pipeline

```
                                   ┌─► solve_cpsat.py (CP-SAT) ──────────────┐
fixtures/toy.json ──► normalize ──►┤                                         ├─► result.py ──► JSON lộ trình
   (dữ liệu + kịch bản)  + facts.py└─► solve_asp.py ─► engine ASP (Clingo) ──┘                    │
                       (kiểm tra)        (JSON → facts)  pipeline/engine/asp                        ▼
fixtures/toy.json ───────────────────────────────────────────────────────────────────────────► validate.py
   (đọc lại JSON gốc, không dùng code của bộ giải)                                         (danh sách vi phạm)
```

| File | Vai trò |
|---|---|
| `fixtures/toy.json` | Chương trình đào tạo, hồ sơ sinh viên và các kịch bản what-if |
| `facts.py` | Kiểm tra đầu vào; các luật dùng chung cho CP-SAT, validator, báo cáo (tín chỉ từng kỳ, kỳ hè, cấp độ, ngưỡng tốt nghiệp) |
| `solve_asp.py` | Adapter engine ASP: dịch JSON thành facts, gọi Clingo, đọc kết quả ([ASP-ADAPTER.md](ASP-ADAPTER.md)) |
| `../engine/asp/` | Engine ASP: luật (`core/*.lp`) và quy định của trường (`policy.lp`) |
| `result.py` | Dựng kết quả chung cho mọi bộ giải, tính khác biệt giữa hai lộ trình |
| `validate.py` | Kiểm tra lộ trình bằng Python thuần, cố ý không dùng chung code với solver |
| `run_scenarios.py` | Chạy mọi kịch bản (mặc định engine ASP, `--solver cpsat`) và in kết quả |
| `solve_cpsat.py` | Bộ giải bằng OR-Tools CP-SAT (mục 6) |
| `compare.py` | So sánh hai bộ giải và đo thời gian |
| `tests/test_planner.py` | Test với đáp án xếp tay (chạy bằng CP-SAT) |
| `tests/test_solve_asp.py` | Test của engine ASP và adapter |

Nguyên tắc tách lớp: **dữ liệu** nằm trong JSON, **luật** nằm trong engine (`pipeline/engine/asp`) hoặc `solve_cpsat.py`. Đổi sinh viên hay đổi kịch bản thì chỉ đổi dữ liệu, không sửa luật.

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

Chỉ engine ASP dùng facts. Xem bằng `python -m planner.run_scenarios --facts base`; bảng đối chiếu từng trường JSON với fact: [ASP-ADAPTER.md](ASP-ADAPTER.md), mục 4.

## 3. Solver và thuật toán

### 3.1 Clingo làm gì

Clingo là bộ giải Answer Set Programming. Ta không viết thuật toán xếp môn; ta **mô tả** thế nào là một lộ trình hợp lệ và thế nào là tốt hơn, Clingo tự tìm. Nó chạy hai bước:

1. **Grounding:** thay mọi biến (`C`, `I`, ...) bằng giá trị cụ thể từ facts. Luật "môn chưa đạt được xếp vào nhiều nhất một kỳ" biến thành một dòng cho từng môn chưa đạt, với từng kỳ.
2. **Solving:** tìm tổ hợp các `take(môn, kỳ)` thỏa mọi ràng buộc. Cách tìm là thử gán, khi gặp mâu thuẫn thì ghi nhớ nguyên nhân để không lặp lại (conflict-driven learning), nên không phải duyệt hết mọi tổ hợp.

Để tối ưu, mỗi lần tìm được một lộ trình, Clingo thêm yêu cầu "lộ trình sau phải tốt hơn" rồi tìm tiếp. Khi không còn lộ trình nào tốt hơn thì lộ trình cuối cùng được **chứng minh** là tối ưu.

### 3.2 Luật và mục tiêu của engine ASP

Luật nằm trong `pipeline/engine/asp/core/*.lp`, quy định của trường trong `pipeline/engine/asp/policy.lp`; thứ tự mục tiêu `@8..@0` ở `core/optimize.lp`. Mô tả và các thay đổi so với nhánh `research-pipeline`: `pipeline/engine/asp/README.md`; khác biệt với CP-SAT: [ASP-ADAPTER.md](ASP-ADAPTER.md), mục 7.

### 3.3 Cách chạy what-if

`run_scenarios.py` giải kịch bản đầu tiên làm cơ sở, rồi giải lại từng kịch bản sau và so sánh. CP-SAT có mục tiêu S3 (ít đổi so với lộ trình cơ sở); engine ASP chưa có, nên lộ trình what-if của engine có thể đổi cả những môn không liên quan.

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

`validate.py` nhận JSON gốc, kịch bản và lộ trình, rồi tự kiểm tra lại mọi ràng buộc cứng bằng Python. Nó không import `facts.py`, `solve_asp.py`, `solve_cpsat.py` hay Clingo, nên lỗi trong adapter hoặc encoding sẽ lộ ra dưới dạng vi phạm. `violations` rỗng nghĩa là lộ trình hợp lệ.

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
.venv/Scripts/python -m planner.run_scenarios --facts base             # xem facts engine ASP của một kịch bản
.venv/Scripts/python -m planner.run_scenarios --json output/planner.json
.venv/Scripts/python -m pytest planner -q
```

Lưu ý: Clingo trên Windows không mở được file có dấu tiếng Việt trong đường dẫn, nên `solve_asp.py` đọc các file `.lp` bằng Python rồi mới đưa nội dung vào Clingo.

## 6. Bộ giải thứ hai: OR-Tools CP-SAT

`solve_cpsat.py` giải cùng bài toán bằng OR-Tools CP-SAT. Nó nhận cùng JSON và kịch bản, trả cùng dạng JSON, nhưng viết độc lập: đọc thẳng JSON, không đi qua facts hay engine ASP.

> Bảng và nhận xét so sánh dưới đây đo với **encoding Clingo cũ** (đã bỏ 20/11/2026), giữ lại làm tư liệu. Engine ASP mới: KHMT 2023 (96 môn) `OPTIMAL` trong khoảng 1–2,5 giây ([ASP-ADAPTER.md](ASP-ADAPTER.md), mục 8).

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
- Nguyên nhân đã được xác định bằng lệnh chẩn đoán của `compare.py` khi đó (đã bỏ cùng encoding cũ): Clingo kẹt ở việc chứng minh "không thể xong sớm hơn một kỳ", vốn là một phép đếm tín chỉ. Tắt nới lỏng tuyến tính thì CP-SAT cũng kẹt tương tự. Chi tiết: `docs/luu-tru/2026-11-15-planner-3-so-sanh.md`.
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
- **Đối chiếu chéo:** hai cách viết độc lập cho cùng giá trị mục tiêu là bằng chứng mạnh hơn nhiều so với một bộ giải tự kiểm tra. Với encoding cũ, test tự động kiểm tra hai bộ giải cùng giá trị mục tiêu; engine ASP dùng quy định và mục tiêu khác nên nay chỉ kiểm tra so sánh chạy được (`test_compare_runs_both_solvers_*`).
- **Dùng được ở cỡ thật:** CP-SAT trả lời what-if trong vài trăm mili giây kèm chứng minh tối ưu.
- **Có số liệu so sánh thật** giữa hai hướng mà tài liệu của nhóm đang phân vân (CP-SAT ở bản 28/10, Clingo ở bản 05/11).

Giới hạn ở mục 7 áp dụng cho cả hai bộ giải, vì chúng cùng dựa trên một cách hiểu quy chế.

**Update 22/11/2026 (measured by `synthetic/`).** The "under 1 second" figures above come from the old three-objective model. With the current objectives (S1–S11) and mid-program student states from the KHMT 2023 simulation, 6 of 30 captured solves did not prove optimality within 10 s. With 60 s, 4 of those 6 proved optimal and their final plan differed from the 10 s plan. With the wall-clock `time_limit`, such plans therefore depend on machine load.

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
