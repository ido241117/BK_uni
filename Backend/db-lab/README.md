# db-lab — thực nghiệm cơ sở dữ liệu

Các kịch bản đo đạc dùng cho báo cáo phần CSDL (lưu trữ, xử lý truy vấn, transaction, đồng thời, sao lưu/phục hồi).
Chạy mọi lệnh trong thư mục `Backend`. Kết quả ghi vào `db-lab/results/`, bản dump vào `db-lab/backups/`
(cả hai đã được gitignore).

- Thực nghiệm cần ghi dữ liệu chỉ dùng schema tạm `bk_lab` (tạo khi bắt đầu, `DROP` khi xong). Thao tác trên
  bảng thật luôn nằm trong transaction kết thúc bằng `ROLLBACK`.
- Thời gian đo bằng `bk_lab.bench()` ([sql/00-lab-helpers.sql](sql/00-lab-helpers.sql)): chạy n lần ngay trên server,
  lấy trung vị, không tính độ trễ mạng.

| Lệnh | Nội dung | Tác động |
|---|---|---|
| `bash db-lab/run.sh 41-storage` | Kích thước bảng/TOAST, TEXT/JSON/JSONB, pglz/lz4, MVCC & bloat, FILLFACTOR & HOT | Chỉ `bk_lab` |
| `bash db-lab/run.sh 41-storage-after` | Kiểm tra trên bảng thật sau migration StorageTuning | Chạy `VACUUM FULL course_outlines` (khóa bảng ~10 s) |
| `bash db-lab/run.sh 42-query <hậu tố>` | EXPLAIN ANALYZE, index trigram, thuật toán join, thống kê, materialized view, JSONB GIN | Chỉ đọc + `bk_lab` |
| `bash db-lab/run.sh 43-transaction` | Atomicity, savepoint, WAL, chi phí COMMIT, trigger audit | Bảng thật chỉ trong transaction ROLLBACK |
| `node db-lab/concurrency.mjs` | Dirty/non-repeatable/phantom read, lost update, write skew, deadlock, khóa, race của ứng dụng | Chỉ `bk_lab` |
| `bash db-lab/backup.sh` | pg_dump/pg_restore, so sánh định dạng nén, phục hồi chọn lọc sau sự cố xóa nhầm | PostgreSQL cục bộ (postgres/postgres): DB `bk_uni_lab`, `bk_uni_r1`, `bk_uni_r4`, `bk_uni_scratch` |
| `bash db-lab/pitr.sh` | Point-in-time recovery: pg_basebackup + pg_receivewal + recovery_target_xid | PostgreSQL cục bộ; instance tạm cổng 5499, slot `bk_lab_pitr`; dọn hết khi kết thúc |

`run.sh` và `concurrency.mjs` chạy lên CSDL trong `Backend/.env`. `backup.sh` và `pitr.sh` cần PostgreSQL 17 cục bộ.
