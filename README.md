# BK Uni

Hệ thống hỗ trợ sinh viên theo dõi chương trình đào tạo, kế hoạch học tập và tư vấn học vụ với AI.

| Thư mục | Nội dung |
| --- | --- |
| [Backend/](Backend/) | API NestJS + TypeORM + PostgreSQL ([README](Backend/README.md)) |
| [Frontend/](Frontend/) | React 19 + Vite + antd ([README](Frontend/README.md)) |
| [pipeline/](pipeline/) | Công cụ Python xử lý dữ liệu học vụ, không cần để chạy web |

## Yêu cầu

- Node.js 20.19+ hoặc 22.12+ và npm.
- Tài khoản database dùng chung (Supabase) do Thiên cấp.

> Nếu cần setup `.env` hoặc chưa có tài khoản database, hỏi Thiên.

## 1. Backend

```powershell
cd Backend
npm ci
Copy-Item .env.example .env
```

Sửa `Backend/.env`:

```env
PORT=3210
CORS_ORIGINS=http://localhost:5173,http://localhost:3210

DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
DB_PORT=5432
DB_USERNAME=<tài khoản được cấp>
DB_PASSWORD=<mật khẩu được cấp>
DB_NAME=postgres
DB_SCHEMA=bk_uni
DB_SSL_MODE=require

JWT_ACCESS_SECRET=<chuỗi ngẫu nhiên, tối thiểu 32 ký tự>

# Chỉ cần nếu dùng trang Tư vấn với AI
DEEPSEEK_API_KEY=
```

Database dùng chung đã có sẵn bảng và dữ liệu. Tài khoản dev chỉ được xem, thêm, sửa, xóa dữ liệu, không được tạo, sửa hay xóa bảng, nên **không chạy `npm run migration:run` hay `migration:revert`**. Nếu cần thay đổi schema, báo Thiên để chạy migration.

## 2. Frontend

```powershell
cd Frontend
npm ci
Copy-Item .env.example .env     # VITE_API_PROXY_TARGET=http://localhost:3210
```

## 3. Chạy

Mở hai terminal:

```powershell
cd Backend
npm run dev                     # API http://localhost:3210/api, Swagger http://localhost:3210/docs
```

```powershell
cd Frontend
npm run dev                     # http://localhost:5173
```

Mở `http://localhost:5173` rồi đăng nhập. Tài khoản test có trong [Backend/TEST-ACCOUNTS.md](Backend/TEST-ACCOUNTS.md); bạn cũng có thể tự đăng ký tài khoản sinh viên.

## Kiểm tra

```powershell
cd Backend;  npm run build; npm test; npm run lint
cd Frontend; npm run build; npm run lint
```

Test Backend chạy trên PostgreSQL giả lập trong bộ nhớ (`pg-mem`), không chạm vào database dùng chung.

## Lưu ý

- Không commit file `.env` và không gửi mật khẩu database lên kênh chung.
- Database dùng chung cho cả nhóm. Không xóa dữ liệu của người khác, và không đưa dữ liệu sinh viên thật vào.
