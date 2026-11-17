#!/usr/bin/env bash
# 4.5 Sao lưu & phục hồi (logical): chạy trên PostgreSQL local (postgres/postgres), nguồn dữ liệu là Supabase.
# Dùng: bash db-lab/backup.sh   -> results/45-backup.txt
# Tạo/xóa các database: bk_uni_lab (bản làm việc), bk_uni_r1, bk_uni_r4, bk_uni_scratch. Không đụng DB khác.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bk="$here/backups"; work="$bk/work"; out="$here/results/45-backup.txt"
mkdir -p "$work" "$here/results"; : > "$out"
log() { echo "$*" | tee -a "$out"; }
timed() { local label="$1"; shift; local t0=$(date +%s.%N); "$@" >>"$out.err" 2>&1; local rc=$?
  log "$(printf '  %-58s %7.2f s  (exit %s)' "$label" "$(awk -v a="$(date +%s.%N)" -v b="$t0" 'BEGIN{print a-b}')" "$rc")"; }
size() { du -sh "$1" | cut -f1; }

# Nguồn: Supabase (biến DB_* trong backend/.env)
set -a; . "$here/../.env"; set +a
SRC=(-h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME")
src() { PGPASSWORD="$DB_PASSWORD" PGSSLMODE=require "$@"; }
# Đích: PostgreSQL local
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGSSLMODE=disable
export PGCLIENTENCODING=UTF8
lq() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
# Dump theo schema (-n bk_uni) KHÔNG chứa extension (pg_trgm nằm ở schema "extensions" trên Supabase),
# nên DB đích phải chuẩn bị trước, nếu không các index trigram sẽ không tạo lại được.
newdb() { dropdb --if-exists "$1"; createdb "$1"; lq "$1" "CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions"; }
work_win=$(cygpath -m "$work")

log "=== [A] Sao lưu logic từ Supabase (schema bk_uni, sau khi đã chạy các migration 4.1-4.3) ==="
timed "pg_dump -Fc (custom, nén gzip mặc định)" src pg_dump "${SRC[@]}" -n bk_uni -Fc -f "$bk/bk_uni_after_lab.dump"
log "  kích thước: $(size "$bk/bk_uni_after_lab.dump")"
timed "pg_dump -Fp (plain SQL)" src pg_dump "${SRC[@]}" -n bk_uni -Fp -f "$work/supabase_plain.sql"
log "  kích thước: $(size "$work/supabase_plain.sql")"

log ""
log "=== [B] So sánh định dạng / thuật toán nén (dump từ bản local bk_uni_lab để loại trừ độ trễ mạng) ==="
newdb bk_uni_lab
pg_restore -d bk_uni_lab --no-owner --no-privileges "$bk/bk_uni_after_lab.dump" 2>>"$out.err"
for spec in "plain|-Fp|plain.sql" "custom gzip-6 (mặc định)|-Fc|gzip.dump" "custom không nén (-Z0)|-Fc -Z0|none.dump" \
            "custom lz4|-Fc -Z lz4|lz4.dump" "custom zstd|-Fc -Z zstd|zstd.dump" "directory -j4 (song song)|-Fd -j4|dir4"; do
  IFS='|' read -r label opts file <<<"$spec"; rm -rf "$work/$file"
  # shellcheck disable=SC2086
  timed "$label" pg_dump -d bk_uni_lab -n bk_uni $opts -f "$work/$file"
  log "    -> $(size "$work/$file")"
done

log ""
log "=== [C] Phục hồi toàn bộ vào database mới: tuần tự vs song song ==="
for j in 1 4; do
  newdb "bk_uni_r$j"
  timed "pg_restore -j $j (custom gzip)" pg_restore -d "bk_uni_r$j" -j "$j" --no-owner --no-privileges "$bk/bk_uni_after_lab.dump"
done
log "  Kiểm tra: số dòng từng bảng trên Supabase so với bản phục hồi (chỉ in bảng lệch):"
count_sql="SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM bk_uni.%I', relname, relname), ' UNION ALL ' ORDER BY relname)
           FROM pg_class WHERE relnamespace = 'bk_uni'::regnamespace AND relkind = 'r'"
q_src=$(src psql "${SRC[@]}" -X -At -c "$count_sql")
src psql "${SRC[@]}" -X -At -F' ' -c "$q_src ORDER BY 1" > "$work/count_src.txt"
psql -X -At -F' ' -d bk_uni_r4 -c "$(psql -X -At -d bk_uni_r4 -c "$count_sql") ORDER BY 1" > "$work/count_r4.txt"
if diff "$work/count_src.txt" "$work/count_r4.txt" >>"$out"; then
  log "  -> khớp hoàn toàn $(wc -l < "$work/count_src.txt") bảng, tổng $(awk '{s+=$2} END {print s}' "$work/count_src.txt") dòng"
fi
log "  trigger audit: $(lq bk_uni_r4 "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'TRG_audit_%'"), index trigram: $(lq bk_uni_r4 "SELECT count(*) FROM pg_indexes WHERE indexname LIKE '%trgm'")"
log "  nén cột content: $(lq bk_uni_r4 "SELECT string_agg(DISTINCT pg_column_compression(content), ',') FROM bk_uni.course_outlines")"

log ""
log "=== [D] Sự cố: quản trị viên xóa nhầm CTĐT CS-2023-KHMT trên bk_uni_lab (đang có 2 sinh viên theo học) ==="
X=$(lq bk_uni_lab "SELECT id FROM bk_uni.curricula WHERE code = 'CS-2023-KHMT'")
fingerprint() { # dấu vân tay toàn bộ dữ liệu liên quan tới CTĐT X (md5 của các dòng sắp theo id)
  psql -X -q -At -F' ' -d "$1" -v ON_ERROR_STOP=1 <<SQL
SET search_path = bk_uni;
SELECT 'curricula', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM curricula t WHERE id = '$X'
UNION ALL SELECT 'curriculum_specializations', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM curriculum_specializations t WHERE curriculum_id = '$X'
UNION ALL SELECT 'course_groups', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM course_groups t WHERE curriculum_id = '$X'
UNION ALL SELECT 'course_categories', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM course_categories t WHERE curriculum_id = '$X'
UNION ALL SELECT 'curriculum_courses', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM curriculum_courses t WHERE curriculum_id = '$X'
UNION ALL SELECT 'course_group_members', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM course_group_members t WHERE group_id IN (SELECT id FROM course_groups WHERE curriculum_id = '$X')
UNION ALL SELECT 'course_category_members', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM course_category_members t WHERE category_id IN (SELECT id FROM course_categories WHERE curriculum_id = '$X')
UNION ALL SELECT 'course_relations', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM course_relations t WHERE curriculum_id = '$X'
UNION ALL SELECT 'curriculum_regulations', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM curriculum_regulations t WHERE curriculum_id = '$X'
UNION ALL SELECT 'student_regulation_statuses', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM student_regulation_statuses t WHERE regulation_id IN (SELECT id FROM curriculum_regulations WHERE curriculum_id = '$X')
UNION ALL SELECT 'student_plan_courses', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM student_plan_courses t WHERE curriculum_id = '$X'
UNION ALL SELECT 'student_profiles (trỏ tới CTĐT)', count(*), md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM student_profiles t WHERE curriculum_id = '$X';
SQL
}
fingerprint bk_uni_lab > "$work/fp_before.txt"
log "  Dữ liệu của CTĐT trước sự cố (bảng | số dòng | md5):"; sed "s/^/    /" "$work/fp_before.txt" | tee -a "$out"
lq bk_uni_lab "TRUNCATE bk_uni.audit_log"
lq bk_uni_lab "UPDATE bk_uni.courses SET name = name || ' [edited after backup]' WHERE code = 'CO1007'"
timed "DELETE FROM curricula WHERE code = 'CS-2023-KHMT'" lq bk_uni_lab "DELETE FROM bk_uni.curricula WHERE id = '$X'"
log "  Thiệt hại (theo audit_log, chỉ các bảng có trigger):"
psql -X -At -F' | ' -d bk_uni_lab -c "SELECT table_name, operation, count(*), min(occurred_at) FROM bk_uni.audit_log GROUP BY 1, 2 ORDER BY 3 DESC" | sed 's/^/    /' | tee -a "$out"
fingerprint bk_uni_lab | awk '{print "    sau sự cố: " $0}' | tee -a "$out"

log ""
log "=== [E] Phục hồi CHỌN LỌC từ bản dump (không ghi đè thay đổi hợp lệ sau thời điểm sao lưu) ==="
newdb bk_uni_scratch
timed "pg_restore bản dump vào database tạm bk_uni_scratch" pg_restore -d bk_uni_scratch -j 4 --no-owner --no-privileges "$bk/bk_uni_after_lab.dump"
exp() { psql -X -q -d bk_uni_scratch -c "\\copy ($2) TO '$work_win/$1.csv' WITH (FORMAT csv)"; }
S="SET search_path = bk_uni"
t0=$(date +%s.%N)
exp curricula "SELECT * FROM bk_uni.curricula WHERE id = '$X'"
exp curriculum_specializations "SELECT * FROM bk_uni.curriculum_specializations WHERE curriculum_id = '$X'"
exp course_groups "SELECT * FROM bk_uni.course_groups WHERE curriculum_id = '$X' ORDER BY parent_group_id IS NOT NULL"
exp course_categories "SELECT * FROM bk_uni.course_categories WHERE curriculum_id = '$X'"
exp curriculum_courses "SELECT * FROM bk_uni.curriculum_courses WHERE curriculum_id = '$X'"
exp course_group_members "SELECT * FROM bk_uni.course_group_members WHERE group_id IN (SELECT id FROM bk_uni.course_groups WHERE curriculum_id = '$X')"
exp course_category_members "SELECT * FROM bk_uni.course_category_members WHERE category_id IN (SELECT id FROM bk_uni.course_categories WHERE curriculum_id = '$X')"
exp course_relations "SELECT * FROM bk_uni.course_relations WHERE curriculum_id = '$X'"
exp curriculum_regulations "SELECT * FROM bk_uni.curriculum_regulations WHERE curriculum_id = '$X'"
exp student_regulation_statuses "SELECT * FROM bk_uni.student_regulation_statuses WHERE regulation_id IN (SELECT id FROM bk_uni.curriculum_regulations WHERE curriculum_id = '$X')"
exp student_plan_courses "SELECT * FROM bk_uni.student_plan_courses WHERE curriculum_id = '$X'"
exp profiles "SELECT user_id, curriculum_id, target_specialization_id FROM bk_uni.student_profiles WHERE curriculum_id = '$X'"
# Nạp lại trong MỘT transaction: lỗi ở bất kỳ bảng nào thì không để lại dữ liệu dở dang.
psql -X -q -v ON_ERROR_STOP=1 -d bk_uni_lab <<SQL >>"$out" 2>&1
BEGIN;
SET LOCAL search_path = bk_uni;
\copy curricula FROM '$work_win/curricula.csv' WITH (FORMAT csv)
\copy curriculum_specializations FROM '$work_win/curriculum_specializations.csv' WITH (FORMAT csv)
\copy course_groups FROM '$work_win/course_groups.csv' WITH (FORMAT csv)
\copy course_categories FROM '$work_win/course_categories.csv' WITH (FORMAT csv)
\copy curriculum_courses FROM '$work_win/curriculum_courses.csv' WITH (FORMAT csv)
\copy course_group_members FROM '$work_win/course_group_members.csv' WITH (FORMAT csv)
\copy course_category_members FROM '$work_win/course_category_members.csv' WITH (FORMAT csv)
\copy course_relations FROM '$work_win/course_relations.csv' WITH (FORMAT csv)
\copy curriculum_regulations FROM '$work_win/curriculum_regulations.csv' WITH (FORMAT csv)
\copy student_regulation_statuses FROM '$work_win/student_regulation_statuses.csv' WITH (FORMAT csv)
\copy student_plan_courses FROM '$work_win/student_plan_courses.csv' WITH (FORMAT csv)
CREATE TEMP TABLE restored_profiles (user_id uuid, curriculum_id uuid, target_specialization_id uuid) ON COMMIT DROP;
\copy restored_profiles FROM '$work_win/profiles.csv' WITH (FORMAT csv)
UPDATE student_profiles p SET curriculum_id = r.curriculum_id, target_specialization_id = r.target_specialization_id
FROM restored_profiles r WHERE p.user_id = r.user_id;
COMMIT;
SQL
log "$(printf '  %-58s %7.2f s' "trích từ bản tạm + nạp lại trong 1 transaction" "$(awk -v a="$(date +%s.%N)" -v b="$t0" 'BEGIN{print a-b}')")"
fingerprint bk_uni_lab > "$work/fp_after.txt"
if diff "$work/fp_before.txt" "$work/fp_after.txt" >>"$out"; then
  log "  -> md5 của cả 12 nhóm dữ liệu trùng khớp với trước sự cố: phục hồi chính xác từng byte"
else
  log "  -> CÓ KHÁC BIỆT (xem diff ở trên)"
fi
log "  thay đổi hợp lệ sau sao lưu vẫn còn: $(lq bk_uni_lab "SELECT name FROM bk_uni.courses WHERE code = 'CO1007'")"

log ""
log "=== [F] So sánh: phục hồi TOÀN BỘ từ bản dump sẽ làm mất thay đổi hợp lệ sau thời điểm sao lưu ==="
log "  bản phục hồi toàn bộ: $(lq bk_uni_r1 "SELECT name FROM bk_uni.courses WHERE code = 'CO1007'")"

dropdb --if-exists bk_uni_r1; dropdb --if-exists bk_uni_r4; dropdb --if-exists bk_uni_scratch
rm -rf "$work"
