#!/usr/bin/env bash
set -euo pipefail

# 開発DBバックアップスクリプト
# 優先: Dockerコンテナ(techtrend-postgres) -> ローカルpg_dump(DATABASE_URL必要)

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/dev_backup_${TIMESTAMP}.sql.gz"
DB_NAME=""

mkdir -p "$BACKUP_DIR"

echo "[backup] Output: $OUT_FILE"

# 1) Dockerコンテナ優先（docker compose devのPostgres）
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^techtrend-postgres$'; then
  DB_NAME="techtrend_dev"
  OUT_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"
  echo "[backup] Using docker exec on techtrend-postgres (db=$DB_NAME)"
  echo "[backup] Output: $OUT_FILE"
  # 標準出力へダンプしてgzip圧縮
  docker exec techtrend-postgres pg_dump -U postgres -d "$DB_NAME"  | gzip -c > "$OUT_FILE"
  echo "[backup] Done via docker"
  exit 0
fi

# 2) ローカルpg_dump + .envのDATABASE_URL
if command -v pg_dump >/dev/null 2>&1; then
  # .env から DATABASE_URL のみを安全に抽出（行内コメントや引用を考慮）
  if [ -f "$ROOT_DIR/.env" ]; then
    db_line=$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ROOT_DIR/.env" | tail -n1 || true)
    if [ -n "$db_line" ]; then
      db_url="${db_line#*=}"
      # 行末コメントを除去
      db_url="${db_url%%#*}"
      # 先頭末尾の空白を除去
      db_url="$(echo -n "$db_url" | sed -E 's/^\s+|\s+$//g')"
      # 囲みのダブルクオートを除去
      db_url="$(echo -n "$db_url" | sed -E 's/^"|"$//g')"
      export DATABASE_URL="$db_url"
    fi
  fi

  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[backup] ERROR: DATABASE_URL not set. Please set it in .env or run via docker."
    exit 1
  fi

  # DB名を抽出
  db_path="${DATABASE_URL#*//}"
  db_path="${db_path#*/}"
  DB_NAME="${db_path%%\?*}"
  DB_NAME="${DB_NAME##*/}"

  # test DB の誤バックアップを防止（必要なら BACKUP_ALLOW_TEST=1 を指定）
  if echo "$DB_NAME" | grep -qi 'test' && [ "${BACKUP_ALLOW_TEST:-0}" != "1" ]; then
    echo "[backup] ERROR: Target database appears to be a test DB (name=$DB_NAME)."
    echo "         If this is intentional, set BACKUP_ALLOW_TEST=1 and retry."
    exit 1
  fi

  OUT_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql.gz"
  echo "[backup] Using local pg_dump with DATABASE_URL (db=$DB_NAME)"
  echo "[backup] Output: $OUT_FILE"
  pg_dump "$DATABASE_URL" | gzip -c > "$OUT_FILE"
  echo "[backup] Done via local pg_dump"
  exit 0
fi

echo "[backup] ERROR: Neither docker (techtrend-postgres) nor pg_dump is available."
exit 1
