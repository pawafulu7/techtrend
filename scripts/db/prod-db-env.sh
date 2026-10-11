#!/usr/bin/env bash
# 本番DB (Neon) の接続URL PROD_DATABASE_URL を読み込む共通処理。source して使う。
# 優先順位: 既に設定済みの環境変数 > .env.local > .env
# URL にはパスワードが含まれるため、値は出力しない。
# URL にポートが無ければ 5432 を補う。Ubuntu の psql / pg_dump（postgresql-common のラッパー）は、
# ポートの無い URL に手元のクラスタのポートを当てはめ、Neon に繋がらずにタイムアウトする。
# 本番に繋ぐコマンドの出力は prod_db_run_masked で流し、接続先（ホスト・IP・ロール・DB 名）を伏せる。

PROD_DB_ENV_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# URL を scheme / userinfo（末尾の @ を含む）/ hostport / tail（パス以降）に分け、
# _PROD_DB_URL_* に入れる。ホスト部は最初の / か ? まで、認証情報は最後の @ までとする
_prod_db_split_url() {
  local url="$1" rest authority
  _PROD_DB_URL_SCHEME="${url%%://*}"
  rest="${url#*://}"
  authority="${rest%%[/?]*}"
  _PROD_DB_URL_TAIL="${rest:${#authority}}"
  _PROD_DB_URL_USERINFO=""
  _PROD_DB_URL_HOSTPORT="$authority"
  if [[ "$authority" == *@* ]]; then
    _PROD_DB_URL_USERINFO="${authority%@*}@"
    _PROD_DB_URL_HOSTPORT="${authority##*@}"
  fi
}

# URL のホスト部にポートが無ければ :5432 を補って出力する
with_default_port() {
  local url="$1"
  case "$url" in
    *://*) ;;
    *) printf '%s' "$url"; return 0 ;;
  esac

  _prod_db_split_url "$url"
  local scheme="$_PROD_DB_URL_SCHEME" userinfo="$_PROD_DB_URL_USERINFO"
  local hostport="$_PROD_DB_URL_HOSTPORT" tail="$_PROD_DB_URL_TAIL"

  # ホストが空（UNIX ソケット）か、ポートがあればそのまま返す。[IPv6] は ]: の後にポートがある
  if [ -z "$hostport" ] || [[ "$hostport" == \[*\]:* ]] || { [[ "$hostport" != \[* ]] && [[ "$hostport" == *:* ]]; }; then
    printf '%s' "$url"
    return 0
  fi

  printf '%s' "${scheme}://${userinfo}${hostport}:5432${tail}"
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

# sed -E の正規表現として文字どおりに一致させるため、メタ文字を逃がす（区切りは #）
_prod_db_sed_escape() {
  printf '%s' "$1" | sed -E 's/[][\\/.^$*+?(){}|#]/\\&/g'
}

# PROD_DATABASE_URL の接続先（ホストと、その名前解決の IP・ロール・DB 名）を伏せる sed の式を出力する
prod_db_mask_expr() {
  local url="${PROD_DATABASE_URL:-}"
  case "$url" in
    *://*) ;;
    *) return 0 ;;
  esac

  _prod_db_split_url "$url"
  local host="$_PROD_DB_URL_HOSTPORT" user="${_PROD_DB_URL_USERINFO%@}" db
  user="${user%%:*}"
  db="${_PROD_DB_URL_TAIL#/}"
  db="${db%%\?*}"
  [[ "$_PROD_DB_URL_TAIL" == /* ]] || db=""
  # ポートを外す（[IPv6]:port と host:port）
  if [[ "$host" == \[* ]]; then
    host="${host%%]*}"
    host="${host#[}"
  else
    host="${host%%:*}"
  fi

  local expr="" ip
  # 長い値から先に伏せる（ロール名が DB 名を含む場合など）
  if [ -n "$host" ]; then
    expr+="s#$(_prod_db_sed_escape "$host")#<prod-db-host>#g;"
    if command -v getent >/dev/null 2>&1; then
      while read -r ip; do
        [ -n "$ip" ] && expr+="s#$(_prod_db_sed_escape "$ip")#<prod-db-ip>#g;"
      done < <(getent ahosts "$host" 2>/dev/null | awk '{print $1}' | sort -u)
    fi
  fi
  [ -n "$user" ] && expr+="s#$(_prod_db_sed_escape "$user")#<prod-db-user>#g;"
  [ -n "$db" ] && expr+="s#$(_prod_db_sed_escape "$db")#<prod-db-name>#g;"
  printf '%s' "$expr"
}

# 標準入力を、本番の接続先を伏せて標準出力へ流す
prod_db_mask() {
  local expr
  expr="$(prod_db_mask_expr)"
  if [ -z "$expr" ]; then
    cat
    return 0
  fi
  # GNU sed は -u で行ごとに流す（進捗の表示を溜めない）
  if sed -u -n '' </dev/null 2>/dev/null; then
    sed -u -E "$expr"
  else
    sed -E "$expr"
  fi
}

# コマンドを実行し、標準出力と標準エラーの両方で本番の接続先を伏せる。終了コードはコマンドのものを返す
prod_db_run_masked() {
  # 標準エラーは fd 3 経由で伏せて標準エラーへ、標準出力は外側のパイプで伏せる。
  # 括弧の中はコマンドの終了コードで抜ける（set -e と pipefail のときは、その値でスクリプトが終わる）
  ( "$@" 2>&1 1>&3 3>&- | prod_db_mask >&2; exit "${PIPESTATUS[0]}" ) 3>&1 | prod_db_mask
  return "${PIPESTATUS[0]}"
}
