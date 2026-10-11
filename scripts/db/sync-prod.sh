#!/usr/bin/env bash
set -euo pipefail

# 本番DB (Neon) からローカルDB (Docker) へコンテンツデータを同期するスクリプト
# ユーザー系テーブルは除外される

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# 除外テーブル（ユーザー関連、Prisma PascalCase）
EXCLUDE_TABLES=(
  '"User"' '"Account"' '"Session"' '"Verification"'
  '"Favorite"' '"ArticleView"' '"UserDeletionLog"'
  '"UserCategoryPreference"' '"Comment"' '"UserSourcePreset"'
)

# 環境変数 -> .env.local -> .env の順で PROD_DATABASE_URL を読み込む
# shellcheck source=scripts/db/prod-db-env.sh
source "$ROOT_DIR/scripts/db/prod-db-env.sh"

# 前提条件チェック
if ! command -v docker >/dev/null 2>&1; then
  echo "[sync] ERROR: docker コマンドが見つかりません。"
  exit 1
fi

load_prod_database_url || exit 1

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
  PG_DUMP_VER=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
  if [ "$PG_DUMP_VER" = "17" ]; then
    PG_DUMP="$(command -v pg_dump)"
  fi
fi
if [ -z "$PG_DUMP" ]; then
  echo "[sync] ERROR: pg_dump 17 が見つかりません。postgresql-client-17 をインストールしてください。"
  exit 1
fi

# パスワードをCLI引数に渡さないようPGPASSWORDを設定
# （URL のパスワードは %XX でエンコードされているので、復号してから渡す）
export PGPASSWORD
# コマンド置換は末尾の改行を落とすので、番兵の x を付けて受け取り、後で外す（%0A で終わるパスワードのため）
PGPASSWORD="$(prod_db_url_password "$PROD_DATABASE_URL" && printf x)"
PGPASSWORD="${PGPASSWORD%x}"
PG_CONN_NOPASS="$(prod_db_url_without_password "$PROD_DATABASE_URL")"

# pg_dump のエラー出力には接続先が入るため、画面には出さずにファイルへ保存する。
# 保存先は TRUNCATE の前に作る（作れずに止まったとき、ローカルのデータを消した後にならないように）
DUMP_STDERR_LOG="$(umask 077 && mkdir -p "$ROOT_DIR/.workflow/tmp/prod-db" && mktemp "$ROOT_DIR/.workflow/tmp/prod-db/$(date +%Y%m%d-%H%M%S)-pg_dump-XXXXXX")"

# TRUNCATE 前に本番DBへの接続を確認
echo "[sync] 本番DBへの接続を確認中..."
if ! "$PG_DUMP" "$PG_CONN_NOPASS" --format=custom --schema-only > /dev/null 2>&1; then
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
# pg_dump のエラー出力は、TRUNCATE の前に作った DUMP_STDERR_LOG に保存する
if ! "$PG_DUMP" "$PG_CONN_NOPASS" \
  --format=custom \
  --no-owner \
  --no-privileges \
  "${EXCLUDE_OPTS[@]}" \
  2>"$DUMP_STDERR_LOG" \
| docker exec -i techtrend-postgres pg_restore \
  --no-owner \
  --no-privileges \
  --data-only \
  --disable-triggers \
  --single-transaction \
  -U postgres \
  -d techtrend_dev; then
  echo "[sync] ERROR: pg_dump または pg_restore が失敗しました。pg_dump の出力 $(grep -c '' "$DUMP_STDERR_LOG" || true) 行は ${DUMP_STDERR_LOG#"$ROOT_DIR"/} に保存しました。"
  exit 1
fi

echo "[sync] リストア完了。Prisma Client を再生成中..."
cd "$ROOT_DIR" && npx prisma generate

echo "[sync] 同期が完了しました。"
