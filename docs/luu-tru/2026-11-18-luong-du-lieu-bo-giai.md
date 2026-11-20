# Luồng dữ liệu của bộ giải lộ trình

Việc T1 của [kế hoạch](2026-11-18-ke-hoach-goi-y-hoc-phan.md). Viết ngày 18/11/2026 cho nhóm và giảng viên hướng dẫn. Tài liệu trả lời bốn câu hỏi: dữ liệu lấy từ đâu, đi qua những bước nào, bộ giải nhận gì, và trả gì ra.

**Cập nhật 19/11:** giai đoạn 2 đã code xong phần bộ giải (B4–B8, `planner.cli`). Các nhãn "Sẽ làm, GĐ 2" dưới đây đã có trong `pipeline/planner/`; nhãn GĐ 3–5 vẫn chưa làm.

**Đọc nhãn:** mỗi phần đều ghi **[Đã có]** (code đang chạy trong `pipeline/planner/`, đã kiểm tra ngày 18/11) hoặc **[Sẽ làm, GĐ n]** (theo kế hoạch, chưa viết). Luật lấy từ [QĐ 285](2026-11-18-luat-qd285.md).

---

## 0. Toàn cảnh

```
 NGUỒN DỮ LIỆU                         XỬ LÝ                                   KẾT QUẢ
 ─────────────                         ─────                                   ───────
 PDF CTĐT công khai ──(nhóm trích)──► database web ─┐
 Sinh viên khai trạng thái môn ─────► database web ─┤
 File tiến độ myBK (GĐ 8) ──(parser)► database web ─┤
                                                    ▼
 Trang Gợi ý: kịch bản + nút chỉnh ──► [B1] POST /api/plans/solve
                                       [B2] Backend đọc database, ghép JSON đầu vào
                                       [B3] Gọi  python -m planner.cli  (stdin → stdout)
                                       [B4] Kiểm tra đầu vào  ──sai──► INPUT_ERROR
                                       [B5] Bộ giải: CP-SAT (mặc định) hoặc Clingo
                                       [B6] Dựng kết quả chung (cùng dạng cho cả hai)
                                       [B7] Validator độc lập kiểm tra lại
                                       [B8] Báo cáo: mong muốn, khác biệt, giả định
                                       [B9] Backend trả JSON ──────────────────► Trang Gợi ý
```

---

## 1. Thu dữ liệu

### 1.1 Chương trình đào tạo [Đã có trong database]

| Bảng | Trường dùng cho bộ giải | Ý nghĩa | Nguồn |
|---|---|---|---|
| `curricula` | `code`, `cohort`, `duration_years`, `min/max_semester_credits` | Một chương trình (ví dụ `CS-2023-KHMT`) | Nhóm tự đặt mã. Mức tín chỉ trong database là 11–24, **bộ giải không dùng**; nó lấy 11–25 theo quyết định của người duyệt (QĐ 285 ghi 14–21) |
| `courses` | `code`, `name`, `credits` | Danh mục 5 328 môn | Trích từ PDF CTĐT |
| `curriculum_courses` | `course_id`, kỳ khuyến nghị | Môn thuộc chương trình (KHMT 2023: 96 môn) | Trích từ PDF CTĐT |
| `course_groups` + `course_group_members` | `kind`, `required_count`, `required_credits`, `pool_scope`, `pool_course_credits`, `specialization_id`, `parent_group_id` | Khối bắt buộc, khối tự chọn | Trích từ PDF CTĐT |
| `course_relations` | `course_id`, `related_course_id`, `type` | TQ, HT, SH, KN theo từng chương trình (KHMT 2023: 11 TQ, 2 HT, 1 SH, 18 KN) | Trích từ PDF CTĐT |
| `course_opened_semesters` | `course_id`, `semester_code` | Kỳ môn **đã từng** mở | Lịch sử, không phải kế hoạch mở lớp |

Ghi chú: script trích PDF (`build-vertical.cjs`) **không có trong repo** (việc T18). Hiện chỉ đối chiếu tay được KHMT 2023 khớp 100% với PDF.

### 1.2 Hồ sơ sinh viên [Đã có trong database]

| Bảng | Trường dùng | Ý nghĩa | Nguồn |
|---|---|---|---|
| `student_profiles` | `curriculum_id`, `admission_year`, `target_specialization_id` | Sinh viên học chương trình nào, vào năm nào | Sinh viên tự chọn trong hồ sơ |
| `student_courses` | `course_id`, `status` | `not-started`, `in-progress`, `completed`, `failed` | Sinh viên tự khai, hoặc tải Excel/CSV theo mẫu của nhóm |
| `student_regulation_status` | `regulation_id`, `status` | Trạng thái các điều kiện của chương trình | **Chưa kiểm tra** bảng này chứa những điều kiện nào |

Bộ giải **không** đọc tên, MSSV, ngày sinh, số điện thoại hay điểm.

### 1.3 Dữ liệu còn thiếu và cách bù

| Thiếu | Vì sao cần | Cách bù (không sửa schema Supabase) |
|---|---|---|
| Kỳ hiện tại | Biết bắt đầu xếp từ kỳ nào | Backend tính từ ngày hiện tại theo mã kỳ `YYS` (ví dụ tháng 11/2026 là kỳ `261`) |
| Danh sách kỳ còn lại | Không gian xếp | Sinh từ kỳ hiện tại tới kỳ chính thứ 12 tính từ `admission_year` (Đ5.2); kỳ hè chỉ dành cho thực tập ngoài trường |
| Kỳ học của từng môn đã qua | Không cần | Năm học tính theo khóa: kỳ `YYS` là năm thứ `YY − (khóa mod 100) + 1` |
| Chuẩn tốt nghiệp Nghe–Đọc, MOS, điểm rèn luyện | Điều kiện khóa luận (Đ15.5, PL7, PL9) | Sinh viên khai trên trang Gợi ý, gửi kèm request (trường `student_flags`). Không khai thì **giả định đã đạt** và ghi vào `assumptions` |
| Kế hoạch mở lớp tương lai | Môn không mở thì không xếp | Mặc định giả định có mở; sinh viên khai `not_offered` trong kịch bản |
| Quan hệ môn còn thiếu trong chương trình của sinh viên | Tránh bỏ sót tiên quyết | Bản chụp quan hệ của 96 chương trình, gắn nhãn nguồn (GĐ 3) |

### 1.4 Kịch bản từ giao diện [Sẽ làm, GĐ 5]

Sinh viên chỉnh trên trang Gợi ý, gửi `POST /api/plans/solve`:

```json
{
  "solver": "cpsat",
  "max_credits": 18,
  "semester_limits": { "262": { "max": 12 } },
  "graduate_by": "272",
  "in_progress_results": { "CO3005": "pass", "CO3117": "fail" },
  "locked": [ { "course_code": "CO3061", "semester_code": "262" } ],
  "not_offered": [ { "course_code": "CO3001", "semester_code": "262" } ],
  "preferences": { "wanted_courses": ["CO3117"], "balanced_load": false, "recommendations_first": false },
  "student_flags": { "english_grad_reading": false, "mos": true },
  "previous_plan": { "CO3001": "262", "CO4337": "271" }
}
```

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `solver` | `"cpsat"` \| `"clingo"` | Không, mặc định `cpsat` | Chọn bộ giải |
| `max_credits` | số nguyên 11–25 | Không, mặc định 25 | Hạ mức tối đa cho mọi kỳ |
| `semester_limits` | map mã kỳ → `{min?, max?}` | Không | Chỉnh riêng từng kỳ (xem mục H7 của kế hoạch) |
| `graduate_by` | mã kỳ hoặc `null` | Không | Phải xong trước hoặc trong kỳ này (H10, cứng) |
| `in_progress_results` | map mã môn → `"pass"` \| `"fail"` | Không, mặc định `pass` | What-if đậu rớt môn đang học |
| `locked` | danh sách `{course_code, semester_code}` | Không | Môn bắt buộc nằm ở kỳ đó (cứng) |
| `not_offered` | danh sách `{course_code, semester_code}` | Không | Môn không mở ở kỳ đó (cứng) |
| `preferences.wanted_courses` | danh sách mã môn | Không | S4, mềm |
| `preferences.balanced_load` | boolean | Không | S5, mềm |
| `preferences.recommendations_first` | boolean | Không, mặc định `false` | `false`: tốt nghiệp sớm nhất trước, rồi ít phá khuyến nghị (S1 > S6). `true`: giữ khuyến nghị trước, chấp nhận lùi kỳ (S6 > S1) |
| `preferences.preferred_load` | `[thấp, cao]` | Không, mặc định theo chương trình (KHMT: `[15, 18]`) | S8: khoảng tín chỉ đẹp của kỳ chính |
| `summer_opt_in` | danh sách mã kỳ hè | Không, mặc định rỗng | Kỳ hè sinh viên muốn học; chỉ các kỳ này mới được xếp môn thường (môn từng mở hè), tối đa 12 TC |
| `student_flags` | object | Không | Chuẩn tiếng Anh tốt nghiệp (Nghe–Đọc), MOS: điều kiện khóa luận. Thiếu thì giả định đạt |
| `previous_plan` | map mã môn → mã kỳ | Không | Lộ trình mốc để chạy what-if (S3) |

Sinh viên, chương trình và trạng thái môn **không gửi lên**: backend đọc từ tài khoản đang đăng nhập.

---

## 2. Các bước xử lý

| Bước | Ai làm | Vào | Ra | Lỗi thì sao | Trạng thái |
|---|---|---|---|---|---|
| B1 | Trang Gợi ý | Thao tác của sinh viên | Request mục 1.4 | Kiểm tra kiểu ngay trên giao diện | Sẽ làm, GĐ 5 |
| B2 | Backend, module `planner` | Request + phiên đăng nhập | JSON đầu vào bộ giải (mục 3) | Chưa chọn chương trình → HTTP 400 kèm lý do | Sẽ làm, GĐ 4 |
| B3 | Backend | JSON đầu vào | Gọi `python -m planner.cli --solver ...`, ghi JSON vào stdin, đọc JSON từ stdout | Tiến trình chết hoặc quá giờ → `status: "TIMEOUT"` | Sẽ làm: `cli` ở GĐ 2, phía backend ở GĐ 4 |
| B4 | `facts.py` → `validate_input` | JSON đầu vào | Không gì (chỉ kiểm tra) | `FixtureError` → `status: "INPUT_ERROR"` kèm lý do | Đã có (đang ném lỗi, chưa đổi thành `INPUT_ERROR`) |
| B5 | `solve_cpsat.py` hoặc `solve.py` | JSON đầu vào | Danh sách `(mã môn, chỉ số kỳ)` + trạng thái | Xem mục 4 | Đã có |
| B6 | `solve.make_result` | Danh sách trên | JSON kết quả chung (mục 5) | — | Đã có |
| B7 | `validate.py` | JSON đầu vào + lộ trình | Danh sách vi phạm | Có vi phạm nghĩa là bộ giải có lỗi → giao diện cảnh báo đỏ | Đã có |
| B8 | `solve.diff` + phần báo cáo | Lộ trình + mốc + mong muốn | `diff_vs_previous`, `preferences_report`, `assumptions` | — | `diff`, `assumptions` đã có; `preferences_report` sẽ làm ở GĐ 2 |
| B9 | Backend | JSON kết quả | Trả nguyên cho giao diện | — | Sẽ làm, GĐ 4 |

Trong lúc phát triển, ở B2 backend ghi JSON đầu vào ra file để người duyệt kiểm tra tay.

### 2.1 B2 chi tiết: ghép JSON đầu vào từ database

1. Đọc `student_profiles` của người đang đăng nhập, lấy `curriculum_id` và `admission_year`. Không có `curriculum_id` thì dừng với lỗi rõ ràng.
2. Đọc chương trình: `curricula`, `curriculum_courses` (kèm `courses`), `course_groups` (kèm thành viên), `course_relations`.
3. Đổi mọi uuid sang **mã môn**. Bộ giải chỉ làm việc với mã môn.
4. Đọc `student_courses`: môn không có bản ghi coi như `not-started`.
5. Tính kỳ hiện tại và sinh danh sách kỳ còn lại (mục 1.3).
6. Ghép quan hệ môn theo thứ tự ưu tiên nguồn: chương trình của sinh viên (`curriculum`), rồi suy ra từ chương trình khác hoặc đề cương (`inferred`, GĐ 3). Môn không có quan hệ ở nguồn nào thì ghi vào `unverified_prerequisites`.
7. Gắn luật thành tham số: 11–25 TC mỗi kỳ (người duyệt), khóa của sinh viên để tính năm học, tỉ lệ 65/70/85% (QĐ 285 Đ15.5).
8. Gộp các trường của request (mục 1.4) thành một kịch bản.

---

## 3. Bộ giải nhận gì vào

Một file JSON duy nhất, **giống nhau cho cả hai bộ giải**. Định dạng hiện tại là `pipeline/planner/fixtures/toy.json`; các trường đánh dấu *mới* sẽ thêm ở GĐ 2.

| Khối | Kiểu | Nội dung | Có từ |
|---|---|---|---|
| `schema_version` | số nguyên | Hiện là 1 | Đã có |
| `curriculum` | object | `code`, `cohort`, `duration_years`, `min_semester_credits`, `max_semester_credits` | Đã có |
| `courses` | danh sách `{code, name, credits}` | Danh mục môn có liên quan | Đã có |
| `curriculum_courses` | danh sách `{course_code, recommended_year, recommended_term}` | Môn thuộc chương trình | Đã có |
| `course_groups` | danh sách `{name, kind, required_count, required_credits, members[]}` | `kind` là `required` hoặc `elective`. Khối tự chọn phải có ít nhất một ngưỡng | Đã có |
| `course_relations` | danh sách `{course_code, related_course_code, type}` | `type`: `prerequisite`, `prior`, `corequisite`, `recommended` | Đã có |
| `course_relations[].source` | `"curriculum"` \| `"inferred"` | Nguồn quan hệ | *Mới, GĐ 3* |
| `semesters` | danh sách mã kỳ, theo thời gian | Mọi kỳ, kể cả kỳ đã qua | Đã có |
| `student.current_semester` | mã kỳ | Kỳ đang học; bộ giải xếp từ kỳ **sau** kỳ này | Đã có |
| `student.student_courses` | danh sách `{course_code, status}` | Trạng thái từng môn | Đã có |
| `student.flags` | object | Chuẩn tiếng Anh tốt nghiệp, MOS | *Mới, GĐ 2* |
| `offerings` | `{unknown_policy, records[]}` | `records`: `{course_code, semester_code, status: "not-offered"}`. `unknown_policy` hiện chỉ có `assume-open` | Đã có |
| `rules` | object | `credits_min`, `credits_max`, `graduation_thresholds`, `max_main_semesters` (năm học lấy từ `curriculum.cohort`) | *Mới, GĐ 2* |
| `scenarios` | danh sách kịch bản | Mỗi kịch bản: `id`, `label`, `in_progress_results`, `locked`, `not_offered`; *mới*: `max_credits`, `semester_limits`, `graduate_by`, `preferences` | Đã có một phần |

**B4 từ chối** (không âm thầm bỏ qua) khi gặp: mã môn trùng hoặc không tồn tại; loại quan hệ hay trạng thái lạ; khối tự chọn không có ngưỡng; một môn thuộc hai khối; thiếu giả định cho môn đang học; kỳ bị khóa nằm ngoài các kỳ còn lại; kỳ hiện tại không có trong `semesters`.

---

## 4. Bên trong từng bộ giải

Hai bộ giải **viết độc lập** và chỉ dùng chung bước B4 (kiểm tra đầu vào) và B6 (dựng kết quả). Mục đích là đối chiếu chéo: nếu hai bộ giải cho cùng giá trị mục tiêu thì khả năng cả hai cùng sai rất thấp.

### 4.1 CP-SAT (OR-Tools), mặc định [Đã có: `solve_cpsat.py`]

**Nhận:** JSON đầu vào, đọc thẳng, không qua bước dịch nào.

**Xử lý:**

1. Tính tập môn đã đạt và đã học từ `student_courses` và `in_progress_results`.
2. Tạo biến 0/1 `x[môn, kỳ]` cho mỗi môn chưa đạt và mỗi kỳ còn lại. `x = 1` nghĩa là xếp môn vào kỳ đó.
3. Viết mọi ràng buộc cứng thành bất đẳng thức tuyến tính. Ví dụ:
   - Mỗi môn nhiều nhất một kỳ: `Σ_kỳ x[c, kỳ] ≤ 1`.
   - Tiên quyết: `x[c, i] ≤ Σ_{j < i} x[r, j]`, hoặc r đã đạt từ trước.
   - Tối đa tín chỉ: `Σ_c tc(c) · x[c, i] ≤ max`.
4. Mục tiêu: gộp các mức ưu tiên thành **một tổng có trọng số**, trọng số đủ lớn để mức cao luôn thắng mức thấp:
   `minimize  w_last · kỳ_cuối + w_tc · tổng_tín_chỉ + số_môn_dời`.
5. Chạy `CpSolver` với giới hạn 30 giây, 1 luồng (để kết quả lặp lại được).

**Trả:** danh sách `(mã môn, chỉ số kỳ)` có `x = 1`, cùng mã trạng thái của OR-Tools. Đổi mã trạng thái như sau:

| OR-Tools trả | `status` của ta | Có lộ trình không |
|---|---|---|
| `OPTIMAL` | `OPTIMAL` | Có, đã chứng minh tối ưu |
| `FEASIBLE` | `SAT_NOT_PROVEN_OPTIMAL` | Có, chưa chứng minh tối ưu |
| `INFEASIBLE` | `UNSAT` | Không |
| Khác (`UNKNOWN`, `MODEL_INVALID`) | `TIMEOUT` | Không |

### 4.2 Clingo (ASP), tùy chọn [Đã có: `facts.py` + `encoding.lp` + `solve.py`]

**Nhận:** cùng JSON đầu vào, nhưng `facts.py` dịch nó thành **facts** dạng văn bản, ví dụ:

```prolog
course("CS301", 3).        relation("CS301", "CS201", "prerequisite").
status("CS201", "in-progress").   assume_result("CS201", "pass").
plan_semester(1, "262").   not_offered("EL303", 2).   locked("EL303", 1).
```

Luật nằm riêng trong `encoding.lp`, viết gần câu chữ quy định, ví dụ tiên quyết:

```prolog
:- take(C, I), relation(C, R, "prerequisite"), not passed(R), not take_before(R, I).
```

**Xử lý:**

1. Nạp `encoding.lp` và facts. File được đọc bằng Python trước, vì Clingo trên Windows không mở được đường dẫn có dấu.
2. **Grounding:** thay mọi biến bằng giá trị cụ thể từ facts.
3. **Solving** với `--opt-mode=opt`: mỗi lần tìm được lộ trình tốt hơn thì gọi `on_model` và giữ lại lộ trình đó. Các mức ưu tiên là `@3`, `@2`, `@1` (thứ tự từ điển, không cần trọng số).
4. Giới hạn 30 giây. Hết giờ thì hủy và giữ lộ trình tốt nhất đã có.

**Trả:** các atom `take(môn, chỉ số kỳ)` của lộ trình cuối cùng, cờ "đã chứng minh tối ưu", và kết quả `unsatisfiable` / `exhausted`. Đổi trạng thái:

| Clingo trả | `status` của ta |
|---|---|
| Có lộ trình, đã chứng minh tối ưu (hoặc đã duyệt hết) | `OPTIMAL` |
| Có lộ trình, hết giờ trước khi chứng minh | `SAT_NOT_PROVEN_OPTIMAL` |
| Không lộ trình, `unsatisfiable` | `UNSAT` |
| Không lộ trình, hết giờ | `TIMEOUT` |

### 4.3 Khác nhau trong thực tế

| | CP-SAT | Clingo |
|---|---|---|
| Thời gian trên dữ liệu sinh ngẫu nhiên 40–80 môn | 80–250 ms, chứng minh được tối ưu | Có lộ trình nhưng không chứng minh xong trong 20 giây → thường trả `SAT_NOT_PROVEN_OPTIMAL` |
| Cách viết mức ưu tiên | Trọng số trong một tổng | Mức `@n` |
| Dễ đọc luật | Khó hơn | Gần câu chữ quy định |
| Cùng đầu vào, có cùng lộ trình không | **Không nhất thiết.** Có thể có nhiều lộ trình tốt ngang nhau. Chỉ so sánh bộ giá trị mục tiêu (kỳ cuối, tổng tín chỉ, số môn dời) | — |

Số đo: ngày 15/11/2026, Clingo 5.8.3, OR-Tools 9.15 (`docs/2026-11-15-planner-3-so-sanh.md`). Chưa đo trên chương trình thật.

---

## 5. Bộ giải trả gì ra

### 5.1 Hiện có [Đã có: `solve.make_result`]

```json
{
  "scenario_id": "base",
  "label": "Co so: gia dinh dau het mon dang hoc",
  "curriculum": "TOY-2025",
  "solver": "cp-sat",
  "status": "OPTIMAL",
  "assumptions": ["Moi mon xep trong tuong lai duoc gia dinh se dau", "..."],
  "semesters": [
    { "semester_code": "262", "courses": ["CS301", "CS302", "MA102"], "credits": 9 },
    { "semester_code": "271", "courses": ["CS401", "EL302", "EL304", "MA201"], "credits": 11 }
  ],
  "graduation_semester": "271",
  "violations": [],
  "diff_vs_base": []
}
```

Số liệu trên là kết quả thật của lệnh `.venv/Scripts/python -m planner.run_scenarios --solver cpsat`, chạy ngày 18/11.

Khi `UNSAT` hoặc `TIMEOUT`: `semesters` rỗng, `graduation_semester` là `null`. **`UNSAT` chỉ có nghĩa** không có lộ trình thỏa mọi ràng buộc trong các kỳ còn lại với các giả định đã nêu. Không có nghĩa là sinh viên không thể tốt nghiệp.

### 5.2 Mục tiêu [Sẽ làm, GĐ 2]

Thêm vào kết quả trên:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `solve_ms` | số nguyên | Thời gian giải |
| `semesters[].courses[]` | đổi từ chuỗi thành `{code, credits, reason, locked}` | `reason`: `required` (môn bắt buộc), `elective` (để đủ khối tự chọn), `wanted` (sinh viên muốn), `retake` (học lại môn rớt) |
| `preferences_report` | danh sách `{id, detail, satisfied}` | Mỗi mong muốn mềm (S1–S6) được đáp ứng hay không |
| `unverified_prerequisites` | danh sách mã môn | Môn mà không nguồn nào cho biết quan hệ |
| `diff_vs_previous` | danh sách chuỗi | Đổi tên từ `diff_vs_base`; ví dụ `"~ CO4337 dời 271 -> 272"` |
| `infeasible_reason` | chuỗi hoặc `null` | Khi `UNSAT`: nút nào của sinh viên gây ra (thử bỏ lần lượt từng nút khóa) |
| `status: "INPUT_ERROR"` | — | Kèm lý do từ B4 |

---

## 6. Xử lý đầu ra

| Bước | Làm gì | Áp dụng cho |
|---|---|---|
| Dựng kết quả (B6) | Đổi chỉ số kỳ 1, 2, 3 về mã kỳ thật, nhóm môn theo kỳ, cộng tín chỉ, lấy kỳ cuối có môn làm kỳ tốt nghiệp. Nếu không còn môn nào phải học, kỳ tốt nghiệp là kỳ hiện tại | Cả hai, cùng một hàm |
| Validator (B7) | Đọc lại **JSON gốc**, không dùng facts hay bộ giải, tự kiểm tra mọi ràng buộc cứng bằng Python thuần. `violations` khác rỗng nghĩa là bộ giải có lỗi | Cả hai |
| Khác biệt (B8) | So lộ trình mới với `previous_plan`: `+` thêm môn, `-` bỏ môn, `~` dời kỳ | Cả hai |
| Mong muốn (B8) | Với mỗi S1–S6, ghi đáp ứng hay không | Cả hai, sẽ làm ở GĐ 2 |
| Đối chiếu chéo | Test tự động chạy cả hai bộ giải trên cùng đầu vào và so bộ giá trị mục tiêu | Chỉ khi chạy test, không chạy trên web |

Giới hạn của validator: nó chỉ kiểm tra lộ trình **hợp lệ**, không kiểm tra **tối ưu**. Nó dựa trên cùng một cách hiểu quy định với hai bộ giải, nên nếu cách hiểu đó sai thì cả ba cùng sai. Đó là lý do có [file luật QĐ 285](2026-11-18-luat-qd285.md) kèm điều và trang để người đọc tự đối chiếu.

---

## 7. Giao diện hiển thị

| `status` | Giao diện hiện |
|---|---|
| `OPTIMAL` | Lộ trình theo kỳ, kỳ tốt nghiệp, danh sách giả định |
| `SAT_NOT_PROVEN_OPTIMAL` | Lộ trình kèm dòng "Có thể còn lộ trình tốt hơn" |
| `UNSAT` | "Không có lộ trình với các lựa chọn hiện tại", kèm `infeasible_reason` |
| `TIMEOUT` | "Hết thời gian, thử lại hoặc đổi sang CP-SAT" |
| `INPUT_ERROR` | Lý do lỗi dữ liệu, gợi ý kiểm tra lại trang Môn học |
| `violations` khác rỗng | Cảnh báo đỏ "Bộ giải có lỗi, đừng dùng lộ trình này", kèm danh sách vi phạm |
| Mong muốn `satisfied: false` | "Không đáp ứng được: ..." ngay dưới lộ trình |
