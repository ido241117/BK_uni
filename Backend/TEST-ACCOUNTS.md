# Tài khoản test

> **Chỉ dùng cho môi trường test/demo.** Mật khẩu nằm trong repository, không dùng cho production.
> Khi triển khai thật phải đổi mật khẩu (không có API đổi mật khẩu, xem cách bên dưới) và xóa file này khỏi repo.

Bảng dưới là các tài khoản đã tạo trong database cấu hình ở `Backend/.env` (schema `bk_uni`).

| Vai trò | Email | Mật khẩu | Ghi chú |
| --- | --- | --- | --- |
| `ADMIN` | `admin@bkuni.local` | `Admin@123456` | Tạo bằng `npm run admin:create`; đã đăng nhập và gọi được API Admin. |
| `STUDENT` | `khmt.demo@bkuni.local` | `Student@123` | SV demo Khoa học Máy tính (CS-2023-KHMT), khóa 2023, đang học HK 261, **đúng tiến độ**. Tạo bằng `node scripts/seed-demo-student.mjs` (chạy lại sẽ reset dữ liệu môn học của tài khoản này). |
| `STUDENT` | `khmt.cham@bkuni.local` | `Student@123` | SV Khoa học Máy tính (CS-2023-KHMT), khóa 2023, đang học HK 261, **chậm khoảng 1 năm** (xong ~54% chương trình, 4 môn quá hạn trong đó 1 môn chưa đạt). Tạo bằng `node scripts/seed-demo-student.mjs --scenario=behind`. |

### Tài khoản test trang Gợi ý học phần (CS-2023-KHMT, khóa 2023, dừng quanh năm 2)

**Chỉ có trên Postgres local** (database `bk_uni_2`, schema `bk_uni`, khôi phục từ backup), không có trên Supabase. Tạo bằng `node scripts/seed-recommendation-students.mjs` với `Backend/.env` trỏ về local. Mỗi lần chạy sẽ xóa hẳn rồi tạo lại các tài khoản này (kể cả lộ trình đã lưu, lịch sử chat); thêm `--scenario=<tên>` để chạy một kịch bản. Mật khẩu đều là `Student@123`.

Theo lịch, HK 261 là năm 4 của khóa 2023 nên các bạn này đều chậm tiến độ; hạn 12 kỳ chính là HK 282.

| Email | Kịch bản | Tình trạng | Bộ giải CP-SAT (kiểm 28/11/2026) |
| --- | --- | --- | --- |
| `khmt.nam2@bkuni.local` | `steady` | 49 TC: xong năm 1, năm 2 kỳ 1; đang học đúng các môn năm 2 kỳ 2. Mốc chuẩn. | Tốt nghiệp 281, 28 môn trong 4 kỳ. |
| `khmt.rot@bkuni.local` | `retake` | 38 TC, GPA ~1.6. Rớt CO2003, MT1005 (chưa học lại); đang học lại CO1027 (chặn CO3005, CO3015, CO3135). | Tốt nghiệp 281, kỳ 262 22 TC. Đổi CO1027 sang "rớt" để thử. |
| `khmt.baoluu@bkuni.local` | `paused` | 33 TC: chỉ xong năm 1, bảo lưu HK 261 (không có môn đang học). | Tốt nghiệp 282 (sát hạn), 32 môn trong 5 kỳ. |
| `khmt.tuchon@bkuni.local` | `early-elect` | 58 TC: như steady, đã học sớm CO3061 (nhóm C, chọn tính vào Tự chọn tự do), IM1013 (nhóm D), CO3141 (ngoài CTĐT); đạt tiếng Anh. | Tốt nghiệp 272, 23 môn. |
| `khmt.lech@bkuni.local` | `out-of-order` | 50 TC: học trước CO2013, CO3001 nhưng bỏ CO2007, CO2011; rớt MT2013; đang học cải thiện MT1003. | Tốt nghiệp 281, 23 môn. |
| `khmt.he@bkuni.local` | `preset` | Như steady, kèm kịch bản dựng sẵn (chưa giải): học hè 263, 273; ghim CO2013 vào 262; CO3001 không mở ở 262; muốn 21 TC ở 262; muốn học CO3117, CO3133; xong trước 281. | **Lỗi**: báo TIMEOUT sau ~0,2 s. Học hè + "số TC muốn" làm trọng số mục tiêu CP-SAT tràn int64 (MODEL_INVALID). Bỏ một trong hai thì giải được. |

Tạo thêm tài khoản Student bằng API (tự đăng ký), sau đó đăng nhập:

```bash
# Cần header Origin trùng CORS_ORIGINS, ví dụ http://localhost:5173
curl -X POST http://localhost:3210/api/auth/register \
  -H "Origin: http://localhost:5173" -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"Student@123"}'
```

Hồ sơ sinh viên không được tạo tự động khi đăng ký; sau khi đăng nhập, gọi `PATCH /api/student-profiles/me` để tạo.

## Tạo hoặc đổi tài khoản Admin

Backend không có API tự cấp quyền Admin; dùng script chạy trực tiếp trên database:

```bash
cd Backend
npm run admin:create                                        # admin@bkuni.local / Admin@123456
npm run admin:create -- --email=admin@example.com --password=MatKhau123
```

Script dùng đúng cách băm bcrypt của `POST /auth/register`, nên tài khoản tạo ra đăng nhập được ngay. Nếu email đã tồn tại, script đặt lại mật khẩu và nâng vai trò thành `ADMIN` — đây cũng là cách đổi mật khẩu Admin hiện tại.

## Lưu ý khi test

- Đăng nhập đặt cookie `accessToken` (HttpOnly). Với Postman/curl phải giữ cookie và gửi `Origin` cho mọi request POST/PATCH/PUT/DELETE.
- Route đọc danh mục (`/courses`, `/curricula` và nội dung chương trình) không cần đăng nhập.
- Route ghi dữ liệu chương trình cần `ADMIN`; tài khoản Student gọi sẽ nhận `403`.
