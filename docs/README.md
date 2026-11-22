# Tài liệu BK Uni: tính năng "Gợi ý học phần"

Đọc file này trước. Cập nhật lần cuối: **22/11/2026**.

## Mục lục

| File | Trả lời câu hỏi | Khi nào sửa |
|---|---|---|
| [01-boi-canh.md](01-boi-canh.md) | Điều gì **đã kiểm chứng** (database, file myBK, QĐ 285, bộ giải, kết quả đo)? Mỗi dòng có cách kiểm tra lại | Có sự thật mới |
| [02-ke-hoach.md](02-ke-hoach.md) | Việc gì (T1–T26), giai đoạn nào, **đã duyệt chưa**, quyết định nào đã chốt | Xong việc, có quyết định mới, người duyệt ghi duyệt |
| [03-thiet-ke.md](03-thiet-ke.md) | Hệ thống **làm gì và làm thế nào**: tính năng, kiến trúc, file và hàm, API, nguồn dữ liệu, bên trong hai bộ giải | Đổi code hoặc hợp đồng API |
| [04-luat-qd285.md](04-luat-qd285.md) | Luật lập lộ trình rút từ QĐ 285, kèm điều và trang | Có văn bản mới hoặc trường trả lời |
| [05-kiem-thu.md](05-kiem-thu.md) | Chạy test nào, bấm kịch bản nào trên web, kết quả mong đợi | Thêm tính năng, chạy xong một kịch bản |
| [luu-tru/](luu-tru/README.md) | Tài liệu cũ (hướng trước 18/11, lý thuyết Clingo/CP-SAT, bàn giao 15/11) | Không sửa; xóa được khi nhóm đồng ý |

Script `pipeline/check_baseline.py` kiểm tự động phần lớn sự thật trong 01 và trạng thái trong 02. Ba nơi phải cập nhật cùng lúc khi xong một việc: **02** (duyệt, nhật ký), **01** (sự thật mới), **check_baseline.py** (phép kiểm tương ứng).

---

## Đang ở đâu (23/11, sáng sớm)

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0–2 | Kế hoạch, tài liệu, bộ giải theo QĐ 285 | **Đã duyệt** |
| 3 | Dữ liệu tiên quyết (bản chụp 96 chương trình) | Đã làm, **chờ duyệt**; bản chụp đã cũ (database thay 20/11) |
| 4 | API `POST /api/plans/solve` | Đã làm, **chờ duyệt**; lỗi T37 (không nhận môn tốt nghiệp trên database mới) |
| 5 | Trang Gợi ý | Đã làm, **chờ duyệt**; chưa bấm thử trên trình duyệt |
| 6 | What-if (mốc, so sánh, Về mốc) | Đã làm, **chờ duyệt**; chưa bấm thử trên trình duyệt |
| 7 | Script trích chương trình `build-vertical.cjs` (T18) | **Chặn**: chờ bạn cùng nhóm gửi script |
| 8 | File tiến độ myBK (PDF + Excel) | Đã làm, **chờ duyệt**; còn T24 |
| 9 | PDF là nguồn duy nhất (T27–T31) | T29 chờ bấm thử, T31 chưa |
| 10 | Sinh viên chốt trạng thái (T32–T36) | **T32, T35 xong 21/11** (chưa bấm hết trên web); T33 (chọn từng môn khi nhập lại), T36 còn |

| 11 | Sprint "Gợi ý theo ý sinh viên" (T38–T50), mở 22/11 | **T40, T42, T43 xong; T41, T45, T46, T47 gần xong** (code + test; người duyệt bấm web 22–23/11, đã sửa theo góp ý, phần sửa cuối chưa bấm lại). Còn T38, T39, T44, T48–T50 |

### Phiên 22–23/11 (đã commit và đẩy lên `origin/feature/goi-y-hoc-phan` theo yêu cầu người duyệt, 23/11)

- **Gộp `origin/main`** (9 commit của Thiên) vào nhánh; hoàn tất trong commit 23/11, kèm gộp 9 commit mới của nhánh trên remote (bộ phân loại tag, chọn thẻ sở thích ở tab clingo, thiết kế dữ liệu tổng hợp). Trang Môn học giữ bản nhánh này, thêm tab "Chương trình" là trang của Thiên. Ẩn trang Quy định tốt nghiệp, nút Phân tích, chọn bộ giải.
- **T37 xong:** nhận nhóm "Tốt nghiệp" / "Học phần tốt nghiệp" / "Tốt nghiệp bậc cử nhân" / "Điều kiện tốt nghiệp" (132/132 chương trình).
- Hiệu chỉnh: ghi chú riêng từng môn (`data.web.notes`), hỏi xác nhận cả khi thêm môn / đổi học kỳ; nhãn "Rớt" → "Đã học nhưng gãy" (đổi "Trượt môn" trước hội đồng).
- **Hỏi đáp Q1–Q20** với người duyệt, ghi ở [02 mục 11.7](02-ke-hoach.md#117-mười-sáu-quyết-định-ghi-vào-cột-bạn-chọn); sprint ở [02 giai đoạn 11](02-ke-hoach.md#giai-đoạn-11-sprint-gợi-ý-theo-ý-sinh-viên-t38t50-mở-2211). Nguyên tắc: quyền sinh viên lớn nhất, ghim tuyệt đối, không im lặng bỏ yêu cầu.
- Trang Gợi ý mới (T45): bảng các kỳ kéo thả/ghim, ⚙ từng kỳ, ô khối, ưu tiên tự sắp, thẻ "Yêu cầu của bạn"; tự lưu vào tài khoản (`/api/plans/settings`) và giải lại mỗi lần chỉnh.
- **T46 (22/11 tối, chưa bấm web):** Hiệu chỉnh có ô "Môn đang học kỳ này" mở ra được (mã, tên, TC, khối); mọi môn trong mọi khối có cột "Tính vào khối" (kể cả Bắt buộc), nhắc "có thể khác cách tính của myBK"; trang Gợi ý mở ra là giải lại từ database, nút Giải lại ở đầu cột trái, web hoàn toàn tôn trọng lựa chọn của sinh viên. Bộ giải trừ môn đang học (kể cả ngoài CTĐT) vào tự chọn tự do; trang Gợi ý hiện môn ngoài CTĐT. pytest 139 + 7 xfail + 1 xpass, jest 98 qua. **Lệch tài liệu:** 02 không có Q17–Q20 và mục "Giai đoạn 11" như dòng dưới ghi; cần ghi lại.
- Lần chạy cuối (22/11): pytest 134 qua + 7 xfail + 1 xpass; jest 97 qua; typecheck + lint hai phía qua; `check_baseline.py` không KHAC.
- **23/11 (chưa bấm web):** trang Gợi ý gọn lại: nút "không mở kỳ này" trên thẻ môn, ô số TC ở đầu mỗi kỳ, cảnh báo gắn vào môn/kỳ (tự xác nhận chuẩn tiếng Anh), bỏ hai khung ghim / không mở ở cột trái và nhãn so với mốc; sửa lỗi validator "FREE_…: chua tung mo ky he". Còn hẹn: gõ mã môn bất kỳ vào ô khối, thêm môn vào kỳ trên bảng.
- **Kết nối database (22/11 tối):** Supabase chế độ session (cổng 5432) chỉ 15 chỗ cho cả nhóm, hết chỗ thì `/plans/solve` lỗi 500 (`EMAXCONNSESSION`, frontend hiện "Hệ thống đang bận"). Máy này đổi `Backend/.env` sang **`DB_PORT=6543`** (chế độ transaction, file không commit, đồng đội không phải đổi); 20 request song song đều 200. Chạy migration thì tạm về 5432 (chưa kiểm TypeORM có cần khóa theo phiên không).
- **Tối 22/11 – sáng 23/11, người duyệt bấm web và góp ý** (đã sửa, xem nhật ký 22/11 và 23/11 trong 02):
  - Đổi khối cho **mọi môn** ở Hiệu chỉnh, chỉ nhắc "có thể khác cách tính của myBK"; mọi chỉnh sửa ghi database, bộ giải đọc lại từ database (test tích hợp jest).
  - Trang Gợi ý mở ra là giải lại; nút "Giải lại lộ trình" ở đầu cột trái.
  - "Môn không mở" thành nút trên thẻ môn; số TC muốn là ô ở đầu mỗi kỳ; cảnh báo gắn vào môn/kỳ, lời nhẹ nhàng, tự xác nhận chuẩn tiếng Anh.
  - Người duyệt thích kiểu: ít chữ, liền mạch, làm ngay trên bảng; không thích các thẻ "mốc".
- **Đang điều tra (chưa xong):** người duyệt hỏi vì sao CO1007 (Cấu trúc rời rạc, không ghim) bị xếp hè 263 mà không lên 262. Backend đang chạy với `PLANNER_DUMP_DIR` = thư mục tạm của phiên (ghi đầu vào bộ giải để xem; có điểm của người duyệt, không trong repo). Phiên sau: tắt biến này, xóa file dump.
- Chạy frontend trên máy này: `node_modules/.vite` bị EPERM khi đổi tên (nghi diệt virus) → `cd Frontend && npx vite --config node_modules/.bk-local/vite.dev.config.mjs` (bộ đệm ra thư mục tạm, không sửa `vite.config.ts`).

Ngày 20/11 (ngoài nhánh này): đồng đội `kqyuu22` thay bộ giải Clingo bằng engine ASP (`pipeline/engine/asp`, không sửa `core/*.lp`); Thiên thay toàn bộ CTĐT trên database bằng dữ liệu myBK (132 chương trình, trường cho phép). Xem [01 mục 6e](01-boi-canh.md#6e-database-mới-và-luồng-pdf--database-2111).

### Phiên 21/11 đã làm (commit `4a663b5`, đã đẩy lên `origin/feature/goi-y-hoc-phan`)

Trang Môn học (sinh viên) chỉ còn thẻ tiến độ myBK; luồng chi tiết ở [03 mục 4b](03-thiet-ke.md#4b-luồng-tải-pdf-tiến-độ--database-f9-giai-đoạn-910-cập-nhật-2111):
- Nút **"Nhập tiến độ từ myBK"**, 2 cách: tải PDF (phải "Lưu dưới dạng PDF"; file "Microsoft Print to PDF" không có chữ) hoặc **dán nội dung trang** (Ctrl+A, Ctrl+C; "đạt" suy từ điểm 4–10/12/21).
- Hộp xác nhận: chương trình tìm theo **mã CTĐT myBK = `curricula.source_code`** (người dùng chỉ thấy mã myBK), mâu thuẫn, GDTC, môn sẽ đổi hoặc bị xóa. **Mỗi lần nhập, trạng thái trên web theo đúng file mới** (môn file không có → xóa = Chưa học).
- Nút **Hiệu chỉnh**: sửa trạng thái mọi môn (hỏi xác nhận từng lần), thêm/xóa môn ngoài chương trình, **khai học kỳ hiện tại** (bộ giải xếp từ kỳ sau). Không hiện điểm.
- Bộ giải không xếp GDTC (PE1003, PE1005). Sidebar thu gọn được.
- Tài khoản thử: tài khoản thử A = dữ liệu người duyệt; tài khoản thử B = dữ liệu sinh viên B (đã nhập lại 21/11, khớp file); **`khmt.demo` không giữ dữ liệu thật**.

Lần chạy cuối (21/11): pytest planner 122 qua + 7 xfail + 1 xpass; jest planner + mybk-review 26 qua; typecheck + lint hai phía qua; `check_baseline.py` KHAC 1 (T37, cố ý báo).

## Người duyệt cần làm (phiên sau bắt đầu từ đây)

00. (23/11) Bấm lại trang Môn học → Hiệu chỉnh (cột "Tính vào khối", ô môn đang học) và trang Gợi ý (nút không mở, ô TC đầu kỳ, nhãn "Lưu ý", "Mình đạt rồi"). Việc kế tiếp đã hẹn: (a) vì sao CO1007 bị xếp hè 263; (b) gõ mã môn bất kỳ (kể cả ngoài CTĐT) vào ô khối / ô tự chọn tự do; (c) thêm môn vào kỳ ngay trên bảng; (d) ghi lại Q17–Q20 và T38–T50 vào 02 (file đang thiếu, xem dòng "Lệch tài liệu" ở trên).
0. (21/11) Bấm kịch bản **F** (F1–F25) trong [05-kiem-thu.md](05-kiem-thu.md#f-tải-pdf-tiến-độ-ở-trang-môn-học-giai-đoạn-910-t32-code-2111) bằng tài khoản thử A hoặc tien. Chốt: **T37** (bộ giải không nhận môn tốt nghiệp trên database mới) sửa ngay hay sau khi gộp `main`; có **commit** phần 21/11 không; **chuyển nhóm** ở Hiệu chỉnh có làm không. Việc kế tiếp đã hẹn: gộp `origin/main` (2 xung đột: `data-source.ts`, `courses/index.tsx`; bỏ phần khai `source_*` trong `curriculum.entity.ts`), rồi xem dữ liệu kéo theo vấn đề gì.
1. Chạy web (lệnh ở dưới), đăng nhập tài khoản test, **bấm các kịch bản A, B, D** trong [05-kiem-thu.md](05-kiem-thu.md), ghi kết quả vào cột cuối. Ca nào sai: gửi số ca kèm ảnh chụp.
2. Ghi "Đồng ý" hoặc "Không" cho giai đoạn 3, 4, 5, 6, 8 ở [02-ke-hoach.md mục 10](02-ke-hoach.md#10-duyệt).
3. Xác nhận đáp án các ca **K6, K8, K8b, K8c, K8d** ([02-ke-hoach.md mục 7](02-ke-hoach.md#7-ca-kiểm-tra-có-đáp-án-xếp-tay)).
4. Xem các chỗ **dữ liệu chương trình KHMT 2023 của web lệch myBK** ([01-boi-canh.md mục 6c](01-boi-canh.md#6c-giai-đoạn-6-và-8-1911)): CO3129–CO3139, CO3151, CO3153 không có trên myBK; `ENG_GC` so với `ENG_GC_600`; PE1003/PE1005 so với `CCGDTC`.
5. T24: tải file myBK của mình trên trang Gợi ý, chọn môn đang học kỳ 261, bấm Lưu (ghi vào database chung), rồi chạy lộ trình và 3 what-if.

## Việc còn treo

| Việc | Chờ ai |
|---|---|
| T18 script `build-vertical.cjs` | Bạn cùng nhóm |
| Bản xuất quan hệ môn theo mã chương trình; mã myBK có xác định duy nhất phiên bản không; định nghĩa "học trước"; cấp 4 từ năm 3 hay 4 | Phó Khoa (dự kiến 21/11) |
| Kỳ cuối dưới mức tối thiểu; giới hạn tín chỉ kỳ hè | Phòng đào tạo |
| Tự điền "Chuẩn tiếng Anh" từ điều kiện tốt nghiệp trong PDF | Chưa lên lịch |

## Git (cập nhật 23/11)

- 23/11: commit toàn bộ việc 22–23/11 (trừ file nhạy cảm ở cuối trang, PDF quy định và báo cáo, thư mục cache/công cụ cục bộ), gộp 9 commit mới của remote, đẩy lên `origin/feature/goi-y-hoc-phan`. Commit không có dòng đồng tác giả (người duyệt yêu cầu).

### Ghi chú cũ (21/11)

- Nhánh `feature/goi-y-hoc-phan`, đã kéo tới `bd98658` (2 commit engine ASP của `kqyuu22`). Việc ngày 21/11 đã commit `4a663b5` và đẩy lên remote (người dùng yêu cầu). Chỉ commit khi được yêu cầu.
- **Chưa gộp `origin/main`** (khoảng 60 file của Thiên: dữ liệu CTĐT, trang Môn học viết lại). Thử gộp ngày 21/11 có 2 xung đột (`Backend/src/database/data-source.ts`, `Frontend/src/pages/courses/index.tsx`), đã hủy. Người duyệt chọn: xong luồng PDF rồi gộp một lần. Khi gộp, bỏ phần khai `source_*`, `total_credits` trong `curriculum.entity.ts` của nhánh này (entity bên `main` đã có).
- Hai migration cùng mốc `1795600000000` (nhánh này và `main`), cả hai đã chạy trên Supabase.

## Chạy

```
npm --prefix Backend run dev       # http://localhost:3210  (nối Supabase dùng chung, chỉ đọc trừ khi bấm Lưu)
npm --prefix Frontend run dev      # http://localhost:5173/recommendations
cd pipeline && .venv/Scripts/python check_baseline.py
```

Tài khoản test sinh viên: `khmt.demo@bkuni.local` (KHMT 2023, 40 môn đạt, 5 đang học). Mật khẩu ở `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md` mục 11.

## File nhạy cảm (không commit, không chép vào code hay test)

- `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md`: mật khẩu, khóa API.
- `Mon_hoc_CTDT_*.xlsx`, `Bảng điểm.pdf` ở thư mục gốc: file tiến độ thật của người duyệt (có họ tên, MSSV, điểm).
- `ctdt-ben-tien-do-mon-tra-ve-cua-tao.json` (JSON API myBK của người duyệt, có điểm) và `function.js` (mã trang myBK của Phòng Đào tạo, có tên và email người viết) ở thư mục gốc (chuyển từ `docs/` ngày 21/11).
