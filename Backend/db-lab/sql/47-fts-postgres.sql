-- 4.6 Tìm kiếm toàn văn: phía PostgreSQL (tsvector + GIN) trên nội dung đề cương.
-- So sánh với kết quả của db-lab/es-bench.ts. Chỉ ghi vào schema bk_lab (xóa khi xong).
\pset footer off
\ir 00-lab-helpers.sql
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Hàm bỏ dấu dùng được trong index (unaccent() mặc định là STABLE nên không dùng trực tiếp trong biểu thức index được)
CREATE FUNCTION bk_lab.fold(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce($1, ''))) $$;

-- [A] Dựng bảng tìm kiếm: mỗi mã môn một dòng (bản đề cương mới nhất), văn bản gom từ các trường giống ES
\timing on
CREATE TABLE bk_lab.outline_fts AS
SELECT DISTINCT ON (o.course_code)
  o.course_code AS code,
  o.name_vi,
  concat_ws(' ', o.name_vi, o.name_en) AS t_name,
  concat_ws(' ', o.content #>> '{objectives,vi}', o.content #>> '{objectives,en}',
                 o.content #>> '{summary,vi}', o.content #>> '{summary,en}') AS t_main,
  concat_ws(' ',
    (SELECT string_agg(concat_ws(' ', s #>> '{content,vi}', s #>> '{content,en}'), ' ') FROM jsonb_array_elements(o.content -> 'sessions') s),
    (SELECT string_agg(concat_ws(' ', l #>> '{name,vi}', l #>> '{name,en}'), ' ') FROM jsonb_array_elements(o.content -> 'learning_outcomes') l)
  ) AS t_detail,
  concat_ws(' ', o.content #>> '{references,vi}', o.content #>> '{study_guide,vi}') AS t_ref,
  o.content #>> '{assessment,final_exam,format,name,vi}' AS final_exam_format,
  o.content #>> '{faculty,name,vi}' AS faculty
FROM bk_uni.course_outlines o
ORDER BY o.course_code, o.applies_from DESC NULLS LAST, o.version DESC;

-- tsvector có trọng số: A = tên, B = mục tiêu/tóm tắt, C = nội dung buổi/chuẩn đầu ra, D = tài liệu.
-- Cấu hình 'simple' (PostgreSQL không có bộ tách từ/stemmer tiếng Việt) + bỏ dấu.
ALTER TABLE bk_lab.outline_fts ADD COLUMN doc tsvector;
UPDATE bk_lab.outline_fts SET doc =
     setweight(to_tsvector('simple', bk_lab.fold(t_name)), 'A')
  || setweight(to_tsvector('simple', bk_lab.fold(t_main)), 'B')
  || setweight(to_tsvector('simple', bk_lab.fold(t_detail)), 'C')
  || setweight(to_tsvector('simple', bk_lab.fold(t_ref)), 'D');
CREATE INDEX outline_fts_gin ON bk_lab.outline_fts USING gin (doc);
\timing off
ANALYZE bk_lab.outline_fts;

SELECT count(*) AS so_tai_lieu,
       pg_size_pretty(pg_table_size('bk_lab.outline_fts')) AS bang,
       pg_size_pretty(pg_relation_size('bk_lab.outline_fts_gin')) AS index_gin,
       pg_size_pretty(pg_total_relation_size('bk_lab.outline_fts')) AS tong
FROM bk_lab.outline_fts;

-- [B] Kế hoạch thực thi: GIN được dùng cho toán tử @@
EXPLAIN (ANALYZE, BUFFERS)
SELECT code, ts_rank_cd(doc, q) AS rank
FROM bk_lab.outline_fts, websearch_to_tsquery('simple', bk_lab.fold('kiểm thử phần mềm')) q
WHERE doc @@ q ORDER BY rank DESC LIMIT 5;

-- [C] Cùng các truy vấn như phía ES: số kết quả và top 5
CREATE FUNCTION bk_lab.fts(query text, n int DEFAULT 5)
RETURNS TABLE (code text, ten text, rank real) LANGUAGE sql STABLE AS $$
  SELECT f.code, f.name_vi, round(ts_rank_cd(f.doc, q)::numeric, 3)::real
  FROM bk_lab.outline_fts f, websearch_to_tsquery('simple', bk_lab.fold(query)) q
  WHERE f.doc @@ q ORDER BY 3 DESC, 1 LIMIT n
$$;
SELECT q AS truy_van, (SELECT count(*) FROM bk_lab.outline_fts f WHERE f.doc @@ websearch_to_tsquery('simple', bk_lab.fold(q))) AS so_ket_qua,
       (SELECT string_agg(code || ' ' || ten, ' | ') FROM bk_lab.fts(q, 3)) AS top3
FROM unnest(ARRAY['docker', 'csdl', 'tri tue nhan tao', 'kiem thu phan mem', 'kubernetess', 'máy học', 'xử lý ảnh']) q;

-- [D] Thời gian (trung vị 9 lần, đo trên server)
SELECT * FROM bk_lab.bench('PG FTS | docker',             $q$SELECT * FROM bk_lab.fts('docker')$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG FTS | csdl',               $q$SELECT * FROM bk_lab.fts('csdl')$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG FTS | tri tue nhan tao',   $q$SELECT * FROM bk_lab.fts('tri tue nhan tao')$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG FTS | kiem thu phan mem',  $q$SELECT * FROM bk_lab.fts('kiem thu phan mem')$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG FTS | máy học',            $q$SELECT * FROM bk_lab.fts('máy học')$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG FTS + ts_headline (top 5) | kiem thu phan mem',
  $q$SELECT code, ts_headline('simple', bk_lab.fold(t_main), q, 'MaxFragments=2, MaxWords=20, MinWords=8')
     FROM bk_lab.outline_fts, websearch_to_tsquery('simple', bk_lab.fold('kiem thu phan mem')) q
     WHERE doc @@ q ORDER BY ts_rank_cd(doc, q) DESC LIMIT 5$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG đếm theo khoa (facet) | tri tue nhan tao',
  $q$SELECT faculty, count(*) FROM bk_lab.outline_fts WHERE doc @@ websearch_to_tsquery('simple', bk_lab.fold('tri tue nhan tao')) GROUP BY 1 ORDER BY 2 DESC LIMIT 5$q$, 9)
UNION ALL SELECT * FROM bk_lab.bench('PG không có fuzzy: ILIKE ''%kubernet%'' (tự cắt từ, quét tuần tự)',
  $q$SELECT code FROM bk_lab.outline_fts WHERE bk_lab.fold(t_detail) ILIKE '%kubernet%' LIMIT 5$q$, 9);

-- [E] Highlight của PostgreSQL (ts_headline) cho cùng truy vấn
SELECT code, ts_headline('simple', bk_lab.fold(t_main), q, 'MaxFragments=1, MaxWords=18, MinWords=8, StartSel=**, StopSel=**') AS doan_trich
FROM bk_lab.outline_fts, websearch_to_tsquery('simple', bk_lab.fold('kiem thu phan mem')) q
WHERE doc @@ q ORDER BY ts_rank_cd(doc, q) DESC LIMIT 3;

-- [F] Tính nhất quán: thay đổi trong transaction thấy ngay sau COMMIT (không có độ trễ như refresh của ES)
BEGIN;
UPDATE bk_lab.outline_fts SET doc = doc || to_tsvector('simple', 'tukhoamoi') WHERE code = 'CO3001';
SELECT count(*) AS thay_ngay_trong_transaction FROM bk_lab.outline_fts WHERE doc @@ to_tsquery('simple', 'tukhoamoi');
ROLLBACK;

DROP SCHEMA bk_lab CASCADE;
