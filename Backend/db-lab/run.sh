#!/usr/bin/env bash
# Chạy một kịch bản SQL trong db-lab/sql lên DB chính (Supabase) và lưu kết quả vào results/.
# Dùng: bash db-lab/run.sh 41-storage [hau-to]   -> results/41-storage[-hau-to].txt
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$here/../.env"; set +a
export PGPASSWORD="$DB_PASSWORD" PGSSLMODE=require PGOPTIONS="-c search_path=bk_uni,public,extensions"
mkdir -p "$here/results"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -X -v ON_ERROR_STOP=1 -e \
  -f "$here/sql/$1.sql" 2>&1 | tee "$here/results/$1${2:+-$2}.txt"
