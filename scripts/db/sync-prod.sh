#!/usr/bin/env bash
set -euo pipefail

# 本番DB (Neon) からローカルDB (Docker) へコンテンツデータを同期するスクリプト
# ユーザー系テーブルは本番から持ってこない。ただし、消すテーブルを参照しているものは
# TRUNCATE ... CASCADE で一緒に空になる（確認の前に一覧を出す）
# 本番のデータをファイルに落としきってから、ローカルの TRUNCATE と書き込みを1つのトランザクションで行う。
# 途中で失敗したら元に戻るので、ローカルのテーブルが空のまま残らない
# 対象は public スキーマだけ（ops_backup などのバックアップの表は、ローカルで消さないので持ってくると重なる）

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

# 除外テーブル（ユーザー関連、Prisma PascalCase）
# SocialPostAuditLog は、操作したユーザーの ID・IP アドレス・User-Agent を持つ
EXCLUDE_TABLES=(
  '"User"' '"Account"' '"Session"' '"Verification"'
  '"Favorite"' '"ArticleView"' '"UserDeletionLog"'
  '"UserCategoryPreference"' '"Comment"' '"UserSourcePreset"'
  '"Inquiry"' '"SocialPostAuditLog"'
)

# 環境変数 -> .env.local -> .env の順で PROD_DATABASE_URL を読み込む
# shellcheck source=scripts/db/prod-db-env.sh
source "$ROOT_DIR/scripts/db/prod-db-env.sh"

container_running() {
  [ "$(docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}

# ローカルDBへの問い合わせ（-i を付けない。付けると while read の入力を読んでしまう）
local_query() {
  docker exec techtrend-postgres psql -X -q -t -A -v ON_ERROR_STOP=1 -U postgres -d techtrend_dev -c "$1"
}

# 前提条件チェック
if ! command -v docker >/dev/null 2>&1; then
  echo "[sync] ERROR: docker コマンドが見つかりません。"
  exit 1
fi

load_prod_database_url || exit 1

for container in techtrend-postgres techtrend-redis; do
  if ! container_running "$container"; then
    echo "[sync] ERROR: ${container} コンテナが起動していません。"
    echo "         docker compose -f docker-compose.dev.yml up -d で起動してください。"
    exit 1
  fi
done

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
# psql と pg_restore は、pg_dump と同じ場所のものを使う
PSQL="$(dirname "$PG_DUMP")/psql"
PG_RESTORE="$(dirname "$PG_DUMP")/pg_restore"
for tool in "$PSQL" "$PG_RESTORE"; do
  if [ ! -x "$tool" ]; then
    echo "[sync] ERROR: ${tool} が見つかりません。postgresql-client-17 をインストールしてください。"
    exit 1
  fi
done

# パスワードをCLI引数に渡さないようPGPASSWORDを設定
# （URL のパスワードは %XX でエンコードされているので、復号してから渡す）
export PGPASSWORD
# コマンド置換は末尾の改行を落とすので、番兵の x を付けて受け取り、後で外す（%0A で終わるパスワードのため）
PGPASSWORD="$(prod_db_url_password "$PROD_DATABASE_URL" && printf x)"
PGPASSWORD="${PGPASSWORD%x}"
PG_CONN_NOPASS="$(prod_db_url_without_password "$PROD_DATABASE_URL")"

# 本番に繋ぐコマンドのエラー出力には接続先が入るため、画面には出さずにファイルへ保存する。
# ローカルへの書き込みのエラー出力は、画面に出してよいので別のファイルに分ける
TMP_DIR="$ROOT_DIR/.workflow/tmp/prod-db"
(umask 077 && mkdir -p "$TMP_DIR")
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_STDERR_LOG="$(umask 077 && mktemp "$TMP_DIR/${TIMESTAMP}-pg_dump-XXXXXX")"
RESTORE_LOG="$(umask 077 && mktemp "$TMP_DIR/${TIMESTAMP}-restore-XXXXXX")"

# 本番で適用済みのマイグレーションがローカルに無いと、本番にだけある列を書き込めずに失敗する。
# 時間のかかるダンプの前に比べる（本番への接続の確認も兼ねる）
APPLIED_MIGRATIONS_SQL="SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"
echo "[sync] 本番とローカルのマイグレーションを比べています..."
if ! PROD_MIGRATIONS="$("$PSQL" "$PG_CONN_NOPASS" -X -q -t -A -v ON_ERROR_STOP=1 -c "$APPLIED_MIGRATIONS_SQL" 2>>"$DUMP_STDERR_LOG")"; then
  echo "[sync] ERROR: 本番DBに接続できません。PROD_DATABASE_URL を確認してください。出力 $(grep -c '' "$DUMP_STDERR_LOG" || true) 行は ${DUMP_STDERR_LOG#"$ROOT_DIR"/} に保存しました。"
  exit 1
fi
LOCAL_MIGRATIONS="$(local_query "$APPLIED_MIGRATIONS_SQL")"
# comm は並び順が同じでないと誤るので、DB の照合順序ではなく C の順に並べ直す
ONLY_PROD="$(LC_ALL=C comm -23 <(printf '%s\n' "$PROD_MIGRATIONS" | LC_ALL=C sort) <(printf '%s\n' "$LOCAL_MIGRATIONS" | LC_ALL=C sort))"
ONLY_LOCAL="$(LC_ALL=C comm -13 <(printf '%s\n' "$PROD_MIGRATIONS" | LC_ALL=C sort) <(printf '%s\n' "$LOCAL_MIGRATIONS" | LC_ALL=C sort))"
if [ -n "$ONLY_PROD" ]; then
  echo "[sync] ERROR: 本番で適用済みの次のマイグレーションが、ローカルDBに適用されていません。"
  printf '  %s\n' "${ONLY_PROD//$'\n'/$'\n'  }"
  echo "         main を取り込み、npx prisma migrate deploy でローカルDBに適用してから流してください。"
  exit 1
fi
if [ -n "$ONLY_LOCAL" ]; then
  echo "[sync] 注意: 次のマイグレーションはローカルDBにだけ適用されています。本番のデータが入らなければ元に戻して止まりますが、入った場合も、これらがデータを書き換えるものなら、その書き換えは本番のデータで消えます（必要なら同期の後に流し直してください）。"
  printf '  %s\n' "${ONLY_LOCAL//$'\n'/$'\n'  }"
fi

# 置き換えるテーブル（除外テーブルと _prisma_migrations 以外）
EXCLUDE_SQL_LIST="'_prisma_migrations'"
for table in "${EXCLUDE_TABLES[@]}"; do
  EXCLUDE_SQL_LIST+=",'${table//\"/}'"
done
TABLES_SQL="SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN (${EXCLUDE_SQL_LIST})"
# < <(...) の中の失敗は外に伝わらないので、先にコマンド置換で受け取る（失敗したら set -e で止まる）
LOCAL_TABLES="$(local_query "$TABLES_SQL ORDER BY 1")"
TRUNCATE_TARGETS=""
TARGET_COUNT=0
while read -r tbl; do
  [ -n "$tbl" ] || continue
  # テーブル名が安全な文字のみで構成されていることを確認
  if [[ ! "$tbl" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "[sync] ERROR: 扱えない名前のテーブルがあります: $tbl"
    exit 1
  fi
  TRUNCATE_TARGETS+="${TRUNCATE_TARGETS:+, }public.\"${tbl}\""
  TARGET_COUNT=$((TARGET_COUNT + 1))
done <<<"$LOCAL_TABLES"
if [ -z "$TRUNCATE_TARGETS" ]; then
  echo "[sync] ERROR: 置き換えるテーブルがローカルDBにありません。"
  exit 1
fi

# ローカルにだけあるテーブル（ローカルにだけ適用したマイグレーションで作ったものなど）は、消した後に何も入らない
if ! PROD_TABLES="$("$PSQL" "$PG_CONN_NOPASS" -X -q -t -A -v ON_ERROR_STOP=1 -c "$TABLES_SQL" 2>>"$DUMP_STDERR_LOG")"; then
  echo "[sync] ERROR: 本番DBのテーブルの一覧を取れませんでした。出力 $(grep -c '' "$DUMP_STDERR_LOG" || true) 行は ${DUMP_STDERR_LOG#"$ROOT_DIR"/} に保存しました。"
  exit 1
fi
LOCAL_ONLY_TABLES="$(LC_ALL=C comm -13 <(printf '%s\n' "$PROD_TABLES" | LC_ALL=C sort) <(printf '%s\n' "$LOCAL_TABLES" | LC_ALL=C sort) | paste -sd, - | sed 's/,/, /g')"

# 置き換えるテーブルの他に、TRUNCATE ... CASCADE で一緒に空になるもの（消すテーブルを外部キーで辿って参照しているもの）。
# 除外テーブルのほか、public 以外のスキーマの表も含む（スキーマ付きで出す）
CASCADED_TABLES="$(local_query "
  WITH RECURSIVE targets(oid) AS (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname NOT IN (${EXCLUDE_SQL_LIST})
  ), emptied(oid) AS (
    SELECT oid FROM targets
    UNION
    SELECT con.conrelid FROM pg_constraint con JOIN emptied e ON con.confrelid = e.oid
    WHERE con.contype = 'f'
  )
  SELECT string_agg(name, ', ' ORDER BY name) FROM (
    SELECT CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END AS name
    FROM emptied e JOIN pg_class c ON c.oid = e.oid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE e.oid NOT IN (SELECT oid FROM targets)
  ) cascaded
")"

# 確認プロンプト
echo "[sync] 本番DB (Neon) からローカルDB (techtrend_dev) にコンテンツデータを同期します。"
echo "[sync] ローカルの ${TARGET_COUNT} 個のテーブルを、本番のデータで置き換えます。"
if [ -n "$LOCAL_ONLY_TABLES" ]; then
  echo "[sync] 次のテーブルは本番に無いので、空のままになります: ${LOCAL_ONLY_TABLES}"
fi
if [ -n "$CASCADED_TABLES" ]; then
  echo "[sync] ユーザー系テーブル (${#EXCLUDE_TABLES[@]}個) は本番から持ってきませんが、次のテーブルは消すテーブルを参照しているため、一緒に空になります: ${CASCADED_TABLES}"
else
  echo "[sync] ユーザー系テーブル (${#EXCLUDE_TABLES[@]}個) は変えません。"
fi
echo "[sync] 最後に、開発用 Redis（techtrend-redis）の中身を消します。"
echo "[sync] 同期の間に開発サーバーやワーカーが書き込むと、古い値がキャッシュや埋め込みに残ることがあります。止めてから流すと確実です。"
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

# 本番のデータは権限 600 のファイルに落とし、終わったら消す
DUMP_FILE="$(umask 077 && mktemp "$TMP_DIR/${TIMESTAMP}-dump-XXXXXX")"
trap 'rm -f "$DUMP_FILE"' EXIT

echo "[sync] 本番DBのデータを取得中..."
if ! "$PG_DUMP" "$PG_CONN_NOPASS" \
  --format=custom \
  --schema=public \
  --data-only \
  --no-owner \
  --no-privileges \
  "${EXCLUDE_OPTS[@]}" \
  --file="$DUMP_FILE" \
  2>>"$DUMP_STDERR_LOG"; then
  echo "[sync] ERROR: pg_dump が失敗しました。ローカルDBは変えていません。出力 $(grep -c '' "$DUMP_STDERR_LOG" || true) 行は ${DUMP_STDERR_LOG#"$ROOT_DIR"/} に保存しました。"
  exit 1
fi
# この後は本番に繋がない。子のプロセスに本番のパスワードを渡さない
unset PGPASSWORD

# TRUNCATE と書き込みを1つのトランザクションで行う。pg_restore が失敗したら COMMIT を送らず、
# psql が接続を閉じたときに、開いたままのトランザクションは捨てられる
echo "[sync] ローカルDBを置き換え中（失敗したら元に戻します。終わるまで、開発サーバーの読み込みは待たされます）..."
if ! {
  echo 'BEGIN;'
  echo "TRUNCATE TABLE ${TRUNCATE_TARGETS} CASCADE;"
  "$PG_RESTORE" \
    --data-only \
    --disable-triggers \
    --no-owner \
    --no-privileges \
    --file=- \
    "$DUMP_FILE" &&
    echo 'COMMIT;'
} 2>>"$RESTORE_LOG" |
  docker exec -i techtrend-postgres psql -X -q -v ON_ERROR_STOP=1 -U postgres -d techtrend_dev \
    >/dev/null 2>>"$RESTORE_LOG"; then
  echo "[sync] ERROR: ローカルDBへの書き込みが失敗したので、元に戻しました。出力は ${RESTORE_LOG#"$ROOT_DIR"/} に保存しました。"
  grep -m 3 -i 'error' "$RESTORE_LOG" || true
  exit 1
fi
rm -f "$DUMP_FILE"

# 一覧・件数・ソースなどのキャッシュが、置き換える前のデータのまま残らないようにする。
# COMMIT の直後に消す（後の処理が失敗しても、古いキャッシュを残さないため）
echo "[sync] リストア完了。開発用 Redis の中身を消しています..."
if ! bash "$ROOT_DIR/scripts/db/clear-local-cache.sh"; then
  echo "[sync] ERROR: DB の同期は終わりましたが、キャッシュを消せませんでした。原因を直してから npm run db:cache:clear で消してください。"
  exit 1
fi

echo "[sync] Prisma Client を再生成中..."
cd "$ROOT_DIR" && npx prisma generate

echo "[sync] 同期が完了しました。開発サーバーのメモリ上のキャッシュ（ソース名などは最長5分）はすぐには消えないので、すぐ反映するには開発サーバーを再起動してください。"
