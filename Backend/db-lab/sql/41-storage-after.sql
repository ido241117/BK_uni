-- 4.1 (sau migration StorageTuning): lz4 trên bảng thật, bloat do UPDATE ghi lại cột, VACUUM FULL thu hồi chỗ
\pset footer off
\ir 00-lab-helpers.sql

SELECT pg_column_compression(content) AS thuat_toan, count(*) FROM bk_uni.course_outlines GROUP BY 1;
SELECT 'trước VACUUM FULL' AS buoc, pg_size_pretty(pg_total_relation_size('bk_uni.course_outlines')) AS tong,
       n_live_tup AS dong_song, n_dead_tup AS dong_chet, last_autovacuum
FROM pg_stat_user_tables WHERE schemaname = 'bk_uni' AND relname = 'course_outlines';
\timing on
VACUUM (FULL, ANALYZE) bk_uni.course_outlines;
\timing off
SELECT 'sau VACUUM FULL' AS buoc, pg_size_pretty(pg_total_relation_size('bk_uni.course_outlines')) AS tong;

SELECT * FROM bk_lab.bench('bảng thật, lz4: đọc 1 khóa JSONB của mọi đề cương',
  $q$SELECT count(*) FROM bk_uni.course_outlines WHERE (content ->> 'course_code') IS NOT NULL$q$, 5);

-- Ràng buộc CHECK mới: thử ghi dữ liệu sai (trong transaction, rollback ngay)
BEGIN;
\set ON_ERROR_STOP off
UPDATE bk_uni.courses SET credits = -1 WHERE code = 'CO1007';
ROLLBACK;
BEGIN;
INSERT INTO bk_uni.course_opened_semesters (course_id, semester_code)
SELECT id, '24A' FROM bk_uni.courses WHERE code = 'CO1007';
ROLLBACK;
\set ON_ERROR_STOP on

SELECT relname AS bang, reloptions FROM pg_class
WHERE relnamespace = 'bk_uni'::regnamespace AND reloptions IS NOT NULL ORDER BY 1;

DROP SCHEMA bk_lab CASCADE;
