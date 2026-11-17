-- 4.3 Giao dịch: tính nguyên tử, savepoint, WAL/độ bền, trigger audit chạy trong cùng transaction.
-- Mọi thay đổi trên bảng thật đều nằm trong transaction kết thúc bằng ROLLBACK.
\pset footer off
\ir 00-lab-helpers.sql
\set ON_ERROR_STOP off

-- [A] Atomicity trên dữ liệu thật: 3 câu lệnh, câu thứ 3 vi phạm CHECK -> cả transaction bị hủy,
--     kể cả dòng nhật ký do trigger audit ghi ra.
SELECT id AS course_id, name AS ten_cu FROM bk_uni.courses WHERE code = 'CO1007' \gset
SELECT count(*) AS audit_truoc FROM bk_uni.audit_log \gset
BEGIN;
SELECT txid_current() AS txid;
UPDATE bk_uni.courses SET name = 'TÊN TẠM' WHERE id = :'course_id';
INSERT INTO bk_uni.course_opened_semesters (course_id, semester_code) VALUES (:'course_id', '263');
SELECT table_name, operation, new_data FROM bk_uni.audit_log WHERE txid = txid_current();
UPDATE bk_uni.courses SET credits = 99 WHERE id = :'course_id';   -- vi phạm CHK_course_credits
SELECT 1;                                                          -- transaction đã hỏng: mọi lệnh bị từ chối
COMMIT;                                                            -- COMMIT trên transaction hỏng = ROLLBACK
SELECT name = :'ten_cu' AS ten_giu_nguyen,
       (SELECT count(*) FROM bk_uni.course_opened_semesters WHERE course_id = :'course_id' AND semester_code = '263') AS hk_263,
       (SELECT count(*) FROM bk_uni.audit_log) - :audit_truoc AS audit_moi
FROM bk_uni.courses WHERE id = :'course_id';

-- [B] Savepoint: hủy một phần transaction, giữ phần còn lại
CREATE TABLE bk_lab.status (course text PRIMARY KEY, status text NOT NULL CHECK (status IN ('not-started', 'in-progress', 'completed', 'failed')));
INSERT INTO bk_lab.status VALUES ('CO1007', 'not-started'), ('MT1003', 'not-started'), ('PH1003', 'not-started');
BEGIN;
UPDATE bk_lab.status SET status = 'completed' WHERE course = 'CO1007';
SAVEPOINT truoc_khi_sua_mt1003;
UPDATE bk_lab.status SET status = 'passed' WHERE course = 'MT1003';  -- lỗi CHECK
ROLLBACK TO SAVEPOINT truoc_khi_sua_mt1003;
UPDATE bk_lab.status SET status = 'in-progress' WHERE course = 'PH1003';
COMMIT;
SELECT * FROM bk_lab.status ORDER BY course;

-- [C] Độ bền: mỗi transaction sinh bản ghi WAL; COMMIT chỉ trả về khi WAL đã được flush xuống đĩa
SHOW synchronous_commit;
SHOW wal_level;
SELECT pg_current_wal_lsn() AS lsn_truoc \gset
BEGIN;
INSERT INTO bk_lab.status SELECT 'X' || g, 'not-started' FROM generate_series(1, 10000) g;
COMMIT;
SELECT pg_current_wal_lsn() AS lsn_sau_insert \gset
UPDATE bk_lab.status SET status = 'completed' WHERE course LIKE 'X%';
SELECT pg_current_wal_lsn() AS lsn_sau_update \gset
SELECT :'lsn_truoc' AS lsn_truoc, :'lsn_sau_insert' AS lsn_sau_insert, :'lsn_sau_update' AS lsn_sau_update,
       pg_size_pretty(pg_wal_lsn_diff(:'lsn_sau_insert', :'lsn_truoc')) AS wal_insert_10k,
       pg_size_pretty(pg_wal_lsn_diff(:'lsn_sau_update', :'lsn_sau_insert')) AS wal_update_10k;
-- (Supabase còn các phiên khác ghi WAL cùng lúc nên con số là xấp xỉ.)

-- [D] Chi phí COMMIT: 2000 lệnh INSERT, mỗi lệnh một transaction (autocommit) vs gói trong 1 transaction.
--     PL/pgSQL không COMMIT được giữa vòng lặp trong DO, nên dùng PROCEDURE (PostgreSQL 11+ cho COMMIT trong procedure).
CREATE TABLE bk_lab.log_rows (id int, note text);
CREATE PROCEDURE bk_lab.insert_each_commit(n int) LANGUAGE plpgsql AS $$
BEGIN
  FOR i IN 1..n LOOP
    INSERT INTO bk_lab.log_rows VALUES (i, 'x');
    COMMIT;
  END LOOP;
END $$;
CREATE PROCEDURE bk_lab.insert_one_commit(n int) LANGUAGE plpgsql AS $$
BEGIN
  FOR i IN 1..n LOOP
    INSERT INTO bk_lab.log_rows VALUES (i, 'x');
  END LOOP;
  COMMIT;
END $$;
\timing on
CALL bk_lab.insert_each_commit(2000);
CALL bk_lab.insert_one_commit(2000);
SET synchronous_commit = off;
CALL bk_lab.insert_each_commit(2000);
RESET synchronous_commit;
\timing off

-- [E] Trigger audit: ghi nhật ký cho thay đổi thật, rồi rollback (không để lại dấu vết)
BEGIN;
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000001';
UPDATE bk_uni.courses SET name = name || ' ' WHERE id = :'course_id';
UPDATE bk_uni.courses SET updated_at = now() WHERE id = :'course_id';  -- không đổi gì -> trigger bỏ qua
DELETE FROM bk_uni.course_opened_semesters WHERE course_id = :'course_id' AND semester_code = (
  SELECT min(semester_code) FROM bk_uni.course_opened_semesters WHERE course_id = :'course_id');
SELECT table_name, operation, actor, db_user, old_data, new_data FROM bk_uni.audit_log WHERE txid = txid_current() ORDER BY id;
ROLLBACK;
SELECT count(*) - :audit_truoc AS audit_con_lai_sau_rollback FROM bk_uni.audit_log;

\set ON_ERROR_STOP on
DROP SCHEMA bk_lab CASCADE;
