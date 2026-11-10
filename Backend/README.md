# BK Uni Backend

Backend NestJS, TypeORM và PostgreSQL. Cấu trúc và cách đặt tên dựa trên dự án MOVE; nghiệp vụ tài khoản và dữ liệu học tập được điều chỉnh theo BK Uni.

Tài liệu bàn giao API cho frontend: [API-FRONTEND.md](./API-FRONTEND.md).
Luồng tạo một chương trình đào tạo hoàn chỉnh qua API: [TAO-CHUONG-TRINH-DAO-TAO.md](./TAO-CHUONG-TRINH-DAO-TAO.md).

## Chạy dự án

Yêu cầu Node.js 20 trở lên và PostgreSQL 13 trở lên. Tạo một database PostgreSQL và schema dành riêng cho ứng dụng, sau đó:

1. Chạy `npm install`.
2. Sao chép `.env.example` thành `.env`, điền thông tin database và `JWT_ACCESS_SECRET` ngẫu nhiên, tối thiểu 32 ký tự. Không đưa `.env` vào Git.
3. Chạy `npm run migration:run`.
4. Chạy `npm run dev`; API ở `http://localhost:3000/api`, Swagger ở `http://localhost:3000/docs`.
5. (Tùy chọn) Tạo tài khoản Admin để thử các API quản trị: `npm run admin:create`. Tài khoản test đã tạo sẵn và cách tạo thêm được ghi ở [TEST-ACCOUNTS.md](./TEST-ACCOUNTS.md).

`DB_SCHEMA` mặc định là `public`; với database dùng chung, tạo schema riêng trước khi chạy migration và cấu hình tên schema trong `.env`. Backend và migration dùng cùng cấu hình. `DB_SSL_MODE=local` chỉ cho phép host localhost/127.0.0.1/::1; `DB_SSL_MODE=require` bắt buộc TLS cho kết nối online.

Với Supabase Session Pooler, điền host, port, user và database từ **Connect → Session pooler**, đặt `DB_SSL_MODE=require` và schema riêng. Chế độ này mã hóa đường truyền nhưng **không xác minh CA hoặc hostname**, nên chỉ phù hợp môi trường demo như yêu cầu; không dùng cấu hình này cho production hoặc dữ liệu nhạy cảm. Cần xác minh chứng chỉ máy chủ và dùng tài khoản database giới hạn quyền trước khi triển khai thật. Schema riêng không thay thế phân quyền hay sao lưu, và không nên đưa schema này vào Supabase Data API.

Chạy `npm run build`, `npm test` và `npm run lint` để kiểm tra. Mặc định test dùng PostgreSQL giả lập trong bộ nhớ (`pg-mem`). Để kiểm thử PostgreSQL thật, đặt `BK_TEST_DATABASE_URL` trỏ tới một database **rỗng, chỉ dành cho test** có tên `bk_uni_test` rồi chạy `npm test`; test tạo schema riêng, bảng và thay đổi dữ liệu trong database đó. Không chạy test này với database đang dùng. `npm run migration:revert` hoàn tác migration mới nhất và có thể xóa dữ liệu: chỉ chạy khi đã sao lưu và chủ động muốn hoàn tác.

## API hiện có

| Nhóm | Endpoint chính |
| --- | --- |
| Xác thực | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` |
| Môn học | `GET/POST /api/courses`, `GET /api/courses/by-code/:code`, `GET/PATCH/DELETE /api/courses/:id`, `GET/PUT /api/courses/:id/opened-semesters`, `DELETE /api/courses/:id/opened-semesters/:semesterCode` |
| Chương trình đào tạo | `GET/POST /api/curricula`, `GET/PATCH/DELETE /api/curricula/:id`, `/api/curricula/:id/courses`, `/groups`, `/categories`, `/relations`, `/regulations` |
| Hồ sơ sinh viên | `GET/PATCH /api/student-profiles/me` |
| Trạng thái môn học | `GET /api/student-courses/me`, `PUT/DELETE /api/student-courses/me/:courseId` |
| Kế hoạch học tập | `GET /api/student-plan-courses/me`, `PUT/DELETE /api/student-plan-courses/me/:curriculumId/:courseId` |
| Trạng thái quy định | `GET /api/student-regulation-statuses/me`, `PUT/DELETE /api/student-regulation-statuses/me/:regulationId` |

Endpoint đọc danh mục (`courses`, `curricula` và nội dung của chương trình) không cần đăng nhập; endpoint thay đổi dữ liệu chương trình yêu cầu vai trò `ADMIN`; endpoint `/me` yêu cầu phiên đăng nhập và luôn thao tác trên dữ liệu của chính tài khoản đó. Chi tiết request/response xem [API-FRONTEND.md](./API-FRONTEND.md).

Chưa có API gợi ý học phần, phân tích điều kiện học phần, tổng hợp tín chỉ, đổi mật khẩu, refresh token và quản lý tài khoản Admin.

## Xác thực

| API | Nội dung |
| --- | --- |
| `POST /api/auth/register` | `{ "email", "password" }`; tạo Student, không tự đăng nhập. |
| `POST /api/auth/login` | `{ "email", "password" }`; đặt cookie phiên, trả thông tin tài khoản. |
| `GET /api/auth/me` | Trả id, email, role của phiên hiện tại. |
| `POST /api/auth/logout` | Xóa phiên hiện tại ở database và cookie. |

Email được chuẩn hóa thành chữ thường. Mật khẩu có ít nhất 8 ký tự, tối đa 72 byte UTF-8 và được băm bằng bcrypt. Không có API tự cấp Admin; việc cấp quyền phải do người vận hành được ủy quyền thực hiện. Vai trò được đọc từ database mỗi lần kiểm tra phiên. Mỗi lần đăng nhập tạo một phiên riêng; đăng xuất chỉ thu hồi phiên hiện tại. Phiên hết hạn theo `SESSION_TTL_SECONDS` (mặc định 86400 giây, tối đa 30 ngày), không có refresh token.

Token chỉ nằm trong cookie HttpOnly, SameSite=Lax, Secure khi `NODE_ENV=production`; không trả token trong JSON. Frontend gửi `credentials: 'include'` và origin chính xác trong `CORS_ORIGINS`. Mọi request thay đổi dữ liệu, kể cả đăng ký và đăng nhập, bắt buộc có header `Origin` thuộc danh sách cho phép; công cụ như curl/Postman cũng cần gửi header này. Cấu hình frontend và backend cùng site để cookie SameSite=Lax hoạt động; production bắt buộc HTTPS, bao gồm cả origin frontend. Không đưa token hoặc mật khẩu vào log.

API có giới hạn tốc độ theo IP (120 request/phút; đăng nhập và đăng ký 10 request/phút mỗi endpoint). Bộ đếm mặc định nằm trong bộ nhớ mỗi instance, không phải giới hạn toàn hệ thống: khi chạy nhiều instance cần rate limiter dùng kho lưu trữ chia sẻ và cấu hình IP proxy đáng tin cậy. Cần dọn các bản ghi phiên hết hạn theo chính sách vận hành.

## Quy ước phát triển

- Mỗi nghiệp vụ có module, controller, service, DTO và entity riêng; controller điều hướng, service xử lý nghiệp vụ.
- **Toàn bộ cột database, tên thuộc tính entity, trường DTO và khóa JSON dùng `snake_case`** (`course_id`, `semester_code`, `created_at`, `updated_at`, `updated_by`). Không dùng camelCase ở bất kỳ tầng nào để tránh phải viết lớp chuyển đổi tên.
- DTO dùng `class-validator`; request thừa trường bị từ chối (`whitelist` + `forbidNonWhitelisted`). DTO chỉ kiểm tra kiểu dữ liệu và độ dài, không kiểm tra quy tắc nghiệp vụ.
- Response thành công có dạng `{ error: false, data, message }`, lỗi có dạng `{ error: true, data: null, message }`. Danh sách dùng `PageDto`, `PageMetaDto` và `PageOptionsDto`.
- Entity kế thừa `BaseEntityCustom` (`id`, `created_at`, `updated_at`, `updated_by`). `updated_by` là trường nullable và **chưa tự động điền**.
- Dùng `@AdminOnly()` cho route giới hạn vai trò Admin, `@SignedIn()` cho route cần phiên đăng nhập. Route `/me` luôn giới hạn ở tài khoản hiện tại.
- Lỗi ràng buộc PostgreSQL được dịch sang mã HTTP phù hợp qua `src/common/database/postgres-error.ts`: trùng lặp → `409`, khóa ngoại không tồn tại → `400`.
- Schema được quản lý bằng migration, `synchronize` luôn tắt. Khi thêm entity, đăng ký trong module và `src/database/entities.ts`, tạo migration tương ứng. Không sửa migration đã triển khai.
- `common` chỉ chứa các thành phần đang dùng hoặc có hợp đồng rõ ràng. Các tính năng MOVE không thuộc BK Uni như OTP, OAuth, logging request dạng cURL và audit log chưa được sao chép.

## Mô hình dữ liệu học tập

Các entity được đăng ký tập trung trong `src/database/entities.ts`; các cột dùng `snake_case`. Tất cả entity dùng UUID và các cột của `BaseEntityCustom`.

- `users` là tài khoản đăng nhập; `student_profiles` gắn tối đa một hồ sơ với tài khoản. Đăng ký chỉ cần email và mật khẩu, không tự tạo hồ sơ; các thông tin trong hồ sơ đều có thể để trống, kể cả chương trình và khóa tuyển sinh.
- `courses` và `course_opened_semesters` là danh mục dùng chung. `curricula`, `curriculum_courses`, `course_groups`, `course_group_members`, `course_categories`, `course_category_members`, `course_relations`, `curriculum_regulations` lưu cấu trúc theo chương trình. `curriculum_id` trong `course_group_members`/`course_category_members` được lưu thêm để ràng buộc nhóm và môn cùng thuộc một chương trình. Một môn có thể nằm trong **nhiều khối** (ví dụ vừa thuộc nhóm C vừa dùng làm tự chọn tự do), chỉ không lặp trong cùng một khối.
- **Nhóm học phần là dữ liệu theo chương trình:** `course_categories` (tên do admin tự đặt) + `course_category_members` chỉ mang tính mô tả, không có ràng buộc số môn/tín chỉ; cùng một môn có thể mang tên nhóm khác nhau ở từng chương trình nên không lưu trên `courses`.
- **Vị trí khuyến nghị là tùy chọn:** `curriculum_courses.recommended_year/term` cho phép `NULL` cho môn thuộc pool tự chọn (chọn 5 trong 44 môn rải rác nhiều học kỳ). Môn bắt buộc vẫn nên có năm/kỳ để hiển thị lộ trình.
- **Khối yêu cầu** (`course_groups`) có `required_count` (số môn phải chọn) và/hoặc `required_credits` (số tín chỉ phải đạt, ít nhất một trong hai), `pool_scope` = `listed` (chọn trong danh sách môn của khối) hoặc `any` (chọn tự do mọi môn trong danh mục, không có thành viên), và `pool_course_credits` để giới hạn khối `any` chỉ nhận môn đúng số tín chỉ (ví dụ tự chọn tự do chỉ nhận môn 3 tín chỉ). Phân bổ theo từng học kỳ chỉ là gợi ý, không lưu thành ràng buộc.
- `student_courses`, `student_plan_courses`, `student_regulation_statuses` là dữ liệu **tự khai**, không phải kết quả chính thức. Môn trong kế hoạch **không bắt buộc** thuộc chương trình (tự chọn tự do có thể lấy môn ngoài chương trình); hai đầu quan hệ học phần vẫn phải thuộc đúng chương trình. Trạng thái còn thiếu được hiểu là chưa bắt đầu ở tầng hiển thị.
- Mã học kỳ gồm hai chữ số năm và học kỳ 1, 2 hoặc 3, ví dụ `261`. Học kỳ khuyến nghị trong chương trình lưu riêng năm tương đối và kỳ 1–3. Quy đổi phải dựa trên khóa tuyển sinh; khi chưa có khóa thì không suy đoán học kỳ thực tế.
- Tổng tín chỉ chương trình = tổng `required_credits` của các khối cộng dồn; khối không khai báo tín chỉ thì tính `required_count` × tín chỉ môn trong khối. Chưa có API hay hàm tính tổng, và không kiểm tra tổng này so với chuẩn tốt nghiệp.
- **Ràng buộc ở database:** khóa chính, khóa ngoại, trùng lặp và miền giá trị enum. **Không có CHECK constraint nghiệp vụ** (tín chỉ dương, mã học kỳ, khóa tuyển sinh, giới hạn tín chỉ) — các giá trị này được chấp nhận như dữ liệu đầu vào; frontend hoặc tầng nghiệp vụ tương lai tự kiểm tra nếu cần.
- **Xóa theo tầng:** mọi khóa ngoại dùng `ON DELETE CASCADE`; xóa môn, chương trình, nhóm, môn trong chương trình hoặc quy định sẽ xóa theo các bản ghi con. Riêng `student_profiles.curriculum_id` dùng `ON DELETE SET NULL` để xóa chương trình không xóa hồ sơ sinh viên.
- Chưa tạo bảng gợi ý (`recommendation_runs`, `recommendation_items`) vì input/output của chức năng gợi ý chưa được chốt. Khi chốt, cần thêm entity, migration và API tương ứng.
- Các quy tắc liên bảng như số môn phải chọn so với số thành viên nhóm, các môn tự chọn cùng số tín chỉ, nhóm bắt buộc có số môn bằng số thành viên, đồ thị tiên quyết không có chu trình **chưa được database hoặc service thực thi** (service chỉ kiểm tra cấu trúc khối: khối phải có `required_count` hoặc `required_credits`; khối `any` phải có `required_credits` và không có thành viên; năm/kỳ khuyến nghị phải cùng có hoặc cùng `null`). Đây là lựa chọn có chủ đích để giai đoạn đầu nhận được mọi dữ liệu đầu vào; khi bổ sung cần kiểm tra trong transaction.
- Database khởi tạo trống, dữ liệu trong `Design/data` chỉ dùng cho prototype giao diện. Muốn nạp chương trình mẫu qua API, dùng `npm run curriculum:create -- --data=scripts/cs-2023-khmt.json` (xem [TAO-CHUONG-TRINH-DAO-TAO.md](./TAO-CHUONG-TRINH-DAO-TAO.md)).
