# 03 · Thiết kế: tính năng "Gợi ý học phần"

Cập nhật 19/11/2026. Mô tả **cái đã có trong code**: tính năng, kiến trúc, từng file và hàm chính, hợp đồng API, quyết định thiết kế, bên trong hai bộ giải. Trạng thái việc và duyệt xem [02-ke-hoach.md](02-ke-hoach.md); sự thật đã kiểm chứng xem [01-boi-canh.md](01-boi-canh.md); cách kiểm tra xem [05-kiem-thu.md](05-kiem-thu.md).

---

## 1. Sinh viên làm được gì

| # | Tính năng | Ở đâu trên trang Gợi ý (`/recommendations`) |
|---|---|---|
| F1 | **Giải lộ trình** các kỳ còn lại theo QĐ 285 và chương trình đào tạo, từ trạng thái môn đã khai | Nút "Giải lộ trình" |
| F2 | **Giả định đậu/rớt** từng môn đang học | Thẻ "Bạn đang học gì…" |
| F3 | **Ràng buộc cứng do sinh viên đặt**: tối đa TC mỗi kỳ (11–25), học xong trước kỳ X, bật kỳ hè, khóa môn vào kỳ, môn không mở ở kỳ | Thẻ "Bắt buộc phải theo" |
| F4 | **Mong muốn mềm**: môn muốn học, các kỳ đều tải, ưu tiên giữ khuyến nghị, đã có chuẩn tiếng Anh/MOS | Thẻ "Mong muốn" |
| F5 | **Chọn bộ giải** CP-SAT (mặc định, nhanh) hoặc Clingo | Thẻ cuối cột trái |
| F6 | **Kết quả**: kỳ học xong, TC còn lại, từng kỳ và lý do từng môn, mong muốn nào không đáp ứng được, cảnh báo, giả định, độ tin cậy dữ liệu tiên quyết; không có lộ trình thì nói **lựa chọn nào/luật nào** đang chặn; validator bắt lỗi thì cảnh báo đỏ | Cột phải |
| F7 | **What-if**: lưu lộ trình làm mốc, đổi kịch bản rồi giải lại, xem kỳ tốt nghiệp trước/sau, môn dời kỳ, môn mới, môn bỏ; nút Về mốc / Lấy làm mốc mới / Xóa mốc | Thẻ "So với lộ trình mốc" |
| F8 | **Nhập file tiến độ myBK** (PDF hoặc Excel): đọc file, nhận chương trình, cảnh báo chọn sai chương trình, so dữ liệu chương trình của web với myBK, sinh viên xác nhận rồi mới lưu trạng thái môn | Nút "Tải file tiến độ myBK" |
| F9 | **Tiến độ theo PDF myBK** (giai đoạn 9, 20/11): tải PDF ở trang Môn học → lưu nội dung file theo tài khoản và ghi trạng thái môn đúng như file, không bước xác nhận; thẻ hiện lại khối/môn/✓/điều kiện tốt nghiệp. Điểm, ghi chú, thông tin sinh viên có lưu, chưa hiện. Thay F8 trên giao diện | Trang Môn học (`/courses`) |

---

## 2. Kiến trúc

```
Trình duyệt (React, Frontend/src/pages/recommendations)
  │  POST /api/plans/solve          (JSON kịch bản + mốc what-if)
  │  POST /api/plans/mybk/preview   (multipart: file PDF/Excel)
  │  PUT  /api/student-courses/me   (API sẵn có: lưu trạng thái môn sau khi xác nhận)
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

Ghi vào Supabase dùng chung: trạng thái môn của chính tài khoản, và từ 20/11 bảng `student_progress_imports` (thêm bằng 1 migration, người duyệt cho phép).

---

## 3. Luồng giải lộ trình (F1–F7)

1. **Trang** gom kịch bản thành `SolvePlanPayload`; nếu có mốc thì thêm `previous_plan` (`index.tsx → buildPayload`).
2. **Backend** `PlannerService.loadSource` đọc database theo tài khoản; `buildPlannerInput` (hàm thuần) ghép JSON cho bộ giải: môn bắt buộc suy ra, khối và khối con chuyên ngành, quan hệ TQ/SH/KN của chính chương trình, môn tốt nghiệp (nhóm D), điều kiện (nhóm E), môn không xếp hè (tên có "đồ án"), lịch sử mở hè, luật `PLANNER_RULES`, danh sách kỳ. Không có tên, MSSV.
3. **`PlannerRunner.run`** gọi `python -m planner.cli`, giới hạn 60 giây (Clingo 30 giây, CP-SAT 20 giây bên trong).
4. **`cli.run`**: `normalize` → bộ giải → `validate_plan` (độc lập) → `diff` so với mốc → nếu UNSAT thì `_explain_unsat` thử bỏ từng lựa chọn của sinh viên, rồi nới từng luật của trường, để nói cái gì chặn.
5. **Trang** hiện kết quả (`PlanResultView`); what-if so mốc ở trình duyệt (`whatIf.comparePlans`).

**Ràng buộc cứng** (kế hoạch mục 3.1): H1 mỗi môn ≤ 1 kỳ · H2 đủ môn bắt buộc · H3 đủ TC/số môn từng khối tự chọn · H4 tiên quyết phải **đạt** kỳ trước · H5 song hành đạt trước hoặc cùng kỳ (cùng kỳ thì cảnh báo) · H7 11–25 TC/kỳ chính, sinh viên hạ được · H8 môn không mở · H9 khóa môn · H10 xong trước kỳ X · H11 cấp độ môn theo năm (năm tính theo khóa) · H12 ngưỡng 65/70/85% cho thực tập/đồ án chuyên ngành/khóa luận · H13 ô tự chọn tự do · H14 tối đa 12 kỳ chính; hè chỉ xếp khi sinh viên bật (≤ 12 TC, không đồ án, chỉ môn từng mở hè), thực tập luôn xếp hè được · H15 chuyên ngành. "Học trước" (HT) đã bỏ.

**Mong muốn mềm, theo thứ tự ưu tiên**: S1 xong sớm nhất > S6 giữ khuyến nghị > S4 môn muốn học > S9 hè ưu tiên môn cấp 1–2 > S7 hè 6–9 TC > S2 không học thừa > S11 kỳ chính đủ 11 TC > S8 kỳ chính 15–18 TC > S5 đều tải > S3 ít đổi so với mốc > S10 ít học hè. Bật "ưu tiên giữ khuyến nghị" thì S6 lên trên S1. Mỗi mong muốn được báo lại là đáp ứng hay không.

---

## 4. Luồng nhập file myBK (F8)

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
| `planner-input.ts` | `buildPlannerInput`, `semestersFor`, `graduationKind`, `PLANNER_RULES` | Hàm thuần: database → JSON đầu vào bộ giải |
| **`mybk-check.ts`** (mới) | `analyzeMybk` | Hàm thuần: file đã đọc + database → nhận chương trình, cảnh báo, so dữ liệu, đề xuất trạng thái |
| `planner.runner.ts` | `run`, `readMybk`, `runModule` | Gọi `python -m <module>` qua stdin/stdout; biến môi trường `PLANNER_DIR`, `PLANNER_PYTHON`, `PLANNER_TIMEOUT_MS`, `PLANNER_DUMP_DIR` |
| `dto/solve-plan.dto.ts` | `SolvePlanDto` | Kiểm tra request giải (trường lạ → 400) |

### 5.3 Frontend

| File | Thành phần / hàm | Làm gì |
|---|---|---|
| `pages/recommendations/index.tsx` | `RecommendationsPage`, `CourseSemesterList` | Trang Gợi ý: kịch bản, gọi giải, giữ mốc (`snapshot`, `applyScenario`, `changeBaseline`) |
| `pages/recommendations/PlanResultView.tsx` | `PlanResultView`, `WhatIfCard` | Hiện kết quả; thẻ so mốc; nhãn "dời từ …", "mới so với mốc" |
| **`pages/recommendations/whatIf.ts`** (mới) | `planOf`, `comparePlans`, `isSameAsBaseline`, `loadBaseline`, `storeBaseline`, `baselineKey` | Logic what-if, lưu mốc trong localStorage (khóa theo tài khoản và chương trình) |
| **`pages/recommendations/MybkImport.tsx`** (mới) | `MybkImport` | Nút tải file, màn hình xác nhận, lưu |
| **`pages/courses/components/MybkProgress.tsx`** (mới 20/11) | `MybkUploadButton`, `MybkProgressCard` | Nút tải PDF (gọi import, không xác nhận); thẻ tiến độ đọc `GET mybk/progress`. Thay `MybkImport` (không còn dùng) |
| `apis/planner/index.ts` | `solvePlan`, `previewMybk` | Gọi API (chờ tối đa 2 phút) |
| `types/planner.ts` | `SolvePlanPayload`, `PlanResult`, `MybkPreview`… | Kiểu dữ liệu khớp hợp đồng |

### 5.4 Python `pipeline/tag_classifier/` (đang làm, từ 21/11)

Pipeline riêng tìm tag cho môn học từ đề cương trong database, để nhóm chọn tag cuối cùng (file CSV) rồi xuất sang `pipeline/planner/data/course-tags.json`. Không chạy khi giải lộ trình; có venv riêng. Chi tiết: `pipeline/tag_classifier/README.md`.

| File | Vai trò | Hàm chính |
|---|---|---|
| `common.py` | Shared by every step: config and paths, JSON / JSON Lines I/O, the topic-section list, loaders for courses, curricula, candidates and scores files | `load_config`, `load_records`, `load_curriculum`, `load_scores` |
| `extract.py` | Đọc database (chỉ đọc) → `data/snapshot/`; bước duy nhất chạm database | `fetch`, `assemble` |
| `preprocess.py` + `text.py` | Làm sạch đề cương → `data/courses.jsonl`, log từng thay đổi → `logs/preprocess.csv` | `preprocess`, `assign_languages`, `pick_versions`, `clean_text` |
| `eda.py` | Báo cáo dữ liệu sau bước 1 → `reports/01-data/report.md` + biểu đồ | `write_report` |
| `candidates.py` + `candidates_report.py` | Candidate tags per curriculum (structure, profile, clustered syllabus phrases), merge, suggested English labels, coverage, quality numbers → `data/candidates/`, `reports/02-candidates/` | `Builder.build`, `Builder.syllabus`, `Builder.judge`, `quality`, `render` |
| `models.py`, `phrases.py`, `structure.py` | Lazy embedding model (also used by the embedding scorer) and spaCy; section text, template lines, per-line noun-phrase cache, catalogue rarity, MMR; structure candidates, specialization lists, elective set | `Embedder`, `NounPhraser`, `section_text`, `PhraseIndex`, `template_lines`, `mmr`, `structure_candidates`, `specialization_members` |
| `classify.py` + `scorers.py` | Step 3: score each elective course × section × candidate tag with NLI, embedding and keyword scorers; SQLite score cache; tags renamed in the review CSV are scored under the new name | `classify`, `units`, `apply_renames`, `NLIScorer`, `EmbeddingScorer`, `KeywordScorer` |
| `aggregate.py` | Step 4: course tags by rule (a), majority of sections | `course_tags`, `aggregate` |
| `evaluate.py` + `metrics.py` + `charts.py` | Step 5: automatic evaluation (specialization recall, kappa, Krippendorff's alpha, section consistency, language stability) | `Evaluation`, `krippendorff_alpha`, `cohen_kappa` |
| `review.py`, `export.py` | Step 6: review CSV per curriculum (keeps the team's answers on regeneration); export kept tags to `pipeline/planner/data/course-tags.json` | `write`, `read_reviews`, `build` |
| `bundle.py`, `merge_cache.py`, `notebooks/colab_classify.ipynb` | NLI scoring on a Colab GPU without database access; merge the Colab score cache locally | `merge` |
| `config.toml` | Ngưỡng và mẫu của mọi bước | — |

---

## 6. Hợp đồng API

**`POST /api/plans/solve`** — body (mọi trường không bắt buộc):
`solver`, `max_credits`, `semester_limits`, `graduate_by`, `in_progress_results`, `locked`, `not_offered`, `summer_opt_in`, `preferences {wanted_courses, balanced_load, recommendations_first}`, `student_flags {english_grad_reading, mos}`, `previous_plan {mã môn: mã kỳ}`.
Trả: `status` (`OPTIMAL` | `SAT_NOT_PROVEN_OPTIMAL` | `UNSAT` | `TIMEOUT` | `INPUT_ERROR`), `semesters[{semester_code, credits, courses[{code, credits, reason, locked}]}]`, `graduation_semester`, `preferences_report`, `assumptions`, `warnings`, `violations`, `diff_vs_previous`, `infeasible_reason`, `unverified_prerequisites`. Lỗi: 401 chưa đăng nhập, 400 chưa chọn chương trình hoặc trường lạ, 502 không chạy được Python.

**`POST /api/plans/mybk/import`** (20/11) — multipart `file` (chỉ PDF, ≤ 5 MB). Ghi `student_progress_imports` của tài khoản (ghi đè) và `student_courses` đúng như file. Trả `{imported_at, data, written_courses, unknown_codes}`. Lỗi: 400 file không phải PDF tiến độ, 401.

**`GET /api/plans/mybk/progress`** (20/11) — trả `{imported_at, data}` của chính tài khoản; `data` = null khi chưa tải. `data` là JSON của `python -m planner.mybk`, có cả họ tên, MSSV, điểm.

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
| Bảng nối mã myBK để trong repo | Không thêm bảng vào database chung |

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
