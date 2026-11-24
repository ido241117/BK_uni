# 05 · Kiểm thử: lệnh test và kịch bản đầu cuối

Ngày lập: 19/11/2026, cập nhật 24/11. Đi kèm [kế hoạch](02-ke-hoach.md), [thiết kế](03-thiet-ke.md) và [tổng kết](06-tong-ket.md).

> **Đọc nhanh (24/11):** kịch bản đang dùng là **F** (trang Môn học) và **G** (trang Gợi ý, giai đoạn 12). Mục A, B, D viết cho giao diện trang Gợi ý **trước** giai đoạn 11–12 (nút "Giải lộ trình", chọn bộ giải, nút tải myBK ở trang Gợi ý, thẻ mốc): giữ để tra; phần còn giá trị đã chuyển vào G.

## Lệnh test tự động

| Lệnh | Kiểm gì | Kết quả 19/11 |
|---|---|---|
| `cd pipeline` → `.venv/Scripts/python -m pytest planner -q` | Bộ giải (ca K1–K8d, hai bộ giải đối chiếu, KHMT 2023 thật), cli, đọc file myBK (chỉ file bịa) | 101 qua |
| `cd Backend` → `npx jest test/planner.spec.ts` | Ghép đầu vào từ database (pg-mem), API, không lộ dữ liệu cá nhân, đối chiếu file myBK, gọi Python thật | 11 qua (21/11: 14 qua) |
| `cd Backend` → `npx jest test/mybk-review.spec.ts` | (21/11) Xem trước PDF: chương trình theo `source_code`, mâu thuẫn, `CCGDTC` ↔ PE1003/PE1005, khóa không có CCGDTC, trạng thái sẽ đổi (dữ liệu bịa) | 9 qua (21/11) |
| `cd pipeline` → `.venv/Scripts/python -m pytest planner/tests/test_mybk.py -q` | (21/11) Đọc PDF, chữ dán (suy đạt từ điểm 12/21), chữ mất Tab, PDF không có chữ (dữ liệu bịa) | 15 qua (21/11); cả `planner`: 122 qua + 7 xfail + 1 xpass |
| `cd Frontend` → `npx tsc -b` và `npx eslint src/pages/recommendations` | Kiểu và lint trang Gợi ý | Qua |
| `cd pipeline` → `.venv/Scripts/python -m pytest planner/tests -q` | (23/11, giai đoạn 12) Thêm `test_whatif12.py`: ưu tiên S2/S8, giả định rớt, "kỳ này có mở", cảnh báo nghỉ 2 kỳ / ô TC vượt luật, cách gỡ, lý do không đạt TC, `course_facts`, ô tự chọn tự do | 165 qua + 7 xfail + 1 xpass (23/11) |
| `cd Backend` → `npx jest` | (23/11) Cả backend; `planner.spec.ts` thêm 2 ca: trường what-if mới tới bộ giải, tra mã môn ô tự do (mã sai → 400) | 104 qua, 9 bỏ qua (23/11) |
| Logic trang Gợi ý (không có bộ chạy test frontend) | (23/11) Kỳ được / không được khi chọn môn, payload ưu tiên, cách gỡ, chỉ số so sánh, giữ 10 bản: script tạm chạy qua esbuild, không nằm trong repo | 28/28 đúng (23/11) |
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
3. Đăng nhập tài khoản thử (mục G: tài khoản thử A; mục A–D cũ: `khmt.demo@bkuni.local`, dữ liệu mẫu ngày 19/11).
4. Vào trang Gợi ý (`/recommendations`). Mở DevTools, tab Network, để xem request và response.

Quy ước: mỗi kịch bản bắt đầu từ **trang vừa tải lại** (F5), trừ khi ghi khác.

---

## A. Đường chính (giai đoạn 4–5; giao diện cũ, xem G)

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

> **23/11: thay bằng mục G (giai đoạn 12).** Mốc không còn nằm trong trình duyệt: mốc là bản lưu gắn sao trong tài khoản; thẻ "So với lộ trình mốc" đã bỏ, so sánh ở tab So sánh. Các dòng dưới chỉ để tra lịch sử.

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

## D. File tiến độ myBK (giai đoạn 8; giao diện cũ, luồng hiện hành ở F)

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

## F. Tải PDF tiến độ ở trang Môn học (giai đoạn 9–10, T32: code 21/11)

Nút "Tải PDF tiến độ myBK" ở đầu trang Môn học (`/courses`). Luồng: [03 mục 4b](03-thiet-ke.md#4b-luồng-tải-pdf-tiến-độ--database-f9-giai-đoạn-910-cập-nhật-2111).

⚠️ Bấm **Xác nhận và lưu** sẽ ghi database chung cho tài khoản đang đăng nhập: nội dung file, trạng thái môn, và chương trình trong hồ sơ nếu tích ô. Thử bằng tài khoản thử của người duyệt **tài khoản thử A**. **Không tải file thật vào `khmt.demo`**, kể cả chỉ để xem (người duyệt cấm 21/11; dòng ghi nhầm hôm 20/11 đã xóa).

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| F1 | Chọn `Bảng điểm.pdf` | Hộp "Kiểm tra file tiến độ trước khi lưu" mở; **chưa ghi gì** (thẻ tiến độ, bảng môn không đổi) | API (`review` 21/11, không ghi) | |
| F2 | Xem mục Chương trình | "Mã CTĐT (myBK)": `DH_CQ_MT_KHM_2023`; "Chương trình trên web": tên ngành (khóa 2023, 128 TC, 96 môn; phiên bản DH_CQ_MT_NG_KHM_2023.v01). **Không** thấy chữ `CS-2023-KHMT` ở đâu trong hộp | Chưa (đổi 21/11) | |
| F3 | Tài khoản chưa có chương trình (tài khoản thử A, ảnh chụp 21/11) | Trang Môn học: "Chưa có chương trình đào tạo" kèm nút tải PDF (không còn "Điền hồ sơ"). Hộp: cảnh báo "Tài khoản chưa có chương trình đào tạo. Bấm Xác nhận sẽ đặt chương trình DH_CQ_MT_KHM_2023."; **không có ô tích** | Chưa | |
| F4 | Xem mâu thuẫn | Vàng: 8 môn CO3129–CO3153 "thuộc chương trình trên web nhưng file không liệt kê". Xanh dương: `CCGDTC` không có trong danh mục | API | |
| F5 | Xem tương ứng GDTC | Một dòng "Giáo dục thể chất: Đạt" (21/11, người duyệt bỏ phần còn lại); PE1003, PE1005 hiện trong bảng "Trạng thái môn sẽ đổi"; CCGDTC không bị báo là mã lạ. Sau khi lưu, PE1003, PE1005 của tài khoản là Đã hoàn thành | Test (đổi 21/11) | |
| F5b | (khi có file khóa 2024/2026) File không có `CCGDTC` | Vàng "Chưa hoàn thành GDTC … Lộ trình không xếp GDTC"; không báo PE1003/PE1005 thiếu; môn thể thao 0 TC không vào tự chọn tự do | Test (`mybk-review.spec.ts`) | |
| F5c | Trang Gợi ý, giải lộ trình | Không kỳ nào có PE1003, PE1005 | Test (`planner.spec.ts`) | |
| F4b | File có môn ngoài chương trình (vd IM3047 ở PDF mới) | Khung xanh dương "Môn ngoài chương trình, tính vào tự chọn tự do" kèm mã, không còn khung vàng | Test (đổi 21/11) | |
| F6 | Mở "Toàn bộ thông tin đọc được từ file" | Họ tên, MSSV, lớp, khoa, ngành, năm áp dụng, 89/128, GPA hệ 10 / hệ 4, ngày cập nhật 06/03/2026; 17 khối; mỗi môn có Điểm số, Điểm chữ, Tín chỉ, Đạt, Ghi chú | API (chỉ kiểm có trường) | |
| F7 | Bấm **Hủy** | Không có gì thay đổi | Chưa | |
| F8 | Chọn lại file, bấm **Xác nhận và lưu** | Toast "Đã lưu tiến độ … cập nhật trạng thái N môn. Tài khoản theo chương trình DH_CQ_MT_KHM_2023."; thẻ tiến độ hiện đủ trường như F6; thông báo "Chưa có chương trình đào tạo" biến mất | Chưa | |
| F13 | Cuộn trang Môn học (sinh viên) xuống dưới thẻ tiến độ | Không còn hàng thẻ "Môn đã khai / Môn đã hoàn thành / Tín chỉ", không còn bảng môn 5675 dòng. Đăng nhập quản trị: trang Môn học vẫn có ô tìm và bảng danh mục | Chưa | |
| F14 | Bấm "Nhập tiến độ từ myBK" | Hộp có 2 tab "Tải file PDF" (hướng dẫn, dòng đỏ "Không chọn Microsoft Print to PDF") và "Dán nội dung trang" (ô chữ, nút "Đọc nội dung" khóa khi ô trống) | Chưa | |
| F15 | Tab dán: dán cả trang Tiến độ (Edge/Chrome máy tính), bấm Đọc nội dung | Hộp xác nhận như F2–F6; số môn đạt và TC khớp trang myBK | API 21/11 (tài khoản thử B: 116/128, 45 Đã hoàn thành) | |
| F16 | Tải PDF in bằng "Microsoft Print to PDF" | Toast "File PDF không có chữ để đọc (file được in bằng Microsoft Print to PDF)…" | Test (`test_mybk.py`) + file thật của sinh viên B tại máy | |
| F17 | Thẻ tiến độ | Thanh trên: "Học kỳ hiện tại: HK 261 (kỳ 1 2026-2027)" + "tự tính theo ngày", "Đang học: N môn, X TC", nút Hiệu chỉnh. Bảng không có cột điểm; có cột "Đạt (file)" và "Trên web" | Chưa | |
| F18 | Hiệu chỉnh → đổi một môn "--" sang Đang học, chọn học kỳ, Lưu | Toast "Đã lưu hiệu chỉnh: 1 môn…"; dòng đó có "Đang học" + "Khác file"; số Đang học tăng | API 21/11 (tài khoản thử B, đã trả lại) | |
| F19 | Hiệu chỉnh → ô "+ Môn đang học", gõ mã ngoài chương trình, Lưu | Môn hiện ở khối "Môn trên web ngoài file", trạng thái Đang học | Chưa | |
| F18b | Xem nhãn ở dòng đã đổi | Nhãn vàng ghi "Khác file tiến độ" | Chưa | |
| F19b | Ô "+ Môn đang học", gõ mã đã có trong bảng (vd CO3021) | Kết quả ghi "· đã có trong bảng"; chọn → toast "… chuyển sang Đang học", dòng đó trong bảng thành Đang học + "Khác file tiến độ"; không có dòng trùng (lỗi 21/11: trước đó hiện "Không có môn khớp") | Chưa | |
| F20 | Sau F18, trang Gợi ý → Giải lộ trình | Lộ trình bắt đầu từ kỳ sau kỳ đã khai; môn Đang học không bị xếp lại; mục giả định "Môn đang học …: giả định đậu" | API 21/11 (kỳ 261 → bắt đầu 262) | |
| F21 | Nhập lại file sau khi đã khai học kỳ | Học kỳ đã khai vẫn còn (không về "tự tính") | API 21/11 (tài khoản thử B) | |
| F22 | Có môn ngoài file (vd thêm tay), nhập lại file | Hộp xác nhận ghi môn đó "Chưa học (file không có)"; lưu xong môn đó biến mất, mọi trạng thái khớp file | API 21/11 (sinh viên B: IM3047 bị xóa, CO3029 về Chưa học, 116 TC) | |
| F23 | Hiệu chỉnh → đổi trạng thái một môn | Hộp "Đổi … sang …?" OK/Hủy; Hủy thì không đổi | Chưa | |
| F24 | Hiệu chỉnh → nút Xóa ở khối "Môn ngoài chương trình đào tạo" → OK → Lưu | Môn biến mất; toast "… xóa 1 môn" | Chưa | |
| F25 | Khối "Chứng chỉ Giáo dục Thể chất" | Dòng "Giáo dục thể chất", không có mã; không có PE1003/PE1005 riêng | Chưa | |
| F12 | Bấm "Thu gọn" ở cuối sidebar, rồi tải lại trang (F5) | Sidebar còn cột icon, rê chuột vào icon hiện tên mục; sau F5 vẫn thu gọn; bấm lại thì mở rộng | Chưa | |
| F9 | Tải lại cùng file lần hai | Không còn cảnh báo hồ sơ; mục "Trạng thái môn sẽ đổi khi xác nhận (0)" | Chưa | |
| F10 | Tải file không phải PDF tiến độ | Toast lỗi "Chỉ nhận file PDF…" hoặc "Không phải file PDF tiến độ myBK…"; không mở hộp | Test (luồng cũ) | |
| F11 | (giả lập) File có mã CTĐT không có trên web | Đỏ "Không có chương trình nào trên web mang mã myBK …"; nút Xác nhận bị khóa | Test (`mybk-review.spec.ts`) | |

---

## E. Ca bộ giải chưa được xác nhận đáp án

Đã qua cả hai bộ giải nhưng người duyệt **chưa xác nhận đáp án** (mục 7 kế hoạch): **K6** (ngưỡng 85% khóa luận), **K8, K8b, K8c, K8d** (kỳ hè). Chạy: `cd pipeline` rồi `.venv/Scripts/python -m pytest planner/tests/test_cases_k.py -q`.

---

## G. What-if theo đặc tả mục 12 (giai đoạn 12, code 23/11)

Đặc tả: [02 mục 12](02-ke-hoach.md); chức năng M1–M18 ở 02 mục 12.12. Giao diện là Ant Design hiện tại (chưa áp thiết kế mới). Chuẩn bị như mục 0; dùng tài khoản thử (tài khoản thử A: dữ liệu thật của người duyệt; hoặc khmt.demo: dữ liệu mẫu). Trước mỗi nhóm, bấm **Làm lại** nếu cần: mở bản "Mốc cũ" hoặc xóa lịch sử.

Cột "Trạng thái" lúc lập (23/11): **Test** = có test tự động; **Chưa** = chưa bấm trên web.

### G1. Giải bằng nút, chưa kiểm, hoàn tác (M1, M2, M17)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G1.1 | Mở trang lần đầu (chưa lưu gì) | **Không tự giải.** Thẻ "Chưa có lộ trình"; Network không có `POST /plans/solve` | Chưa | |
| G1.2 | Bấm **Giải** | Có `POST /plans/solve`; hiện dải chỉ số, bảng kỳ | Chưa | |
| G1.3 | Tick "Nghỉ" một kỳ chính, đổi ô "Muốn" một kỳ | Không gọi bộ giải; dòng "Đã sửa 2 chỗ, chưa kiểm…"; dải chỉ số mờ | Chưa | |
| G1.4 | Bấm **Hoàn tác** 2 lần | Kịch bản về như trước; dòng "đã sửa" biến mất | Chưa | |
| G1.5 | Sửa 1 chỗ, F5 (hoặc đăng xuất rồi vào lại) | Kịch bản, lộ trình đang xem, "đã sửa 1 chỗ" vẫn còn; không tự giải | Chưa | |

### G2. Ưu tiên (M4)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G2.1 | Xem thẻ Ưu tiên | Đúng 3 mục: Ra trường sớm nhất, Mỗi kỳ chính 15–18 TC, Không học dư môn tự chọn; 2 dòng mờ "bàn sau" | Chưa | |
| G2.2 | Đưa "15–18 TC" lên đầu, Giải | Payload `preferences.order` bắt đầu bằng `S8, S1`; các kỳ chính (trừ kỳ cuối) gần 15–18 hơn; có thể ra trường muộn hơn | Test (`test_user_can_put_s8_before_s1`) | |
| G2.3 | Tắt "Không học dư", Giải | Payload `preferences.disabled = ["S2"]` | Test | |

### G3. Từng kỳ (M5) và cảnh báo quy định (M12)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G3.1 | Tick "Nghỉ" 2 kỳ chính liền nhau, Giải | Cảnh báo "Lưu ý" ở kỳ đầu: cần đơn xin phép Phòng Đào tạo, ghi QĐ 285 Điều 32.1 | Test | |
| G3.2 | Ô "Muốn" một kỳ chính = 27, Giải | Cảnh báo vượt 25 TC, vẫn xếp theo ô | Test | |
| G3.3 | Ô "Muốn" cao hơn số môn đủ điều kiện, Giải | Thẻ "Yêu cầu của bạn": dòng Số TC muốn nêu lý do thật (lựa chọn nào chặn, hoặc luật nào), không còn câu đoán "không còn môn đủ điều kiện để thêm" | Test (`test_target_reason_names_the_blocking_choice`) | |
| G3.4 | Bỏ tick "Học hè" ở kỳ hè | Cột kỳ đó thu hẹp, ghi "Không học hè" | Chưa | |

### G4. Chọn môn, chuyển môn (M6, M9, M13)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G4.1 | Rê chuột vào một môn | Hiện TC, loại môn (và khối), ghim / đã chuyển / giả định rớt / không mở nếu có | Chưa | |
| G4.2 | Bấm một môn có tiên quyết | Kỳ chuyển vào được viền màu + nút "Chuyển vào đây"; kỳ không được mờ, có lý do ("Cần xong X trước", "Phải học trước Y", "Bạn nghỉ kỳ này", "Đồ án không học hè"…). Không gọi bộ giải | Chưa (logic: 28 kiểm) | |
| G4.3 | Bấm "Chuyển vào đây" | Môn sang kỳ mới, nhãn "đã chuyển, chưa giải"; dòng "đã sửa" tăng 1 | Chưa | |
| G4.4 | Bấm Giải | Môn nằm đúng kỳ mới (ghim tuyệt đối); phần còn lại xếp lại | Chưa | |
| G4.5 | Chuyển một môn sang kỳ trước môn tiên quyết của nó bằng kéo thả, Giải | Vẫn giữ chỗ ghim; thẻ Yêu cầu ghi "Giữ, nhưng trái luật" kèm luật | Test (sprint 11) | |

### G5. Thao tác trên môn (M7, M8)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G5.1 | Chọn môn → "Ghim vào kỳ này" → Giải | Môn giữ kỳ; viền trái màu | Chưa | |
| G5.2 | Chọn môn → "Kỳ này không mở" → xác nhận → Giải | Chip "X không mở" ở kỳ; môn sang kỳ khác | Chưa | |
| G5.3 | Chọn môn bắt buộc đầu chuỗi tiên quyết → "Giả định rớt kỳ này" → Giải | Ở kỳ đó: dòng gạch ngang "Rớt (giả định)" vẫn tính TC; môn học lại ở kỳ sau; môn cần nó lùi theo; dải chỉ số báo ra trường trễ (nếu có) | Test (`test_assumed_fail_counts_credits_and_retakes_later`) | |
| G5.4 | Bấm nút hoàn tác nhỏ trên dòng "Rớt (giả định)" → Giải | Về như trước G5.3 | Chưa | |
| G5.5 | Chọn môn tự chọn bộ giải đã điền tên → "Đổi môn khác cùng khối" → chọn môn khác → Giải | Môn mới ở đúng kỳ đó; môn cũ không còn | Chưa | |
| G5.6 | Đổi sang môn có tiên quyết chưa học | Ô xổ xuống làm mờ môn đó, ghi "(cần … trước)" | Chưa | |
| G5.7 | Ô tự chọn tự do: gõ mã một môn ngoài chương trình (vd môn khoa khác) → Chọn → Giải | Môn đó vào đúng kỳ, ô tự do không còn trống; thẻ ghi "Ô tự do: bạn chọn" | Test (`test_free_choice_outside_curriculum_fills_the_free_slot`, jest T62) | |
| G5.8 | Gõ mã không tồn tại → Giải | Báo lỗi "Không tìm thấy môn: …" (400), lộ trình cũ giữ nguyên | Test (jest) | |
| G5.9 | Chọn môn ở ô tự do → "Bỏ môn này khỏi ô tự do" → Giải | Ô tự do trống lại | Chưa | |

### G6. Không giải được, cách gỡ (M10, M11) và "Kỳ này có mở" (M12)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G6.1 | Nghỉ gần hết các kỳ chính, đặt "Học xong trước" kỳ cuối, Giải | "Không có lộ trình…" kèm lý do; nếu bỏ một lựa chọn là đủ thì có nút "Cách gỡ" | Test (`test_unsat_returns_fixes_that_can_be_applied`) | |
| G6.2 | Bấm một nút cách gỡ (vd "Không nghỉ kỳ X") | Kịch bản đổi đúng chỗ đó và tự giải lại; có lộ trình | Chưa | |
| G6.3 | Có cảnh báo "chưa từng mở kỳ hè/kỳ 1/kỳ 2" ở một môn → bấm "Lưu ý" → "Kỳ này có mở" → Giải | Cảnh báo đó biến mất | Test (`test_offering_history_warning_and_offered_removes_it`) | |

### G7. Lưu, lịch sử, so sánh (M14–M16, M18)

| # | Thao tác | Kết quả mong đợi | Trạng thái | Kết quả thật |
|---|---|---|---|---|
| G7.1 | Giải, đặt tên "A", bấm **Lưu bản này** | Lịch sử (1/10) có "A", giờ lưu, kỳ ra trường | Chưa | |
| G7.2 | Sửa 1 chỗ (chưa giải), lưu "B" | "B" có nhãn "chưa kiểm" | Chưa | |
| G7.3 | Gắn sao "A" | Nhãn "Mốc"; lần Giải sau payload có `previous_plan` | Chưa | |
| G7.4 | Lưu thêm tới 11 bản | Còn 10; bản cũ nhất **không gắn sao** bị bỏ | Chưa (logic: kiểm) | |
| G7.5 | Bấm "Mở" ở "A" | Kịch bản và lộ trình của A hiện lại, không gọi bộ giải | Chưa | |
| G7.6 | Tab **So sánh**: "A" so với "Kế hoạch giảng dạy" | Bảng chỉ số (ra trường, kỳ ngoài 15–18, kỳ nặng nhất, học hè, môn bắt buộc trễ, cảnh báo; chữ xanh ở bản tốt hơn); bảng giả định khác nhau (dòng khác tô màu); môn đổi kỳ kèm tên. Ghi rõ số môn có kỳ khuyến nghị | Chưa | |
| G7.7 | "So với đang xem" ở một bản | Tab So sánh mở sẵn bản đó với "Đang xem" | Chưa | |
| G7.8 | Bấm "Thu gọn" khối Kịch bản, rồi "Mở Kịch bản" | Lộ trình giãn ra toàn bề ngang; mở lại như cũ | Chưa | |
| G7.9 | Tài khoản có mốc cũ (trước 23/11) mở trang | Lịch sử có "Mốc cũ" gắn sao | Chưa | |

### G8. Bảng đối chiếu M1–M18 (điền khi bấm xong)

| M | Chức năng | Kịch bản | Đạt? |
|---|---|---|---|
| M1 | Giải bằng nút, "đã sửa N chỗ" | G1.1–G1.3 | |
| M2 | Hoàn tác | G1.4 | |
| M3 | Đậu/Rớt môn đang học | A (cũ) | |
| M4 | Ưu tiên 3 mục | G2 | |
| M5 | Nghỉ, học hè, ô muốn TC; kỳ tắt thu hẹp | G3.4, G1.3 | |
| M6 | Chọn môn → kỳ được / không + lý do | G4.2, G4.3 | |
| M7 | Ghim, không mở, giả định rớt | G5.1–G5.4 | |
| M8 | Đổi môn cùng khối; ô tự do gõ mã | G5.5–G5.9 | |
| M9 | Rê chuột xem chi tiết | G4.1 | |
| M10 | Trạng thái chung | G1, G6.1 | |
| M11 | Cách gỡ bấm là áp dụng | G6.2 | |
| M12 | Cảnh báo theo kỳ; "Kỳ này có mở" | G3.1, G3.2, G6.3 | |
| M13 | Môn chờ xếp | G5.3 trước khi Giải, G5.5 | |
| M14 | Dải chỉ số + nhãn thay đổi | G4.4, G5.3 | |
| M15 | Lưu, lịch sử, mốc, mở, xóa | G7.1–G7.5 | |
| M16 | So sánh | G7.6, G7.7 | |
| M17 | Giữ trạng thái khi đăng xuất | G1.5 | |
| M18 | Thu gọn khối Kịch bản | G7.8 | |
