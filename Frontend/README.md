# BK Uni Frontend

Frontend React 19 + TypeScript + Vite cho đồ án BK Uni. Kiến trúc 5 tầng (types/utils → config → stores/contexts → hooks → components) bám theo mẫu MOVE-Admin nhưng rút gọn: **style lấy từ design token + theme antd, không viết lại CSS cho từng trạng thái**.

## Chạy dự án

Yêu cầu Node.js 20.19+ hoặc 22.12+ (theo Vite 7) và npm.

```powershell
cd Frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

- `npm run dev` — chạy dev server tại `http://localhost:5173` (khớp CORS mặc định của backend).
- `npm run build` — kiểm tra TypeScript và build production.
- `npm run lint` — ESLint.
- `npm run preview` — xem bản build.

`VITE_API_URL` là URL gốc của API (mặc định `/api`). Vite mặc định chuyển tiếp `/api` tới backend tại `http://localhost:3210`; đặt `VITE_API_PROXY_TARGET` trong `.env` nếu backend chạy ở địa chỉ khác. Proxy giữ nguyên prefix `/api`.

Triển khai production: frontend và backend phải cùng site để cookie `SameSite=Lax` hoạt động, bắt buộc HTTPS, và origin frontend phải nằm trong `CORS_ORIGINS` của backend. Biến `VITE_` được nhúng vào client — không dùng cho secrets.

## Kiến trúc

```text
src/
  apis/            Hàm gọi API theo nghiệp vụ (auth, course, curriculum, student)
  components/      Component dùng chung + barrel `components/index.tsx`
  config/          access-control, query-client, query-method, sider-options, theme
  contexts/        ThemeProvider + useAppTheme
  hooks/           Hook dùng chung + barrel `hooks/index.ts`
  layouts/         auth / private (Sider + Header) / public
  pages/           Trang theo nghiệp vụ
  routes/          guards + public/student/admin routes
  stores/          Zustand: auth (phiên), authz (quyền)
  styles/          tokens.css, base.css, layout.css, components.css
  types/           Kiểu dữ liệu theo nghiệp vụ + barrel
  utils/           error, toast, lazy, auth-validation, session-bus
```

### Muốn làm gì thì sửa ở đâu

| Nhu cầu | Nơi sửa |
| --- | --- |
| Thêm trang | `pages/<nghiệp-vụ>/index.tsx` + khai route trong `routes/student.routes.tsx` hoặc `routes/admin.routes.tsx` + thêm mục menu ở `config/sider-options` + resource ở `config/access-control/page-resources.ts` |
| Đổi màu/bo góc/nhãn | `config/theme/index.ts` (antd token) và `styles/tokens.css` (biến CSS) — hai nơi phải khớp nhau |
| Đổi quyền xem trang | `config/access-control/index.ts` (`routeAccessRules`, `getPermissionsForRole`) |
| Thêm endpoint | `apis/<nghiệp-vụ>/index.ts` + kiểu trong `types/<nghiệp-vụ>.ts` |
| Thêm component dùng chung | `components/<Tên>/index.tsx` + export ở `components/index.tsx` |
| Thêm hook dùng chung | `hooks/use<Tên>.ts` + export ở `hooks/index.ts` |

### Luồng dữ liệu

```text
page  →  hooks (useApiQuery / useApiMutation)  →  apis/<nghiệp-vụ>  →  config/query-method
                                                                          ↓
                                                     axios (cookie) → envelope → ApiError → toast
```

- `config/query-method` là nơi duy nhất gọi axios: bóc envelope `{ error, data, message, pagination }`, chuẩn hoá lỗi thành `ApiError`, tự hiện toast lỗi (trừ khi truyền `suppressGlobalErrorToast`).
- Danh sách dùng `queryMethod.getPage<T>()` → `{ items, pagination }`.
- Gặp `401` ở endpoint không phải auth: interceptor phát tín hiệu qua `utils/session-bus` → `stores/auth` xoá phiên + cache React Query → guard tự đẩy về `/login`.
- UI không bao giờ tự gọi `axios`/`fetch` và không tự `toast.error` cho lỗi đã được xử lý ở tầng transport.

### Quy ước code

- Alias `@/` trỏ `src`. Page/layout đặt trong thư mục riêng với `index.tsx`.
- TypeScript strict: không `any`, không `@ts-ignore`, không `enum` (dùng const object + union type), `import type` cho kiểu.
- antd v6: `Button` dùng `color` + `variant` (không dùng `type`), `Alert` dùng `title`, `Space` dùng `orientation`, `Tabs` dùng `items`.
- Component dùng chung: `PageHeader`, `ISolidBtn`/`IOutLinedBtn`/`ITextBtn`/`IconBtn`, `FormField`, `PasswordField`/`ConfirmPasswordField`, `ITable`, `TablePageSkeleton`, `EmptyState`, `ComingSoon`.
- Hook dùng chung: `useApiQuery`, `useApiMutation`, `usePageLocation`, `useDebounce`, `useAsyncAction`, `useMediaQuery`, `useCurrentUser`/`useCurrentRole`, `usePermission`/`useHasRole`, `useDocumentTitle`.
- Danh sách phải đồng bộ `page`/`pageSize`/filter lên URL qua `usePageLocation` + `ITable` để F5 và chia sẻ link không mất trạng thái.
- Xác thực: cookie HttpOnly + `withCredentials`, khôi phục phiên bằng `GET /auth/me`, không lưu token/user trong localStorage.

## Trạng thái tích hợp

| Trang | Route | API |
| --- | --- | --- |
| Đăng nhập / Đăng ký | `/login`, `/register` | `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `POST /auth/logout` |
| Chương trình & học phần | `/courses` | `GET /courses`, `GET /curricula/:id/categories`, `GET /student-courses/me` |
| Chi tiết môn + học kỳ đã mở | `/courses/:code` | `GET /courses/by-code/:code`, `GET /courses/:id/opened-semesters`, `GET /curricula/:id/categories` |
| Trạng thái môn học | `/student-courses` | `GET/PUT/DELETE /student-courses/me` |
| Kế hoạch học tập | `/plan` | `GET /curricula/:id/courses`, `GET/PUT/DELETE /student-plan-courses/me` |
| Quy định tốt nghiệp | `/regulations` | `GET /curricula/:id/regulations`, `GET/PUT/DELETE /student-regulation-statuses/me` |
| Hồ sơ cá nhân | `/profile` | `GET/PATCH /student-profiles/me` |
| Quản lý môn học (Admin) | `/admin/courses` | `GET/POST/PATCH/DELETE /courses`, `PUT/DELETE .../opened-semesters` |
| Chương trình đào tạo (Admin) | `/admin/curricula` | `GET/POST/PATCH/DELETE /curricula` |
| Nội dung chương trình (Admin) | `/admin/curricula/:id` | môn, nhóm môn, quan hệ, quy định của chương trình |

Chưa có API (xem `API-FRONTEND.md` mục 7): gợi ý học phần (`/recommendations` hiển thị trạng thái chờ API), đổi mật khẩu, quên mật khẩu, quản lý tài khoản Admin.
