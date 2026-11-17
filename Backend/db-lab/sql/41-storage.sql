-- 4.1 Lưu trữ dữ liệu: các phép đo chỉ đọc trên bk_uni + thực nghiệm trên schema bk_lab (xóa khi xong)
\pset footer off
\timing off

-- [A] Kích thước từng bảng: heap (main) / TOAST / index
SELECT c.relname AS bang,
       c.relpages AS so_trang_8kb,
       c.reltuples::bigint AS uoc_luong_dong,
       pg_size_pretty(pg_relation_size(c.oid, 'main')) AS heap,
       pg_size_pretty(COALESCE(pg_total_relation_size(NULLIF(c.reltoastrelid, 0)), 0)) AS toast,
       pg_size_pretty(pg_indexes_size(c.oid)) AS index,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tong
FROM pg_class c
WHERE c.relnamespace = 'bk_uni'::regnamespace AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 10;

-- [B] Độ rộng trung bình một dòng và số dòng ước tính trên một trang 8KB (header dòng 23B + line pointer 4B)
SELECT 'courses' AS bang, round(avg(pg_column_size(t.*))) AS byte_moi_dong,
       floor(8168 / avg(pg_column_size(t.*) + 4)) AS dong_moi_trang_uoc_tinh
FROM bk_uni.courses t
UNION ALL
SELECT 'course_opened_semesters', round(avg(pg_column_size(t.*))), floor(8168 / avg(pg_column_size(t.*) + 4))
FROM bk_uni.course_opened_semesters t
UNION ALL
SELECT 'student_courses', round(avg(pg_column_size(t.*))), floor(8168 / avg(pg_column_size(t.*) + 4))
FROM bk_uni.student_courses t;

-- [C] TOAST và nén của cột JSONB course_outlines.content
SELECT count(*) AS so_de_cuong,
       pg_size_pretty(sum(octet_length(content::text))) AS kich_thuoc_logic,
       pg_size_pretty(sum(pg_column_size(content))) AS kich_thuoc_luu_tru,
       round(sum(octet_length(content::text))::numeric / sum(pg_column_size(content)), 2) AS ty_le_nen,
       count(*) FILTER (WHERE pg_column_size(content) > 2032) AS so_gia_tri_vuot_nguong_toast
FROM bk_uni.course_outlines;

SELECT COALESCE(pg_column_compression(content), '(không nén, nằm inline)') AS thuat_toan_nen, count(*)
FROM bk_uni.course_outlines GROUP BY 1;

-- [D] Thực nghiệm 1: cùng dữ liệu, ba kiểu lưu TEXT / JSON / JSONB, hai thuật toán nén pglz / lz4
\ir 00-lab-helpers.sql
\timing on
CREATE TABLE bk_lab.outline_text  (id uuid, content text);
CREATE TABLE bk_lab.outline_json  (id uuid, content json);
CREATE TABLE bk_lab.outline_jsonb (id uuid, content jsonb COMPRESSION pglz);
CREATE TABLE bk_lab.outline_jsonb_lz4 (id uuid, content jsonb COMPRESSION lz4);
CREATE TABLE bk_lab.outline_jsonb_external (id uuid, content jsonb);
ALTER TABLE bk_lab.outline_jsonb_external ALTER COLUMN content SET STORAGE EXTERNAL; -- TOAST nhưng không nén
INSERT INTO bk_lab.outline_text  SELECT id, content::text FROM bk_uni.course_outlines;
INSERT INTO bk_lab.outline_json  SELECT id, content::json FROM bk_uni.course_outlines;
INSERT INTO bk_lab.outline_jsonb SELECT id, content::text::jsonb FROM bk_uni.course_outlines;
INSERT INTO bk_lab.outline_jsonb_lz4 SELECT id, content::text::jsonb FROM bk_uni.course_outlines;
INSERT INTO bk_lab.outline_jsonb_external SELECT id, content::text::jsonb FROM bk_uni.course_outlines;
\timing off
SELECT relname AS bang,
       pg_size_pretty(pg_relation_size(oid)) AS heap,
       pg_size_pretty(pg_total_relation_size(reltoastrelid)) AS toast,
       pg_size_pretty(pg_total_relation_size(oid)) AS tong
FROM pg_class WHERE relnamespace = 'bk_lab'::regnamespace AND relkind = 'r'
ORDER BY pg_total_relation_size(oid);

-- Truy cập một khóa bên trong tài liệu: JSONB đã được phân tích sẵn, JSON/TEXT phải phân tích lại mỗi lần
SELECT * FROM bk_lab.bench('TEXT  -> ép sang jsonb rồi lấy khóa', $q$SELECT count(*) FROM bk_lab.outline_text  WHERE (content::jsonb ->> 'course_code') IS NOT NULL$q$, 5)
UNION ALL SELECT * FROM bk_lab.bench('JSON  -> lấy khóa (phải parse)',     $q$SELECT count(*) FROM bk_lab.outline_json  WHERE (content ->> 'course_code') IS NOT NULL$q$, 5)
UNION ALL SELECT * FROM bk_lab.bench('JSONB pglz -> lấy khóa',             $q$SELECT count(*) FROM bk_lab.outline_jsonb WHERE (content ->> 'course_code') IS NOT NULL$q$, 5)
UNION ALL SELECT * FROM bk_lab.bench('JSONB lz4  -> lấy khóa',             $q$SELECT count(*) FROM bk_lab.outline_jsonb_lz4 WHERE (content ->> 'course_code') IS NOT NULL$q$, 5)
UNION ALL SELECT * FROM bk_lab.bench('JSONB EXTERNAL (không nén)',         $q$SELECT count(*) FROM bk_lab.outline_jsonb_external WHERE (content ->> 'course_code') IS NOT NULL$q$, 5);

-- [E] Thực nghiệm 2: MVCC, phiên bản dòng (xmin/xmax/ctid) và phình bảng (bloat)
CREATE TABLE bk_lab.mvcc_demo (id int PRIMARY KEY, status text, note text) WITH (autovacuum_enabled = off);
INSERT INTO bk_lab.mvcc_demo SELECT g, 'not-started', repeat('x', 60) FROM generate_series(1, 100000) g;
SELECT ctid, xmin, xmax, id, status FROM bk_lab.mvcc_demo WHERE id = 1;
UPDATE bk_lab.mvcc_demo SET status = 'in-progress' WHERE id = 1;
SELECT ctid, xmin, xmax, id, status FROM bk_lab.mvcc_demo WHERE id = 1;

CREATE EXTENSION IF NOT EXISTS pgstattuple WITH SCHEMA extensions;
SELECT 'sau INSERT' AS buoc, pg_size_pretty(table_len) AS kich_thuoc, tuple_count AS dong_song, dead_tuple_count AS dong_chet,
       round(dead_tuple_percent::numeric, 1) AS pct_chet, round(free_percent::numeric, 1) AS pct_trong
FROM extensions.pgstattuple('bk_lab.mvcc_demo');
UPDATE bk_lab.mvcc_demo SET status = 'completed';
SELECT 'sau UPDATE toàn bảng' AS buoc, pg_size_pretty(table_len), tuple_count, dead_tuple_count,
       round(dead_tuple_percent::numeric, 1), round(free_percent::numeric, 1)
FROM extensions.pgstattuple('bk_lab.mvcc_demo');
VACUUM bk_lab.mvcc_demo;
SELECT 'sau VACUUM' AS buoc, pg_size_pretty(table_len), tuple_count, dead_tuple_count,
       round(dead_tuple_percent::numeric, 1), round(free_percent::numeric, 1)
FROM extensions.pgstattuple('bk_lab.mvcc_demo');
UPDATE bk_lab.mvcc_demo SET status = 'failed';
SELECT 'UPDATE lần 2 (tái dùng chỗ trống)' AS buoc, pg_size_pretty(table_len), tuple_count, dead_tuple_count,
       round(dead_tuple_percent::numeric, 1), round(free_percent::numeric, 1)
FROM extensions.pgstattuple('bk_lab.mvcc_demo');
VACUUM FULL bk_lab.mvcc_demo;
SELECT 'sau VACUUM FULL' AS buoc, pg_size_pretty(table_len), tuple_count, dead_tuple_count,
       round(dead_tuple_percent::numeric, 1), round(free_percent::numeric, 1)
FROM extensions.pgstattuple('bk_lab.mvcc_demo');

-- [F] Thực nghiệm 3: FILLFACTOR và HOT update (Heap-Only Tuple)
CREATE TABLE bk_lab.ff100 (id int PRIMARY KEY, user_id int, status text, updated_at timestamptz) WITH (fillfactor = 100, autovacuum_enabled = off);
CREATE TABLE bk_lab.ff90  (LIKE bk_lab.ff100 INCLUDING ALL) WITH (fillfactor = 90, autovacuum_enabled = off);
CREATE TABLE bk_lab.ff70  (LIKE bk_lab.ff100 INCLUDING ALL) WITH (fillfactor = 70, autovacuum_enabled = off);
CREATE INDEX ON bk_lab.ff100 (user_id);
CREATE INDEX ON bk_lab.ff90 (user_id);
CREATE INDEX ON bk_lab.ff70 (user_id);
INSERT INTO bk_lab.ff100 SELECT g, g % 500, 'not-started', now() FROM generate_series(1, 50000) g;
INSERT INTO bk_lab.ff90  SELECT * FROM bk_lab.ff100;
INSERT INTO bk_lab.ff70  SELECT * FROM bk_lab.ff100;
SELECT relname AS bang, pg_size_pretty(pg_relation_size(oid)) AS heap_truoc_update
FROM pg_class WHERE relnamespace = 'bk_lab'::regnamespace AND relname IN ('ff100', 'ff90', 'ff70') ORDER BY relname;
\timing on
UPDATE bk_lab.ff100 SET status = 'completed', updated_at = now() WHERE id % 5 = 0;
UPDATE bk_lab.ff90  SET status = 'completed', updated_at = now() WHERE id % 5 = 0;
UPDATE bk_lab.ff70  SET status = 'completed', updated_at = now() WHERE id % 5 = 0;
\timing off
SELECT pg_stat_force_next_flush();
SELECT pg_sleep(1.5);
SELECT relname AS bang, n_tup_upd AS so_update, n_tup_hot_upd AS so_hot_update,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS pct_hot,
       pg_size_pretty(pg_relation_size(relid)) AS heap_sau_update,
       pg_size_pretty(pg_indexes_size(relid)) AS index
FROM pg_stat_user_tables WHERE schemaname = 'bk_lab' AND relname LIKE 'ff%' ORDER BY relname;

DROP SCHEMA bk_lab CASCADE;
