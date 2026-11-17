-- 4.2 Xử lý truy vấn. Chạy 2 lần: trước và sau migration SearchIndexes (index trigram).
\pset footer off
\ir 00-lab-helpers.sql

-- [A] Câu tìm kiếm thật của CourseService.findPage (đúng hình dạng TypeORM sinh ra)
\set q 'mạng'
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT c.*, CASE WHEN lower(c.code) = lower(:'q') THEN 0
                 WHEN lower(c.code) LIKE lower(:'q' || '%') THEN 1
                 WHEN lower(c.code) LIKE lower('%' || :'q' || '%') THEN 2 ELSE 3 END AS search_rank
FROM bk_uni.courses c
WHERE (lower(c.code) LIKE lower('%' || :'q' || '%') OR lower(c.name) LIKE lower('%' || :'q' || '%'))
ORDER BY search_rank, c.code, c.id
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(DISTINCT c.id) FROM bk_uni.courses c
WHERE lower(c.code) LIKE '%co10%' OR lower(c.name) LIKE '%co10%';

-- [B] Đo thời gian trên bảng thật (5.3 nghìn dòng)
SELECT * FROM bk_lab.bench('thật | tìm "mạng" (tên)',        $q$SELECT * FROM bk_uni.courses c WHERE lower(c.code) LIKE '%mạng%' OR lower(c.name) LIKE '%mạng%' ORDER BY c.code LIMIT 20$q$, 15)
UNION ALL SELECT * FROM bk_lab.bench('thật | tìm "co10" (mã)',  $q$SELECT * FROM bk_uni.courses c WHERE lower(c.code) LIKE '%co10%' OR lower(c.name) LIKE '%co10%' ORDER BY c.code LIMIT 20$q$, 15)
UNION ALL SELECT * FROM bk_lab.bench('thật | đếm "giải tích"',  $q$SELECT count(*) FROM bk_uni.courses c WHERE lower(c.code) LIKE '%giải tích%' OR lower(c.name) LIKE '%giải tích%'$q$, 15);

-- [C] Khả năng mở rộng: bản sao x50 (~266 nghìn dòng), so sánh có / không có index GIN trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE TABLE bk_lab.courses_x50 AS
SELECT gen_random_uuid() AS id, c.code || CASE WHEN g = 1 THEN '' ELSE '-' || g END AS code, c.name, c.credits
FROM bk_uni.courses c CROSS JOIN generate_series(1, 50) g;
ANALYZE bk_lab.courses_x50;
SELECT count(*) AS so_dong, pg_size_pretty(pg_relation_size('bk_lab.courses_x50')) AS heap FROM bk_lab.courses_x50;

SELECT * FROM bk_lab.bench('x50 | không index | "mạng"',     $q$SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%mạng%' OR lower(c.name) LIKE '%mạng%' ORDER BY c.code LIMIT 20$q$, 7)
UNION ALL SELECT * FROM bk_lab.bench('x50 | không index | "co1007"', $q$SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%co1007%' OR lower(c.name) LIKE '%co1007%' ORDER BY c.code LIMIT 20$q$, 7)
UNION ALL SELECT * FROM bk_lab.bench('x50 | không index | đếm "giải tích 1"', $q$SELECT count(*) FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%giải tích 1%' OR lower(c.name) LIKE '%giải tích 1%'$q$, 7);

\timing on
CREATE INDEX courses_x50_code_trgm ON bk_lab.courses_x50 USING gin (lower(code) extensions.gin_trgm_ops);
CREATE INDEX courses_x50_name_trgm ON bk_lab.courses_x50 USING gin (lower(name) extensions.gin_trgm_ops);
\timing off
ANALYZE bk_lab.courses_x50;
SELECT pg_size_pretty(pg_relation_size('bk_lab.courses_x50_code_trgm')) AS idx_code,
       pg_size_pretty(pg_relation_size('bk_lab.courses_x50_name_trgm')) AS idx_name;

SELECT * FROM bk_lab.bench('x50 | GIN trigram | "mạng"',     $q$SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%mạng%' OR lower(c.name) LIKE '%mạng%' ORDER BY c.code LIMIT 20$q$, 7)
UNION ALL SELECT * FROM bk_lab.bench('x50 | GIN trigram | "co1007"', $q$SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%co1007%' OR lower(c.name) LIKE '%co1007%' ORDER BY c.code LIMIT 20$q$, 7)
UNION ALL SELECT * FROM bk_lab.bench('x50 | GIN trigram | đếm "giải tích 1"', $q$SELECT count(*) FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%giải tích 1%' OR lower(c.name) LIKE '%giải tích 1%'$q$, 7);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%co1007%' OR lower(c.name) LIKE '%co1007%' ORDER BY c.code LIMIT 20;

-- Từ khóa quá ngắn (< 3 ký tự) không sinh được trigram -> index vô dụng, planner tự quay về Seq Scan
EXPLAIN (ANALYZE)
SELECT * FROM bk_lab.courses_x50 c WHERE lower(c.code) LIKE '%pe%' OR lower(c.name) LIKE '%pe%' ORDER BY c.code LIMIT 20;

-- [D] Thuật toán join: cùng câu hỏi "các môn của một CTĐT và số học kỳ đã mở", ép planner dùng từng loại join
SELECT id AS curriculum_id FROM bk_uni.curricula ORDER BY code LIMIT 1 \gset
\set join_sql 'SELECT c.code, c.name, count(o.id) AS so_hk_mo FROM bk_uni.curriculum_courses cc JOIN bk_uni.courses c ON c.id = cc.course_id LEFT JOIN bk_uni.course_opened_semesters o ON o.course_id = c.id GROUP BY c.id'

EXPLAIN (ANALYZE, BUFFERS) SELECT c.code, c.name, count(o.id) AS so_hk_mo
FROM bk_uni.curriculum_courses cc JOIN bk_uni.courses c ON c.id = cc.course_id
LEFT JOIN bk_uni.course_opened_semesters o ON o.course_id = c.id
WHERE cc.curriculum_id = :'curriculum_id' GROUP BY c.id;

EXPLAIN (ANALYZE, BUFFERS) SELECT c.code, c.name, count(o.id) AS so_hk_mo
FROM bk_uni.curriculum_courses cc JOIN bk_uni.courses c ON c.id = cc.course_id
LEFT JOIN bk_uni.course_opened_semesters o ON o.course_id = c.id
GROUP BY c.id;

CREATE FUNCTION bk_lab.bench_join(label text, sql text, hash bool, merge bool, nest bool)
RETURNS TABLE (thu_nghiem text, trung_vi_ms numeric, nho_nhat_ms numeric, lon_nhat_ms numeric)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('enable_hashjoin', hash::text, true);
  PERFORM set_config('enable_mergejoin', merge::text, true);
  PERFORM set_config('enable_nestloop', nest::text, true);
  RETURN QUERY SELECT * FROM bk_lab.bench(label, sql, 7);
  PERFORM set_config('enable_hashjoin', 'on', true);
  PERFORM set_config('enable_mergejoin', 'on', true);
  PERFORM set_config('enable_nestloop', 'on', true);
END $$;

BEGIN;
SELECT * FROM bk_lab.bench_join('toàn bộ | planner tự chọn', :'join_sql', true, true, true)
UNION ALL SELECT * FROM bk_lab.bench_join('toàn bộ | chỉ Hash Join', :'join_sql', true, false, false)
UNION ALL SELECT * FROM bk_lab.bench_join('toàn bộ | chỉ Merge Join', :'join_sql', false, true, false)
UNION ALL SELECT * FROM bk_lab.bench_join('toàn bộ | chỉ Nested Loop', :'join_sql', false, false, true);
COMMIT;

\set join_one 'SELECT c.code, count(o.id) FROM bk_uni.curriculum_courses cc JOIN bk_uni.courses c ON c.id = cc.course_id LEFT JOIN bk_uni.course_opened_semesters o ON o.course_id = c.id WHERE cc.curriculum_id = ''' :curriculum_id ''' GROUP BY c.id'
BEGIN;
SELECT * FROM bk_lab.bench_join('1 CTĐT | planner tự chọn', :'join_one', true, true, true)
UNION ALL SELECT * FROM bk_lab.bench_join('1 CTĐT | chỉ Hash Join', :'join_one', true, false, false)
UNION ALL SELECT * FROM bk_lab.bench_join('1 CTĐT | chỉ Merge Join', :'join_one', false, true, false)
UNION ALL SELECT * FROM bk_lab.bench_join('1 CTĐT | chỉ Nested Loop', :'join_one', false, false, true);
COMMIT;

-- [E] Vai trò của thống kê (ANALYZE): ước lượng số dòng sai -> kế hoạch sai
CREATE TABLE bk_lab.opened (LIKE bk_uni.course_opened_semesters) WITH (autovacuum_enabled = off);
INSERT INTO bk_lab.opened SELECT * FROM bk_uni.course_opened_semesters;
CREATE INDEX ON bk_lab.opened (semester_code);
EXPLAIN SELECT * FROM bk_lab.opened WHERE semester_code = '241';
EXPLAIN ANALYZE SELECT * FROM bk_lab.opened WHERE semester_code = '241';
ANALYZE bk_lab.opened;
EXPLAIN ANALYZE SELECT * FROM bk_lab.opened WHERE semester_code = '241';
SELECT attname, n_distinct, (most_common_vals::text::text[])[1:5] AS mcv_5_dau, most_common_freqs[1:5] AS tan_suat
FROM pg_stats WHERE schemaname = 'bk_lab' AND tablename = 'opened' AND attname = 'semester_code';

-- [F] Tổng hợp (GROUP BY) tính tức thời so với materialized view tính sẵn
CREATE MATERIALIZED VIEW bk_lab.mv_offering AS
SELECT course_id, count(*) AS so_hk_mo, min(semester_code) AS hk_dau, max(semester_code) AS hk_cuoi
FROM bk_uni.course_opened_semesters GROUP BY course_id;
CREATE UNIQUE INDEX ON bk_lab.mv_offering (course_id);
SELECT course_id AS some_course FROM bk_lab.mv_offering ORDER BY so_hk_mo DESC LIMIT 1 \gset
EXPLAIN ANALYZE SELECT course_id, count(*), min(semester_code), max(semester_code) FROM bk_uni.course_opened_semesters GROUP BY course_id;
SELECT * FROM bk_lab.bench('GROUP BY toàn bảng (27 nghìn dòng)', 'SELECT course_id, count(*), min(semester_code), max(semester_code) FROM bk_uni.course_opened_semesters GROUP BY course_id', 9)
UNION ALL SELECT * FROM bk_lab.bench('đọc materialized view', 'SELECT * FROM bk_lab.mv_offering', 9)
UNION ALL SELECT * FROM bk_lab.bench('REFRESH MATERIALIZED VIEW', 'REFRESH MATERIALIZED VIEW bk_lab.mv_offering', 5);

-- [G] JSONB: tìm đề cương theo nội dung bên trong (toán tử @>) có / không có index GIN jsonb_path_ops
CREATE TABLE bk_lab.outlines AS SELECT id, course_code, content FROM bk_uni.course_outlines;
ANALYZE bk_lab.outlines;
SELECT * FROM bk_lab.bench('JSONB @> không index', $q$SELECT count(*) FROM bk_lab.outlines WHERE content @> '{"is_graduation_course": true}'$q$, 5);
\timing on
CREATE INDEX outlines_content_gin ON bk_lab.outlines USING gin (content jsonb_path_ops);
\timing off
ANALYZE bk_lab.outlines;
SELECT pg_size_pretty(pg_relation_size('bk_lab.outlines_content_gin')) AS idx_gin;
SELECT * FROM bk_lab.bench('JSONB @> có GIN jsonb_path_ops', $q$SELECT count(*) FROM bk_lab.outlines WHERE content @> '{"is_graduation_course": true}'$q$, 5);
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM bk_lab.outlines WHERE content @> '{"is_graduation_course": true}';

-- [H] Truy vấn tốn thời gian nhất mà ứng dụng thật đã gửi tới (pg_stat_statements)
SELECT calls AS so_lan, round(total_exec_time::numeric, 1) AS tong_ms, round(mean_exec_time::numeric, 2) AS tb_ms,
       rows AS so_dong, left(regexp_replace(query, '\s+', ' ', 'g'), 110) AS truy_van
FROM extensions.pg_stat_statements
WHERE query ILIKE '%bk_uni%' AND query NOT ILIKE '%bk_lab%' AND query NOT ILIKE '%pg_%'
ORDER BY total_exec_time DESC LIMIT 8;

DROP SCHEMA bk_lab CASCADE;
