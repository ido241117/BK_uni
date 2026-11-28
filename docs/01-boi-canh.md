# 01 · Bối cảnh đã kiểm chứng (cập nhật 24/11/2026)

> **Đọc nhanh (24/11):** sự thật hiện hành nằm ở mục **6e** (database từ 20/11, luồng PDF ↔ database) và **6f** (giai đoạn 12). Mục 2, 2b, 5, 6, 6b, 6c, 6d ghi theo ngày của từng mục, giữ để tra lịch sử: database thay toàn bộ dữ liệu chương trình ngày 20/11; bộ giải Clingo cũ (`encoding.lp`, `solve.py`) được thay bằng engine ASP ngày 20/11; trang Gợi ý đã làm lại ở giai đoạn 11–12 (tổng kết ở [06](06-tong-ket.md)).

Tài liệu này giữ lại những gì đã biết chắc qua các phiên làm việc 15–18/11, để phiên sau (người hoặc AI) không phải đoán. Kế hoạch việc cần làm nằm ở [02-ke-hoach.md](02-ke-hoach.md).

Phần lớn các sự thật dưới đây được kiểm tra tự động bằng `pipeline/check_baseline.py` (chạy: `cd pipeline` rồi `.venv/Scripts/python check_baseline.py`). Thêm sự thật mới quan trọng thì thêm phép kiểm tra tương ứng vào script.

Quy ước: mỗi mục ghi **nguồn** và **cách kiểm tra lại**. Mục nào không có cách kiểm tra lại thì chỉ là ghi nhận, không phải sự thật đã xác minh. Số liệu về database là ảnh chụp tại ngày ghi, có thể đã đổi.

---

## 1. Mục tiêu đã chốt

- Giá trị cốt lõi: **what-if động nhiều học kỳ** (khóa môn kỳ tới, đậu/rớt môn đang học, môn không mở). Không làm lại việc kiểm tra tiên quyết một kỳ, vì trang đăng ký môn của trường đã làm.
- Muốn cho sinh viên toàn trường dùng thử thật, không chỉ nộp đồ án.
- Paper: chưa chốt đóng góp. Trên thế giới đã có sản phẩm cùng loại (ví dụ Degree Works có What-If); cần khảo sát trước khi nói gì là mới.

## 2. Database của web (đọc qua API ngày 15–16/11)

| Sự thật | Cách kiểm tra lại |
|---|---|
| 96 chương trình, 7 khoa, khoảng 17 ngành, khóa 2019–2024 và 2026; không có 2025 | `GET /api/curricula` (không cần đăng nhập), xem `pagination.itemCount` |
| Chỉ có hệ tài năng (7) và vừa làm vừa học (6); không có chất lượng cao, Việt Nhật | Lọc tên/mã chương trình |
| 5 328 môn trong danh mục; 713 môn thuộc ít nhất một chương trình | `GET /api/courses`, `GET /api/curricula/:id/courses` |
| Mã chương trình do nhóm tự đặt, ví dụ `CS-2023-KHMT`; không lưu mã myBK | Xem trường `code` |
| `CS-2023-KHMT` khớp 100% PDF CTĐT KHMT 2023: 96/96 môn, tín chỉ, 32/32 quan hệ | Đối chiếu PDF `2023_MT_KHMT` với `/api/curricula/:id/courses` và `/relations` |
| Quan hệ tiên quyết là dữ liệu trong bảng `course_relations` theo từng chương trình, trích từ PDF CTĐT công khai | Bảng `course_relations` |
| Mức tín chỉ mỗi kỳ trong database là 11–24, khác QĐ 285 (14–21) | Trường `min/max_semester_credits` |
| API đọc chương trình và môn **không cần đăng nhập**; API đề cương thì cần | Gọi không kèm phiên |
| Script trích chương trình `build-vertical.cjs` được nhắc trong mô tả database nhưng **không có trong repo** | `git ls-files | grep -i build-vertical` |

Các bảng database bộ giải dùng: [03-thiet-ke.md, phụ lục A](03-thiet-ke.md#phụ-lục-a-nguồn-dữ-liệu-database-web).

### 2b. Quét database qua API đọc công khai (18/11, backend local nối Supabase, chỉ GET)

Khởi động backend không sửa schema: `Backend/src/database/database-options.ts` đặt `synchronize: false`, không có `migrationsRun`.

| Sự thật | Cách kiểm tra lại |
|---|---|
| Toàn bộ 96 chương trình: 503 TQ, 50 HT, 175 SH, 1 284 KN | Đếm `type` qua `GET /api/curricula/:id/relations` |
| Khối: 230 tự chọn `listed`, 117 tự chọn `any` (tự chọn tự do), chỉ 2 khối `required` | `GET /api/curricula/:id/groups` |
| Web coi **môn bắt buộc** là môn của chương trình không thuộc khối tự chọn gốc nào | Từng ở `Frontend/src/pages/courses/analysis/analyze.ts` (dòng 242–273, đã gỡ 28/11); backend dùng cùng cách: `Backend/src/planner/planner-input.ts` |
| KHMT 2023: 10 khối. Nhóm C (15 TC) có **5 khối con theo chuyên ngành** (`parent_group_id`, `specialization_id`). Tự chọn tự do 9 TC, mỗi môn tính 3 TC (`pool_course_credits`) | Như trên; kiểm tự động trong `check_baseline.py` |
| KHMT 2023 có 5 chuyên ngành; mô tả: "Đạt chuyên ngành khi các môn tự chọn của khối gốc đều thuộc danh sách của chuyên ngành" | `GET /api/curricula/:id/specializations` |
| KHMT 2023 nhóm "D. Học phần tốt nghiệp": CO3335 (thực tập), CO4029 (đồ án chuyên ngành), CO4337 (đồ án tốt nghiệp). Nhóm "E. Điều kiện tốt nghiệp": ENG_GC, SA4001 | `GET /api/curricula/:id/categories` |
| KHMT 2023 có môn 0 TC: PE1003, PE1005, MI1003 (môn thật) và ENG_GC, SA4001 (điều kiện, không phải lớp) | Trường `credits` |
| KHMT 2023: SH duy nhất là CO4029 song hành CO3335, khớp QĐ 285 Đ15.5; 2 HT là CO3031 sau CO2003, PE1005 sau PE1003 | `GET /api/curricula/:id/relations` |
| KHMT 2023 `regulations`: GDQP, GDTC, tiếng Anh tốt nghiệp (ENG_GC_600), Hoạt động sinh viên | `GET /api/curricula/:id/regulations` |
| Lịch sử mở lớp có cả mã kỳ hè (`xx3`) | `GET /api/curricula/:id/opened-semesters` |
| Trên 96 chương trình: **không** chương trình nào có môn thuộc hai khối tự chọn gốc; 11 có khối lồng (chuyên ngành); 93 có khối tự chọn tự do; 87 có môn 0 TC; 1 có khối `required` | Quét chậm có nghỉ giữa các lần gọi, 18/11 |
| API bị giới hạn tốc độ (HTTP 429) khi gọi dồn dập; cần nghỉ giữa các lần gọi | Quét 96 chương trình liên tục |

## 3. File tiến độ myBK ("Tiến độ hoàn thành CTĐT")

Đã xem đúng **một** sinh viên (KHMT 2023). Chưa thấy file của ngành hay hệ khác.

| PDF có | Excel có |
|---|---|
| Mã chương trình `DH_CQ_MT_KHM_2023`, chuyên ngành, năm áp dụng | Không có mã chương trình |
| 16 khối, loại BB/TC, tín chỉ cần và đã đạt | Có, tên khối dạng mã (`(9) COSONGANH`) |
| **Mọi môn của khối, kể cả chưa học** | **Chỉ môn đã đạt** (41 dòng) |
| Điểm, đạt hay chưa, điều kiện tốt nghiệp | Có; cột "Mã học kỳ" là kỳ xuất file, không phải kỳ học |

Cả hai **không có**: tiên quyết, môn đang học, kỳ đã học từng môn, phân biệt "rớt" với "chưa học" (đều ghi `--`).

PDF có lớp chữ, đọc được bằng `pypdf`. Khối của myBK khác cách chia trong PDF CTĐT (ví dụ Cơ sở ngành 24 so với 21) nhưng tổng vẫn 128; myBK khớp với tín chỉ từng môn.

File thật chứa dữ liệu cá nhân: **không commit, không chép vào test**. Hiện có một file Excel như vậy ở thư mục gốc repo (`Mon_hoc_CTDT_*.xlsx`).

## 4. Quy định 285/ĐHBK-ĐT (bản hợp nhất, 28/07/2022)

Giảng viên hướng dẫn gửi ngày 17/11. File: `Quy định về học vụ và đào tạo - Phiên bản hợp nhất.pdf` ở thư mục gốc repo. 58 trang **ảnh scan, không có lớp chữ**: phải chuyển trang thành ảnh để đọc (PyMuPDF trong `pipeline/.venv`). **Đã đọc đủ 58 trang ngày 18/11**; luật liên quan tới lộ trình, kèm điều và trang, ở [04-luat-qd285.md](04-luat-qd285.md). Bảng dưới chỉ là tóm tắt.

| Điều | Nội dung | Trang |
|---|---|---|
| 2 | Tiên quyết: phải **tích lũy** A trước khi đăng ký B. Song hành: tích lũy A trước **hoặc** học cùng kỳ; B chỉ được xác nhận tích lũy khi A đã tích lũy. Khuyến nghị: chỉ là nên học | 2 |
| 3 | Rớt bắt buộc: học lại hoặc học môn tương đương; rớt tự chọn: được chọn môn khác | 3 |
| 15.1 | Khi đăng ký, môn đang học được **xem như đã đạt**; hậu kiểm sau khi có điểm | 11 |
| 15.3 | Kỳ chính: chính quy 14–21 (đặc biệt tối thiểu 11; loại giỏi tối đa 25); vừa làm vừa học 11–17 | 11 |
| 15.4 | Môn cấp 2 cho sinh viên từ năm 2; cấp 3 từ năm 3 | 12 |
| 15.5 | Thực tập ≥ 65% tín chỉ; đồ án chuyên ngành ≥ 70%; khóa luận ≥ 85% + chuẩn tiếng Anh; thực tập song hành đồ án; cả hai tiên quyết khóa luận | 12 |
| 20.1 | Học dư tín chỉ nhóm tự chọn chỉ tính đủ số yêu cầu | 15 |
| 5.2 | Chính quy tối đa 12 kỳ chính | 4 |
| 14.1, 29.1 | Lớp chính quy mở ở kỳ chính; thực tập ngoài trường thường ở kỳ hè | 10, 19 |
| 24 | **Năm học tính theo tín chỉ tích lũy N**, mốc M = 28 khi đăng ký môn: năm 2 khi N ≥ 28, năm 3 khi N ≥ 56, năm 4 khi N ≥ 84; kèm chuẩn ngoại ngữ từng năm; lên năm 3 phải xong GDQP, GDTC | 17 |
| 37.2 | Đăng ký dưới mức tối thiểu ở kỳ chính thì bị buộc tạm dừng học | 24 |
| PL1 | Mã môn `MMLXXX`: L là cấp độ. PL1 ghi cấp 4 từ năm 4, **lệch** với Đ15.4 (cấp 3–5 từ năm 3) | 27 |
| PL7 | Chuẩn ngoại ngữ từng năm và tốt nghiệp; đăng ký khóa luận chỉ cần Nghe–Đọc | 35–36 |
| PL9 | Từ khóa 2021: chuẩn tin học cơ bản để lên năm 2; MOS để đăng ký khóa luận | 40 |
| PL14 | Ngoại lệ "kỳ sau thời gian kế hoạch chỉ cần 1 môn" chỉ có ở phần chuyển tiếp cho khóa ≤ 2020, đã hết hạn | 54 |

**Không có trong cả 58 trang:** định nghĩa "học trước" (HT) (cụm "học phần trước" chỉ xuất hiện ở bảng điểm VP, HT, tr.55), giới hạn tín chỉ kỳ hè, ngoại lệ kỳ cuối dưới mức tối thiểu trong quy định hiện hành.

**Lệch với code hiện tại:**
- Web và `pipeline/planner/encoding.lp` đang hiểu song hành là "đã học, rớt vẫn được". Theo Điều 2 thì phải **đạt**.
- Cả hai bộ giải đang miễn mức tối thiểu cho kỳ cuối (`encoding.lp`: `used_after`; `solve_cpsat.py`: `used_after_i`). Quy định hiện hành không có ngoại lệ này; kế hoạch chọn giữ lại kèm cảnh báo (mục 3.3).
- Cả hai bộ giải đang **bỏ qua** quan hệ khuyến nghị (KN); người duyệt quyết KN là mềm S6 (18/11). "Học trước" (HT) giữ cứng.
- Người duyệt chọn (18/11), khác văn bản: tín chỉ 11–25 mỗi kỳ (QĐ: 14–21); năm học tính theo khóa (QĐ Đ24: theo tín chỉ tích lũy).

## 4b. Tài liệu thiết kế

[03-thiet-ke.md](03-thiet-ke.md) (gộp tài liệu luồng dữ liệu T1 ngày 18/11 và tổng quan 19/11): tính năng, kiến trúc, file và hàm, API, nguồn dữ liệu, bên trong CP-SAT và Clingo.

Thêm từ việc đọc code backend ngày 18/11: `student_courses` **không có cột kỳ học**; `student_profiles` có `admission_year`, `curriculum_id`; có bảng `student_regulation_status` và `curriculum_regulations` nhưng chưa xem chúng chứa điều kiện gì.

## 5. Web lúc bắt đầu (đọc code ngày 18/11; hiện hành xem [06](06-tong-ket.md))

- Sinh viên **tự chọn chương trình** trong hồ sơ, **tự khai trạng thái từng môn** (`not-started`, `in-progress`, `completed`, `failed`) hoặc tải Excel/CSV theo mẫu của nhóm. Không đọc được file myBK.
- Trang Phân tích tính **trong trình duyệt** (`Frontend/src/pages/courses/analysis/analyze.ts`), không lưu kết quả. Lộ trình là heuristic xếp lần lượt từng kỳ. **Đã gỡ 28/11** cùng tab "Chương trình" của trang Môn học (bảng thẻ, sơ đồ điều kiện, kế hoạch tay): xem mục 5b.
- AI tư vấn (DeepSeek) nhận bản tóm tắt phân tích do trình duyệt gửi lên. **Đã gỡ toàn bộ ngày 28/11** (trang `/advisor`, API, module `Backend/src/advisor`, entity, báo cáo LaTeX). Cùng ngày gỡ luôn Elasticsearch (`Backend/src/outline/search`, `docker-compose.yml`, `npm run search:reindex`, API `/course-outlines/search/*`, biến `ELASTICSEARCH_*`, `db-lab/es-bench.ts`, `db-lab/search-lab.ts`); nhập đề cương chỉ ghi PostgreSQL. Sơ đồ class và ERD sinh lại từ `Report/` (copy từ DACN2, đã bỏ advisor). Bảng `advisor_sessions`, `advisor_steps` vẫn còn trên Supabase chung (không sửa DB); file migration `1795100000000-advisor.ts` giữ để lịch sử migration khớp DB. `currentSemester` chuyển sang `Backend/src/common/semester.ts`.
- Trang Gợi ý (`/recommendations`): từ 19/11 là trang thật (xem 6b, 6c).
- Mã kỳ dạng myBK: `251` = năm học 2025–2026 kỳ 1, `253` = kỳ hè.

## 5b. Gỡ tab "Chương trình" và trang Phân tích (28/11, kiểm bằng `tsc`, `eslint`, `jest`, `vite build`)

- Trang Môn học của sinh viên chỉ còn tiến độ myBK + Hiệu chỉnh (`Frontend/src/pages/courses/index.tsx`, không còn `Tabs`). Mã môn trong bảng tiến độ và bảng "Môn đang học" là link `/courses/:code` (`MybkProgress.tsx`, hàm `courseLink`). Link cũ `?tab=board` rơi về trang này.
- Đã xóa: `pages/courses/board/`, `pages/courses/analysis/` (route `/courses/analysis`), `CourseEditModal`, `CourseStatusFileActions`, `ProgressSummary`, `utils/student-course-file.ts`, `utils/course-search.ts`, nhánh sinh viên của `CourseCatalog` (nay chỉ cho quản trị), gói `@xyflow/react`, `exceljs`, CSS thẻ môn / sơ đồ / khối số liệu / lộ trình. Hàm mã học kỳ phía web chuyển sang `Frontend/src/utils/semester.ts`.
- Backend đã xóa: API `/student-plan-courses/*` (controller, service, DTO, entity `StudentPlanCourse`), `PUT/DELETE /student-courses/me/:courseId`, `GET /course-outlines/summaries`, hàm `OutlineService.searchTexts` (sót từ AI tư vấn). Còn `GET/PUT /student-courses/me`.
- Bảng `student_plan_courses` **vẫn còn** trên Supabase chung (không sửa DB, không viết migration); không code nào đọc/ghi nữa. Trang Gợi ý không dùng bảng này (lưu ở `student_progress_imports.data.web.planner`).

## 6. Bộ giải (`pipeline/planner/`, ghi 18–19/11)

- Hai bộ giải độc lập: Clingo (`encoding.lp`, `solve.py`) và OR-Tools CP-SAT (`solve_cpsat.py`), cùng đầu vào và đầu ra; validator độc lập (`validate.py`). Từ GĐ 2 cả ba dùng chung bước chuẩn hóa dữ liệu `normalize.py` (không chứa luật).
- **Giai đoạn 2 (18/11):** song hành theo QĐ 285 (phải đạt); bỏ học trước; khuyến nghị là mềm S6; tín chỉ từng kỳ, `max_credits`, `semester_limits`, `graduate_by`; cấp độ môn theo khóa (`rules.course_level`); kỳ hè chỉ xếp thực tập; ngưỡng TC môn tốt nghiệp; khối chuyên ngành; ô tự chọn tự do; S4, S5, S6 kèm `preferences_report`; `warnings`; lệnh `planner.cli` (stdin → stdout, `INPUT_ERROR`, `infeasible_reason`).
- Fixture: `fixtures/toy.json` (bịa) và `fixtures/khmt2023.json` (chương trình **thật** lấy qua API ngày 18/11, sinh viên bịa).
- Trên KHMT 2023 thật: CP-SAT `OPTIMAL` khoảng 440 ms; Clingo `SAT_NOT_PROVEN_OPTIMAL` sau 30 giây với cùng giá trị mục tiêu. Đo một lần ngày 18/11.
- **19/11:** thêm cảnh báo song hành cùng kỳ; thứ tự tính tín chỉ tự chọn tự do theo file tiến độ; kỳ hè do sinh viên bật (`summer_opt_in`, tối đa 12 TC, chỉ môn từng mở hè); mong muốn mềm S7 (ít học hè), S8 (kỳ chính 15–18 TC).
- Trên KHMT 2023 với sinh viên bịa (87 TC trước kỳ 261): không bật hè thì xong ở 271; bật hè 253 và 263 thì xong ở 262. Lý do: đồ án chuyên ngành CO4029 cần 90 TC, không bật hè chỉ có 89 (thiếu 1 TC), nên khóa luận phải lùi một kỳ. CP-SAT, khoảng 1–2 giây.
- Lịch sử mở lớp hè của KHMT 2023: kỳ 243 ghi 87 môn, các kỳ hè khác 26–41 môn. Kỳ 243 có thể là dữ liệu lỗi; chưa kiểm tra.
- S9 (19/11): kỳ hè ưu tiên môn cấp 1–2. Trên KHMT, các môn 1 TC đều là cấp 3 (đồ án tổng hợp CO31xx), nên khi bật hè, S7 (ít tín chỉ hè) thắng S9 và kết quả báo S9 không đáp ứng.
- 19/11 (sau): S9 > S7; đồ án không xếp vào hè (cứng, `summer_excluded`); S7 thành "hè 6–9 TC"; thêm S10 "ít học hè" ở cuối. Trên KHMT với sinh viên bịa, bật hè 253 và 263: hè 253 học 7 TC môn đại cương (IM1013, SP1007, SP1037), xong ở 262.
- Kiểm tra lại: `cd pipeline` rồi `.venv/Scripts/python -m pytest planner -q` (81 test qua ngày 19/11).
- Đo trên dữ liệu sinh ngẫu nhiên: từ 40 môn, Clingo không chứng minh xong tối ưu trong 20 giây; CP-SAT dưới 1 giây. Nguyên nhân: chứng minh "không xong sớm hơn được" là phép đếm tín chỉ. Chạy lại: `python -m planner.compare --diagnose`.
- Clingo trên Windows không mở được đường dẫn có dấu tiếng Việt; `solve.py` đọc file rồi đưa nội dung vào.
- Tài liệu lý thuyết (lưu trữ, viết 15/11 trên bản mẫu): `docs/luu-tru/2026-11-15-planner-1-clingo.md`, `-2-ortools.md`, `-3-so-sanh.md`.

## 6b. Giai đoạn 3–5 (19/11)

| Sự thật | Cách kiểm tra lại |
|---|---|
| Bản chụp quan hệ môn: 96 chương trình, 2 012 quan hệ, ngày 19/11 | `pipeline/planner/data/relations-snapshot.json`; chụp lại: `python -m planner.relations snapshot <file>` (backend phải chạy) |
| 493 môn có ở ≥ 2 chương trình: 371 giống nhau (TQ/SH), 122 lệch | `python -m planner.relations report <bản chụp>` |
| Suy ra (ngưỡng 50%): 43/96 chương trình được thêm tổng 231 quan hệ; KHMT 2023 không cần thêm quan hệ nào | `python -m planner.relations coverage <bản chụp> <fixture>` |
| Backend có `POST /api/plans/solve` (`Backend/src/planner/`), cần đăng nhập, gọi `python -m planner.cli` | `npx jest test/planner.spec.ts` trong `Backend` (5 test, có chạy Python thật) |
| Tài khoản test `khmt.demo@bkuni.local` (40 môn đạt, 5 đang học): CP-SAT và Clingo đều `OPTIMAL`, xong ở 262, 9 TC | Đăng nhập localhost rồi `curl` endpoint |
| Trang Gợi ý (`/recommendations`) đã thay "Coming soon": chỉnh đậu/rớt, tối đa TC, hạn tốt nghiệp, kỳ hè, khóa môn, môn không mở, mong muốn, chuẩn tiếng Anh/MOS, chọn bộ giải; hiện lộ trình, mong muốn đáp ứng hay không, cảnh báo, giả định, độ tin cậy dữ liệu | `Frontend/src/pages/recommendations/`; `npm run build` qua. **Chưa bấm thử trên trình duyệt** |
| Trước khi đổi S11 (19/11): luật ≥ 11 TC cứng cộng cấp độ môn làm UNSAT với sinh viên còn ít môn học được ở một kỳ. Sau khi đổi: có lộ trình kèm ghi chú | `Backend/test/planner.spec.ts` |
| (19/11, sau) 11 TC ở kỳ chính là mềm (S11, dưới S2): không học thừa để đủ. Ca "rớt CO4029" của tài khoản test: kỳ 262 còn 7 TC (trước đó bộ giải xếp thêm môn tự chọn cho đủ 11), kèm ghi chú trao đổi phòng đào tạo | Đăng nhập localhost, `curl` với `in_progress_results: {"CO4029": "fail"}` |
| Bộ giải không dùng quan hệ suy ra từ chương trình khác (người duyệt 19/11) | `planner/cli.py`, `use_inferred_relations` mặc định false |

## 6c. Giai đoạn 6 và 8 (19/11)

| Sự thật | Cách kiểm tra lại |
|---|---|
| What-if: trang Gợi ý lưu mốc trong localStorage (khóa `bkuni.planner.baseline.v1.<user>.<curriculum>`), mỗi lần giải gửi `previous_plan`; so sánh tính ở trình duyệt (`whatIf.ts`). Thẻ "Khác so với lộ trình mốc" cũ (chuỗi không dấu của `cli.py`) đã bỏ khỏi giao diện | `Frontend/src/pages/recommendations/` |
| Tài khoản test, mốc = lộ trình mặc định (262: CO3051, CO4337, SP1007): rớt CO4029 → CO4337 dời 262 → 271, thêm CO4029; giải lại đúng kịch bản cũ kèm mốc → giống hệt mốc | Script gọi API đăng nhập; chưa bấm trên trình duyệt |
| Tài khoản test đang học 5 môn: CO3117, CO4029, CO4031, IM3001, SP1037 | `GET /api/student-courses/me` |
| File Excel myBK: cộng tín chỉ các dòng = ô "Số TCTL" (111). Môn có `X` ở cột "Xét TCTD" là môn ngoài CTĐT tính vào tự chọn tự do. Khối 12 có 2 môn 2 TC nhưng chỉ tính 1 TC đạt (học dư) | `python -m planner.mybk < file.xlsx` (file thật chỉ ở máy) |
| `pipeline/planner/mybk.py` trả khối, môn, tổng tín chỉ, kỳ xuất file, khóa (2 chữ số đầu MSSV); không trả MSSV, mã lớp, tên môn, điểm | `planner/tests/test_mybk.py` (`test_no_personal_data_in_output`) |
| Các chương trình KHMT 2019–2023 có cùng danh sách môn với file của người duyệt (đều khớp 97,5%, 39/40 môn; môn còn lại là `CCGDTC`, không có trong danh mục web) | `POST /api/plans/mybk/preview` |
| `POST /api/plans/mybk/preview` cần đăng nhập, giới hạn 10 lần/phút, 5 MB; không ghi database (số môn đã khai không đổi sau khi gọi) | `check_baseline.py`; `Backend/test/planner.spec.ts` (10 test) |
| PDF tiến độ của người duyệt là `Bảng điểm.pdf` ở thư mục gốc (không bị git theo dõi). myBK cập nhật 06/03/2026: `DH_CQ_MT_KHM_2023`, 17 khối, 85 môn liệt kê, 32 đạt, 89/128 TC. Cộng "đạt" của các khối = 89 | `check_baseline.py` |
| PDF: PyMuPDF trả mỗi ô một dòng; `pypdf` tách rời chữ có dấu ("Kh ố i") nên không dùng. Biểu tượng: U+F058 khối đủ, U+F111 khối chưa đủ, U+F00C môn đạt, U+F162 đứng trước mã môn trong khối tự chọn. Môn chưa học và môn rớt đều ghi "--" | `planner/mybk.py` |
| CS-2023-KHMT của web có 11 môn PDF myBK không liệt kê: CO3129–CO3139, CO3151, CO3153, ENG_GC (myBK: ENG_GC_600), PE1003, PE1005 (myBK: CCGDTC) | `POST /api/plans/mybk/preview` với PDF, `data_check.missing_in_file` |
| Không có `build-vertical.cjs` trên ổ D và thư mục người dùng (tìm 19/11) | Tìm lại bằng tên file |
| pytest planner: 101 test qua (19/11) | `cd pipeline` rồi `.venv/Scripts/python -m pytest planner -q` |

## 6d. Giai đoạn 9: PDF là nguồn duy nhất (20/11)

| Sự thật | Cách kiểm tra lại |
|---|---|
| Repo đã kéo `origin/main` tới `655780b`; repo và Supabase có cùng 15 migration cũ + 1 migration mới `StudentProgressImports1795600000000` | `npx typeorm-ts-node-commonjs migration:show -d src/database/data-source.ts` (trong `Backend`) |
| Tài khoản database `trinh` có `role=bk_owner` mặc định (`rolconfig`), là thành viên `bk_owner`, `bk_dev`. Mọi bảng `bk_uni` thuộc `bk_owner`. Quyền CREATE trên schema `bk_uni` được cấp 20/11 | `select rolconfig from pg_roles where rolname='trinh'` |
| Bảng `student_progress_imports` do migration tạo ra thuộc `trinh` nên backend (vai trò `bk_owner`) bị "permission denied"; đã `ALTER TABLE … OWNER TO bk_owner` (người duyệt cho phép 20/11). Lưu ý: `RESET ROLE` quay về `bk_owner`, phải `SET ROLE trinh` mới đổi chủ được | `select tableowner from pg_tables where tablename='student_progress_imports'` → `bk_owner` |
| Tải `Bảng điểm.pdf` (myBK 06/03/2026) vào tài khoản thử của người duyệt qua `POST /api/plans/mybk/import`: ghi 85 trạng thái môn (31 Đã hoàn thành = **89 TC, khớp 89/128 của PDF**; 54 Chưa học); `CCGDTC`, `ENG_GC_600` không có trong danh mục web nên chỉ nằm trong JSON tiến độ; `GET mybk/progress` trả đúng JSON đã lưu | SQL đếm `student_courses` theo `status` của tài khoản đó |
| Tài khoản thử của người duyệt chưa chọn chương trình trong hồ sơ (20/11), nên bảng môn và thẻ thống kê trang Môn học chưa theo chương trình | Trang Hồ sơ |
| Python không đọc file có tên tiếng Việt qua `curl -F` (Git Bash) và Postgres không mở thư mục có "Đồ án": chép sang đường dẫn không dấu | — |

## 6e. Database mới và luồng PDF ↔ database (21/11)

Đọc Supabase bằng `SELECT` trong transaction `READ ONLY` (script tạm, không commit), và đọc file thật tại máy (chỉ in mã, số đếm, không in tên/MSSV/điểm).

| Sự thật | Cách kiểm tra lại |
|---|---|
| Ngày 20/11 Thiên thay toàn bộ CTĐT bằng dữ liệu myBK (`Backend/DU-LIEU-CTDT.md` trên `main`): **132 chương trình** (khóa 2023: 46, 2024: 40, 2025: 2, 2026: 44), **5 675 môn** | `select count(*) from bk_uni.curricula` / `courses`; `check_baseline.py` |
| Mọi chương trình có `source_system = 'mybk'` và `source_code` (mã CTĐT myBK), 132 mã **không trùng**. `CS-2023-KHMT` ↔ `DH_CQ_MT_KHM_2023` (phiên bản `DH_CQ_MT_NG_KHM_2023.v01`, 128 TC, 96 môn); `CS-2024-KHMT` ↔ `DH_CQ_MT_NG_7480101_2024`; `CS-2026-KHMT` ↔ `DH_CQ_MT_NG_7480101_2026` | `select code, source_code, source_version from bk_uni.curricula where code like '%KHMT%'` |
| Hai migration cùng mốc `1795600000000` **đều đã chạy** trên Supabase: `StudentProgressImports` (nhánh này) và `CurriculumSourceAndGroupSemester` (`main`); thêm `CurriculumProfile1795700000000` | `select * from bk_uni.migrations order by timestamp desc limit 5` |
| CS-2023-KHMT có **37 quan hệ**: 11 TQ, 21 KN, 2 HT (CO2007 sau CO1023, CO3031 sau CO2003), **3 SH** (CO3049–CO2013; CO3335–CO4029 ghi **cả hai chiều**). So bản chụp 19/11 (PDF CTĐT công khai, 32 quan hệ): chung 31; mất HT PE1005 sau PE1003; thêm 2 SH, 1 HT, 3 KN | Truy vấn `course_relations` theo `curriculum_id`; bản chụp `planner/data/relations-snapshot.json` (nay đã cũ) |
| `curriculum_courses` có thêm `recommended_year`, `recommended_term` (KHMT 2023: 37/96 môn có giá trị). Lịch sử mở lớp của KHMT 2023: 19 kỳ, 201–261 | `information_schema.columns`; `course_opened_semesters` |
| Nhóm môn (`course_categories`) đổi tên: **"Tốt nghiệp"** (CO3335, CO4029, CO4337) và **"Điều kiện tốt nghiệp"** (ENG_GC_600, SA4001); **không chương trình nào** còn nhóm tên `D.`/`E.` → `buildPlannerInput` không nhận môn tốt nghiệp (T37) | Truy vấn `course_categories` (`name like 'D.%'` → 0 chương trình) |
| Trên database, `ENG_GC` đã đổi thành `ENG_GC_600` (trùng mã myBK) | `courses.code` |
| **PDF in bằng "Microsoft Print to PDF" không đọc được**: 6 trang, 0 chữ, 0 font, 0 hình (Windows vẽ chữ thành nét; producer `Microsoft: Print To PDF`). PDF đọc được là bản Chrome/Edge **"Lưu dưới dạng PDF"** (producer `Skia/PDF`, 14 font). Gặp ngày 21/11 với file của sinh viên B | `pymupdf.open(f).metadata`, `page.get_text()` |
| **Chữ dán** từ trang Tiến độ (Ctrl+A, Ctrl+C trên Edge, 2 sinh viên KHMT 2023): bảng giữ dấu **Tab** giữa các ô; dấu ✓ (icon) **mất**; ô mã môn của khối tự chọn có dấu cách đầu; đầu trang có menu myBK và chú thích "Điểm số > Điểm MT (12) > Điểm DT (21)". Suy "đạt" từ điểm (4–10 khác F, 12, 21): cả hai qua tự kiểm tra cộng tín chỉ từng khối; với người duyệt, **PDF (`trinh.pdf`, myBK 14/11) và chữ dán cho cùng mã môn, cùng đạt/chưa, cùng điểm** | `planner.mybk.parse_text` trên file tại máy (không commit) |
| Tài khoản **tài khoản thử B** giữ dữ liệu của sinh viên B (KHMT 2023, 116/128, myBK 18/09/2026). 21/11 lưu lại bằng chữ dán của chính sinh viên B qua API: 97 trạng thái, 45 Đã hoàn thành = 116 TC, PE1003/PE1005 Đã hoàn thành, CH4079 (ngoài chương trình) tính tự chọn tự do | `GET /api/plans/mybk/progress`, `GET /api/student-courses/me` khi đăng nhập tài khoản đó |
| Hiệu chỉnh trên tài khoản thử B qua API (21/11): khai kỳ 261 + CO3013 Đang học → bộ giải CP-SAT `OPTIMAL`, lộ trình bắt đầu 262, không xếp lại CO3013 ("giả định đậu"), không xếp PE1003/PE1005; đã trả CO3013 về Chưa học, **kỳ 261 vẫn để ở trạng thái "đã khai"** (`data.web.current_semester`) | `GET /api/plans/mybk/progress` khi đăng nhập tài khoản đó |
| Trước 22/11, môn **ngoài CTĐT đang học** (giả định đậu) không được trừ vào tự chọn tự do: `normalize.py` chỉ đếm môn Đã hoàn thành, nên lộ trình xếp dư một ô tự chọn tự do. Trang Gợi ý cũng lọc bỏ môn ngoài CTĐT khỏi ô "Nếu đậu hoặc rớt" (`nameByCode.has`). Đã sửa (T46); test `test_cli_marks_in_progress_pass_for_normalize` | `pipeline/planner/tests/test_normalize.py` |
| PE1003, PE1005 (0 TC) có trong **cả 132** chương trình; quy định GDTC ghi "Trên myBK ghi theo CCGDTC" ở 46 chương trình, còn khóa 2024, 2026 ghi "Trên myBK ghi theo PE1009, PE1011, PE1013, PE1015…". IM3047 (Giao tiếp trong kinh doanh, 3 TC) thuộc 5 chương trình, không thuộc KHMT 2023 | Truy vấn `curriculum_courses`, `curriculum_regulations` (21/11) |
| **GDTC**: PE1003, PE1005 không thuộc nhóm nào; MI1003 thuộc nhóm "Chứng chỉ Giáo dục Quốc phòng". Liên kết duy nhất tới `CCGDTC` là chữ trong `curriculum_regulations.detail` của quy định "Chứng chỉ Giáo dục Thể chất" ("Trên myBK ghi theo CCGDTC", 46 chương trình) | Truy vấn `course_category_members`, `curriculum_regulations` |
| PDF của người duyệt (myBK 06/03/2026) so với CS-2023-KHMT: 84 mã chung; chỉ PDF có `CCGDTC`; chỉ web có CO3129, CO3131, CO3133, CO3135, CO3137, CO3139, CO3151, CO3153, PE1003, PE1005 (và ENG_GC_600, SA4001 nằm ở điều kiện tốt nghiệp của PDF) | `POST /api/plans/mybk/review` với PDF (xem 03 mục 4b) |
| JSON từ API myBK của người duyệt (`danh-sach-mon-hoc-ctdt/v2`, myBK cập nhật 14/11, lưu ở thư mục gốc, **không commit**): 99 dòng = 98 mã + 1 dòng ô tự chọn tự do; 111/128 TC; **có** 8 môn CO31xx mà PDF không có, có thêm môn ngoài CTĐT IM3047, PE1021, PE1035; tín chỉ khớp database 100%. **Không có** mã CTĐT, họ tên, GPA (nằm ở API `thong-tin-mo-ta-ctdt/v2` riêng). ⇒ 8 môn lệch là do **PDF cũ**, không phải database sai | `ctdt-ben-tien-do-mon-tra-ve-cua-tao.json` (tại máy) |
| Trường của JSON đó: `loainhomkhoikienthuc` (mã khối: `TOAN`, `COSONGANH`, `CHUYENNGANH`, `CC_GDTC`…), `khoikienthucid` + `tcyeucau` (Chuyên ngành tách 4 khối 10/15/1/1 TC, khớp nhóm A/B/C của database), `hieuluc`, `tamdat`, `xetchontctd`, `monhoctuongduongid`, `douutien` (= điểm số ở 39/39 môn có điểm), `diemso` 21 (MI1003, CCGDTC) và 12 (LA1003, LA1005) với điểm chữ `--` (nghĩa chưa kiểm chứng). 55 môn chưa đạt đều `diemso = null`: không phân biệt được rớt với chưa học | Như trên |
| Mã trang "Tiến độ hoàn thành CTĐT" của myBK (`function.js`, Phòng Đào tạo, thư mục gốc, **không commit**): `tamdat = 1` ẩn điểm (`--`); `hieuluc = 0` hiện `--`, không ✓; ✓ chỉ khi `diemdat = 1`, `hieuluc = 1`, `xetchontctd ≠ 1`; ghi chú "Đã dùng để xét TCTD", "Tương đương <mã>"; nút "Cập nhật" gọi `cap-nhat-tien-do-hoan-thanh-ctdt/v2` để tính lại | `function.js` dòng 95–107, 195–227, 420–427, 457–465 |
| Công cụ cộng đồng `danhnth/mybk-planner` (MIT, 08/2026, đọc code 21/11, không chạy): CLI dùng mật khẩu CAS của chính sinh viên; gợi ý **một kỳ**, tham lam, **không** tiên quyết. Ghi nhận: API CTĐT của myBK **không có trường tiên quyết**; `diemdat` của CTĐT nghĩa là "có điểm" (môn rớt vẫn = 1); có API bảng điểm theo kỳ (`danh-sach-diem-hoc-ky-mon-hoc/v2`) và môn tương đương; API tải Excel CTĐT bị tắt (500); học phí 2026–2027 CQ: 15,75 triệu/kỳ, định mức 18 TC, 940 nghìn/TC vượt | `github.com/danhnth/mybk-planner`, `mybk_planner/planner.py`, `transcript.py`, `fees.py` |
| **Tài khoản thử của người duyệt là tài khoản thử A** (đang giữ tiến độ từ `Bảng điểm.pdf`, nạp 20/11: 31 Đã hoàn thành, 54 Chưa học). `khmt.demo@bkuni.local` **không được giữ dữ liệu thật**: ngày 20/11 nó bị ghi nhầm 1 dòng `student_progress_imports` chứa PDF của người duyệt; đã xóa ngày 21/11 theo yêu cầu người duyệt (trạng thái môn của demo, 40 đạt + 4 đang học, không phải dữ liệu từ PDF nên giữ nguyên). Sau khi xóa, bảng chỉ còn 1 dòng (tài khoản thử A) | `select u.email from bk_uni.student_progress_imports p join bk_uni.users u on u.id = p.user_id` |
| Quan hệ môn của myBK nằm trong **đề cương** (`v1/subject-outlines/{id}/full`, mở cho khách); backend đọc trường `prerequisites` có loại khi nhập đề cương. 1 127/1 626 môn thuộc CTĐT có đề cương. Chưa kiểm 37 quan hệ của KHMT 2023 lấy từ đề cương hay từ CTĐT | `Backend/src/outline/outline-format.ts` dòng 14–34, 124–141; `DU-LIEU-CTDT.md` |

## 6f. Giai đoạn 12: what-if theo đặc tả mục 12 (23/11, code + test tự động, chưa bấm thử web)

| Sự thật | Cách kiểm tra lại |
|---|---|
| Trang Gợi ý **không tự giải** nữa (cả khi mở trang); chỉ nút Giải và nút "Cách gỡ" gọi `POST /plans/solve` | `Frontend/src/pages/recommendations/index.tsx` (`runSolve`); `check_baseline.py` mục T59 |
| Trạng thái trang lưu ở `data.web.planner` = `{scenario, view, dirty, plans}` (view = lộ trình đang xem, plans ≤ 10 bản); mốc = bản gắn sao. Cài đặt cũ có `baseline` thì thành bản "Mốc cũ" | `index.tsx` (`SavedSettings`, `stateJson`) |
| Bộ giải nhận `assumed_fail`, `offered`, `preferences.disabled`; backend nhận thêm `free_choices` và tra mã trong bảng `courses` (thiếu thì 400) | `pytest planner/tests/test_whatif12.py` (16 ca), `npx jest test/planner.spec.ts` (28 ca) |
| Trên fixture KHMT 2023 (sinh viên bịa), một lần Giải kể cả giải thích (`_explain_targets`, `_explain_unsat`) mất 0,2–1,5 giây | Script tạm, đo 23/11 (4 kịch bản) |
| Thứ tự ưu tiên gửi bộ giải: 3 mục sinh viên (mặc định S1 > S8 > S2) rồi S6, S4, OH, S3; **W12 chưa chốt** | `priorities.ts` (`HIDDEN_ORDER`) |
| Frontend **không có bộ chạy test**; logic tính tại trang kiểm bằng script tạm qua esbuild (28/28, không nằm trong repo) | `Frontend/package.json` không có `test` |

## 7. Trao đổi với trường

| Ngày | Sự việc |
|---|---|
| 17/11 | Văn phòng khoa: quy định rải rác, chính các cô cũng phải tự tổng hợp. Việc xin dữ liệu phải hỏi trực tiếp Phó Khoa phụ trách, không nhắn tin |
| 17/11 | Giảng viên hướng dẫn gửi QĐ 285 |
| 18/11 | Đã nhắn thầy xin bản xuất quan hệ môn theo mã chương trình; thầy thả like, chưa trả lời. Dự kiến có tin thứ 6 (21/11) |
| — | Nhóm đã hứa với thầy: trong tuần thống nhất và giải thích được luồng dữ liệu vào, bộ giải nhận gì, trả gì |

## 8. Ràng buộc làm việc

- Không sửa schema, không chạy migration, không sửa dữ liệu trên Supabase dùng chung **trừ khi người duyệt cho phép từng lần** (20/11: cho phép migration `StudentProgressImports` và đổi chủ bảng đó).
- Không đăng nhập myBK hay thu mật khẩu sinh viên; không cào hệ thống của trường. Dữ liệu CTĐT nạp ngày 20/11 lấy từ myBK **có phép của trường** (Thiên xin thầy; người duyệt xác nhận 21/11).
- Không đưa tên, MSSV, điểm thật vào code, test hay commit.
- File `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md` mục 11 chứa mật khẩu và khóa API: **không commit file này**.
