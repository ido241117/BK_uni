# 05 · Kiểm thử: lệnh test và kịch bản đầu cuối

Ngày lập: 19/11/2026. Đi kèm [kế hoạch](02-ke-hoach.md) và [thiết kế](03-thiet-ke.md).

## Lệnh test tự động

| Lệnh | Kiểm gì | Kết quả 19/11 |
|---|---|---|
| `cd pipeline` → `.venv/Scripts/python -m pytest planner -q` | Bộ giải (ca K1–K8d, hai bộ giải đối chiếu, KHMT 2023 thật), cli, đọc file myBK (chỉ file bịa) | 101 qua |
| `cd Backend` → `npx jest test/planner.spec.ts` | Ghép đầu vào từ database (pg-mem), API, không lộ dữ liệu cá nhân, đối chiếu file myBK, gọi Python thật | 11 qua |
| `cd Frontend` → `npx tsc -b` và `npx eslint src/pages/recommendations` | Kiểu và lint trang Gợi ý | Qua |
| `cd pipeline` → `.venv/Scripts/python check_baseline.py` | Mọi sự thật trong [01-boi-canh.md](01-boi-canh.md); phần database cần backend đang chạy | DUNG 38, CHUA_LAM 2, KHAC 0 |

## Kịch bản đầu cuối (bấm tay trên web)

Mỗi kịch bản đi trọn đường: **trang Gợi ý → `POST /api/plans/solve` → backend ghép đầu vào → `planner.cli` → bộ giải → validator → trang hiện kết quả.**

Cột "Trạng thái" ghi tình trạng lúc lập file:
- **API**: đã chạy qua `curl` ngày 19/11, có đáp án; chưa bấm trên giao diện.
- **Chưa**: chưa chạy lần nào.
- **Test**: chỉ kiểm bằng test tự động.

Đáp án ghi "ghi lại" nghĩa là chưa có đáp án xếp tay. Người chạy ghi kết quả thật vào cột cuối, rồi người duyệt chốt có đúng không.

---

## 0. Chuẩn bị

1. Backend: `npm --prefix Backend run dev` (cổng 3210). Frontend: `npm --prefix Frontend run dev` (cổng 5173).
2. `cd pipeline` rồi `.venv/Scripts/python check_baseline.py`: không có mục KHAC.
3. Đăng nhập `khmt.demo@bkuni.local` (KHMT 2023, 40 môn đạt, 5 môn đang học, theo bối cảnh ngày 19/11).
4. Vào trang Gợi ý (`/recommendations`). Mở DevTools, tab Network, để xem request và response.

Quy ước: mỗi kịch bản bắt đầu từ **trang vừa tải lại** (F5), trừ khi ghi khác.

---

## A. Đường chính (giai đoạn 4–5: làm được ngay)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| A1 | Mở trang, không chỉnh gì, bấm **Giải lộ trình** (CP-SAT) | `OPTIMAL`. Học xong dự kiến **262**, còn **9 TC**. Không có cảnh báo đỏ. Có mục giả định ("môn xếp trong tương lai giả định đạt"...) | API | |
| A2 | Như A1, đổi bộ giải sang **Clingo** | `OPTIMAL`, cùng kỳ 262, cùng 9 TC với A1. Thời gian giải khác nhau là bình thường | API | |
| A3 | Danh sách "đang học" ở cột trái | Hiện đủ **5 môn đang học**, mặc định là "đậu" | Chưa | |
| A4 | Đặt **CO4029 rớt**, giải | Khóa luận **CO4337 lùi từ 262 sang 271**. Kỳ 262 còn **7 TC**, kèm ghi chú dưới 11 TC "nên trao đổi phòng đào tạo" | API | |
| A5 | Tối đa mỗi kỳ = **11**, thêm 3 môn tự chọn vào "Môn muốn học", giải | Có lộ trình. Mục "Mong muốn": **2 môn "Không đáp ứng được"** | API | |
| A6 | Bật hè 263, khóa **CO4337 vào 263**, giải | `UNSAT`. Lý do: "Bỏ một trong các lựa chọn sau thì có lộ trình: khóa CO4337 vào kỳ 263". Trang hiện lý do, không trắng trang | API | |
| A7 | Khóa một môn còn lại vào kỳ 262, giải | Môn đó nằm ở 262, có dấu "Bạn đã khóa môn vào kỳ này" | Chưa | ghi lại |
| A8 | Đánh dấu một môn còn lại **không mở ở 262**, giải | Môn đó không nằm ở 262. Nếu đó là môn chặn đường thì kỳ tốt nghiệp lùi | Chưa | ghi lại |
| A9 | "Học xong trước" = **261** (sớm hơn mức có thể), giải | `UNSAT`, lý do chỉ ra hạn tốt nghiệp | Chưa | ghi lại |
| A10 | Bật **Ưu tiên giữ khuyến nghị**, giải | Hoặc giống A1, hoặc lùi kỳ tốt nghiệp. Nếu lùi thì trang phải nói lùi bao nhiêu kỳ (mục 3.2 kế hoạch) | Chưa | ghi lại |
| A11 | Bật **Các kỳ đều tải**, giải | Kỳ tốt nghiệp không đổi so với A1 (S1 đứng trên S5) | Chưa | ghi lại |
| A12 | Bỏ chọn "Chuẩn tiếng Anh", "MOS", giải | Có lộ trình, nhưng có cảnh báo chuẩn tiếng Anh/MOS cho khóa luận, không chặn | Chưa | ghi lại |
| A13 | Bật kỳ hè, không chỉnh gì khác | Kỳ hè chỉ chứa môn từng mở hè, ≤ 12 TC, **không có đồ án** (CO3101–CO3111, CO3119, CO3127, CO4029, CO4337) | Chưa | ghi lại |

### Lỗi và biên

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| E1 | Đăng xuất, gọi `POST /api/plans/solve` | HTTP 401 | Đã chạy 19/11 (`check_baseline.py`) | |
| E2 | Tài khoản chưa chọn chương trình mở trang | Thẻ "Chưa chọn chương trình đào tạo" + nút "Cập nhật hồ sơ"; API trả 400 | Test backend | |
| E3 | Bấm Giải 21 lần trong 1 phút | Lần thứ 21 bị từ chối (giới hạn 20 lần/phút), trang báo lỗi dễ hiểu | Chưa | |
| E4 | Tắt Python (đổi `PLANNER_PYTHON` sai), giải | Trang báo lỗi, không treo; backend không sập | Chưa | |
| E5 | Bấm Giải liên tục khi lần trước chưa xong | Không gửi chồng request, hoặc kết quả cuối đúng với kịch bản cuối | Chưa | |
| E6 | Response có `violations` khác rỗng (chỉ giả lập được bằng cách sửa tay response) | Cảnh báo đỏ "Bộ giải có lỗi… Đừng dùng lộ trình này" | Chưa | |

---

## B. What-if (giai đoạn 6, T17: đã có code 19/11)

Mốc lưu trong localStorage của trình duyệt. Thẻ "So với lộ trình mốc" nằm ngay dưới dòng trạng thái.

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| B1 | Giải như A1, bấm **Lưu làm mốc** | Thẻ thành "Đang xem lộ trình mốc", có giờ lưu | Chưa | |
| B2 | Đặt CO4029 rớt, giải | "Học xong muộn hơn 1 kỳ chính: … 262 → … 271". Dời: CO4337 262 → 271. Mới: CO4029. Trên bảng kỳ: nhãn "dời từ 262", "mới so với mốc" | API | |
| B3 | Khóa một môn vào kỳ tới, giải | Chỉ những môn buộc phải đổi mới bị dời | Chưa | ghi lại |
| B4 | Đánh dấu CO3051 không mở ở 262, giải | Vẫn xong 262; mới CO3029, bỏ CO3051 | API | |
| B5 | Bấm **Về mốc**, rồi Giải lại | "Giống hệt mốc" | API (giải lại) | |
| B6 | Ghép B2 + B4 | Xong 271; dời CO4337; mới CO4029, CO3013; bỏ CO3051 | API | |
| B7 | Tải lại trang (F5) | Mốc và kịch bản lúc lưu hiện lại | Chưa | |
| B8 | Bấm **Xóa mốc**, tải lại | Không còn mốc | Chưa | |

---

## C. Script trích chương trình (giai đoạn 7, T18: **chặn**)

Cần bạn cùng nhóm gửi `build-vertical.cjs` (19/11 đã tìm trên máy, không có). Không có thì giai đoạn này đứng.

| # | Thao tác | Kết quả mong đợi |
|---|---|---|
| C1 | Chạy script cho KHMT 2023 | Ra dữ liệu khớp database: 128 TC, các nhóm D (CO3335, CO4029, CO4337) và E (ENG_GC, SA4001) |
| C2 | So kết quả với `pipeline/planner/fixtures/khmt2023.json` | Không có môn thiếu hay lệch tín chỉ |

---

## D. File tiến độ myBK (giai đoạn 8: đã có code 19/11 cho **PDF và Excel**)

Nút "Tải file tiến độ myBK" ở đầu cột trái trang Gợi ý. Test chỉ dùng **file bịa cùng định dạng**. File thật chỉ chạy trên máy, không commit.

⚠️ Bấm **Lưu** ở màn hình xác nhận sẽ ghi trạng thái môn của tài khoản đang đăng nhập vào database chung. Nếu thử bằng tài khoản test thì bấm **Huỷ**, đừng bấm Lưu, trừ khi muốn đổi dữ liệu của tài khoản đó.

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| D1 | Tải **Excel** tiến độ của người duyệt | 41 môn đã đạt, "Tích lũy 111/128 TC", hai ô tự kiểm tra màu xanh | API | |
| D2 | Tải **PDF** (`Bảng điểm.pdf`) | Tag `PDF`, `DH_CQ_MT_KHM_2023`, 32 môn đã đạt, 89/128 TC, "myBK cập nhật 06/03/2026", ENG_GC_600 và SA4001 "chưa đạt"; chương trình CS-2023-KHMT; mục dữ liệu lệch liệt kê 11 môn web có mà PDF không có | API | |
| D3 | Chương trình được nhận | "File khớp chương trình bạn chọn: CS-2023-KHMT (98%)" (với tài khoản đã chọn KHMT 2023) | API | |
| D4 | Hồ sơ chọn KHMT 2024 rồi tải file khóa 2023 | Cảnh báo vàng "File là của sinh viên khóa 2023…" + link Sửa hồ sơ | Test backend | |
| D5 | Tải file lạ (ảnh, Excel khác, file hỏng) | Toast "Chỉ nhận file Excel…" hoặc "Không phải file tiến độ myBK…"; không mở màn hình lưu | API | |
| D6 | Màn hình xác nhận, mục 2 | Mỗi môn chưa đạt có nút Chưa học / Đang học / Rớt; bật "Chỉ hiện…" lọc còn môn đang học, rớt, hoặc web ghi khác myBK | Chưa | |
| D7 | Bấm Lưu, sang trang Gợi ý, giải | Cột "đang học" và lộ trình theo trạng thái vừa lưu | Chưa | |
| D8 | Lộ trình cơ sở + 3 what-if trên hồ sơ thật (T24) | Người duyệt xác nhận kết quả hợp lý | Chưa | |
| D9 | Mở "Dữ liệu chương trình của web lệch với myBK" | File người duyệt: chỉ `CCGDTC` (không có trong danh mục web); không lệch tín chỉ | API | |
| D10 | Kiểm tra lưu trữ | Backend không ghi file; kết quả đọc file không có MSSV, mã lớp, tên, điểm | Test | |

---

## E. Ca bộ giải chưa được xác nhận đáp án

Đã qua cả hai bộ giải nhưng người duyệt **chưa xác nhận đáp án** (mục 7 kế hoạch): **K6** (ngưỡng 85% khóa luận), **K8, K8b, K8c, K8d** (kỳ hè). Chạy: `cd pipeline` rồi `.venv/Scripts/python -m pytest planner/tests/test_cases_k.py -q`.
