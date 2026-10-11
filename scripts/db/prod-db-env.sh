#!/usr/bin/env bash
# 本番DB (Neon) の接続URL PROD_DATABASE_URL を読み込む共通処理。source して使う。
# 優先順位: 既に設定済みの環境変数 > .env.local > .env
# URL にはパスワードが含まれるため、値は出力しない。
# URL にポートが無ければ 5432 を補う。Ubuntu の psql / pg_dump（postgresql-common のラッパー）は、
# ポートの無い URL に手元のクラスタのポートを当てはめ、本番に繋がらずにタイムアウトする。

PROD_DB_ENV_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# URL のホスト部にポートが無ければ :5432 を補って出力する
with_default_port() {
  local url="$1"
  case "$url" in
    *://*) ;;
    *) printf '%s' "$url"; return 0 ;;
  esac

  local scheme="${url%%://*}"
  local rest="${url#*://}"
  # ホスト部は最初の / か ? まで。認証情報（user:pass@）は最後の @ までとする
  local authority="${rest%%[/?]*}"
  local tail="${rest:${#authority}}"
  local userinfo="" hostport="$authority"
  if [[ "$authority" == *@* ]]; then
    userinfo="${authority%@*}@"
    hostport="${authority##*@}"
  fi

  # : の後が空のポート（host: や [::1]:）は、ポートが無いのと同じなので 5432 を入れる
  if [[ "$hostport" == *: ]] && [[ "$hostport" != *,* ]]; then
    printf '%s' "${scheme}://${userinfo}${hostport}5432${tail}"
    return 0
  fi

  # ホストが空（UNIX ソケット）か、複数ホストか、ポートがあればそのまま返す。[IPv6] は ]: の後にポートがある
  if [ -z "$hostport" ] || [[ "$hostport" == *,* ]] || [[ "$hostport" == \[*\]:* ]] || { [[ "$hostport" != \[* ]] && [[ "$hostport" == *:* ]]; }; then
    printf '%s' "$url"
    return 0
  fi

  printf '%s' "${scheme}://${userinfo}${hostport}:5432${tail}"
}

# URL のパスワード（user:pass@ の pass）を、%XX を復号して出力する。パスワードが無ければ空
prod_db_url_password() {
  local url="$1"
  [[ "$url" == *://* ]] || return 0
  local rest="${url#*://}"
  local authority="${rest%%[/?]*}"
  [[ "$authority" == *@* ]] || return 0
  local userinfo="${authority%@*}"
  [[ "$userinfo" == *:* ]] || return 0
  _prod_db_percent_decode "${userinfo#*:}"
}

# URL からパスワードを除いて出力する（user:pass@ を user@ にする）。パスワードはコマンドの引数に載せず PGPASSWORD で渡す
prod_db_url_without_password() {
  local url="$1"
  if [[ "$url" != *://* ]]; then
    printf '%s' "$url"
    return 0
  fi
  local scheme="${url%%://*}"
  local rest="${url#*://}"
  local authority="${rest%%[/?]*}"
  local tail="${rest:${#authority}}"
  if [[ "$authority" != *@* ]]; then
    printf '%s' "$url"
    return 0
  fi
  local userinfo="${authority%@*}"
  printf '%s' "${scheme}://${userinfo%%:*}@${authority##*@}${tail}"
}

# %XX を 1 バイトに戻す。libpq と同じく + は空白に変えない
_prod_db_percent_decode() {
  local s="$1" out="" byte
  while [ -n "$s" ]; do
    if [[ "$s" =~ ^%([0-9A-Fa-f]{2}) ]]; then
      printf -v byte '%b' "\\x${BASH_REMATCH[1]}"
      out+="$byte"
      s="${s:3}"
    else
      out+="${s:0:1}"
      s="${s:1}"
    fi
  done
  printf '%s' "$out"
}

# 本番に接続するコマンドの出力のうち、画面に出してよい行だけを通す（許可リスト）。
# 生の出力から接続先を置換で伏せる方式は、表記の揺れや名前解決の結果で漏れるため使わない。
#   - 名前=数値（真偽・null）の行。件数や成否を出すときはこの形で出力する
#   - マイグレーション名の行（Prisma の一覧の罫線は外す）。名前は 8 桁の日付で始まる（prisma/migrations には
#     14 桁の日時のほか、20250921_baseline・20251012_105500_xxx の形もある）
#   - Prisma migrate の定型文
prod_db_filter_output() {
  LC_ALL=C sed -E 's/^[[:space:]└├│─]*//; s/[[:space:]]+$//' | LC_ALL=C awk '
    BEGIN {
      fixed["Database schema is up to date!"] = 1
      fixed["No pending migrations to apply."] = 1
      fixed["All migrations have been successfully applied."] = 1
      fixed["The following migration(s) have been applied:"] = 1
      fixed["Following migration have not yet been applied:"] = 1
      fixed["Following migrations have not yet been applied:"] = 1
      fixed["Following migration have failed:"] = 1
      fixed["Following migrations have failed:"] = 1
      fixed["No migration found in prisma/migrations"] = 1
      fixed["Script executed successfully."] = 1
    }
    ($0 in fixed) ||
    /^[A-Za-z_][A-Za-z0-9_]*=(-?[0-9]+(\.[0-9]+)?|true|false|null)$/ ||
    /^[0-9]{8}[0-9]*_[A-Za-z0-9_]+\/?$/ ||
    /^[0-9]+ migrations? found in prisma\/migrations$/ { print }
  '
}

# 出力に含まれるエラーコード（Prisma の P1001 など、Node の接続エラー）だけを空白区切りで出す
prod_db_error_codes() {
  { LC_ALL=C grep -oE '\bP[0-9]{4}\b|\b(ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN)\b' || true; } |
    sort -u | tr '\n' ' ' | sed -E 's/ $//'
}

# 本番に接続するコマンドを実行する。生の出力（stdout と stderr）は .workflow/tmp/prod-db/ に権限 600 で保存し、
# 画面には prod_db_filter_output を通した行と、成否・行数・エラーコードだけを出す。終了コードはコマンドのものを返す。
# 保存先は PROD_DB_LAST_LOG に入れる（呼び出し元が件数を数えるなど、表示せずに使うため）
prod_db_run() {
  local log_dir="${PROD_DB_LOG_DIR:-$PROD_DB_ENV_ROOT_DIR/.workflow/tmp/prod-db}"
  (umask 077 && mkdir -p "$log_dir")
  PROD_DB_LAST_LOG="$(umask 077 && mktemp "$log_dir/$(date +%Y%m%d-%H%M%S)-XXXXXX")"

  local status=0
  "$@" >"$PROD_DB_LAST_LOG" 2>&1 || status=$?

  local shown total shown_count codes summary
  shown="$(prod_db_filter_output <"$PROD_DB_LAST_LOG")"
  [ -n "$shown" ] && printf '%s\n' "$shown"
  total="$(grep -c '' "$PROD_DB_LAST_LOG" || true)"
  shown_count="$(printf '%s' "$shown" | grep -c '' || true)"
  summary="出力 ${total} 行（表示 ${shown_count} 行）。生の出力: ${PROD_DB_LAST_LOG#"$PROD_DB_ENV_ROOT_DIR"/}"
  if [ "$status" -eq 0 ]; then
    echo "[prod-db] 成功 (exit 0)。${summary}" >&2
  else
    codes="$(prod_db_error_codes <"$PROD_DB_LAST_LOG")"
    echo "[prod-db] 失敗 (exit ${status})${codes:+。エラーコード: ${codes}}。${summary}" >&2
  fi
  return "$status"
}

load_prod_database_url() {
  if [ -n "${PROD_DATABASE_URL:-}" ]; then
    PROD_DATABASE_URL="$(with_default_port "$PROD_DATABASE_URL")"
    return 0
  fi

  local envfile db_line db_url
  for envfile in "$PROD_DB_ENV_ROOT_DIR/.env.local" "$PROD_DB_ENV_ROOT_DIR/.env"; do
    if [ -f "$envfile" ]; then
      db_line=$(grep -E '^[[:space:]]*PROD_DATABASE_URL[[:space:]]*=' "$envfile" | tail -n1 || true)
      if [ -n "$db_line" ]; then
        db_url="${db_line#*=}"
        # 先頭末尾の空白を除去
        db_url="$(echo -n "$db_url" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
        # 行末コメント（スペース+#）を除去（URL内の#は保持）
        db_url="$(echo -n "$db_url" | sed -E 's/[[:space:]]+#.*$//')"
        # 囲みのダブルクオートを除去
        db_url="$(echo -n "$db_url" | sed -E 's/^"|"$//g')"
        PROD_DATABASE_URL="$(with_default_port "$db_url")"
        break
      fi
    fi
  done

  if [ -z "${PROD_DATABASE_URL:-}" ]; then
    echo "ERROR: PROD_DATABASE_URL が設定されていません。.env.local または .env に設定してください。" >&2
    return 1
  fi
}
