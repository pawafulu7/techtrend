#!/usr/bin/env bash
set -euo pipefail

# テストDBバックアップスクリプト
# 優先: Dockerコンテナ(techtrend-postgres-test) -> ローカルpg_dump(TEST_DATABASE_URL_HOST必要)

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

DB_NAME="techtrend_test"
OUT_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"

# 1) Docker のテストDBコンテナを優先
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^techtrend-postgres-test$'; then
  echo "[backup:test] Using docker exec on techtrend-postgres-test (db=$DB_NAME)"
  echo "[backup:test] Output: $OUT_FILE"
  docker exec techtrend-postgres-test pg_dump -U postgres -d "$DB_NAME" | gzip -c > "$OUT_FILE"
  echo "[backup:test] Done via docker"
  exit 0
fi

# 2) ローカルpg_dump + .envの TEST_DATABASE_URL_HOST
if command -v pg_dump >/dev/null 2>&1; then
  TEST_DB_URL=""
  if [ -f "$ROOT_DIR/.env" ]; then
    db_line=$(grep -E '^[[:space:]]*TEST_DATABASE_URL_HOST[[:space:]]*=' "$ROOT_DIR/.env" | tail -n1 || true)
    if [ -n "$db_line" ]; then
      val="${db_line#*=}"
      val="${val%%#*}"
      val="$(echo -n "$val" | sed -E 's/^\s+|\s+$//g')"
      val="$(echo -n "$val" | sed -E 's/^"|"$//g')"
      TEST_DB_URL="$val"
    fi
  fi

  if [ -z "${TEST_DB_URL:-}" ]; then
    echo "[backup:test] ERROR: TEST_DATABASE_URL_HOST not set. Please set it in .env or run via docker."
    exit 1
  fi

  echo "[backup:test] Using local pg_dump with TEST_DATABASE_URL_HOST"
  echo "[backup:test] Output: $OUT_FILE"
  pg_dump "$TEST_DB_URL" | gzip -c > "$OUT_FILE"
  echo "[backup:test] Done via local pg_dump"
  exit 0
fi

echo "[backup:test] ERROR: Neither docker (techtrend-postgres-test) nor pg_dump is available."
exit 1

