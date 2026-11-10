# Luồng tạo một chương trình đào tạo

Tài liệu này mô tả **cách tạo một chương trình đào tạo hoàn chỉnh qua API thật** của backend
(đã kiểm chứng trên backend đang chạy tại `http://localhost:3210`). Nội dung gồm thứ tự gọi bắt
buộc, payload từng bước, các ràng buộc thực sự được thi hành, và những chỗ backend **không** chặn
để bạn tự kiểm trước khi ghi.

- Base URL local: `http://localhost:3210/api`
- Swagger: `http://localhost:3210/docs`
- Script chạy sẵn toàn bộ luồng: [`scripts/create-curriculum.mjs`](./scripts/create-curriculum.mjs)
  + dữ liệu mẫu [`scripts/sample-curriculum.json`](./scripts/sample-curriculum.json)

## 1. Vì sao phải chia nhiều request

Không có endpoint "tạo cả chương trình trong một request". Mỗi phần dữ liệu là một bảng riêng và
có khóa ngoại, nên thứ tự bị ràng buộc bởi database:

```
courses ─┬─> curriculum_courses <── curricula
         │        │   │
         │        │   └──────────────> course_relations (2 đầu đều là curriculum_courses)
         │        └──────────────────> course_group_members <── course_groups
         └───────────────────────────> course_opened_semesters

curricula ─────────────────────────────> curriculum_regulations
```

Hệ quả: **môn học phải tồn tại trước khi vào chương trình; môn phải nằm trong chương trình trước
khi vào nhóm hoặc tham gia quan hệ tiên quyết.** Nếu gọi sai thứ tự, backend trả `400`.

## 2. Chuẩn bị

| Việc | Cách làm |
| --- | --- |
| Backend chạy | `cd Backend && npm run dev`, kiểm tra `GET /api/curricula` trả `200` |
| Tài khoản ADMIN | có sẵn `admin@bkuni.local` / `Admin@123456`; tạo mới bằng `npm run admin:create` |
| Header `Origin` | **bắt buộc** cho mọi `POST/PUT/PATCH/DELETE`; giá trị phải nằm trong `CORS_ORIGINS` (`http://localhost:5173` hoặc `http://localhost:3210`) |
| Phiên đăng nhập | cookie `accessToken` (HttpOnly) do `POST /auth/login` đặt; không có `Authorization: Bearer` |

Thiếu `Origin` hoặc `Origin` lạ: `403 {"error":true,"data":null,"message":"Nguồn yêu cầu không được phép."}`.
Đăng nhập bằng tài khoản `STUDENT` rồi gọi API ghi: `403 "Forbidden resource"`.

## 3. Thứ tự 7 bước

| # | Việc | Request | Quyền | Mã thành công |
| --- | --- | --- | --- | --- |
| 1 | Đăng nhập | `POST /auth/login` | công khai | `200` |
| 2 | Tạo môn học (danh mục chung) | `POST /courses`, `PUT /courses/:id/opened-semesters` | ADMIN | `201` / `200` |
| 3 | Tạo vỏ chương trình | `POST /curricula` | ADMIN | `201` |
| 4 | Đưa môn vào chương trình | `POST /curricula/:id/courses` | ADMIN | `201` |
| 5 | Nhóm môn + thành viên | `POST /curricula/:id/groups`, `PUT .../groups/:groupId/members` | ADMIN | `201` / `200` |
| 6 | Quan hệ tiên quyết/khuyến nghị | `PUT /curricula/:id/courses/:courseId/relations` | ADMIN | `200` |
| 7 | Quy định đào tạo | `POST /curricula/:id/regulations` | ADMIN | `201` |

Bước 1–3 có thể đảo thứ tự 2 và 3 (chương trình không cần môn để tồn tại), nhưng 4 phải sau cả 2 và 3.

## 4. Payload từng bước

### Bước 1 — Đăng nhập

```http
POST /api/auth/login
Origin: http://localhost:5173
Content-Type: application/json

{ "email": "admin@bkuni.local", "password": "Admin@123456" }
```

Trả `200` + `Set-Cookie: accessToken=...`; body `data` là `{id, email, role}`. Không có token trong JSON.

### Bước 2 — Môn học

`POST /api/courses` — cả 3 trường đều bắt buộc, `credits` là số nguyên dương trên thực tế:

```json
{ "code": "CO2003", "name": "Cấu trúc dữ liệu và giải thuật", "credits": 4 }
```

`code` trùng (không phân biệt hoa/thường) → `409 "Mã môn học đã tồn tại."`
Tra cứu lại: `GET /api/courses/by-code/CO2003` (404 nếu chưa có).

Học kỳ đã mở (tùy chọn, phục vụ gợi ý đăng ký):

```http
PUT /api/courses/:id/opened-semesters

{ "semester_codes": ["251", "252"] }
```

Mã học kỳ = 2 chữ số năm + kỳ `1..3` (`251` = năm 25, kỳ 1). Request này **thay thế toàn bộ**
danh sách, không phải thêm dần; muốn bỏ một kỳ dùng `DELETE .../opened-semesters/:semesterCode`.

### Bước 3 — Vỏ chương trình

`POST /api/curricula` — 8 trường bắt buộc, `description` tùy chọn (`null` được):

```json
{
  "code": "CS-2023",
  "name": "Khoa học máy tính",
  "major": "Công nghệ thông tin",
  "faculty": "Công nghệ thông tin",
  "cohort": 2023,
  "duration_years": 4,
  "min_semester_credits": 1,
  "max_semester_credits": 18,
  "description": "Chương trình mẫu."
}
```

- `code` trùng → `409 "Mã chương trình đã tồn tại."`
- Thiếu trường / sai kiểu → `400` kèm message tiếng Anh của `class-validator`, ví dụ
  `"major must be a string; cohort must be an integer number; ..."`
- Gửi trường lạ (kể cả camelCase như `durationYears`) → `400 "property durationYears should not exist; ..."`.
  Toàn bộ API dùng **snake_case**.

### Bước 4 — Đưa môn vào chương trình

`POST /api/curricula/:id/courses`, một request cho một môn:

```json
{ "course_id": "<uuid môn>", "recommended_year": 2, "recommended_term": 1 }
```

Đây là **upsert**: môn đã có trong chương trình thì request này cập nhật `recommended_year`/
`recommended_term`, nên chạy lại nhiều lần không sinh bản ghi trùng.

`recommended_year` (1..duration) và `recommended_term` (1..3) là **tùy chọn**. Bỏ trống hoặc gửi
`null` cả hai nghĩa là môn thuộc chương trình nhưng **chưa xếp kỳ** — đúng cho pool tự chọn
("chọn 5 trong 44 môn rải rác nhiều học kỳ"). Quy tắc: năm và kỳ phải **cùng có hoặc cùng `null`**,
gửi lệch → `400`.

`course_id` không tồn tại → `400 "Môn học, chương trình hoặc nhóm môn không tồn tại."`

### Bước 5 — Nhóm môn (khối yêu cầu)

`POST /api/curricula/:id/groups`:

```json
{
  "name": "Tự chọn nhóm C",
  "kind": "elective",
  "pool_scope": "listed",
  "required_count": 5,
  "required_credits": 15,
  "course_ids": ["<uuid>", "..."]
}
```

- `kind`: `"required"` hoặc `"elective"`.
- Khối phải có **ít nhất một** ràng buộc: `required_count` (số môn phải chọn) hoặc
  `required_credits` (số tín chỉ phải đạt); thiếu cả hai → `400`.
- `course_ids` (tùy chọn, chỉ với `pool_scope = "listed"`) **phải là môn đã ở bước 4**; không thì `400`.
- **Một môn được nằm trong nhiều khối** (ví dụ vừa thuộc nhóm C vừa dùng làm tự chọn tự do);
  chỉ lặp trong cùng một khối mới bị chặn.
- Tên nhóm trùng trong cùng chương trình → `409 "Dữ liệu bị trùng: tên nhóm đã tồn tại hoặc môn đã có trong nhóm."`
- Sửa nhóm: `PATCH /api/curricula/:id/groups/:groupId` (gửi trường cần đổi).
- Thay toàn bộ thành viên: `PUT /api/curricula/:id/groups/:groupId/members` với `{ "course_ids": [...] }`.

**Khối chọn tự do** (`pool_scope = "any"`) — dùng cho tự chọn tự do, không khai báo thành viên:

```json
{
  "name": "Tự chọn tự do",
  "kind": "elective",
  "pool_scope": "any",
  "required_credits": 9,
  "pool_course_credits": 3
}
```

- Bắt buộc có `required_credits`; gửi `course_ids` khác rỗng → `400`.
- `pool_course_credits` (tùy chọn) giới hạn chỉ nhận môn đúng số tín chỉ đó (`3` = chỉ môn 3 TC).
- Sinh viên có thể chọn môn ngoài chương trình (kể cả chương trình khác) khi lập kế hoạch.

### Bước 6 — Quan hệ tiên quyết / khuyến nghị

`PUT /api/curricula/:id/courses/:courseId/relations`:

```json
{
  "prerequisite_course_ids": ["<uuid môn tiên quyết>"],
  "recommended_course_ids": ["<uuid môn khuyến nghị>"]
}
```

- Cả hai đầu quan hệ phải **thuộc cùng chương trình** (đã ở bước 4) → nếu không: `400`.
- Trường không gửi thì **giữ nguyên**; gửi mảng rỗng `[]` thì xóa hết quan hệ loại đó.
- Đọc lại: `GET /api/curricula/:id/relations` (lọc `?course_id=`) trả kèm `course_code`,
  `related_course_code`, `type`.

### Bước 7 — Quy định đào tạo

`POST /api/curricula/:id/regulations`:

```json
{ "name": "Chuẩn ngoại ngữ đầu ra", "detail": "Đạt chứng chỉ tiếng Anh theo quy định." }
```

`detail` có thể `null`. Sửa/xóa: `PATCH`/`DELETE /api/curricula/:id/regulations/:regulationId`.

### Bước 8 — Nghiệm thu

Đọc lại và đối chiếu (đây là bước script tự làm):

```http
GET /api/curricula/:id
GET /api/curricula/:id/courses
GET /api/curricula/:id/groups
GET /api/curricula/:id/relations
GET /api/curricula/:id/regulations
```

## 5. Ràng buộc backend thực sự thi hành

| Ràng buộc | Backend chặn? | Mã lỗi |
| --- | --- | --- |
| Thiếu/sai kiểu trường DTO, gửi trường lạ | Có (whitelist + forbidNonWhitelisted) | `400` |
| UUID sai định dạng ở path | Có (`ParseUUIDPipe`) | `400 "Validation failed (uuid is expected)"` |
| Mã chương trình / mã môn trùng | Có (unique index lower) | `409` |
| Tên nhóm trùng trong chương trình | Có | `409` |
| Môn vào nhóm/quan hệ nhưng chưa thuộc chương trình | Có (khóa ngoại) | `400` |
| Khối yêu cầu thiếu cả `required_count` và `required_credits` | Có (service) | `400` |
| Khối `any` gửi `course_ids` hoặc thiếu `required_credits` | Có (service) | `400` |
| `recommended_year`/`recommended_term` gửi lệch (một có một null) | Có (service) | `400` |
| Một môn lặp trong cùng một khối | Có (unique `group_id` + `course_id`) | `409` |
| Chưa đăng nhập / không phải ADMIN | Có | `401` / `403` |
| Thiếu `Origin` hợp lệ | Có | `403` |
| Vượt 120 request/phút (đăng nhập 10) | Có | `429` |

## 6. Ràng buộc **không** được thi hành (phải tự kiểm)

Migration `1794300000000-snake-case-and-cascade` đã **drop toàn bộ CHECK constraint nghiệp vụ**
(xem `Backend/README.md`, mục "Mô hình dữ liệu học tập") và DTO chỉ kiểm tra kiểu dữ liệu. Đã thử
trực tiếp trên backend đang chạy:

| Dữ liệu sai | Kết quả thực tế |
| --- | --- |
| `cohort: 1999` (ngoài 2000..2099) | `201` — vẫn tạo được |
| `recommended_term: 4` | `201` — vẫn nhận |
| Môn tự làm tiên quyết của chính nó | `200` — vẫn lưu |
| `required_count` lớn hơn số môn của nhóm | Vẫn tạo được |
| Nhóm `required` có `required_count` nhỏ hơn số thành viên | Vẫn tạo được |
| Tổng tín chỉ các khối khác 128 (chuẩn tốt nghiệp) | Không kiểm tra |
| Đồ thị tiên quyết có chu trình | Không bị phát hiện |
| Mã học kỳ sai định dạng (`"abc"`) | Không có CHECK; chỉ bị chặn nếu `MaxLength(3)` ở DTO |

Vì vậy "đúng cách" nằm ở phía người gọi:

1. `cohort` trong `2000..2099`, `duration_years ≥ 1`, `0 ≤ min_semester_credits ≤ max_semester_credits`.
2. `recommended_year` trong `1..duration_years`, `recommended_term ∈ {1,2,3}`; môn pool tự chọn để cả hai `null`.
3. Mọi môn của nhóm và hai đầu quan hệ đã có ở bước 4 (đừng dựa vào `400` để phát hiện).
4. `required_count ≤` số môn của nhóm; khối `required_count` bằng số thành viên nếu là nhóm bắt buộc.
5. Tổng tín chỉ các khối cộng lại phải bằng chuẩn tốt nghiệp (ví dụ 128).
6. Không tự tiên quyết, không tạo chu trình tiên quyết (A→B→A).
7. Mã học kỳ đúng `YY[123]` (`241`, `252`, ...).

Script `create-curriculum.mjs` kiểm tra toàn bộ các điểm trên **trước khi ghi** và báo lỗi gộp
một lần, nên không để lại chương trình nửa vời.

## 7. Dùng script có sẵn

```bash
cd Backend

# 1. Kiểm tra dữ liệu, in kế hoạch, không ghi gì
node scripts/create-curriculum.mjs --dry-run

# 2. Tạo thật theo scripts/sample-curriculum.json (CS-2023: 9 môn, 3 khối liệt kê,
#    1 khối "chọn tự do", 2 quan hệ, 1 quy định)
node scripts/create-curriculum.mjs

# 3. Chạy lại: idempotent (dùng lại môn/chương trình/nhóm đã có, không tạo trùng)
node scripts/create-curriculum.mjs

# 4. Tạo rồi xóa ngay (chỉ xóa môn do lần chạy này tạo)
node scripts/create-curriculum.mjs --remove-after

# 5. Dùng dữ liệu riêng
node scripts/create-curriculum.mjs --data=duong/dan/chuong-trinh.json
```

Tùy chọn khác: `--base-url=`, `--origin=`, `--email=`, `--password=` (hoặc biến môi trường
`BK_API_URL`, `BK_WEB_ORIGIN`, `BK_ADMIN_EMAIL`, `BK_ADMIN_PASSWORD`).

File dữ liệu dùng **mã môn** (`course_code`) thay cho UUID, script tự tra/ tạo môn rồi đổi sang
`course_id`:

```json
{
  "curriculum": { "code": "CS-2024", "name": "Khoa học máy tính", "major": "...", "faculty": "...",
                  "cohort": 2024, "duration_years": 4, "min_semester_credits": 1, "max_semester_credits": 18 },
  "courses": [
    { "code": "CO2003", "name": "Cấu trúc dữ liệu và giải thuật", "credits": 4, "opened_semesters": ["251"] },
    { "code": "CO3001", "name": "Kỹ thuật phần mềm", "credits": 3, "opened_semesters": ["252"] }
  ],
  "curriculum_courses": [
    { "course_code": "CO2003", "recommended_year": 2, "recommended_term": 1 },
    { "course_code": "CO3001", "recommended_year": 3, "recommended_term": 1 }
  ],
  "groups": [
    { "name": "Cơ sở ngành", "kind": "required", "required_count": 2, "course_codes": ["CO2003", "CO3001"] },
    { "name": "Tự chọn tự do", "kind": "elective", "pool_scope": "any", "required_credits": 3,
      "pool_course_credits": 3, "course_codes": [] }
  ],
  "relations": [{ "course_code": "CO3001", "prerequisite_course_codes": ["CO2003"] }],
  "regulations": [{ "name": "Chuẩn ngoại ngữ đầu ra", "detail": "..." }]
}
```

**Chuyên ngành (không bắt buộc).** Thêm mảng `specializations`. Mỗi phần tử trong `groups` của một chuyên
ngành thu hẹp một khối gốc (tham chiếu bằng tên `parent_group`): `course_codes` phải là tập con của
khối gốc, còn `required_count`/`required_credits` bỏ trống thì kế thừa khối gốc. Khối chuyên ngành
**không** cộng tín chỉ tốt nghiệp. Xem ví dụ đầy đủ trong `scripts/cs-2023-khmt.json`.

```json
"specializations": [
  { "code": "CNPM", "name": "Công nghệ Phần mềm",
    "groups": [{ "parent_group": "Tự chọn nhóm C (học kỳ 7 và 8)",
                 "name": "Tự chọn nhóm C - Công nghệ Phần mềm",
                 "course_codes": ["CO3011", "CO3013", "..."] }] }
]
```

Một chuyên ngành có thể thu hẹp **cùng một khối gốc bằng nhiều khối con**, ví dụ chuyên ngành có môn
bắt buộc cộng phần tự chọn (xem `scripts/im-2023-qlcn.json`): một khối `required` chọn đủ 3/3 môn và
một khối `elective` chọn 6 TC. Các khối con này **không được trùng môn** (backend trả `400`, script báo
lỗi trước khi ghi).

```json
"groups": [
  { "parent_group": "Tự chọn nhóm B", "name": "Nhóm B - Chuỗi cung ứng - bắt buộc",
    "kind": "required", "required_count": 3, "course_codes": ["IM3021", "IM3091", "IM3093"] },
  { "parent_group": "Tự chọn nhóm B", "name": "Nhóm B - Chuỗi cung ứng - tự chọn",
    "kind": "elective", "required_credits": 6, "course_codes": ["IM3095", "IM3097", "..."] }
]
```

Thêm `--prune` để xóa nhóm môn, chuyên ngành, nhóm học phần và quy định có trong DB nhưng không còn
trong file. Nếu không có cờ này, script chỉ thêm và cập nhật, không xóa gì.

## 8. Gọi tay bằng curl (luồng tối thiểu)

```bash
BASE=http://localhost:3210/api
ORIGIN=http://localhost:5173

curl -s -c cookies.txt -X POST $BASE/auth/login \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"email":"admin@bkuni.local","password":"Admin@123456"}'

curl -s -b cookies.txt -X POST $BASE/courses \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"code":"CO2003","name":"Cấu trúc dữ liệu và giải thuật","credits":4}'
# lấy id môn trong data.id, thay vào COURSE_ID

curl -s -b cookies.txt -X POST $BASE/curricula \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"code":"CS-2023","name":"Khoa học máy tính","major":"Công nghệ thông tin",
       "faculty":"Công nghệ thông tin","cohort":2023,"duration_years":4,
       "min_semester_credits":1,"max_semester_credits":18}'
# lấy curriculum.id -> CUR_ID

curl -s -b cookies.txt -X POST $BASE/curricula/$CUR_ID/courses \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"course_id\":\"$COURSE_ID\",\"recommended_year\":2,\"recommended_term\":1}"

curl -s -b cookies.txt -X POST $BASE/curricula/$CUR_ID/groups \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d "{\"name\":\"Cơ sở ngành\",\"kind\":\"required\",\"required_count\":1,\"course_ids\":[\"$COURSE_ID\"]}"

curl -s -b cookies.txt -X POST $BASE/curricula/$CUR_ID/regulations \
  -H "Origin: $ORIGIN" -H "Content-Type: application/json" \
  -d '{"name":"Chuẩn ngoại ngữ đầu ra","detail":"..."}'
```

Trên Windows PowerShell, gọi `curl.exe` (không phải `curl`, vì `curl` là alias của
`Invoke-WebRequest`) hoặc dùng `Invoke-WebRequest -SessionVariable` / `-WebSession` để giữ cookie.
PowerShell cần thêm header `Origin` như trên; curl trên Windows nhận cả `-c/-b` để lưu cookie.

## 9. Sửa và xóa

- `PATCH /api/curricula/:id`: gửi **chỉ trường thay đổi**; đây là cách frontend đang dùng để tránh
  ghi đè dữ liệu người khác vừa sửa.
- `DELETE /api/curricula/:id`: xóa chương trình **và toàn bộ dữ liệu con** — môn trong chương
  trình, nhóm, thành viên nhóm, quan hệ, quy định, kế hoạch học tập của sinh viên thuộc chương
  trình. Không có xác nhận phía server; hồ sơ sinh viên chỉ bị `SET NULL` ở `curriculum_id`.
- `DELETE /api/courses/:id`: xóa môn dùng chung, kéo theo học kỳ mở, dòng trong mọi chương trình,
  quan hệ, trạng thái môn và kế hoạch của sinh viên có môn đó. **Cẩn thận**: môn là danh mục dùng
  chung, không thuộc riêng một chương trình.

## 10. Lỗi đã gặp thật và cách xử lý

| Message | Status | Nguyên nhân thường gặp |
| --- | --- | --- |
| `Nguồn yêu cầu không được phép.` | `403` | Thiếu `Origin` hoặc origin không có trong `CORS_ORIGINS` |
| `Forbidden resource` | `403` | Phiên không phải ADMIN |
| `Mã chương trình đã tồn tại.` | `409` | Chạy lại mà không tra cứu — dùng `GET /curricula?search=` |
| `Mã môn học đã tồn tại.` | `409` | Tạo lại môn đã có — dùng `GET /courses/by-code/:code` |
| `Môn học, chương trình hoặc nhóm môn không tồn tại.` | `400` | Môn chưa có, hoặc chưa thuộc chương trình (sai thứ tự bước 4/5/6) |
| `Dữ liệu bị trùng: tên nhóm đã tồn tại hoặc môn đã có trong nhóm.` | `409` | Trùng tên nhóm, hoặc thêm cùng một môn hai lần vào một khối |
| `Khối "any" không nhận danh sách môn; bỏ course_ids.` | `400` | Khai báo thành viên cho khối chọn tự do |
| `Khối "any" phải khai báo required_credits.` | `400` | Khối tự chọn tự do thiếu số tín chỉ |
| `Năm và học kỳ khuyến nghị phải cùng có hoặc cùng bỏ trống.` | `400` | Gửi lệch năm/kỳ ở bước 4 |
| `Nhóm môn phải có ít nhất một ràng buộc: required_count hoặc required_credits.` | `400` | Khối không khai báo yêu cầu |
| `Validation failed (uuid is expected)` | `400` | Dùng mã (`CO2003`) thay cho `course_id` ở path/body |
| `property ... should not exist` | `400` | Gửi camelCase hoặc trường ngoài DTO |
| `Hệ thống đang bận. Vui lòng thử lại sau.` | `500` | Lỗi không mong đợi (xem log backend) |

Ghi chú: message kiểm tra DTO là tiếng Anh (mặc định `class-validator`), message nghiệp vụ là
tiếng Việt. Không dựa vào `message` để rẽ nhánh — dùng HTTP status + `error`.
