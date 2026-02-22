#!/usr/bin/env bash
set -euo pipefail

# 本番DB (Neon) からローカルDB (Docker) へコンテンツデータを同期するスクリプト
# ユーザー系テーブルは除外される

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# 除外テーブル（ユーザー関連、Prisma PascalCase）
EXCLUDE_TABLES=(
  '"User"' '"Account"' '"VerificationToken"'
  '"Favorite"' '"ArticleView"' '"UserDeletionLog"'
  '"UserCategoryPreference"' '"Comment"' '"UserSourcePreset"'
)

# .env.local -> .env の順で PROD_DATABASE_URL を読み込む
PROD_DATABASE_URL=""
for envfile in "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
  if [ -f "$envfile" ]; then
    db_line=$(grep -E '^[[:space:]]*PROD_DATABASE_URL[[:space:]]*=' "$envfile" | tail -n1 || true)
    if [ -n "$db_line" ]; then
      db_url="${db_line#*=}"
      # 先頭末尾の空白を除去
      db_url="$(echo -n "$db_url" | sed -E 's/^\s+|\s+$//g')"
      # 行末コメント（スペース+#）を除去（URL内の#は保持）
      db_url="$(echo -n "$db_url" | sed -E 's/[[:space:]]+#.*$//')"
      # 囲みのダブルクオートを除去
      db_url="$(echo -n "$db_url" | sed -E 's/^"|"$//g')"
      PROD_DATABASE_URL="$db_url"
      break
    fi
  fi
done

# 前提条件チェック
if ! command -v docker >/dev/null 2>&1; then
  echo "[sync] ERROR: docker コマンドが見つかりません。"
  exit 1
fi

if [ -z "$PROD_DATABASE_URL" ]; then
  echo "[sync] ERROR: PROD_DATABASE_URL が設定されていません。.env.local または .env に設定してください。"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q '^techtrend-postgres$'; then
  echo "[sync] ERROR: techtrend-postgres コンテナが起動していません。"
  echo "         docker compose -f docker-compose.dev.yml up -d で起動してください。"
  exit 1
fi

# 確認プロンプト
echo "[sync] 本番DB (Neon) からローカルDB (techtrend_dev) にコンテンツデータを同期します。"
echo "[sync] ユーザー系テーブル (${#EXCLUDE_TABLES[@]}個) は除外されます。"
echo "[sync] ローカルのコンテンツデータは上書きされます。"
printf "[sync] 続行しますか？ (y/N): "
read -r answer
if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
  echo "[sync] 中止しました。"
  exit 0
fi

# --exclude-table オプションを構築
EXCLUDE_OPTS=()
for table in "${EXCLUDE_TABLES[@]}"; do
  EXCLUDE_OPTS+=("--exclude-table=${table}")
done
EXCLUDE_OPTS+=("--exclude-table=_prisma_migrations")

# PG17 の pg_dump を検出
PG_DUMP=""
for candidate in \
  "/usr/lib/postgresql/17/bin/pg_dump" \
  "/opt/homebrew/opt/postgresql@17/bin/pg_dump" \
  "/usr/local/opt/postgresql@17/bin/pg_dump"; do
  if [ -x "$candidate" ]; then
    PG_DUMP="$candidate"
    break
  fi
done
# PATH上のpg_dumpをバージョン確認付きでフォールバック
if [ -z "$PG_DUMP" ] && command -v pg_dump >/dev/null 2>&1; then
  PG_DUMP_VER=$(pg_dump --version | grep -oP '\d+' | head -1)
  if [ "$PG_DUMP_VER" = "17" ]; then
    PG_DUMP="$(command -v pg_dump)"
  fi
fi
if [ -z "$PG_DUMP" ]; then
  echo "[sync] ERROR: pg_dump 17 が見つかりません。postgresql-client-17 をインストールしてください。"
  exit 1
fi

# TRUNCATE 前に本番DBへの接続を確認
echo "[sync] 本番DBへの接続を確認中..."
if ! "$PG_DUMP" "$PROD_DATABASE_URL" --format=custom --schema-only 2>/dev/null | head -c 1 > /dev/null; then
  echo "[sync] ERROR: 本番DBに接続できません。PROD_DATABASE_URL を確認してください。"
  exit 1
fi

# 除外テーブル以外を TRUNCATE CASCADE でクリア
echo "[sync] ローカルのコンテンツテーブルをクリア中..."
EXCLUDE_PATTERN=$(printf "|%s" "${EXCLUDE_TABLES[@]}" | sed 's/^|//' | sed "s/'//g; s/\"//g")
docker exec techtrend-postgres psql -U postgres -d techtrend_dev -t -A -c "
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT SIMILAR TO '(${EXCLUDE_PATTERN}|_prisma_migrations)'
" | while read -r tbl; do
    # テーブル名が安全な文字のみで構成されていることを確認
    if [[ ! "$tbl" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
      echo "[sync] WARNING: 不正なテーブル名をスキップ: $tbl"
      continue
    fi
    docker exec techtrend-postgres \
      psql -U postgres -d techtrend_dev -q \
      -c "TRUNCATE TABLE public.\"${tbl}\" CASCADE;" 2>/dev/null || true
  done

echo "[sync] pg_dump を実行中..."

# パイプアプローチ: pg_dump (PG17) | docker exec pg_restore (PG17コンテナ)
# --clean なし: 事前にTRUNCATE済みなのでデータ挿入のみ
"$PG_DUMP" "$PROD_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  "${EXCLUDE_OPTS[@]}" \
| docker exec -i techtrend-postgres pg_restore \
  --no-owner \
  --no-privileges \
  --data-only \
  --disable-triggers \
  --single-transaction \
  -U postgres \
  -d techtrend_dev

echo "[sync] リストア完了。Prisma Client を再生成中..."
cd "$ROOT_DIR" && npx prisma generate

echo "[sync] 同期が完了しました。"
