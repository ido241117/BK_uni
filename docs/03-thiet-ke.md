# 03 · Thiết kế: tính năng "Gợi ý học phần"

Cập nhật 24/11/2026. Mô tả **cái đã có trong code**: tính năng, kiến trúc, từng file và hàm chính, hợp đồng API, quyết định thiết kế, bên trong hai bộ giải. Trạng thái việc và duyệt xem [02-ke-hoach.md](02-ke-hoach.md); sự thật đã kiểm chứng xem [01-boi-canh.md](01-boi-canh.md); cách kiểm tra xem [05-kiem-thu.md](05-kiem-thu.md).

---

## 1. Sinh viên làm được gì

Bản đầy đủ theo từng trang, kèm luồng UX: [06-tong-ket.md](06-tong-ket.md). Tóm tắt (24/11):

| # | Tính năng | Ở đâu |
|---|---|---|
| F1 | **Giải lộ trình** các kỳ còn lại theo QĐ 285 và chương trình, từ trạng thái môn đã có; **chỉ bấm Giải mới giải** | Trang Gợi ý, nút Giải dưới lộ trình |
| F2 | **What-if**: đậu/rớt môn đang học, giả định rớt môn tương lai, nghỉ kỳ, học hè, số TC muốn từng kỳ, ghim / chuyển môn, môn không mở / có mở, đổi môn cùng khối, ô tự chọn tự do gõ mã bất kỳ, 3 mục ưu tiên | Trang Gợi ý: bảng kỳ, khối Kịch bản |
| F3 | **Kiểm nhanh tại trang**: chọn một môn → kỳ nào chuyển vào được / không + lý do (không gọi bộ giải) | Bảng kỳ |
| F4 | **Kết quả**: kỳ ra trường, kỳ nặng nhất, học hè (so với lần giải trước), từng kỳ, cảnh báo kèm điều QĐ 285, yêu cầu của sinh viên đáp ứng tới đâu, mong muốn, giả định; không giải được thì lý do + nút **cách gỡ** | Trang Gợi ý |
| F5 | **Lưu bản, lịch sử, mốc, so sánh** (tối đa 10 bản; so với "Kế hoạch giảng dạy") | Khối Kịch bản, tab So sánh |
| F6 | **Giữ trạng thái trang** trong tài khoản (đổi máy, đăng xuất vẫn còn) | `data.web.planner` |
| F7 | **Nhập tiến độ myBK** (PDF hoặc chữ dán) → hộp xác nhận → lưu; **Hiệu chỉnh** trạng thái, học kỳ hiện tại, khối của môn, ghi chú | Trang Môn học, tab "Tiến độ myBK" (mục 4b) |
| F8 | (cũ, giao diện không còn dùng) Nhập file myBK ở trang Gợi ý qua `mybk/preview` | Mục 4 |

---

## 2. Kiến trúc

```
Trình duyệt (React, Frontend/src/pages/recommendations và pages/courses)
  │  POST /api/plans/solve          (JSON kịch bản + mốc what-if; chỉ khi bấm Giải)
  │  GET/PUT /api/plans/settings    (trạng thái trang Gợi ý: kịch bản, lộ trình đang xem, lịch sử 10 bản)
  │  PUT /api/plans/mybk/adjustments (Hiệu chỉnh ở trang Môn học)
  │  GET  /api/plans/interest-tags  (interest tags for the Clingo tab)
  │  POST /api/plans/mybk/review    (multipart PDF: xem trước, không ghi; trang Môn học, 21/11)
  │  POST /api/plans/mybk/import    (multipart PDF [+ apply_curriculum]: ghi sau khi xác nhận)
  │  GET  /api/plans/mybk/progress  (nội dung file đã lưu)
  │  POST /api/plans/mybk/preview   (cũ, giao diện không còn gọi: PDF/Excel)
  ▼
Backend NestJS (Backend/src/planner)
  │  đọc database (chỉ đọc): hồ sơ, chương trình, môn, khối, quan hệ, nhóm, lịch mở hè, trạng thái môn
  │  ghép JSON đầu vào bộ giải / đối chiếu file myBK với database
  │  gọi Python qua dòng lệnh, dữ liệu qua stdin/stdout:
  │     python -m planner.cli  --solver cpsat|clingo     (giải)
  │     python -m planner.mybk                           (đọc file myBK)
  ▼
pipeline/planner (Python)
  cli: kiểm tra đầu vào → normalize → CP-SAT hoặc Clingo → validator → báo cáo → JSON
  mybk: PDF (PyMuPDF) hoặc Excel (openpyxl) → JSON chuẩn hóa, tự kiểm tra tín chỉ
```

Ghi vào Supabase dùng chung: trạng thái môn của chính tài khoản, từ 20/11 bảng `student_progress_imports` (thêm bằng 1 migration, người duyệt cho phép), và từ 21/11 cột `curriculum_id` trong hồ sơ của chính tài khoản khi sinh viên đồng ý đặt chương trình theo file. Mọi lệnh ghi chỉ chạy ở `importMybk`, trong một transaction.

---

## 3. Luồng giải lộ trình (F1–F6)

1. **Trang** (`index.tsx`) giữ kịch bản (`scenario.ts`); mọi chỉnh sửa chỉ đổi kịch bản và tự lưu vào `PUT /plans/settings`. Bấm **Giải** thì `buildPayload` gom thành `SolvePlanPayload`, kèm `previous_plan` của bản gắn sao (mốc).
2. **Backend** `PlannerService.solve`: tra mã môn ở ô tự chọn tự do (`free_choices`, thiếu thì 400); `loadSource` đọc database theo tài khoản; `buildPlannerInput` (hàm thuần) ghép JSON cho bộ giải: môn bắt buộc suy ra, khối và khối con chuyên ngành, quan hệ TQ/SH/KN của chính chương trình, môn tốt nghiệp và điều kiện theo nhóm (T37), đồ án không học hè, lịch sử mở lớp, kỳ hiện tại sinh viên khai, khối sinh viên chọn (`block_overrides`), luật `PLANNER_RULES`. Không đưa tên, MSSV.
3. **`PlannerRunner.run`** gọi `python -m planner.cli`, giới hạn 60 giây.
4. **`cli.run`**: `normalize` → CP-SAT → `validate_plan` (độc lập) → `diff` so với mốc → `_explain_targets` (số TC muốn không đạt thì nêu lý do thật) → nếu UNSAT thì `_explain_unsat` bỏ từng lựa chọn của sinh viên (trả `infeasible_fixes`), rồi nới từng luật. Trả thêm `course_facts` để trang tự kiểm nhanh.
5. **Trang** hiện kết quả (`PlanResultView`, `SemesterBoard`); tab So sánh tính ở trình duyệt (`ComparePanel`, `whatIf.planMetrics`).

**Ràng buộc cứng** (kế hoạch mục 3.1): H1 mỗi môn ≤ 1 kỳ · H2 đủ môn bắt buộc · H3 đủ TC/số môn từng khối tự chọn · H4 tiên quyết phải **đạt** kỳ trước · H5 song hành đạt trước hoặc cùng kỳ (cùng kỳ thì cảnh báo) · H7 11–25 TC/kỳ chính, sinh viên hạ được · H8 môn không mở · H9 khóa môn · H10 xong trước kỳ X · H11 cấp độ môn theo năm (năm tính theo khóa) · H12 ngưỡng 65/70/85% cho thực tập/đồ án chuyên ngành/khóa luận (the other courses of the course's own term count too, 23/11/2026; ASP and validator only) · H13 ô tự chọn tự do · H14 tối đa 12 kỳ chính; hè chỉ xếp khi sinh viên bật (≤ 12 TC, không đồ án, chỉ môn từng mở hè), thực tập luôn xếp hè được · H15 chuyên ngành. "Học trước" (HT) đã bỏ.

**Mong muốn mềm, theo thứ tự ưu tiên**: S1 xong sớm nhất > S6 giữ khuyến nghị > S4 môn muốn học > S9 hè ưu tiên môn cấp 1–2 > S7 hè 6–9 TC > S2 không học thừa > S11 kỳ chính đủ 11 TC > S8 kỳ chính 15–18 TC > S5 đều tải > S3 ít đổi so với mốc > S10 ít học hè. Bật "ưu tiên giữ khuyến nghị" thì S6 lên trên S1. Mỗi mong muốn được báo lại là đáp ứng hay không.

---

## 4. Luồng nhập file myBK (F8, cũ: giao diện không còn dùng, giữ để tra; luồng hiện hành ở 4b)

1. Sinh viên chọn file → `previewMybk` gửi multipart.
2. Backend (`PlannerController.previewMybk`): cần đăng nhập, ≤ 5 MB, ≤ 10 lần/phút, file chỉ nằm trong bộ nhớ.
3. `PlannerRunner.readMybk` → `python -m planner.mybk` (bytes qua stdin) → JSON chuẩn hóa hoặc `INPUT_ERROR` kèm câu tiếng Việt (backend trả HTTP 400).
4. `PlannerService.previewMybk` đọc mọi chương trình, danh mục môn có trong file, trạng thái môn hiện tại, bảng nối mã → `analyzeMybk` (hàm thuần):
   - **Nhận chương trình (T20)**: có mã chương trình myBK (PDF) và có trong `mybk-program-map.json` thì dùng; không thì so danh sách môn. Khớp bằng nhau thì ưu tiên chương trình đúng khóa (suy từ file), rồi chương trình sinh viên đã chọn.
   - **Kiểm chương trình đã chọn (T21)**: cảnh báo khi chưa chọn, khi có chương trình khớp hơn rõ (> 5 điểm %), khi sai khóa, hoặc khi khớp < 80%.
   - **So dữ liệu (T23)**: môn trong khối CTĐT của myBK mà chương trình web không có; lệch tín chỉ; mã không có trong danh mục web; (PDF) môn web có mà myBK không liệt kê.
   - **Đề xuất trạng thái (T22)**: môn đạt → "Đã hoàn thành"; môn chưa đạt của chương trình → sinh viên chọn Chưa học / Đang học / Rớt.
5. Trang hiện màn hình xác nhận (`MybkImport`); bấm Lưu mới gọi API ghi nhiều môn sẵn có.

**Hai định dạng myBK** (đã xem file của một sinh viên KHMT 2023):

| | PDF "Tiến độ hoàn thành CTĐT" | Excel "Môn học CTĐT" |
|---|---|---|
| Mã chương trình | Có (`DH_CQ_MT_KHM_2023`) | Không |
| Môn | **Mọi môn** của chương trình; đạt có dấu ✓ | **Chỉ môn đã đạt** |
| Chưa học / rớt / đang học | Đều ghi "--", không phân biệt | Không có |
| Điều kiện tốt nghiệp | Có (ENG_GC_600, SA4001) | Không |
| Tự kiểm tra | Cộng "đạt" của các khối = tích lũy | Cộng TC các dòng = tích lũy |

---

## 4b. Luồng tải PDF tiến độ ↔ database (F9, giai đoạn 9–10, cập nhật 21/11)

Mục 4 ở trên là luồng cũ (F8, trang Gợi ý); giao diện không còn dùng. Luồng hiện tại ở trang Môn học.

### 4b.1 Từng bước

Nút **"Nhập tiến độ từ myBK"** mở hộp chọn cách nhập (2 tab): **Tải file PDF** (hướng dẫn: myBK → Cập nhật → In → Máy in đích **"Lưu dưới dạng PDF"**, không chọn "Microsoft Print to PDF") hoặc **Dán nội dung trang** (Ctrl+A, Ctrl+C trên trang Tiến độ, dán vào ô chữ; frontend gửi thành file `mybk-tien-do.txt` qua cùng API, backend nhận `format: 'pdf' | 'text'`).

```
Sinh viên chọn PDF hoặc dán chữ (MybkProgress.tsx, MybkUploadButton)
  │ 1. POST /api/plans/mybk/review  (multipart file: .pdf hoặc .txt)   ── KHÔNG GHI GÌ
  ▼
PlannerService.reviewMybk
  │ a. readMybkPdf → PlannerRunner.readMybk → python -m planner.mybk (bytes qua stdin) → JSON
  │    (format khác "pdf" → 400 "Chỉ nhận file PDF ...")
  │ b. Đọc database, song song:
  │      curricula WHERE source_code = file.official_program_code      (chương trình của file)
  │      student_profiles của tài khoản → curricula theo curriculum_id   (chương trình đang chọn)
  │      student_progress_imports của tài khoản (chỉ id)                 (đã từng tải file chưa)
  │      student_courses + courses của tài khoản                         (trạng thái môn trên web)
  │      courses WHERE code IN (mọi mã trong file)                        (danh mục)
  │    Có chương trình thì đọc thêm curriculum_courses + courses, curriculum_regulations của nó.
  │ c. reviewMybk(...)  (mybk-review.ts, hàm thuần) → chương trình, mâu thuẫn, tương ứng, trạng thái sẽ đổi
  │ d. Trả kèm nguyên JSON của file (`file`) để giao diện hiện lại
  ▼
Hộp xác nhận "Kiểm tra file tiến độ trước khi lưu"
  │ Hủy → không có gì xảy ra.
  │ 2. "Xác nhận và lưu" → POST /api/plans/mybk/import (file + apply_curriculum=true khi chương trình của file
  │    khác chương trình tài khoản đang theo; không có ô chọn: mã CTĐT myBK là gốc, người duyệt 21/11)
  ▼
PlannerService.importMybk  (một transaction)
  │ đọc lại file (không tin dữ liệu gửi từ trình duyệt), tìm lại chương trình theo source_code
  │ ghi: student_progress_imports (upsert theo user_id, JSON đầy đủ)
  │      student_courses (upsert): ✓ → completed, "--" → not-started; mã không có trong danh mục bỏ qua;
  │        rồi XÓA mọi môn khác của tài khoản (21/11: web luôn theo đúng file mới; sửa lại bằng Hiệu chỉnh)
  │      student_profiles.curriculum_id = chương trình của file (chỉ khi apply_curriculum, và
  │        đặt target_specialization_id = null nếu đổi chương trình; chưa có hồ sơ thì tạo)
  ▼
Trang cập nhật thẻ tiến độ (GET mybk/progress), bảng môn, hồ sơ
```

File PDF chỉ nằm trong bộ nhớ (multer memory storage, ≤ 5 MB, ≤ 10 lần/phút/endpoint), không ghi ra đĩa. Nút Xác nhận gửi lại file vì backend không giữ kết quả bước 1.

### 4b.1b Hiệu chỉnh (21/11)

Thẻ tiến độ có thanh trên cùng: **Học kỳ hiện tại** (kỳ đã khai, hoặc "tự tính theo ngày"), **Đang học: N môn, X TC** (cảnh báo khi > 25 TC, < 11 TC ở kỳ chính, > 12 TC ở kỳ hè), nút **Hiệu chỉnh**. Bảng môn có cột "Đạt (file)" (✓/--) và "Trên web" (trạng thái trong `student_courses`, nhãn **"Khác file tiến độ"** khi khác ✓→Đã hoàn thành / --→Chưa học); **không hiện điểm**. Khối "Môn trên web ngoài file" gồm môn thêm tay và PE1003/PE1005 suy từ CCGDTC.

GDTC: dòng CCGDTC của file hiện là "Giáo dục thể chất" (không mã), trạng thái lấy từ PE1003/PE1005 và đổi cả hai cùng lúc; PE1003/PE1005 không hiện riêng. Khối cuối "Môn ngoài chương trình đào tạo" = môn có trên web mà file không có (thêm tay).

Chế độ sửa: cột "Trên web" thành ô chọn 4 trạng thái, **mỗi lần đổi hỏi xác nhận OK/Hủy**; môn ở khối cuối có nút **Xóa** (cũng hỏi xác nhận; lưu thì gửi `remove_course_ids`); chọn học kỳ hiện tại (các kỳ từ năm áp dụng tới 7 năm sau); công tắc "Chỉ môn chưa đạt"; ô **"+ Môn đang học"** (tìm trong danh mục, ≥ 2 ký tự): môn đã có trong bảng thì hiện "· đã có trong bảng" và chọn vào là chuyển dòng đó sang Đang học; môn chưa có thì thêm vào khối "Môn trên web ngoài file" với Đang học. Đánh dấu Đang học được cả bằng ô này lẫn đổi trực tiếp ở bảng; **Hủy** / **Lưu hiệu chỉnh** → `PUT /api/plans/mybk/adjustments`.

Backend `adjustMybk`: kiểm môn có trong danh mục, rồi trong một transaction upsert `student_courses` và ghi `data.web.current_semester` của dòng tiến độ. `importMybk` giữ `data.web` khi nhập lại. `progressFromImport` → `PlannerProgress.current_semester` → `buildPlannerInput` dùng làm `student.current_semester` (chưa khai thì `currentSemester(ngày)`); bộ giải xếp từ kỳ sau, môn Đang học được giả định đậu (đổi ở what-if).

### 4b.2 Nối file với database

| Thông tin trong file | Nối với | Ghi chú |
|---|---|---|
| Mã CTĐT ở dòng "Ngành: … - `DH_CQ_MT_KHM_2023`" (`official_program_code`) | `curricula.source_code` | 132 chương trình đều có `source_code`, không trùng (kiểm 21/11). Thay bảng nối viết tay `mybk-program-map.json` (chỉ còn hàm `preview` cũ dùng) |
| Mã môn (`CO2003`…) | `courses.code` | KHMT 2023: 84/85 mã khớp; `CCGDTC` không có trong danh mục (mục 4b.4) |
| ✓ hay `--` | `student_courses.status` | ✓ → `completed`; `--` → `not-started` (xem 4b.5 về nghĩa của `--`) |
| Điều kiện tốt nghiệp (`ENG_GC_600`, `SA4001`) | `courses.code` (môn 0 TC trong chương trình) | Không phải mâu thuẫn khi file để chúng ở khối điều kiện thay vì khối môn |
| Tổng TC cần (`total_required`) | `curricula.total_credits` | KHMT 2023: 128 = 128 |
| Họ tên, MSSV, lớp, khoa, GPA, ngày cập nhật, điểm từng môn | Không nối; chỉ lưu trong JSON `student_progress_imports.data` | Chỉ chính tài khoản đọc được (`GET mybk/progress`) |

Cột `source_system`, `source_code`, `source_version`, `total_credits` do migration `CurriculumSourceAndGroupSemester1795600000000` bên nhánh `main` tạo (đã chạy trên Supabase). Nhánh này chỉ **khai** 4 cột trong `curriculum.entity.ts` để đọc, không có migration; gộp `main` thì bỏ phần khai này.

### 4b.3 Danh sách mâu thuẫn (`reviewMybk`)

| `id` | Mức | Khi nào | Ảnh hưởng nút Xác nhận |
|---|---|---|---|
| `check:<id>` | error | Bộ đọc file tự kiểm tra không qua (cộng TC đạt các khối ≠ "Số tín chỉ tích lũy"…) | Khóa |
| `program_code_missing` | error | File không có mã CTĐT | Khóa |
| `program_not_found` | error | Không chương trình nào có `source_code` = mã của file | Khóa |
| `profile_missing` | warning | Tài khoản chưa có chương trình; Xác nhận sẽ đặt theo file | Không |
| `profile_differs` | warning | Tài khoản đang theo chương trình khác chương trình của file; Xác nhận sẽ đổi sang chương trình của file | Không |

**Người dùng chỉ thấy mã CTĐT myBK** (`source_code`, vd `DH_CQ_MT_KHM_2023`) và tên ngành; mã nội bộ (`curricula.code`, vd `CS-2023-KHMT`) chỉ dùng trong web, không hiện ở hộp xác nhận, câu cảnh báo hay toast.
| `total_credits` | warning | Tổng TC của file ≠ `curricula.total_credits` | Không |
| `free_elective` | info | Môn trong file nhưng không thuộc chương trình (trừ khối "Môn học ngoài CTĐT" của myBK và mã chứng chỉ đã nối): **tính vào tự chọn tự do** (quyết định 19/11, như `normalize.py`). Vd IM3047 (3 TC, thuộc 5 chương trình khác) | Không |
| `missing_in_file` | warning | Môn của chương trình mà file không liệt kê (trừ môn tương ứng chứng chỉ). Với PDF của người duyệt (06/03) là 8 môn CO3129–CO3153, do PDF cũ (mục 4b.5) | Không |
| `credit_mismatch` | warning | Tín chỉ một môn trong file ≠ trên chương trình | Không |
| `unknown_codes` | info | Mã không có trong danh mục: chỉ lưu trong JSON, không ghi trạng thái | Không |

Ngoài ra trả `status_changes` (môn sẽ đổi trạng thái: web đang ghi → theo file) và `has_previous_import`. Lần đầu tải chỉ hiện số môn sẽ ghi; từ lần hai hiện bảng từng môn.

### 4b.4 Chứng chỉ GDTC (`CCGDTC` ↔ PE1003, PE1005)

myBK khóa 2023 gộp Giáo dục thể chất 1, 2 thành một dòng `CCGDTC` (khối "Chứng chỉ Giáo dục Thể chất"). Database tách thành PE1003, PE1005 (0 TC, có trong cả 132 chương trình) và không có nhóm nào nối tới `CCGDTC`; chỉ quy định "Chứng chỉ Giáo dục Thể chất" ghi "Trên myBK ghi theo CCGDTC" (46 chương trình, khóa 2023). Khóa 2024, 2026 ghi "Trên myBK ghi theo PE1009, PE1011, PE1013, PE1015…" (chưa có file mẫu nên chưa xử lý).

Cách nối (21/11, người duyệt): `CERTIFICATES = { CCGDTC: ['PE1003', 'PE1005'] }`, hàm thuần `certificateCourses(file, chương trình)` chỉ nối khi quy định của chương trình nhắc đúng mã chứng chỉ và chỉ lấy môn có trong chương trình. Hộp xác nhận hiện một dòng "Giáo dục thể chất: Đạt" (hoặc "Chưa đạt"); PE1003, PE1005 nằm trong bảng trạng thái sẽ đổi; `CCGDTC` không bị báo là mã lạ. **Lúc lưu**, `importMybk` gọi cùng hàm rồi ghi PE1003, PE1005 theo chứng chỉ (đạt → `completed`, chưa → `not-started`).

**File không có `CCGDTC`** (khóa 2024, 2026, chưa thấy file thật): cảnh báo `gdtc_unknown` "Chưa hoàn thành GDTC … Lộ trình không xếp GDTC"; PE1003, PE1005 không bị báo "file không liệt kê"; môn 0 TC ngoài chương trình (vd PE1009 Bóng đá) không đưa vào tự chọn tự do.

**Bộ giải không xếp GDTC** (người duyệt 21/11): `buildPlannerInput` đưa PE1003, PE1005 vào `conditions` (`NOT_SCHEDULED_CODES`), nên `normalize.py` bỏ khỏi lịch (CP-SAT), engine ASP coi là điều kiện tốt nghiệp (chưa đạt thì báo, không làm UNSAT).

### 4b.5 Bộ đọc PDF (`planner/mybk.py`) và giới hạn

**Không đo tọa độ.** PyMuPDF `page.get_text()` trả lớp chữ theo thứ tự đọc, mỗi ô bảng một dòng → chuẩn hóa (NFC, bỏ dấu cách không ngắt, gạch mềm, ký tự điều khiển) → đọc như một chuỗi ô:

1. Đầu trang: tìm theo nhãn trong 40 dòng đầu (`"Ngành:"` lấy mã sau dấu `-` cuối; `"Số tín chỉ tích lũy:"`; `"Mã sinh viên:"`; `"Điểm TBTL hệ 10:"`…). Không có mã CTĐT, tổng TC, hoặc chữ "Khối kiến thức" → lỗi "Không phải file PDF tiến độ myBK".
2. Bỏ tiêu đề cột lặp lại ở mỗi trang (`PDF_HEADER_CELLS`).
3. Máy trạng thái trên chuỗi ô:
   - **Đầu khối**: `"Khối kiến thức"` + `"Bắt buộc"`/`"Tự chọn"` → lùi lại lấy biểu tượng, `đạt/cần`, tên khối. Tên chứa "ngoài chương trình" → `NGOAICTDT`; "điều kiện tốt nghiệp" → điều kiện.
   - **Dòng môn**: `<stt số> <mã khớp CODE_RE> <tên, nhiều ô> <điểm số khớp SCORE_RE> <điểm chữ> <tín chỉ> [✓ = U+F00C]`.
   - Ô nằm giữa cuối dòng môn và đầu dòng/khối kế tiếp là **Ghi chú** của môn trước.
4. Tự kiểm tra (`self_checks`): cộng "đạt" các khối = "Số tín chỉ tích lũy"; mã không trùng.

**Khác màn hình, khác máy**: không ảnh hưởng vì đọc chữ, không đọc ảnh hay vị trí. Tên môn xuống dòng, bảng sang trang đã xử lý. **Có thể hỏng** khi: trình duyệt in PDF đổi thứ tự ô; font thiếu biểu tượng ✓ (phép cộng TC bắt được); PDF là ảnh scan (không có lớp chữ → báo lỗi). Mới thử trên **một** file thật. Dự phòng nếu gặp thứ tự ô đảo: đọc theo tọa độ (`get_text("words")`, gom theo cột), chưa làm.

**PDF không có chữ** (in bằng "Microsoft Print to PDF", scan, ảnh chụp): `read_pdf_lines` ra 0 dòng → lỗi "File PDF không có chữ để đọc (file được in bằng Microsoft Print to PDF). Trên myBK bấm In, ở ô Máy in chọn "Lưu dưới dạng PDF"…" (kiểm `metadata.producer`).

**Chữ dán (`parse_text`, 21/11)**: `detect_format` nhận chữ UTF-8 có "Ngành:" và "Khối kiến thức" là `text`. Mỗi dòng tách theo **Tab**: dòng khối = ô cuối là "Khối kiến thức Bắt buộc|Tự chọn", ô 2 là `đạt/cần` (khối chứng chỉ để trống); dòng môn = `<stt>\t[ ]<mã>\t<tên>\t<điểm số>\t<điểm chữ>\t<tín chỉ>\t<đạt>\t<ghi chú>`. Dấu ✓ là icon nên mất khi copy: `_passed_from_grade` coi **4–10 (điểm chữ khác F), 12 (MT, miễn), 21 (DT, đạt)** là đạt, `--` là chưa (chú thích "Điểm số > Điểm MT (12) > Điểm DT (21)" trên chính trang myBK). Kết quả cùng cấu trúc với PDF, thêm `passed_inferred: true`; `self_checks` cộng tín chỉ đạt các khối như PDF, nên suy sai thì nút Xác nhận bị khóa. Chữ không có Tab (copy trên điện thoại…) → lỗi, gợi ý dùng PDF.

**`--` trên PDF có 4 nghĩa** (theo mã trang myBK `function.js` của Phòng Đào tạo, người duyệt lấy 21/11, không commit): chưa học, rớt, tạm đạt (`tamdat = 1`: ẩn điểm), hoặc không tính vào tiến độ (`hieuluc = 0`). ✓ chỉ hiện khi `diemdat = 1`, `hieuluc = 1` và môn không bị dùng để xét tự chọn tự do (`xetchontctd ≠ 1`; khi đó cột Ghi chú ghi "Đã dùng để xét TCTD"). Công cụ cộng đồng `mybk-planner` ghi `diemdat` của CTĐT nghĩa là "có điểm" (môn rớt vẫn = 1); chưa kiểm được trên file có môn rớt. Vì vậy web ghi `--` thành "Chưa học" và sinh viên phải sửa tay được (T35). PDF in khi chưa bấm "Cập nhật" trên myBK thì cũ (PDF của người duyệt ghi 06/03, dữ liệu myBK ghi 14/11).

---

## 5. File và hàm

### 5.1 Python `pipeline/planner/`

| File | Vai trò | Hàm chính |
|---|---|---|
| `cli.py` | Cửa vào cho backend: JSON stdin → JSON stdout | `run` (toàn bộ luồng giải), `_explain_unsat` (lý do không có lộ trình), `_reason` (lý do xếp từng môn), `input_error`, `main` |
| `facts.py` | Đọc và kiểm tra đầu vào; các luật dùng chung (tín chỉ từng kỳ, kỳ hè, cấp độ, năm học, ngưỡng tốt nghiệp, thứ tự mong muốn) | `validate_input`, `credit_limits`, `summer_allowed`, `graduation_needs`, `course_level`, `semester_year`, `preference_order`, `assumptions` |
| `normalize.py` | Chuẩn hóa dữ liệu dùng chung cho cả hai bộ giải và validator (bỏ môn điều kiện, khối chuyên ngành, ô tự chọn tự do `FREE_k`, tổng TC chương trình); không chứa luật | `normalize` |
| `solve_cpsat.py` | Bộ giải OR-Tools CP-SAT: biến 0/1 môn×kỳ, ràng buộc tuyến tính, mục tiêu trọng số theo thứ tự mong muốn | `solve_cpsat` |
| `solve_asp.py` + `pipeline/engine/asp/` | Bộ giải "Clingo": adapter JSON → facts và engine ASP (`core/*.lp`, `policy.lp`), mức ưu tiên `@8..@0` (`ASP-ADAPTER.md`) | `build_program`, `solve_asp` |
| `result.py` | Dựng kết quả chung cho mọi bộ giải, so với mốc | `make_result`, `plan_map`, `diff` |
| `validate.py` | Kiểm tra lộ trình độc lập với bộ giải | `validate_plan` |
| `report.py` | Số đo từng mong muốn, báo cáo đáp ứng, cảnh báo | `metrics`, `objective`, `preferences_report`, `warnings` |
| `relations.py` | Bản chụp quan hệ môn 96 chương trình, đo độ nhất quán, suy ra quan hệ (không dùng khi giải) | `take_snapshot`, `consistency`, `enrich`, `coverage` |
| `fetch_curriculum.py` | Dựng fixture từ API đọc công khai | `build` |
| `compare.py`, `run_scenarios.py` | Đối chiếu chéo hai bộ giải, đo tốc độ, chạy kịch bản mẫu | `compare_fixture`, `benchmark`, `diagnose`, `run_all` |
| **`mybk.py`** (mới 19/11) | Đọc file tiến độ myBK. Từ 20/11, PDF trả thêm `name`, `score`, `letter`, `note` (cột Ghi chú; bỏ dòng tiêu đề nhóm khối, định dạng ghi chú thật chưa kiểm được vì file mẫu để trống) cho từng môn và điều kiện tốt nghiệp ("--" thành null), và khối `student` (khoa, họ tên, MSSV, mã lớp, năm áp dụng, TBTL hệ 10/4, đúng chuỗi trên file), để lưu và hiện lại đúng trang myBK (T28). Endpoint preview hiện vẫn chỉ trả các trường cũ | `parse_bytes` (cửa vào, nhận dạng định dạng), `parse_rows` (Excel), `read_pdf_lines` + `parse_pdf_lines` (PDF), `self_checks`, `_cohort` (khóa từ MSSV, chỉ trả năm), `_semester_of_date`, `main` |
| `data/relations-snapshot.json` | Bản chụp quan hệ môn, 96 chương trình, 19/11 | — |
| **`data/mybk-program-map.json`** (mới) | Bảng nối mã myBK → mã nhóm (1 cặp: `DH_CQ_MT_KHM_2023` → `CS-2023-KHMT`) | — |
| `fixtures/toy.json`, `fixtures/khmt2023.json` | Chương trình bịa và KHMT 2023 thật (sinh viên bịa) | — |

### 5.2 Backend `Backend/src/planner/`

| File | Hàm / lớp | Làm gì |
|---|---|---|
| `planner.controller.ts` | `solve`, `previewMybk` | Hai endpoint, đăng nhập bắt buộc, giới hạn tần suất |
| `planner.controller.ts` (20/11) | `importMybk`, `getProgress` | `POST mybk/import`, `GET mybk/progress` |
| **`mybk-import.ts`** (mới 20/11) | `planImportStatuses`, `importedCodes` | Hàm thuần: file đã đọc + danh mục → trạng thái môn cần ghi (✓ → completed, "--" → not-started, mã không có trong danh mục chỉ báo lại) |
| `planner.service.ts` (20/11) | `importMybk`, `getProgress` | Ghi trong một transaction: upsert `student_progress_imports` theo `user_id` + upsert `student_courses` |
| `student/entities/student-progress-import.entity.ts`, migration `1795600000000-student-progress-imports.ts` (mới 20/11) | `StudentProgressImport` | Bảng mới: `user_id` (duy nhất, xóa theo tài khoản), `format`, `official_program_code`, `source_updated_at`, `data` jsonb |
| `planner.service.ts` | `loadSource`, `solve`, `previewMybk`, `programMap` | Đọc database (chỉ đọc), gọi runner, đọc bảng nối mã |
| `planner-input.ts` | `buildPlannerInput`, `semestersFor`, `graduationKind`, `PLANNER_RULES`, `GRADUATION_CONDITION_CODES`, `NOT_SCHEDULED_CODES` (21/11: PE1003, PE1005) | Hàm thuần: database → JSON đầu vào bộ giải; mã điều kiện và GDTC vào `conditions` (không xếp lịch) |
| **`mybk-check.ts`** (mới) | `analyzeMybk` | Hàm thuần: file đã đọc + database → nhận chương trình, cảnh báo, so dữ liệu, đề xuất trạng thái (chỉ `preview` cũ dùng) |
| **`mybk-review.ts`** (mới 21/11) | `reviewMybk`, `CERTIFICATES` | Hàm thuần (T32): file + chương trình theo `source_code` + hồ sơ + danh mục + trạng thái web → `program`, `conflicts`, `equivalents`, `status_changes`, `can_confirm` (mục 4b.3, 4b.4). Test: `Backend/test/mybk-review.spec.ts` (6 test, dữ liệu bịa) |
| `planner.service.ts` (21/11) | `reviewMybk`, `importMybk(userId, file, applyCurriculum)`, `readMybkPdf`, `findBySourceCode` | Đọc database cho `reviewMybk`; `importMybk` thêm bước đặt `curriculum_id` trong cùng transaction |
| `curriculum/entities/curriculum.entity.ts` (21/11) | `source_system`, `source_code`, `source_version`, `total_credits` | Chỉ khai cột đã có trên Supabase (migration bên `main`) |
| `planner.runner.ts` | `run`, `readMybk`, `runModule` | Gọi `python -m <module>` qua stdin/stdout; biến môi trường `PLANNER_DIR`, `PLANNER_PYTHON`, `PLANNER_TIMEOUT_MS`, `PLANNER_DUMP_DIR` |
| `dto/solve-plan.dto.ts` | `SolvePlanDto` | Kiểm tra request giải (trường lạ → 400) |

### 5.3 Frontend

| File | Thành phần / hàm | Làm gì |
|---|---|---|
| `pages/recommendations/index.tsx` (viết lại 23/11, giai đoạn 12) | `RecommendationsPage` | Tab Lộ trình / So sánh; khối Kịch bản thu gọn được (đang học, ưu tiên, lịch sử, yêu cầu khác); **chỉ nút Giải gọi bộ giải**; đếm "đã sửa N chỗ, chưa kiểm"; Hoàn tác (30 bước, trong trang); lưu bản / mở / gắn sao (mốc) / xóa; tự lưu `{scenario, view, dirty, plans}` vào `PUT /plans/settings` |
| **`pages/recommendations/scenario.ts`** (23/11) | `Scenario`, `normalizeScenario`, `buildPayload`, `applyFix`, `describeScenario` | Kịch bản what-if (mục 12.2), payload gửi bộ giải, áp dụng cách gỡ (M11), mô tả giả định để so |
| **`pages/recommendations/localHints.ts`** (23/11) | `moveHint` | Chọn một môn → kỳ được / không được + lý do, tính từ `course_facts`, không gọi bộ giải (M6) |
| **`pages/recommendations/ComparePanel.tsx`** (23/11) | `ComparePanel` | Tab So sánh (M16): chỉ số 12.7, giả định khác nhau, môn đổi kỳ kèm tên |
| `pages/recommendations/SemesterBoard.tsx` (viết lại 23/11) | `SemesterBoard` | Bảng kỳ theo mẫu `mau-what-if` (học kỳ xếp dọc trên đường thời gian, môn là chấm khuyết + mã, tên bên dưới; màu, font của web): chọn môn → "Chuyển vào đây" (= ghim), kéo thả, ghim, không mở, giả định rớt, đổi môn cùng khối, gõ mã ô tự do, rê chuột xem chi tiết, môn chờ xếp; ô Nghỉ / Học hè / Muốn TC; bỏ Khóa kỳ (W13) |
| `pages/recommendations/priorities.ts`, `PriorityList.tsx` (23/11) | `priorityPayload`, `normalizePriorities` | 3 mục S1, S8, S2 (bật/tắt, lên/xuống) + 2 dòng mờ "bàn sau"; gửi `order` = mục bật + mục ẩn `S6, S4, OH, S3`, `disabled` = S2/S8 tắt |
| `pages/recommendations/PlanResultView.tsx` | `PlanResultView` | Hiện kết quả; dải chỉ số mờ khi còn sửa chưa giải; không giải được thì nút "Cách gỡ"; bỏ thẻ mốc (23/11) |
| **`pages/recommendations/whatIf.ts`** | `planOf`, `comparePlans`, `SavedPlan`, `addPlan`, `trimResult`, `planMetrics`, `teachingPlan`, `recommendedSemester`; `loadBaseline` (chỉ để chuyển mốc cũ) | Logic what-if; lưu bản (tối đa 10, bỏ bản cũ nhất không gắn sao); chỉ số so sánh; "Kế hoạch giảng dạy" |
| **`pages/recommendations/MybkImport.tsx`** (mới) | `MybkImport` | Nút tải file, màn hình xác nhận, lưu |
| **`pages/courses/components/MybkProgress.tsx`** (20/11, viết lại 21/11) | `MybkUploadButton`, `MybkReviewContent`, `MybkFileDetails`, `MybkProgressCard` | Nút tải PDF → `reviewMybk` → hộp xác nhận (chương trình, ô đặt chương trình, mâu thuẫn, tương ứng GDTC, trạng thái sẽ đổi, toàn bộ nội dung file) → `importMybk`. `MybkFileDetails` dùng chung cho hộp xác nhận và thẻ tiến độ: thông tin sinh viên, khối, cột Điểm số / Điểm chữ / Ghi chú. Thay `MybkImport` (không còn dùng) |
| `pages/courses/index.tsx` (rút gọn 21/11) | `CoursesPage`, `CourseCatalog` | Sinh viên: đầu trang (nút Phân tích nếu đã có chương trình, nút tải PDF), thông báo "Chưa có chương trình đào tạo", `MybkProgressCard`; bỏ thống kê, tóm tắt theo kỳ, bảng môn. Quản trị: `CourseCatalog` tra cứu danh mục (phân trang, tìm ở server). `components/SemesterSummary.tsx` không còn nơi nào dùng (để nguyên, nhánh `main` đã xóa file này) |
| `layouts/private/index.tsx`, `layouts/private/Sider/index.tsx`, `styles/layout.css`, `styles/tokens.css` (21/11) | `PrivateLayout`, `AppSider({collapsed, onToggle})` | Sidebar thu gọn còn cột icon 72px (`--sidebar-collapsed-width`), nút "Thu gọn" cuối sidebar, nhớ trong `localStorage` (`bkuni.sider.collapsed`, đọc/ghi lỗi thì coi như mở) |
| `apis/planner/index.ts` | `solvePlan`, `reviewMybk`, `importMybk({file, applyCurriculum})`, `getMybkProgress`, `previewMybk` (cũ) | Gọi API (chờ tối đa 2 phút) |
| `types/planner.ts` | `SolvePlanPayload`, `PlanResult`, `MybkPreview`… | Kiểu dữ liệu khớp hợp đồng |

### 5.4 Python `pipeline/tag_classifier/` (đang làm, từ 21/11)

Pipeline riêng tìm tag cho môn học từ đề cương trong database, để nhóm chọn tag cuối cùng (Excel workbook `review/<code>.xlsx`) rồi xuất sang `pipeline/planner/data/course-tags.json`. Không chạy khi giải lộ trình; có venv riêng. Chi tiết: `pipeline/tag_classifier/README.md`.

| File | Vai trò | Hàm chính |
|---|---|---|
| `common.py` | Shared by every step: config and paths, JSON / JSON Lines I/O, the topic-section list, loaders for courses, curricula, candidates and scores files | `load_config`, `load_records`, `load_curriculum`, `load_scores` |
| `extract.py` | Đọc database (chỉ đọc) → `data/snapshot/`; bước duy nhất chạm database | `fetch`, `assemble` |
| `preprocess.py` + `text.py` | Làm sạch đề cương → `data/courses.jsonl`, log từng thay đổi → `logs/preprocess.csv` | `preprocess`, `assign_languages`, `pick_versions`, `clean_text` |
| `eda.py` | Báo cáo dữ liệu sau bước 1 → `reports/01-data/report.md` + biểu đồ | `write_report` |
| `candidates.py` + `candidates_report.py` | Candidate tags per curriculum (structure, profile, clustered syllabus phrases), merge, suggested English labels, coverage, quality numbers → `data/candidates/`, `reports/02-candidates/` | `Builder.build`, `Builder.syllabus`, `Builder.judge`, `quality`, `render` |
| `family.py` | Program families: cohorts of one program (code without the cohort year, e.g. `CS-KHMT`), merged into one record (union of electives, all groups, profiles); steps 2-6 work per family | `family_id`, `merge_family`, `all_families`, `family_of_curricula` |
| `calibrate.py` | Measures the candidate thresholds from data (no human labels; capped false-positive rate; cluster threshold by syllabus purity) → `reports/02-candidates/calibration/` | `capped`, `capped_joint`, `collect`, `cluster_quality` |
| `models.py`, `phrases.py`, `structure.py` | Lazy embedding model (also used by the embedding scorer) and spaCy; section text, template lines, per-line noun-phrase cache, catalogue rarity, MMR; structure candidates, specialization lists, elective set | `Embedder`, `NounPhraser`, `section_text`, `PhraseIndex`, `template_lines`, `mmr`, `structure_candidates`, `specialization_members` |
| `classify.py` + `scorers.py` | Step 3: score each elective course × section × candidate tag with NLI, embedding and keyword scorers; SQLite score cache; tags renamed in the review workbook are scored under the new name | `classify`, `units`, `apply_renames`, `NLIScorer`, `EmbeddingScorer`, `KeywordScorer` |
| `aggregate.py` | Step 4: course tags by rule (a), majority of sections | `course_tags`, `aggregate` |
| `evaluate.py` + `metrics.py` + `charts.py` | Step 5: automatic evaluation (specialization recall, kappa, Krippendorff's alpha, section consistency, language stability) | `Evaluation`, `krippendorff_alpha`, `cohen_kappa` |
| `review.py`, `workbook.py`, `export.py` | Step 6: review workbook per curriculum (sheets Tags and Courses) plus `shared.xlsx` (one decision per tag name across programs; a program row's own decision wins); keeps the team's answers on regeneration; export kept tags (renames not re-scored are marked) to `pipeline/planner/data/course-tags.json` | `write`, `shared_rows`, `effective`, `read_reviews`, `not_rescored`, `build` |
| `bundle.py`, `merge_cache.py`, `notebooks/colab_classify.ipynb` | NLI scoring on a Colab GPU without database access; merge the Colab score cache locally | `merge` |
| `config.toml` | Ngưỡng và mẫu của mọi bước | — |

### 5.5 Python `pipeline/synthetic/` (open loop, from 23/11)

Synthetic students for one curriculum (CS-2023-KHMT), for evaluating the ASP planner without real data. Open loop (`pipeline/synthetic/DESIGN.md`): synthesize students and their records once with no solver, solve once per case with a pluggable solver (ASP by default; cached on disk), then evaluate and run sensitivity from stored data. Not used when solving a plan; uses the `pipeline/.venv`. Attrition rules come from QĐ 285 Điều 37 and Điều 24, as amended by QĐ 1260/2026 (sources per rule in the README). Details: `pipeline/synthetic/README.md`.

| File | Role | Main functions |
|---|---|---|
| `official_plan.json`, `official_plan.py` | Official plan transcribed from the PDF; check against the fixture (step 0) | `check` |
| `regulations.py` | Academic warning, suspension, withdrawal, max duration, year level | `warning_reasons`, `Standing`, `year_level` |
| `curriculum.py` | Fixture, grade scale, fees, tags; legality and graduation through `planner.validate` | `Curriculum`, `parse_policy`, `load_config` |
| `grades.py`, `population.py` | Score model (linear IRT-style, keyed noise); traits, interests, per-student parameters (step 1) | `draw_score`, `fail_probability`, `sample_students` |
| `plans.py`, `agent.py`, `simulate.py` | Official and baseline plans; the agent's options and utility; semester loop (step 2) | `official_spec`, `baseline_bundle`, `allpass_plan`, `options`, `record`, `run_student` |
| `solvers.py`, `solve.py` | Solver adapters (ASP, CP-SAT, plug-ins); solves with a disk cache; cut records (step 3) | `get_solver`, `solve_all`, `select_cuts` |
| `evaluate.py` | Full-plan comparison, first-attempt grades, replay after a fail, cut evaluation (step 4) | `evaluate_full`, `evaluate_cuts` |
| `sensitivity.py`, `checks.py`, `recovery.py` | Sensitivity from a pooled per-student design; legality, determinism, CRN and predictive checks; parameter recovery (steps 5–6) | `analyze`, `pool_checks`, `fit` |
| `visualize.py`, `EVALUATION.md` | Figures and report from stored results; definitions of every metric | `build` |
| `run.py`, `config.toml` | Pipeline driver writing `synthetic/data/<pool>/` (solver outputs in `solver-<label>/`); every parameter with base/low/high | `main` |

---

## 6. Hợp đồng API

**`POST /api/plans/solve`** — body (mọi trường không bắt buộc):
`solver`, `max_credits`, `semester_limits`, `graduate_by`, `in_progress_results`, `locked`, `not_offered`, `summer_opt_in`, `preferences {wanted_courses, balanced_load, recommendations_first}`, `student_flags {english_grad_reading, mos}`, `previous_plan {mã môn: mã kỳ}`.
Sprint 11 (22/11): `skip_semesters`, `frozen_semesters`, `semester_targets`, `preferences.order`. **Giai đoạn 12 (23/11):** `assumed_fail [{course_code, semester_code}]` (W1: giả định rớt, lần học đó tính TC của kỳ, học lại sau), `offered [{course_code, semester_code}]` (W2: gỡ phạt và cảnh báo lịch sử mở lớp), `free_choices [{course_code, semester_code}]` (T62: backend tra mã trong bảng `courses`, thiếu thì 400 "Không tìm thấy môn"; môn ngoài chương trình vào `courses` + `student.free_choices`, mọi môn đều được ghim vào kỳ đó), `preferences.disabled` (tắt S2/S8; `order` nhận thêm `S2`, `S8`).
ASP engine only (`solver: "clingo"`): `interests` (≤ 50 tag names from `GET /api/plans/interest-tags`; planned electives with these tags are preferred at the lowest objective priority; the result's `engine_report.interests` lists the planned courses for each).
Trả: `status` (`OPTIMAL` | `SAT_NOT_PROVEN_OPTIMAL` | `UNSAT` | `TIMEOUT` | `INPUT_ERROR`), `semesters[{semester_code, credits, courses[{code, credits, reason, locked}]}]`, `graduation_semester`, `preferences_report`, `assumptions`, `warnings`, `violations`, `diff_vs_previous`, `infeasible_reason`, `unverified_prerequisites`. Giai đoạn 12 thêm: `infeasible_fixes [{kind, label, course?, semester?}]` (cách gỡ, mỗi cái bỏ đúng một lựa chọn là có lộ trình; ghim tuyệt đối thì không đề xuất bỏ ghim), `course_facts {mã: {prerequisites, corequisites, summer: internship|excluded|history|no_history, terms}}` (môn chưa đạt), `credit_rules {main_max, summer_max}`, `semesters[].courses[].assumed_fail` (lần học giả định rớt), `warning_items[].rule` (điều QĐ 285), loại cảnh báo mới `skip_consecutive`, `target_over_law`, `offering_history` (`confirm: "offered"`), dòng `requests` loại `assumed_fail`, `offered`; dòng `target` không đạt nêu lý do thật (`_explain_targets`). Lỗi: 401 chưa đăng nhập, 400 chưa chọn chương trình hoặc trường lạ, 502 không chạy được Python.

**`GET /api/plans/interest-tags`** (21/11) — the tags of `pipeline/planner/data/course-tags.json` (written by `pipeline/tag_classifier`) that have courses in the student's program, taken from the list of the program's family (`families[curriculum code]` → `by_family`), else the merged `tags` list: `{tags: [{tag, courses: [code]}]}`, sorted by tag. Empty when the student has no program or the file does not exist. Reads no student data besides the profile's program. Errors: 401.

**`POST /api/plans/mybk/review`** (21/11, T32) — multipart `file` (chỉ PDF, ≤ 5 MB). **Không ghi gì.** Trả:
`file` (nguyên JSON của `planner.mybk`, gồm `student`),
`program {official_program_code, matched {id, code, name, cohort, source_code, source_version, total_credits, course_count} | null, profile {id, code, name} | null, same_as_profile}`,
`conflicts [{id, level: error|warning|info, title, codes?}]` (mục 4b.3),
`equivalents [{file_code, passed, courses [{code, name}]}]` (mục 4b.4),
`status_changes [{code, name, web, file}]`, `has_previous_import`, `can_confirm` (false khi có mâu thuẫn mức error). Lỗi: 400 không phải PDF tiến độ / không có file, 401, 413.

**`POST /api/plans/mybk/import`** (20/11; 21/11 thêm `apply_curriculum`) — multipart `file` (chỉ PDF, ≤ 5 MB) và trường form tùy chọn `apply_curriculum=true`. Ghi trong một transaction: `student_progress_imports` của tài khoản (ghi đè), `student_courses` đúng như file, và khi có `apply_curriculum` thì `student_profiles.curriculum_id` = chương trình có `source_code` của file (bỏ chuyên ngành mục tiêu nếu đổi chương trình). Trả `{imported_at, data, written_courses, unknown_codes, curriculum {id, code, name} | null}`. Lỗi: 400 file không phải PDF tiến độ, hoặc `apply_curriculum` mà không tìm được chương trình; 401.

**`PUT /api/plans/mybk/adjustments`** (21/11, Hiệu chỉnh) — body `{current_semester?: "YYS", items: [{course_id, status}], remove_course_ids?: [uuid]}` (≤ 1000 dòng, chỉ cần môn đổi). Cần đã nhập tiến độ (không thì 400). Ghi `student_courses` và `data.web.current_semester` trong một transaction; trả như `GET mybk/progress` + `written_courses`. Lỗi: 400 kỳ sai định dạng, môn không có trong danh mục, chưa nhập tiến độ; 401. 22/11 thêm `notes?: [{code, note}]` (`data.web.notes`) và **T46** `block_choices?: [{code, group_id | "required" | null}]` (`required` = khối Bắt buộc do backend suy ra, gửi bộ giải là `Bat buoc (suy ra)`) → `data.web.block_choices` = `{mã môn: id khối}` (null = về khối mặc định). Web không chặn khối nào (người duyệt: hoàn toàn tôn trọng lựa chọn của sinh viên). `GET mybk/progress` trả thêm `notes`, `block_choices`.

**Cảnh báo có cấu trúc (23/11):** `cli.run` trả thêm `warning_items: [{kind, course?, semester?, confirm?, text, message}]` (`report.warning_items`; `warnings` = các `text`, giữ cho test cũ). Trang Gợi ý gắn `message` vào thẻ môn / đầu kỳ; `confirm: "english"` → nút "Mình đạt rồi" ghi ENG_GC* Đã hoàn thành qua `PUT mybk/adjustments`. `validate.py`: kỳ hè không báo "chưa từng mở" cho ô `FREE_` và khi `rules.offering_soft`.

**Khối sinh viên chọn → bộ giải (T46, 22/11):** `progressFromImport` → `PlannerProgress.block_choices` → `buildPlannerInput` đổi id khối thành tên, gửi `student.block_overrides = {mã môn: tên khối}` (bỏ khối không còn, môn không có trong `courses`, môn điều kiện). `normalize.py` bước 0: bỏ môn khỏi mọi khối; khối `listed` thì thêm vào khối đó (môn ngoài CTĐT được thêm vào `curriculum_courses` để bộ giải xét); khối `any` thì tín chỉ tính vào tự chọn tự do. `cli.run` ghi `student._assumed_pass` = môn Đang học mà kịch bản giả định đậu; `normalize` tính chúng như đã đạt khi trừ ô tự chọn tự do (trước 22/11 chỉ tính môn Đã hoàn thành nên xếp dư ô).

**`GET /api/plans/mybk/progress`** (20/11; 21/11 thêm `current_semester`, `current_semester_source: "student" | "auto"`) — trả `{imported_at, data}` của chính tài khoản; `data` = null khi chưa tải. `data` là JSON của `python -m planner.mybk`, có cả họ tên, MSSV, điểm.

**`POST /api/plans/mybk/preview`** — multipart, trường `file` (PDF hoặc .xlsx, ≤ 5 MB). Trả:
`file {format, official_program_code, total_required, total_earned, updated_at, exported_semester, cohort_hint, checks[], course_count, passed_count, blocks[], graduation_conditions[], lists_only_passed}`,
`detection {method, best, chosen, candidates[3], warning}`,
`data_check {not_in_curriculum[], credit_mismatches[], unknown_codes[], missing_in_file[]}`,
`passed[]`, `not_passed[]` (mỗi dòng: `course_id, code, name, credits, current_status`). Không ghi gì. Lỗi: 400 file sai/không có file, 401, 413 file quá lớn.

---

## 7. Quyết định thiết kế chính

| Quyết định | Lý do |
|---|---|
| Bộ giải và bộ đọc file viết bằng Python, backend gọi qua dòng lệnh | Giữ nguyên bộ giải đã kiểm chứng; test riêng từng lớp; cùng một chỗ cho PDF và Excel |
| Hai bộ giải độc lập + validator độc lập | Đối chiếu chéo; validator bắt lỗi của chính bộ giải |
| Hàm ghép dữ liệu (`buildPlannerInput`, `analyzeMybk`) là hàm thuần | Test được không cần database thật |
| Mức 11–25 TC, năm học theo khóa, bỏ "học trước" | Người duyệt chọn (18/11), ghi rõ trên giao diện là khác QĐ 285 |
| Chỉ dùng quan hệ tiên quyết của chính chương trình | Người duyệt (19/11); bản chụp 96 chương trình chỉ để báo độ tin cậy |
| Mốc what-if lưu ở localStorage | Không được sửa Supabase chung; đổi lại: chỉ trình duyệt đó thấy |
| So mốc tính ở trình duyệt, không dùng chuỗi `diff_vs_previous` | Có cấu trúc (dời/mới/bỏ, kỳ trước/sau), câu chữ có dấu |
| File myBK đọc rồi bỏ, không lưu; kết quả không có tên, MSSV, mã lớp, điểm | Mục 8 kế hoạch; MSSV chỉ dùng lấy 2 chữ số khóa |
| Không tự lưu: sinh viên xác nhận từng môn chưa đạt | Cả PDF lẫn Excel đều không phân biệt chưa học / đang học / rớt |
| Bảng nối mã myBK để trong repo | Không thêm bảng vào database chung. **Từ 21/11 thay bằng `curricula.source_code`** cho luồng PDF |
| (21/11) Xem trước rồi mới ghi; mọi lần tải đều qua hộp xác nhận | Phải cho sinh viên thấy chương trình tìm được và mâu thuẫn trước khi ghi đè database (người duyệt 21/11) |
| (21/11) Bước ghi đọc lại file và tìm lại chương trình ở backend | Không tin kết quả xem trước gửi từ trình duyệt |
| (21/11) Mâu thuẫn mức error khóa nút Xác nhận | Không tìm được chương trình hoặc file đọc lệch thì ghi vào sẽ sai |
| (21/11) `CCGDTC` → PE1003, PE1005 cố định, chỉ khi quy định của chương trình nhắc `CCGDTC`; lúc lưu ghi trạng thái hai môn theo chứng chỉ | Hai môn có trong mọi chương trình; chỉ khóa 2023 dùng `CCGDTC` trên myBK (người duyệt 21/11) |
| (20/11) Lưu cả họ tên, MSSV, điểm trong `student_progress_imports` | Người duyệt quyết 20/11 (thay dòng "đọc rồi bỏ" ở trên cho luồng PDF); chỉ chính tài khoản đọc được |

---

## Phụ lục A. Nguồn dữ liệu (database web)

| Bảng | Trường dùng cho bộ giải | Ý nghĩa | Nguồn |
|---|---|---|---|
| `curricula` | `code`, `cohort`, `duration_years`, `min/max_semester_credits` | Một chương trình (ví dụ `CS-2023-KHMT`) | Nhóm tự đặt mã. Mức tín chỉ trong database là 11–24, **bộ giải không dùng**; nó lấy 11–25 theo quyết định của người duyệt (QĐ 285 ghi 14–21) |
| `courses` | `code`, `name`, `credits` | Danh mục 5 328 môn | Trích từ PDF CTĐT |
| `curriculum_courses` | `course_id`, kỳ khuyến nghị | Môn thuộc chương trình (KHMT 2023: 96 môn) | Trích từ PDF CTĐT |
| `course_groups` + `course_group_members` | `kind`, `required_count`, `required_credits`, `pool_scope`, `pool_course_credits`, `specialization_id`, `parent_group_id` | Khối bắt buộc, khối tự chọn | Trích từ PDF CTĐT |
| `course_relations` | `course_id`, `related_course_id`, `type` | TQ, HT, SH, KN theo từng chương trình (KHMT 2023: 11 TQ, 2 HT, 1 SH, 18 KN) | Trích từ PDF CTĐT |
| `course_opened_semesters` | `course_id`, `semester_code` | Kỳ môn **đã từng** mở | Lịch sử, không phải kế hoạch mở lớp |

Ghi chú: script trích PDF (`build-vertical.cjs`) **không có trong repo** (việc T18). Hiện chỉ đối chiếu tay được KHMT 2023 khớp 100% với PDF.

| Bảng | Trường dùng | Ý nghĩa | Nguồn |
|---|---|---|---|
| `student_profiles` | `curriculum_id`, `admission_year`, `target_specialization_id` | Sinh viên học chương trình nào, vào năm nào | Sinh viên tự chọn trong hồ sơ |
| `student_courses` | `course_id`, `status` | `not-started`, `in-progress`, `completed`, `failed` | Sinh viên tự khai, hoặc tải Excel/CSV theo mẫu của nhóm |
| `student_regulation_status` | `regulation_id`, `status` | Trạng thái các điều kiện của chương trình | **Chưa kiểm tra** bảng này chứa những điều kiện nào |

Bộ giải **không** đọc tên, MSSV, ngày sinh, số điện thoại hay điểm.

**Dữ liệu còn thiếu và cách bù** (không sửa schema):

| Thiếu | Vì sao cần | Cách bù (không sửa schema Supabase) |
|---|---|---|
| Kỳ hiện tại | Biết bắt đầu xếp từ kỳ nào | Backend tính từ ngày hiện tại theo mã kỳ `YYS` (ví dụ tháng 11/2026 là kỳ `261`) |
| Danh sách kỳ còn lại | Không gian xếp | Sinh từ kỳ hiện tại tới kỳ chính thứ 12 tính từ `admission_year` (Đ5.2); kỳ hè chỉ xếp khi sinh viên bật (thực tập luôn được) |
| Kỳ học của từng môn đã qua | Không cần | Năm học tính theo khóa: kỳ `YYS` là năm thứ `YY − (khóa mod 100) + 1` |
| Chuẩn tốt nghiệp Nghe–Đọc, MOS, điểm rèn luyện | Điều kiện khóa luận (Đ15.5, PL7, PL9) | Sinh viên khai trên trang Gợi ý, gửi kèm request (trường `student_flags`). Không khai thì **giả định đã đạt** và ghi vào `assumptions` |
| Kế hoạch mở lớp tương lai | Môn không mở thì không xếp | Mặc định giả định có mở; sinh viên khai `not_offered` trong kịch bản |
| Quan hệ môn còn thiếu trong chương trình của sinh viên | Tránh bỏ sót tiên quyết | Bản chụp quan hệ của 96 chương trình, gắn nhãn nguồn (GĐ 3) |

---

## Phụ lục B. JSON đầu vào bộ giải

Một file JSON duy nhất, **giống nhau cho cả hai bộ giải**. Mẫu: `pipeline/planner/fixtures/toy.json`, `fixtures/khmt2023.json`.

| Khối | Kiểu | Nội dung |
|---|---|---|
| `schema_version` | số nguyên | Hiện là 1 |
| `curriculum` | object | `code`, `cohort`, `duration_years`, `min_semester_credits`, `max_semester_credits` |
| `courses` | danh sách `{code, name, credits}` | Danh mục môn có liên quan |
| `curriculum_courses` | danh sách `{course_code, recommended_year, recommended_term}` | Môn thuộc chương trình |
| `course_groups` | danh sách `{name, kind, required_count, required_credits, members[]}` | `kind` là `required` hoặc `elective`. Khối tự chọn phải có ít nhất một ngưỡng |
| `course_relations` | danh sách `{course_code, related_course_code, type}` | `type`: `prerequisite`, `prior`, `corequisite`, `recommended` |
| `course_relations[].source` | `"curriculum"` \| `"inferred"` | Nguồn quan hệ |
| `semesters` | danh sách mã kỳ, theo thời gian | Mọi kỳ, kể cả kỳ đã qua |
| `student.current_semester` | mã kỳ | Kỳ đang học; bộ giải xếp từ kỳ **sau** kỳ này |
| `student.student_courses` | danh sách `{course_code, status}` | Trạng thái từng môn |
| `student.flags` | object | Chuẩn tiếng Anh tốt nghiệp, MOS |
| `offerings` | `{unknown_policy, records[]}` | `records`: `{course_code, semester_code, status: "not-offered"}`. `unknown_policy` hiện chỉ có `assume-open` |
| `rules` | object | `credits_min`, `credits_max`, `graduation_thresholds`, `max_main_semesters` (năm học lấy từ `curriculum.cohort`) |
| `scenario` (qua `planner.cli`) hoặc `scenarios` (fixture) | kịch bản | `in_progress_results`, `locked`, `not_offered`, `max_credits`, `semester_limits`, `graduate_by`, `summer_opt_in`, `preferences` |
| `previous_plan` | map mã môn → mã kỳ | Mốc what-if (S3) |
| `scenario.skip_semesters` / `frozen_semesters` | danh sách mã kỳ | (22/11) Nghỉ kỳ / khóa kỳ: môn không ghim không xếp vào |
| `scenario.semester_targets` | map mã kỳ → TC | (22/11) Số TC sinh viên muốn; mục mềm "ST" ưu tiên cao nhất, trần nới +2 |
| `scenario.preferences.order` | danh sách trong S1, S6, S4, S5, S10, OH, S3 | (22/11) Thứ tự ưu tiên do sinh viên sắp, chỉ gồm mục đang bật |
| `rules.pins_absolute` | bool | (22/11) Ghim tuyệt đối: luật xung đột với chỗ ghim bỏ qua cho môn đó, chỉ cảnh báo |
| `rules.year_by_credits` | vd `[28, 56, 84]` | (22/11) Năm học theo TC tích lũy (QĐ 285 Đ24) thay cho theo khóa |
| `rules.offering_soft` + `offering_history` | bool + map mã môn → loại kỳ (`"1"`, `"2"`, `"3"`) | (22/11) Lịch sử mở lớp là mềm (mục "OH") |
| `graduation_courses.<loại>` | mã môn **hoặc danh sách** | (22/11) Một loại có thể nhiều môn; backend luôn gửi danh sách; môn nhóm tốt nghiệp không nhận ra loại → `specialized_project` (70%) |
| `offering_history` | map mã môn → loại kỳ từng mở | (22/11) Backend suy từ `course_opened_semesters` |
| Học cải thiện | ghim môn đã đạt (`locked`) khi `pins_absolute` | (22/11) Học ở kỳ ghim; tính vào tải kỳ, không cộng TC tích lũy hay yêu cầu khối |
| Dư khối tự chọn → tự do | — | (22/11) Phần dư của khối tự chọn gốc (kể cả môn sẽ học) bù vào ô tự chọn tự do; CP-SAT và validator cùng luật |
| Kết quả: `semesters[].courses[].block`, `.slot` | tên khối, bool | (22/11) `slot = true`: môn tự chọn bộ giải tự chọn (sinh viên chưa ghim/chọn) hoặc ô tự do → giao diện hiện "khối (x TC) ▾" |
| Kết quả: `requests` | danh sách `{kind, item, status, detail}` | (22/11) Mỗi yêu cầu của sinh viên: `met` / `warning` / `partial` / `unmet` + lý do (`planner/student_requests.py`) |

**Bước kiểm tra đầu vào (`facts.validate_input`) từ chối** (không âm thầm bỏ qua) khi gặp: mã môn trùng hoặc không tồn tại; loại quan hệ hay trạng thái lạ; khối tự chọn không có ngưỡng; một môn thuộc hai khối; thiếu giả định cho môn đang học; kỳ bị khóa nằm ngoài các kỳ còn lại; kỳ hiện tại không có trong `semesters`.

---

## Phụ lục C. Bên trong hai bộ giải

Hai bộ giải **viết độc lập** và chỉ dùng chung bước kiểm tra đầu vào (`validate_input`), chuẩn hóa (`normalize`) và dựng kết quả (`make_result`). Mục đích là đối chiếu chéo: nếu hai bộ giải cho cùng giá trị mục tiêu thì khả năng cả hai cùng sai rất thấp.

### C.1 CP-SAT (OR-Tools), mặc định

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

### C.2 Clingo: engine ASP (từ 20/11/2026)

Lựa chọn `clingo` chạy **engine ASP** (`pipeline/engine/asp/core`, từ nhánh `research-pipeline`) qua adapter `pipeline/planner/solve_asp.py`. Encoding Clingo cũ (`planner/encoding.lp`, `planner/solve.py`, mô tả ở bản trước của mục này) đã bỏ.

**Nhận:** cùng JSON đầu vào; adapter dịch thành facts của engine (`in/2`, `map/3`, `prereq/2`, `taken/2`, `raw_score/2`, `pin/2`, `sem_max/2`...). Quy định của trường nằm trong `pipeline/engine/asp/policy.lp` (tải 14–21 TC, thang điểm, học phí), không lấy từ `PLANNER_RULES`.

**Xử lý:** nạp `core/encoding.lp`, `core/extension.lp`, `policy.lp`, facts, `core/translate.lp`, `core/optimize.lp` (đọc bằng Python vì Clingo trên Windows không mở được đường dẫn có dấu); grounding; solving với `--opt-mode=opt`, mức ưu tiên `@8..@0`; giới hạn mềm 30 giây.

**Trả:** atom `plan(môn, chỉ số kỳ)` (học lại là `rt(môn, k)`), đổi trạng thái như bảng dưới; thêm `engine_report` (GPA, chuyên ngành, điều kiện tốt nghiệp, lịch sử mở lớp, học phí, kỳ trống).

| Clingo trả | `status` của ta |
|---|---|
| Có lộ trình, đã chứng minh tối ưu (hoặc đã duyệt hết) | `OPTIMAL` |
| Có lộ trình, hết giờ trước khi chứng minh | `SAT_NOT_PROVEN_OPTIMAL` |
| Không lộ trình, `unsatisfiable` | `UNSAT` |
| Không lộ trình, hết giờ | `TIMEOUT` |

Chi tiết, bảng đối chiếu JSON → facts và khác biệt với CP-SAT: `pipeline/planner/ASP-ADAPTER.md`.

### C.3 Khác nhau trong thực tế

| | CP-SAT | Clingo |
|---|---|---|
| Thời gian trên dữ liệu sinh ngẫu nhiên 40–80 môn (encoding cũ, 15/11) | 80–250 ms, chứng minh được tối ưu | Có lộ trình nhưng không chứng minh xong trong 20 giây → thường trả `SAT_NOT_PROVEN_OPTIMAL` |
| KHMT 2023, 96 môn (engine ASP, 20/11) | dưới 1 giây, `OPTIMAL` | khoảng 1–2,5 giây kể cả grounding, `OPTIMAL` |
| Cách viết mức ưu tiên | Trọng số trong một tổng | Mức `@n` |
| Dễ đọc luật | Khó hơn | Gần câu chữ quy định |
| Cùng đầu vào, có cùng lộ trình không | **Không nhất thiết.** Có thể có nhiều lộ trình tốt ngang nhau. Chỉ so sánh bộ giá trị mục tiêu (kỳ cuối, tổng tín chỉ, số môn dời) | — |

Số đo: ngày 15/11/2026, Clingo 5.8.3, OR-Tools 9.15 (`docs/luu-tru/2026-11-15-planner-3-so-sanh.md`). Chưa đo trên chương trình thật.
