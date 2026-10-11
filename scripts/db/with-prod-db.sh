#!/usr/bin/env bash
set -euo pipefail

# 本番DB (Neon) の接続URLを環境変数に入れてコマンドを実行する。URL は表示しない。
# コマンドの生の出力も表示しない（接続エラーには接続先が入る）。画面に出るのは prod_db_filter_output
# （scripts/db/prod-db-env.sh）が通す行と成否だけで、生の出力は .workflow/tmp/prod-db/ に保存する。
# 件数や成否を見たいときは、コマンド側で `名前=数値` の行を出力する（例: console.log(`articles=${n}`)）。
#
# Usage:
#   bash scripts/db/with-prod-db.sh <command...>
#     PROD_DATABASE_URL を渡して実行する（例: npx tsx scripts/perf/explain-stage2.ts --env prod）
#   bash scripts/db/with-prod-db.sh --as-database-url <command...>
#     DATABASE_URL も本番に向けて実行する（Prisma CLI など DATABASE_URL を読むコマンド用）

# shellcheck source=scripts/db/prod-db-env.sh
source "$(dirname "$0")/prod-db-env.sh"

as_database_url=false
if [ "${1:-}" = "--as-database-url" ]; then
  as_database_url=true
  shift
fi

if [ $# -eq 0 ]; then
  echo "Usage: bash scripts/db/with-prod-db.sh [--as-database-url] <command...>" >&2
  exit 2
fi

load_prod_database_url
export PROD_DATABASE_URL
if [ "$as_database_url" = true ]; then
  export DATABASE_URL="$PROD_DATABASE_URL"
fi

prod_db_run "$@"
