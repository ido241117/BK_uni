#!/usr/bin/env bash
# 4.5 Point-In-Time Recovery trên PostgreSQL local (postgres/postgres, port 5432).
# Dùng: bash db-lab/pitr.sh   -> results/45-pitr.txt
#
# Không sửa cấu hình server 5432: WAL được lấy bằng pg_receivewal qua replication slot (thay cho archive_mode),
# base backup bằng pg_basebackup. Bản phục hồi chạy trên một instance TẠM ở port 5499, được tắt và xóa
# ngay trong script (trap EXIT), cùng với replication slot và database thử nghiệm bk_uni_pitr.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/backups/pitr"; out="$here/results/45-pitr.txt"
base="$root/base"; wal="$root/wal"; data="$root/restored"
SLOT=bk_lab_pitr; PORT_TMP=5499
export PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGSSLMODE=disable PGCLIENTENCODING=UTF8
win() { cygpath -m "$1"; }
log() { echo "$*" | tee -a "$out"; }
lq() { psql -X -q -At -v ON_ERROR_STOP=1 "$@"; }
now() { date +%s.%N; }
since() { awk -v a="$(now)" -v b="$1" 'BEGIN{printf "%.2f", a-b}'; }

receiver_pid=""
cleanup() {
  [ -f "$data/postmaster.pid" ] && pg_ctl -D "$(win "$data")" stop -m fast -w >/dev/null 2>&1
  [ -n "$receiver_pid" ] && kill "$receiver_pid" 2>/dev/null && wait "$receiver_pid" 2>/dev/null
  lq -d postgres -c "SELECT pg_drop_replication_slot('$SLOT') FROM pg_replication_slots WHERE slot_name = '$SLOT'" >/dev/null 2>&1
  dropdb --if-exists bk_uni_pitr >/dev/null 2>&1
  rm -rf "$root"
}
trap cleanup EXIT
cleanup; mkdir -p "$wal" "$here/results"; : > "$out"

log "=== [0] Chuẩn bị: database bk_uni_pitr (bản sao Supabase), WAL streaming qua replication slot ==="
createdb bk_uni_pitr
lq -d bk_uni_pitr -c "CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions"
pg_restore -d bk_uni_pitr --no-owner --no-privileges "$here/backups/bk_uni_after_lab.dump"
pg_receivewal -D "$(win "$wal")" --slot "$SLOT" --create-slot --if-not-exists >/dev/null 2>&1
pg_receivewal -D "$(win "$wal")" --slot "$SLOT" --synchronous --no-loop >/dev/null 2>&1 &
receiver_pid=$!
sleep 2
lq -d postgres -c "SELECT '  slot: ' || slot_name || ' (' || slot_type || '), active = ' || active FROM pg_replication_slots WHERE slot_name = '$SLOT'" | tee -a "$out"

log ""
log "=== [1] Base backup (pg_basebackup, toàn cluster, -X stream) ==="
t0=$(now)
pg_basebackup -D "$(win "$base")" -X stream -c fast -l bk_lab_pitr >/dev/null 2>&1
log "  thời gian: $(since "$t0") s, kích thước: $(du -sh "$base" | cut -f1)"
log "  $(grep -E '^(START WAL LOCATION|CHECKPOINT LOCATION|START TIME)' "$base/backup_label" | tr '\n' ';')"

log ""
log "=== [2] Hoạt động bình thường SAU base backup (phải được giữ lại khi phục hồi) ==="
X=$(lq -d bk_uni_pitr -c "SELECT id FROM bk_uni.curricula WHERE code = 'CS-2023-KHMT'")
lq -d bk_uni_pitr -c "UPDATE bk_uni.courses SET name = name || ' [edited after base backup]' WHERE code = 'CO1007'"
lq -d bk_uni_pitr -c "INSERT INTO bk_uni.course_opened_semesters (course_id, semester_code) SELECT id, '262' FROM bk_uni.courses WHERE code = 'CO1007' ON CONFLICT DO NOTHING"
fp() { lq -p "$1" -d bk_uni_pitr -F' ' -c "
  SELECT (SELECT count(*) FROM bk_uni.curricula WHERE id = '$X') AS ctdt,
         (SELECT count(*) FROM bk_uni.curriculum_courses WHERE curriculum_id = '$X') AS mon,
         (SELECT count(*) FROM bk_uni.student_profiles WHERE curriculum_id = '$X') AS sinh_vien,
         (SELECT md5(string_agg(t::text, '|' ORDER BY id)) FROM bk_uni.curriculum_courses t WHERE curriculum_id = '$X') AS md5_mon,
         (SELECT name LIKE '%[edited after base backup]' FROM bk_uni.courses WHERE code = 'CO1007') AS giu_sua_doi,
         (SELECT count(*) FROM bk_uni.course_opened_semesters o JOIN bk_uni.courses c ON c.id = o.course_id
           WHERE c.code = 'CO1007' AND o.semester_code = '262') AS hk_262"; }
log "  trạng thái tốt (ctdt | số môn | số SV | md5 môn | giữ sửa đổi | hk 262): $(fp 5432)"
sleep 1

log ""
log "=== [3] Sự cố: DELETE nhầm CTĐT CS-2023-KHMT ==="
lq -d bk_uni_pitr -c "TRUNCATE bk_uni.audit_log"
lq -d bk_uni_pitr -c "DELETE FROM bk_uni.curricula WHERE id = '$X'"
lq -d bk_uni_pitr -c "INSERT INTO bk_uni.course_opened_semesters (course_id, semester_code) SELECT id, '263' FROM bk_uni.courses WHERE code = 'CO1007' ON CONFLICT DO NOTHING"
read -r BAD_TXID BAD_AT < <(lq -d bk_uni_pitr -F' ' -c "SELECT txid, occurred_at FROM bk_uni.audit_log WHERE table_name = 'curricula' AND operation = 'DELETE'")
log "  audit_log cho biết transaction gây sự cố: txid = $BAD_TXID, lúc $BAD_AT"
log "  (sau sự cố còn một thay đổi khác: mở thêm học kỳ 263 cho CO1007 -> sẽ KHÔNG có trong bản PITR)"
log "  trạng thái sau sự cố: $(fp 5432)"

# Đảm bảo WAL tới thời điểm hiện tại đã về tới pg_receivewal rồi mới dừng nó.
target=$(lq -d postgres -c "SELECT pg_current_wal_lsn()")
lq -d postgres -c "SELECT pg_switch_wal()" >/dev/null
for _ in $(seq 1 30); do
  done_=$(lq -d postgres -c "SELECT coalesce(restart_lsn >= '$target', false) FROM pg_replication_slots WHERE slot_name = '$SLOT'")
  [ "$done_" = "t" ] && break; sleep 1
done
kill "$receiver_pid" 2>/dev/null; wait "$receiver_pid" 2>/dev/null; receiver_pid=""
log "  WAL đã nhận: $(ls "$wal" | wc -l) segment, $(du -sh "$wal" | cut -f1) (tới LSN $target)"

log ""
log "=== [4] Phục hồi: base backup + replay WAL tới NGAY TRƯỚC transaction $BAD_TXID ==="
cp -r "$base" "$data"
for partial in "$wal"/*.partial; do [ -e "$partial" ] && mv "$partial" "${partial%.partial}"; done
rm -f "$data/postmaster.pid" "$data/standby.signal"
cat >> "$data/postgresql.auto.conf" <<CONF
# --- cấu hình phục hồi (instance tạm) ---
port = $PORT_TMP
restore_command = 'copy "$(cygpath -w "$wal" | sed 's/\\/\\\\/g')\\\\%f" "%p"'
recovery_target_xid = '$BAD_TXID'
recovery_target_inclusive = off
recovery_target_action = 'promote'
archive_mode = off
logging_collector = off
CONF
touch "$data/recovery.signal"
t0=$(now)
log "  $(grep restore_command "$data/postgresql.auto.conf")"
pg_ctl -D "$(win "$data")" -l "$(win "$root/restored.log")" -o "-p $PORT_TMP" start -w -t 60 >/dev/null 2>&1
for _ in $(seq 1 60); do
  [ -f "$data/postmaster.pid" ] || break   # instance đã chết: không chờ nữa
  [ "$(lq -p $PORT_TMP -d postgres -c 'SELECT pg_is_in_recovery()' 2>/dev/null)" = "f" ] && break; sleep 1
done
log "  khởi động + replay + promote: $(since "$t0") s"
grep -E "starting point-in-time recovery|restored log file|recovery stopping|redo done|selected new timeline|archive recovery complete|FATAL" "$root/restored.log" \
  | sed -E 's/^[0-9-]+ [0-9:.]+ [+0-9A-Z]+ \[[0-9]+\] //' | sed 's/^/    log: /' | tee -a "$out"

log ""
log "=== [5] Kiểm tra bản PITR (port $PORT_TMP) ==="
log "  bản PITR      : $(fp $PORT_TMP)"
log "  (so với trạng thái tốt ở bước [2]; hk 263 thêm sau sự cố không có: $(lq -p $PORT_TMP -d bk_uni_pitr -c "SELECT count(*) FROM bk_uni.course_opened_semesters o JOIN bk_uni.courses c ON c.id = o.course_id WHERE c.code = 'CO1007' AND o.semester_code = '263'") dòng)"
log "  timeline mới: $(lq -p $PORT_TMP -d postgres -c "SELECT timeline_id FROM pg_control_checkpoint()")"
