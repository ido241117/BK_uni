# Tài liệu BK Uni: tính năng "Gợi ý học phần"

Đọc file này trước. Cập nhật lần cuối: **19/11/2026**.

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

## Đang ở đâu (19/11)

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0–2 | Kế hoạch, tài liệu, bộ giải theo QĐ 285 | **Đã duyệt** |
| 3 | Dữ liệu tiên quyết (bản chụp 96 chương trình) | Đã làm, **chờ duyệt** |
| 4 | API `POST /api/plans/solve` | Đã làm, **chờ duyệt** |
| 5 | Trang Gợi ý | Đã làm, **chờ duyệt**; chưa bấm thử trên trình duyệt |
| 6 | What-if (mốc, so sánh, Về mốc) | Đã làm, **chờ duyệt**; chưa bấm thử trên trình duyệt |
| 7 | Script trích chương trình `build-vertical.cjs` (T18) | **Chặn**: chờ bạn cùng nhóm gửi script |
| 8 | File tiến độ myBK (PDF + Excel) | Đã làm, **chờ duyệt**; còn T24 |

Lần chạy cuối (19/11): pytest 101 qua, jest 11 qua, `check_baseline.py` DUNG 38 / CHUA_LAM 2 / KHAC 0.

## Người duyệt cần làm (phiên sau bắt đầu từ đây)

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

## Git (kiểm tra ngày 19/11)

- Thư mục làm việc ở `main` (bản cũ `b1e4a3d`). **Mọi thay đổi chưa commit**; người dùng chỉ muốn commit khi yêu cầu.
- `origin/main` đã có 7 commit mới (mới nhất `655780b`) mà máy chưa kéo về.
- `origin/feature/goi-y-hoc-phan` = `695a12a`: bộ giải + API + trang Gợi ý **trước** khi làm what-if và myBK. Phần giai đoạn 6, 8 và việc sắp xếp tài liệu chưa có trên nhánh nào.
- `origin/research-pipeline` bị `kqyuu22` đẩy đè lúc 00:58 ngày 19/11 (`8e5840b`). Commit `13a59f2` (bộ giải) **không còn trên remote**, chỉ còn ở máy và trong `feature/goi-y-hoc-phan`. Nên hỏi bạn ấy rồi rebase, không đẩy đè.

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
