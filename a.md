Đã dò xong. Tôi **không sửa gì trong `Scraper/`** — các file nháp tôi tạo trong lúc trinh sát (`Scraper/recon/`) đã xoá sạch, thư mục `Scraper` trở lại nguyên trạng; mọi thứ dưới đây là kết quả dò trực tiếp.

# Báo cáo dò URL/API myBK bằng tài khoản khách

## 1. Cách dò (để lặp lại được)

- Vào `https://mybk.hcmut.edu.vn/app/public/de-cuong-mon-hoc` → server tự cấp `SESSION` cookie + JWT khách trong `<input id="hid_Token">` (hạn 12h). Không cần mật khẩu.
- Mọi trang app gọi API qua `hid_APiUrl = https://mybk.hcmut.edu.vn/api/` với header `authorization: Bearer <token>`.
- **Mẹo quan trọng — mã trạng thái là "máy dò"**: API trả `{"code","msg","data"}`. Đường dẫn không tồn tại → Spring trả `404 {"timestamp":...}`; tồn tại nhưng khách không có quyền → `403 "Tài khoản không được cấp quyền truy cập"`. Vậy `403` = **tính năng có thật nhưng bị khoá**, `404` = không có.
- Tôi thử 167 tên tài nguyên × 2 prefix (`/api/v1/*`, `/api/v2/*`) ⇒ **334 request**, cộng ~60 request kiểm tra chi tiết. Tốc độ 1,2–1,6 req/s (server ghi `X-RateLimit-Limit: 120`/phút), **0 lần bị 429**.
- Chỉ dùng `GET`. Không thử `POST/PUT/DELETE` (đó là đường ghi dữ liệu của trường).

## 2. Bản đồ trang khách vào được

Menu khách lấy từ `GET /api/ung-dung/mo-dun/danh-sach-ung-dung-nguoi-dung/v1` — chỉ **9 mục**, trong đó có 2 mục "Soạn thảo":

| Trang | HTTP | Ghi chú |
|---|---|---|
| `/app/public/de-cuong-mon-hoc` | 200 | danh sách đề cương |
| `/app/public/cau-hinh-mon-hoc` | 200 | **cấu hình môn theo HK** (mới) |
| `/app/public/cdr-mon-hoc` | 200 | **trang hỏng**: JS `/app/js/public/danhSachDotPage.js` trả 302 → `/app/404` ⇒ bảng rỗng, không có API riêng |
| `/app/public/van-bang` | 200 | tra cứu văn bằng — **dữ liệu cá nhân** |
| `/app/he-thong-quan-ly-dao-tao/ctdt` | 200 | danh sách CTĐT |
| `/app/he-thong-quan-ly-dao-tao/ctdt/khoi-kien-thuc/{id}` | 200 | khối kiến thức |
| `/app/he-thong-quan-ly-dao-tao/dcmh-core/{id}` | 200 | HTML rỗng, chỉ là template JS |
| `/app/he-thong-quan-ly-dao-tao/dcmh-soan-thao` | 200 | trang soạn thảo (82 KB) |
| `/app/he-thong-quan-ly-dao-tao/quan-ly-ctdt-core` | 302 → `/app/404` | có trong menu nhưng **không mở được** |
| `/app/he-thong-quan-ly-dao-tao/ctdt/dcmh` → `/ctdt/editor` → `/dcmh-soan-thao` | 302 | chuỗi redirect |
| `/app/he-thong-quan-ly-dao-tao/ctdt/{số}` (vd `/12410`) | 302 | controller ép kiểu Long rồi 404 |

Về ví dụ của bạn `dcmh-core/36208`: trang này **luôn rỗng với mọi id** (kể cả id không tồn tại), nên "đổi 5 số đuôi" chỉ đổi được cái vỏ. Id trong URL là id **đề cương** (`subject-outlines`), không phải id cấu hình môn. Muốn liệt kê thì gọi danh sách chứ đừng đoán id.

## 3. API công khai (khách) — phần lớn KHÔNG hiện trên menu

Đây là "tính năng ẩn" thật sự: rất nhiều endpoint đọc dữ liệu học vụ mở cho khách, chỉ không có link nào trỏ tới.

| Endpoint | Nội dung | Quy mô |
|---|---|---|
| `v2/curriculums`, `/short`, `/{id}` | CTĐT bản **v2**, giàu hơn v1 nhiều | **1.814** CTĐT |
| `v2/subjects`, `/{id}` | Danh mục môn chuẩn toàn trường | **20.631** môn |
| `v1/curriculum/{id}` | CTĐT v1 (kèm `subjectGroups` + `teachingPlans` inline) | — |
| `v1/subject-group?curriculumId=`, `/{id}`, `v1/subject-group-details?subjectGroupId=` | Khối kiến thức & môn trong khối | vd CTĐT 12410 có 17 khối |
| `v1/subject-group/type` | Loại khối (Toán, KHTN, Chuyên ngành…) | 8,7 KB |
| `v1/teaching-plans?curriculumId=` | Kế hoạch giảng dạy (môn + `yearSemesterCode`) | rỗng với vài CTĐT, có data với CTĐT mới |
| **`v1/semesters-subjects`**, `/{id}` | **Cấu hình môn theo học kỳ** (mới hoàn toàn) | **40.433** dòng |
| `dcmh/de-cuong/danh-sach-cau-hinh-mon-hoc/v1` | Mẫu cấu hình số TC ↔ số tiết (LT/BT/TN/TQ/Tự học) | 55 KB, 1 lần gọi |
| `v1/draft-subject-outlines`, `/{id}`, `/edit-mode`, `/status-graph` | Quy trình soạn thảo đề cương (chưa công bố) | **13.884** dòng |
| `v1/student-diplomas/search?no=&fullName=` | Tra cứu bằng/chứng chỉ | **dữ liệu cá nhân** |
| `v1/department/short`, `v1/program/short`, `v1/training-level/short`, `v1/training-type/short`, `v1/degree/short`, `v2/major/short`, `v2/semester-years/short` | Bảng tham chiếu cho dropdown | 0,9–196 KB |
| `v1/subject-outlines` (+ `/{id}`, `/{id}/full`) | Đã biết; hiện **6.813** đề cương | — |

Chi tiết đáng chú ý:

- **`v2/curriculums`** có các trường v1 **không có**: `descriptionVi/En`, `enrollmentObjectVi/En`, `jobOpportunityVi/En`, `trainingProcessVi/En`, `assessmentMethodVi/En`, `numOfYearsForTraining`, `version`, `lastSyncedAt`. Đây là mỏ vàng cho trang chi tiết CTĐT và cho RAG (mô tả ngành, cơ hội việc làm, quy trình đào tạo).
- **`v1/semesters-subjects`** (40.433 dòng): mỗi dòng = 1 môn trong 1 học kỳ, kèm `jsonAssmtForm`, `jsonAssmtRate`, `jsonNumOfCredits`, `jsonNumOfLessons` (phân bổ tiết LT/BT/TN/tự học) — tức cấu trúc tín chỉ **chính thức**, không phải suy từ đề cương. Có `semYear.code` dạng `20262`, `subject.code`, `numOfCredits`.
- **`v2/subjects`** (20.631) so với 3.351 môn có đề cương ⇒ bù được phần lớn môn **chưa có đề cương**, kèm cờ `isOperating`, `forVietnameseOnly`.
- Bộ lọc dùng được (rút từ JS của trường): `subject-outlines` nhận `code`, `semYearId`, `teachingDepId`, `genreDepId`, `subjectCode`, `sort`, `page/size` — ví dụ `?subjectCode=CH4051` → 2 bản. `semesters-subjects` nhận `semesterYearId`, `subjectCode`. `v2/curriculums/short` nhận `applyForYear`.
- **`v1/subject/short` bị 403 nhưng `v2/subjects` lại mở** — đúng kiểu "vá nửa vời": v1 khoá, v2 quên khoá.

## 4. Endpoint TỒN TẠI nhưng khoá với khách (403)

`v1/student`, `v1/department`, `v1/program`, `v1/training-level`, `v1/training-type`, `v1/degree`, `v1/room`, `v1/building`, `v1/modules`, `v1/users`, `v1/roles`, `v1/subject/short`, `v2/semester-years`, `v2/students`, `v2/employees`, `v2/major`, và `dcmh/de-cuong/in-de-cuong-mon-hoc/{id}/v1` (= **bản in đề cương**, tức endpoint render server-side; đây là lý do không có cách in đề cương khi chưa đăng nhập).

Ngược lại, 308/334 tên thử nghiệm trả `404` — **không hề có** API kiểu `schedules`, `exam-schedules`, `tuitions`, `registrations`, `enrollments`, `grades`, `transcripts` cho khách. Các mảng đó (thời khoá biểu, lịch thi, điểm, học phí, đăng ký môn) **không lộ** qua đường khách.

## 5. Cảnh báo — những thứ KHÔNG nên cào

1. `v1/student-diplomas/search` trả **họ tên, ngày sinh, ngành, số hiệu bằng, số vào sổ gốc** của người thật. Cào hàng loạt là thu thập dữ liệu cá nhân trái phép, không liên quan đồ án. Bỏ qua.
2. `v1/draft-subject-outlines` là đề cương **chưa công bố** + có tên cán bộ (`assignedBy`, `editedBy`). Dùng để *biết* môn nào sắp có bản mới thì được, cào nội dung thì không nên.
3. Toàn bộ đây là endpoint chính web trường gọi (không phải lỗ hổng), nhưng vẫn là dữ liệu của Trường: giữ ≤ 1,7 req/s, ghi nguồn, và xin phép Phòng Đào tạo nếu định public.

## 6. Nên thêm gì vào dự án hiện tại

| Dữ liệu | Dùng cho | Ghi chú tích hợp |
|---|---|---|
| `v2/curriculums` (1.814) | Trang chi tiết CTĐT + context AI: mô tả ngành, cơ hội việc làm, quy trình đào tạo, cách đánh giá, số năm | Bổ sung cột vào `curriculum`; v1 hiện thiếu hết các trường text này |
| `v2/subjects` (20.631) | Danh mục môn chuẩn, lấp môn **chưa có đề cương** (~3.351 → 20.631), lọc `isOperating` | Nuôi bảng `course` thay vì chỉ suy từ đề cương |
| `v1/semesters-subjects` (40.433) | "Môn này mở học kỳ nào", cấu trúc TC/tiết chính thức, đối chiếu kế hoạch giảng dạy | Bảng mới `semester_course_configs`; khớp khoá ngoại theo `subject.code` + `semYear.code` — không dùng id |
| `v1/subject-group/type` + 7 bảng `/short` | Bảng tham chiếu: khoa, bậc, hệ, ngành, chương trình, bằng, học kỳ | Seed nhỏ, ổn định, nên cache |
| `v1/subject-outlines` | Đã có trong pipeline | Số lượng đã đổi 6.798 → **6.813**: cần job đồng bộ định kỳ thay vì số cứng |

Lưu ý 4 không gian id khác nhau, dễ lẫn: đề cương `39.444` (CH4051 v3.1), cấu hình môn `46.294`, khối kiến thức `54.236`, CTĐT `12.410`. `dcmh-core/{id}` dùng id **đề cương**.

