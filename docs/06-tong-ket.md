# 06 · Tổng kết hai trang: Môn học và Gợi ý học phần

Viết ngày 23/11/2026, **theo code đọc trong ngày** (nhánh `feature/goi-y-hoc-phan`, chưa commit phần giai đoạn 12). Chỗ nào chưa bấm thử trên web thì ghi rõ. Chi tiết kỹ thuật sâu hơn ở [03-thiet-ke.md](03-thiet-ke.md); kịch bản kiểm thử ở [05-kiem-thu.md](05-kiem-thu.md).

---

## 1. Bức tranh chung

```
                    ┌─────────────────────────── Trang Môn học (/courses) ───────────────────────────┐
 PDF / chữ dán myBK │ Tab "Tiến độ myBK": nhập file → xác nhận → lưu; Hiệu chỉnh trạng thái môn       │
 ──────────────────►│ Tab "Chương trình" (nhánh main): bảng thẻ môn, kế hoạch tự xếp                   │
                    └───────────────┬───────────────────────────────────────────────┬────────────────┘
                                    │ ghi                                           │ ghi
                                    ▼                                               ▼
        student_progress_imports (JSON file + data.web)  ·  student_courses (trạng thái môn)  ·  student_plan_courses
                                    │ đọc                                           
                                    ▼                                               
                    ┌──────────────────── Trang Gợi ý học phần (/recommendations) ───────────────────┐
                    │ Kịch bản what-if → bấm Giải → bộ giải xếp các môn còn lại vào từng kỳ            │
                    │ Lưu bản, so sánh; trạng thái trang lưu ở data.web.planner                        │
                    └────────────────────────────────────────────────────────────────────────────────┘
```

**Một nguồn sự thật cho trạng thái môn:** bộ giải chỉ đọc trạng thái từ **file myBK + Hiệu chỉnh** (quyết định Q2, 22/11). Tab "Chương trình" của nhánh `main` vẫn ghi được `student_courses`; chỗ này **chưa xử lý**, người duyệt sẽ trao đổi với Thiên.

Đường dẫn cũ `/plan`, `/student-courses`, `/regulations` đều chuyển về `/courses`.

---

## 2. Database

Supabase dùng chung. Nhánh này **không sửa schema hay dữ liệu dùng chung** (CLAUDE.md); chỉ đọc các bảng chương trình và ghi các bảng của chính tài khoản.

### 2.1 Bảng chương trình (chỉ đọc)

| Bảng | Có gì | Trang nào dùng |
|---|---|---|
| `curricula` | 132 chương trình; `code` nội bộ (vd `CS-2023-KHMT`), `source_code` = mã CTĐT myBK (vd `DH_CQ_MT_KHM_2023`), `total_credits`, mức TC/kỳ 11–24 (bộ giải không dùng) | Môn học (tìm chương trình theo mã của file), Gợi ý |
| `courses` | Danh mục môn: mã, tên, TC | Cả hai; Gợi ý tra mã ở ô tự chọn tự do |
| `curriculum_courses` | Môn của chương trình, `recommended_year`, `recommended_term` (KHMT 2023: 37/96 môn có) | Gợi ý: "Kế hoạch giảng dạy" khi so sánh |
| `course_groups`, `course_group_members` | **Chỉ khối tự chọn** (kind, TC hoặc số môn cần, khối con chuyên ngành, `pool_scope` listed/any). Khối "Bắt buộc" không có dòng: backend suy ra = môn của chương trình không thuộc khối tự chọn gốc nào | Gợi ý (ô khối, đổi môn cùng khối) |
| `course_relations` | Tiên quyết, song hành, khuyến nghị, học trước (bỏ) | Gợi ý |
| `course_categories` (+ members) | Nhóm "Tốt nghiệp", "Điều kiện tốt nghiệp" | Gợi ý: ngưỡng 65/70/85% của môn tốt nghiệp, môn điều kiện không xếp lịch |
| `course_opened_semesters` | Kỳ môn **đã từng** mở | Gợi ý: kỳ hè chỉ ưu tiên môn từng mở hè; cảnh báo "chưa từng mở" |

### 2.2 Bảng của sinh viên (ghi theo tài khoản đang đăng nhập)

| Bảng | Có gì | Ai ghi |
|---|---|---|
| `student_profiles` | `curriculum_id`, năm vào trường, chuyên ngành mục tiêu | Nhập myBK (đặt chương trình theo file) |
| `student_courses` | Mỗi môn một trạng thái: `completed`, `in-progress`, `failed`, `not-started` | Nhập myBK (ghi đúng như file, xóa môn khác), Hiệu chỉnh, tab Chương trình |
| `student_progress_imports` | Một dòng mỗi tài khoản: `data` = JSON của file (khối, môn, đạt/chưa, **điểm, họ tên, MSSV**) + `data.web` = phần sinh viên khai trên web | Nhập myBK, Hiệu chỉnh, trang Gợi ý |
| `student_plan_courses` | Kế hoạch sinh viên tự xếp (môn → kỳ) | Tab Chương trình (nhánh `main`); bộ giải **không** đọc |

**`student_progress_imports.data.web`** (không cần migration, giữ nguyên khi nhập lại file):

| Khóa | Nghĩa | Ghi ở |
|---|---|---|
| `current_semester` | Học kỳ hiện tại sinh viên khai | Hiệu chỉnh |
| `notes` | Ghi chú riêng theo mã môn | Hiệu chỉnh |
| `block_choices` | {mã môn: id khối} sinh viên chọn để tính môn vào | Hiệu chỉnh |
| `planner` | Trạng thái trang Gợi ý: `{scenario, view, dirty, plans}` (mục 4.4) | Trang Gợi ý |

---

## 3. Trang Môn học (`/courses`)

Sinh viên thấy hai tab; tab đang mở lưu ở `?tab=`. Quản trị chỉ thấy danh mục môn (`CourseCatalog`).

### 3.1 Tab "Tiến độ myBK"

**Chức năng và luồng UX:**
1. Nút **"Nhập tiến độ từ myBK"** mở hộp hai cách: **Tải file PDF** (có hướng dẫn in "Lưu dưới dạng PDF") hoặc **Dán nội dung trang** Tiến độ.
2. Web đọc file và mở hộp **"Kiểm tra file tiến độ trước khi lưu"**, gồm:
   - chương trình theo mã myBK;
   - các mâu thuẫn (lỗi thì khóa nút Xác nhận);
   - tương ứng GDTC (`CCGDTC` ↔ PE1003, PE1005);
   - các môn sẽ đổi trạng thái;
   - toàn bộ nội dung file.
3. **Xác nhận và lưu** → web ghi tiến độ, đặt chương trình theo file nếu khác.
4. **Thẻ tiến độ:** học kỳ hiện tại, số môn và TC đang học (cảnh báo khi trên 25, dưới 11, hè trên 12), bảng môn theo khối với cột Đạt (file) và Trên web (nhãn "Khác file tiến độ").
5. **Hiệu chỉnh:**
   - đổi trạng thái 4 loại (mỗi lần hỏi OK/Hủy);
   - thêm "Môn đang học";
   - xóa môn ngoài chương trình;
   - khai học kỳ hiện tại;
   - chọn khối cho môn ("Tính vào khối");
   - ghi chú.

**Luồng backend và database:**

```
Chọn PDF / dán chữ  (MybkProgress.tsx)
  │ POST /api/plans/mybk/review   (multipart, ≤ 5 MB, KHÔNG ghi gì)
  ▼
PlannerService.reviewMybk
  │ python -m planner.mybk (đọc file qua stdin) → JSON
  │ đọc: curricula theo source_code · student_profiles · student_progress_imports (có chưa)
  │      student_courses + courses của tài khoản · courses theo mọi mã trong file
  │ mybk-review.ts (hàm thuần) → chương trình, mâu thuẫn, tương ứng, trạng thái sẽ đổi
  ▼
Hộp xác nhận ── Hủy: không có gì xảy ra
  │ POST /api/plans/mybk/import  (gửi lại file; apply_curriculum khi chương trình khác)
  ▼
PlannerService.importMybk  (một transaction; đọc lại file, không tin dữ liệu trình duyệt)
  │ student_progress_imports: upsert JSON đầy đủ, giữ data.web
  │ student_courses: ✓ → completed, -- → not-started; XÓA môn khác của tài khoản
  │ student_profiles.curriculum_id = chương trình của file (khi apply_curriculum)
  ▼
GET /api/plans/mybk/progress → thẻ tiến độ

Hiệu chỉnh: PUT /api/plans/mybk/adjustments
  │ {current_semester?, items[{course_id, status}], remove_course_ids?, notes?, block_choices?}
  ▼ một transaction: student_courses + data.web.current_semester / notes / block_choices
```

File chỉ nằm trong bộ nhớ (không ghi đĩa), tối đa 10 lần/phút. Điểm và họ tên chỉ chính tài khoản đọc được.

### 3.2 Tab "Chương trình" (nhánh `main`, Thiên làm)

- **Chức năng:**
  - Bảng thẻ môn của chương trình, có tab "Sơ đồ điều kiện".
  - Sinh viên khai trạng thái và xếp kế hoạch tay (môn → kỳ).
  - Chưa chọn chương trình thì hiện danh mục.
- **Luồng:**
  - Bản nháp lưu trong `localStorage` (`bk-course-draft:<user>:<curriculum>`).
  - Bấm Lưu thì gọi `PUT /student-courses/me` (bulk) và `PUT /student-plan-courses/me/:curriculumId`.
  - Ghi vào `student_courses` và `student_plan_courses`.
- **Liên quan Gợi ý:** trạng thái ghi ở đây cũng vào `student_courses` (chỗ Q2 chưa xử lý); kế hoạch tay **không** vào bộ giải.

Hai trang con khác: `/courses/analysis` (Phân tích) và `/courses/:code` (chi tiết môn, đề cương).

---

## 4. Trang Gợi ý học phần (`/recommendations`)

Đặc tả: [02 mục 12](02-ke-hoach.md). Giai đoạn 12 code 23/11, đủ chức năng M1–M18. Giao diện dùng màu, font của web, bố cục theo mẫu `mau-what-if`. **Chưa bấm thử trên web.**

### 4.1 Bố cục

```
Gợi ý học phần · chương trình · đang ở kỳ …
[ Lộ trình | So sánh (n) ]
┌─────────────────────────────────────────────────────────────┬───────────────────┐
│ RA TRƯỜNG HK 281 │ KỲ CHÍNH NẶNG NHẤT 18 TC │ HỌC HÈ 6 TC      │ Kịch bản      [›] │
│ Trạng thái: đang giải / giải được / có cảnh báo / không được │ Môn đang học      │
│   + nút "Cách gỡ" khi không giải được                        │   Đậu | Rớt       │
│ ● 262  18 TC   ○CO2013   ○CO3093   ○CO3005 …                 │ Ưu tiên (3 mục)   │
│ │  ☐nghỉ muốn __TC  tên môn   tên môn  …                     │ Lịch sử (n/10)    │
│ ● 263 · hè  ☐ Học hè kỳ này      (kỳ tắt: một dòng)          │ Yêu cầu khác      │
│ ● 271  …                                                     │                   │
│ [Giải] [Hoàn tác]          [tên bản…] [Lưu bản này]          │                   │
│ Yêu cầu của bạn · Mong muốn · Giả định                       │                   │
└─────────────────────────────────────────────────────────────┴───────────────────┘
```

### 4.2 Chức năng (M1–M18)

| Nhóm | Sinh viên làm gì | Gửi bộ giải bằng |
|---|---|---|
| Giải | **Chỉ bấm Giải mới gọi bộ giải**, kể cả lúc mở trang. Sửa mà chưa giải: "Đã sửa N chỗ, chưa kiểm", dải chỉ số mờ. **Hoàn tác** lùi từng lần sửa | — |
| Môn đang học | Đậu / Rớt | `in_progress_results` |
| Ưu tiên | 3 mục: Ra trường sớm nhất, Mỗi kỳ chính 15–18 TC, Không học dư tự chọn; bật/tắt, lên/xuống. Học phí, sở thích: "bàn sau" | `preferences.order` (+ mục ẩn S6, S4, OH, S3), `preferences.disabled` |
| Từng kỳ | Nghỉ (kỳ chính), Học hè (kỳ hè), "muốn … TC" | `skip_semesters`, `summer_opt_in`, `semester_targets` |
| Chọn môn | Bấm môn: hàng chuyển vào được sáng lên + "Chuyển vào đây", hàng không được mờ + lý do (tính tại trang, không gọi bộ giải). Kéo thả cũng được. Chuyển = ghim | `locked` (ghim tuyệt đối) |
| Trên môn | Ghim / bỏ ghim · "Kỳ này không mở" · "Giả định rớt kỳ này" · đổi môn khác cùng khối · ô tự chọn tự do gõ mã bất kỳ · rê chuột xem chi tiết | `locked`, `not_offered`, `assumed_fail`, `free_choices` |
| Cảnh báo | Hiện ngay trên hàng kỳ, kèm điều QĐ 285; "Kỳ này có mở" gỡ cảnh báo lịch sử mở lớp | `offered` |
| Không giải được | Lý do + nút **cách gỡ** (Không nghỉ kỳ X, Học hè Y, Bỏ giả định rớt Z…), bấm là áp dụng và giải lại | — |
| Lưu, lịch sử | Đặt tên, **Lưu bản này** (cả lộ trình và mọi giả định); tối đa 10 bản; gắn sao = mốc; Mở; So với đang xem; Xóa | Mốc → `previous_plan` |
| So sánh | Hai bản bất kỳ, hoặc với **Kế hoạch giảng dạy**: ra trường, kỳ chính ngoài 15–18, kỳ nặng nhất, học hè, môn bắt buộc trễ kế hoạch khoa, số cảnh báo; giả định khác nhau; môn đổi kỳ kèm tên | Không gọi bộ giải |
| Khác | Học xong trước kỳ X, Môn muốn học; thu gọn khối Kịch bản | `graduate_by`, `preferences.wanted_courses` |

### 4.3 Luồng bấm Giải

```
Trang (index.tsx) ── buildPayload(scenario, mốc) ──► POST /api/plans/solve
  ▼
PlannerService.solve
  │ free_choices: tra mã trong courses (thiếu → 400 "Không tìm thấy môn")
  │ loadSource: đọc database của tài khoản
  │   curricula, curriculum_courses, course_groups (+members), course_relations, course_categories,
  │   course_opened_semesters, student_profiles, student_courses, student_progress_imports (điểm, data.web)
  │ buildPlannerInput (planner-input.ts, hàm thuần; KHÔNG đưa tên, MSSV):
  │   khối Bắt buộc suy ra · môn tốt nghiệp / điều kiện theo nhóm · đồ án không học hè
  │   kỳ hiện tại = data.web.current_semester hoặc theo ngày · block_choices → block_overrides
  │   luật: 11–25 TC kỳ chính, hè ≤ 12, 15–18 mềm, ghim tuyệt đối, năm học theo TC tích lũy, lịch sử mở lớp mềm
  ▼
PlannerRunner → python -m planner.cli --solver cpsat   (JSON qua stdin/stdout)
  │ normalize: bỏ môn điều kiện, chuyên ngành, đổi khối tự chọn tự do thành ô FREE_, trừ môn đã đạt / bạn chọn
  │ solve_cpsat: biến 0/1 "môn c ở kỳ i"; luật cứng; mục tiêu gộp theo thứ tự ưu tiên
  │ validate_plan: kiểm lại độc lập
  │ không giải được → _explain_unsat: bỏ từng lựa chọn → cách gỡ; không đủ thì nới từng luật
  │ số TC muốn không đạt → _explain_targets: lý do thật
  ▼
Kết quả: status, semesters[courses], warning_items (+ rule), requests, infeasible_reason / fixes,
         course_facts (để trang tự tính kỳ được/không), preferences_report, assumptions
  ▼
Trang: dải chỉ số (so với lần giải trước), bảng kỳ, cảnh báo trên hàng, "Yêu cầu của bạn"
```

Trên dữ liệu KHMT 2023 (sinh viên bịa), một lần Giải kể cả phần giải thích mất 0,2–1,5 giây (đo 23/11).

### 4.4 Luồng lưu trạng thái trang

- Mỗi thay đổi (kịch bản, lộ trình đang xem, số chỗ đã sửa, lịch sử) được tự lưu sau 0,6 giây: `PUT /api/plans/settings` ghi `data.web.planner` (tối đa 200 KB).
- **Không gọi bộ giải** khi lưu.
- Mở trang: `GET /api/plans/settings` khôi phục đúng trạng thái lần trước, đổi máy hay đăng xuất vẫn còn. Mở trang không giải.
- Cài đặt cũ (trước 23/11) có "mốc" thì thành bản "Mốc cũ" gắn sao.

---

## 5. API của hai trang

| API | Trang | Ghi gì |
|---|---|---|
| `POST /api/plans/mybk/review` | Môn học | Không ghi |
| `POST /api/plans/mybk/import` | Môn học | `student_progress_imports`, `student_courses`, `student_profiles` |
| `GET /api/plans/mybk/progress` | Môn học | Không |
| `PUT /api/plans/mybk/adjustments` | Môn học (Hiệu chỉnh) | `student_courses`, `data.web` |
| `PUT /student-courses/me`, `PUT /student-plan-courses/me/:curriculumId` | Môn học (tab Chương trình) | `student_courses`, `student_plan_courses` |
| `POST /api/plans/solve` | Gợi ý | Không ghi |
| `GET/PUT /api/plans/settings` | Gợi ý | `data.web.planner` |
| `GET /api/plans/interest-tags` | Gợi ý (Clingo, đang ẩn) | Không |

Mọi API cần đăng nhập (401 nếu chưa) và chỉ đọc/ghi dữ liệu của chính tài khoản.

---

## 6. Còn mở

- **Q2:** tab Chương trình vẫn ghi `student_courses`, có thể lệch với file myBK + Hiệu chỉnh.
- **W12:** thứ tự ưu tiên mặc định chưa chốt (đang để Ra trường sớm > 15–18 TC > Không học dư).
- **Giai đoạn 12 chưa bấm thử trên web** (T66, [05 mục G](05-kiem-thu.md)).
- Lưu nhiều bản chưa đo dung lượng thật so với giới hạn 200 KB.
- Bộ giải Clingo chưa hiểu các trường mới (trang chỉ dùng CP-SAT).
- Thiết kế giao diện mới (mẫu `mau-what-if`) áp sau; hiện là bố cục theo mẫu trên màu và font của web.
