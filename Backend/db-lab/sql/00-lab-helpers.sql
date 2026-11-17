-- Dùng chung cho các kịch bản: tạo schema thử nghiệm bk_lab và hàm đo thời gian phía server.
DROP SCHEMA IF EXISTS bk_lab CASCADE;
CREATE SCHEMA bk_lab;

-- bk_lab.bench(nhan, cau_sql, so_lan): chạy câu SQL n lần (lần đầu làm nóng cache, không tính),
-- trả về trung vị / nhỏ nhất / lớn nhất theo mili-giây. Đo bằng clock_timestamp() ngay trên server
-- nên không bị ảnh hưởng bởi độ trễ mạng tới Supabase.
CREATE FUNCTION bk_lab.bench(label text, sql text, runs int DEFAULT 7)
RETURNS TABLE (thu_nghiem text, trung_vi_ms numeric, nho_nhat_ms numeric, lon_nhat_ms numeric)
LANGUAGE plpgsql AS $$
DECLARE
  t0 timestamptz;
  samples numeric[] := '{}';
BEGIN
  EXECUTE sql; -- làm nóng
  FOR i IN 1..runs LOOP
    t0 := clock_timestamp();
    EXECUTE sql;
    samples := samples || (extract(epoch FROM clock_timestamp() - t0) * 1000)::numeric;
  END LOOP;
  RETURN QUERY
  SELECT label,
         round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s) FROM unnest(samples) s)::numeric, 2),
         round((SELECT min(s) FROM unnest(samples) s), 2),
         round((SELECT max(s) FROM unnest(samples) s), 2);
END $$;
