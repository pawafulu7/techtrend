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

  # ホストが空（UNIX ソケット）か、複数ホストか、ポートがあればそのまま返す。[IPv6] は ]: の後にポートがある
  if [ -z "$hostport" ] || [[ "$hostport" == *,* ]] || [[ "$hostport" == \[*\]:* ]] || { [[ "$hostport" != \[* ]] && [[ "$hostport" == *:* ]]; }; then
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
