# Tài liệu BK Uni: tính năng "Gợi ý học phần"

Đọc file này trước. Cập nhật lần cuối: **24/11/2026**.

## Mục lục

| File | Trả lời câu hỏi | Khi nào sửa |
|---|---|---|
| [01-boi-canh.md](01-boi-canh.md) | Điều gì **đã kiểm chứng** (database, file myBK, QĐ 285, bộ giải, kết quả đo)? Mỗi dòng có cách kiểm tra lại | Có sự thật mới |
| [02-ke-hoach.md](02-ke-hoach.md) | Việc gì (T1–T66), giai đoạn nào, **đã duyệt chưa**, quyết định nào đã chốt | Xong việc, có quyết định mới, người duyệt ghi duyệt |
| [03-thiet-ke.md](03-thiet-ke.md) | Hệ thống **làm gì và làm thế nào**: kiến trúc, file và hàm, hợp đồng API, nguồn dữ liệu, bên trong hai bộ giải | Đổi code hoặc hợp đồng API |
| [04-luat-qd285.md](04-luat-qd285.md) | Luật lập lộ trình rút từ QĐ 285, kèm điều và trang | Có văn bản mới hoặc trường trả lời |
| [05-kiem-thu.md](05-kiem-thu.md) | Chạy test nào, bấm kịch bản nào trên web, kết quả mong đợi | Thêm tính năng, chạy xong một kịch bản |
| [06-tong-ket.md](06-tong-ket.md) | Tổng kết hai trang **Môn học** và **Gợi ý học phần**: chức năng, luồng UX, backend, database (đọc đầu tiên nếu mới vào dự án) | Đổi chức năng hoặc luồng của hai trang |
| [luu-tru/](luu-tru/README.md) | Tài liệu và nhật ký cũ | Không sửa |

Script `pipeline/check_baseline.py` kiểm tự động phần lớn sự thật trong 01 và trạng thái trong 02. Xong một việc thì cập nhật cùng lúc: **02** (duyệt, nhật ký), **01** (sự thật mới), **check_baseline.py** (phép kiểm); đổi code thì **03**, đổi chức năng hai trang thì **06**.

---

## Đang ở đâu (24/11)

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0–2 | Kế hoạch, tài liệu, bộ giải theo QĐ 285 | **Đã duyệt** |
| 3 | Dữ liệu tiên quyết (bản chụp 96 chương trình) | Đã làm, chờ duyệt; bản chụp đã cũ (database thay 20/11) |
| 4 | API `POST /api/plans/solve` | Đã làm, chờ duyệt (T37 xong 22/11) |
| 5–6 | Trang Gợi ý, what-if (mốc) | Đã làm, chờ duyệt; **giao diện đã thay bởi giai đoạn 11–12** |
| 7 | Script trích chương trình `build-vertical.cjs` (T18) | **Chặn**: chờ bạn cùng nhóm |
| 8 | File tiến độ myBK (PDF + Excel) | Đã làm, chờ duyệt; còn T24 |
| 9 | PDF là nguồn duy nhất (T27–T31) | T29 chờ bấm thử, T31 chưa |
| 10 | Sinh viên chốt trạng thái (T32–T36) | T32, T35 xong 21/11; T33, T36 còn; T34 một phần |
| 11 | Gợi ý theo ý sinh viên (T38–T50) | T40, T42, T43 xong; T41, T45, T46, T47 gần xong. **Nội dung T38–T50 và Q17–Q20 chưa được ghi đủ vào 02** |
| 12 | What-if theo đặc tả 02 mục 12 (T51–T66) | **T51–T65 code xong 23/11**, test tự động qua (pytest 165 + 7 xfail + 1 xpass, jest 104, typecheck + lint, logic trang 28/28). **Chưa bấm thử web (T66)**. Giao diện: màu, font của web, bố cục theo mẫu `mau-what-if` |

## Người duyệt cần làm (phiên sau bắt đầu từ đây)

1. **Bấm thử giai đoạn 12** theo [05 mục G](05-kiem-thu.md#g-what-if-theo-đặc-tả-mục-12-giai-đoạn-12-code-2311) bằng tài khoản thử A; điền bảng M1–M18.
2. **Chốt W12** (thứ tự ưu tiên mặc định, 02 mục 12.10).
3. Ghi "Đồng ý" / "Không" cho các giai đoạn ở [02 mục 10](02-ke-hoach.md#10-duyệt).
4. Xác nhận đáp án các ca K6, K8, K8b, K8c, K8d ([02 mục 7](02-ke-hoach.md#7-ca-kiểm-tra-có-đáp-án-xếp-tay)).
5. **Q2:** trao đổi với Thiên: tab "Chương trình" của trang Môn học vẫn ghi `student_courses`.
6. Xem chỗ dữ liệu KHMT 2023 của web lệch myBK ([01 mục 6c, 6e](01-boi-canh.md#6e-database-mới-và-luồng-pdf--database-2111)).

## Việc còn treo

| Việc | Chờ ai |
|---|---|
| T18 script `build-vertical.cjs` | Bạn cùng nhóm |
| Bản xuất quan hệ môn theo mã chương trình; mã myBK có xác định duy nhất phiên bản không; định nghĩa "học trước"; cấp 4 từ năm 3 hay 4 | Phó Khoa |
| Kỳ cuối dưới mức tối thiểu; giới hạn tín chỉ kỳ hè; nghỉ 2 kỳ liên tiếp cần thủ tục gì | Phòng đào tạo |
| Ghi lại T38–T50, Q17–Q20 vào 02 (thiếu từ phiên 22/11) | AI, khi người duyệt nhắc lại nội dung |
| Học phí, budget, sở thích, GPA dự kiến (W3, W4, W9); SSO myBK | Người duyệt thiết kế lại kiến trúc |
| Xóa file dump đầu vào bộ giải (có điểm của người duyệt) trong thư mục tạm phiên 22–23/11 | AI, phiên sau |

## Git (cập nhật 24/11)

- Nhánh `feature/goi-y-hoc-phan`. Commit gần nhất đã đẩy: `441f4d6` (23/11). Việc 23/11 (sửa trần TC, giai đoạn 12, chuẩn hóa docs 24/11) **chưa commit**.
- Chỉ commit khi người duyệt yêu cầu; commit **không có dòng đồng tác giả**.
- Nhật ký các phiên 21–23/11 (gộp `origin/main`, T37, kết nối database cổng 6543…): [luu-tru/2026-11-24-nhat-ky-phien-21-23.md](luu-tru/2026-11-24-nhat-ky-phien-21-23.md).

## Chạy

```
npm --prefix Backend run dev       # http://localhost:3210  (nối Supabase dùng chung; Backend/.env máy này DB_PORT=6543)
cd Frontend && npx vite --config node_modules/.bk-local/vite.dev.config.mjs   # http://localhost:5173/recommendations
                                   # (máy này: node_modules/.vite bị EPERM; máy khác dùng npm --prefix Frontend run dev)
cd pipeline && .venv/Scripts/python check_baseline.py
```

Tài khoản thử: **A** (dữ liệu thật của người duyệt), **B** (dữ liệu bạn cùng nhóm); `khmt.demo@bkuni.local` chỉ giữ dữ liệu mẫu. Mật khẩu ở `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md` mục 11.

## File nhạy cảm (không commit, không chép vào code hay test)

- `docs/luu-tru/2026-11-15-ban-giao-claude-web-va-pipeline.md`: mật khẩu, khóa API.
- `Mon_hoc_CTDT_*.xlsx`, `Bảng điểm.pdf` ở thư mục gốc: file tiến độ thật của người duyệt (họ tên, MSSV, điểm).
- `ctdt-ben-tien-do-mon-tra-ve-cua-tao.json` (JSON API myBK của người duyệt, có điểm) và `function.js` (mã trang myBK của Phòng Đào tạo).
- Thư mục cục bộ: `.local-postgres/`, `.runtime/`, `.tools/`, `.npm-cache/`, `Backend/.env`.
