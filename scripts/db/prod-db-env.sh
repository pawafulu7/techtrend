#!/usr/bin/env bash
# 本番DB (Neon) の接続URL PROD_DATABASE_URL を読み込む共通処理。source して使う。
# 優先順位: 既に設定済みの環境変数 > .env.local > .env
# URL にはパスワードが含まれるため、値は出力しない。

PROD_DB_ENV_ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

load_prod_database_url() {
  if [ -n "${PROD_DATABASE_URL:-}" ]; then
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
        PROD_DATABASE_URL="$db_url"
        break
      fi
    fi
  done

  if [ -z "${PROD_DATABASE_URL:-}" ]; then
    echo "ERROR: PROD_DATABASE_URL が設定されていません。.env.local または .env に設定してください。" >&2
    return 1
  fi
}
