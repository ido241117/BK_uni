# Tài khoản test

> **Chỉ dùng cho môi trường test/demo.** Mật khẩu nằm trong repository, không dùng cho production.
> Khi triển khai thật phải đổi mật khẩu (không có API đổi mật khẩu, xem cách bên dưới) và xóa file này khỏi repo.

Bảng dưới là các tài khoản đã tạo trong database cấu hình ở `Backend/.env` (schema `bk_uni`).

| Vai trò | Email | Mật khẩu | Ghi chú |
| --- | --- | --- | --- |
| `ADMIN` | `admin@bkuni.local` | `Admin@123456` | Tạo bằng `npm run admin:create`; đã đăng nhập và gọi được API Admin. |

Chưa có tài khoản Student nào được seed. Tạo bằng API (tự đăng ký), sau đó đăng nhập:

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
