#!/usr/bin/env bash
set -euo pipefail

# 開発用の Redis（techtrend-redis コンテナ）の中身を全部消す。
# scripts/db/sync-prod.sh が DB の中身を本番のデータに置き換えた後に呼ぶ（古い一覧や件数が残らないように）。
#
# この Redis はキャッシュだけを置く（docker-compose.dev.yml の allkeys-lru）ので、名前空間を選ばずに FLUSHDB で消す
# （アプリのキャッシュは @techtrend/cache・techtrend:digest などの名前空間に分かれている）。
# アプリのコードは NODE_ENV=test では実物の Redis に繋がないので使わない。コンテナの中の redis-cli で消すので、
# 手元のポートや .env の REDIS_URL（本番の値が入っていることがある）も使わない。
# パスワードはコンテナの起動引数（--requirepass）から取る。compose はコンテナを作ったときのシェルの
# REDIS_PASSWORD（無ければ既定値）を埋め込むため、今のシェルや .env の値と同じとは限らない。

CONTAINER=techtrend-redis

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "[cache] ERROR: ${CONTAINER} コンテナが起動していません。" >&2
  exit 1
fi

# パスワードは画面に出さず、コマンドの引数にも載せない。redis-cli には環境変数 REDISCLI_AUTH で渡す。
# 起動引数（JSON の配列）から --requirepass の次の値を取る。コマンド置換は末尾の改行を落とすので、
# 番兵の x を付けて受け取り、後で外す（prod-db-env.sh と同じ）
REDISCLI_AUTH="$(docker inspect --format '{{json .Config.Cmd}}' "$CONTAINER" | node -e '
  const cmd = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const i = Array.isArray(cmd) ? cmd.indexOf("--requirepass") : -1;
  if (i >= 0 && i + 1 < cmd.length) process.stdout.write(cmd[i + 1] + "x");
')"
REDISCLI_AUTH="${REDISCLI_AUTH%x}"
AUTH_OPTS=()
if [ -n "$REDISCLI_AUTH" ]; then
  export REDISCLI_AUTH
  AUTH_OPTS=(-e REDISCLI_AUTH)
fi

# redis-cli は、エラーの応答でも終了コード 0 を返すことがあるので、応答が OK かで判断する
result="$(docker exec ${AUTH_OPTS[@]+"${AUTH_OPTS[@]}"} "$CONTAINER" redis-cli FLUSHDB 2>&1 || true)"
if [ "$result" != "OK" ]; then
  echo "[cache] ERROR: ${CONTAINER} の中身を消せませんでした: ${result}" >&2
  exit 1
fi
echo "[cache] ${CONTAINER} の中身を消しました。"
