#!/bin/bash

# PostgreSQLコンテナを完全にクリーンアップして再起動
# docker-proxy残存問題を確実に解決

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.dev.yml"

echo "========================================"
echo "PostgreSQL完全クリーンアップ＆再起動"
echo "========================================"

# Step 1: すべての関連プロセスを確認
echo ""
echo "📊 Step 1: 現在の状態確認"
echo "----------------------------------------"
echo "稼働中のコンテナ:"
docker ps --filter name=techtrend-postgres --format '  {{.ID}} {{.Names}} {{.Status}}'

echo ""
echo "ポート5432のリスナー:"
sudo ss -ltnp | grep 5432 || echo "  なし"

# Step 2: Dockerコンテナを完全停止
echo ""
echo "🛑 Step 2: コンテナの完全停止"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" stop postgres 2>/dev/null || true
sleep 2

# Step 3: コンテナを削除
echo ""
echo "🗑️  Step 3: コンテナの削除"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" rm -f postgres 2>/dev/null || true
sleep 2

# Step 4: 古いdocker-proxyプロセスを強制終了
echo ""
echo "🔧 Step 4: 古いdocker-proxyの強制終了"
echo "----------------------------------------"
OLD_PROXY_PIDS=$(sudo ss -ltnp | grep ':5432' | grep -oP 'pid=\K\d+' | sort -u || true)

if [ -n "$OLD_PROXY_PIDS" ]; then
    echo "⚠️  古いdocker-proxyプロセスが見つかりました:"
    for pid in $OLD_PROXY_PIDS; do
        echo "  - PID: $pid"
        sudo ps -p $pid -o pid,cmd --no-headers || true
    done

    echo ""
    echo "🔨 これらのプロセスを強制終了します..."
    echo "$OLD_PROXY_PIDS" | xargs -r sudo kill -9
    sleep 3

    # 終了確認
    REMAINING=$(sudo ss -ltnp | grep ':5432' | grep docker-proxy || true)
    if [ -n "$REMAINING" ]; then
        echo "❌ 警告: 一部のプロセスが残っています"
        echo "$REMAINING"
    else
        echo "✅ すべての古いプロセスを終了しました"
    fi
else
    echo "✅ 古いdocker-proxyプロセスはありません"
fi

# Step 5: 念のため既存のコンテナをすべて確認・削除
echo ""
echo "🔍 Step 5: 孤立したPostgreSQLコンテナの確認"
echo "----------------------------------------"
ORPHAN_CONTAINERS=$(docker ps -a --filter "name=techtrend-postgres" --format '{{.ID}}' || true)
if [ -n "$ORPHAN_CONTAINERS" ]; then
    echo "⚠️  孤立したコンテナが見つかりました:"
    docker ps -a --filter "name=techtrend-postgres" --format '  {{.ID}} {{.Names}} {{.Status}}'
    echo ""
    echo "🗑️  これらを削除します..."
    echo "$ORPHAN_CONTAINERS" | xargs -r docker rm -f
    sleep 2
else
    echo "✅ 孤立したコンテナはありません"
fi

# Step 6: ポート5432が完全に解放されたことを確認
echo ""
echo "🔍 Step 6: ポート5432の解放確認"
echo "----------------------------------------"
PORT_CHECK=$(sudo ss -ltnp | grep ':5432' || true)
if [ -n "$PORT_CHECK" ]; then
    echo "❌ エラー: ポート5432がまだ使用中です"
    echo "$PORT_CHECK"
    echo ""
    echo "手動で以下のプロセスを確認してください:"
    sudo lsof -i :5432
    exit 1
else
    echo "✅ ポート5432は完全に解放されました"
fi

# Step 7: コンテナを再作成
echo ""
echo "🚀 Step 7: コンテナの再作成"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" up -d postgres

# Step 8: 起動待機
echo ""
echo "⏳ Step 8: PostgreSQLの起動待機"
echo "----------------------------------------"
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec techtrend-postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "✅ PostgreSQLが起動しました (待機時間: ${RETRY_COUNT}秒)"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $((RETRY_COUNT % 5)) -eq 0 ]; then
        echo "   起動中... ($RETRY_COUNT/$MAX_RETRIES 秒)"
    fi
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ エラー: PostgreSQLの起動がタイムアウトしました"
    echo ""
    echo "コンテナログ:"
    docker logs techtrend-postgres --tail 50
    exit 1
fi

# Step 9: 接続テスト
echo ""
echo "🔍 Step 9: 接続テスト"
echo "----------------------------------------"

echo "  📌 Docker内部からの接続:"
DOCKER_VERSION=$(docker exec techtrend-postgres psql -U postgres -t -c "SELECT version();" 2>&1 | grep PostgreSQL | xargs || echo "接続失敗")
DOCKER_START_TIME=$(docker exec techtrend-postgres psql -U postgres -t -c "SELECT pg_postmaster_start_time();" 2>&1 | xargs || echo "不明")
echo "    バージョン: $DOCKER_VERSION"
echo "    起動時刻: $DOCKER_START_TIME"

echo ""
echo "  📌 外部(127.0.0.1)からの接続:"
EXTERNAL_VERSION=$(PGPASSWORD=postgres_dev_password psql -h 127.0.0.1 -p 5432 -U postgres -t -c "SELECT version();" 2>&1 | grep PostgreSQL | xargs || echo "接続失敗")
EXTERNAL_START_TIME=$(PGPASSWORD=postgres_dev_password psql -h 127.0.0.1 -p 5432 -U postgres -t -c "SELECT pg_postmaster_start_time();" 2>&1 | xargs || echo "不明")
echo "    バージョン: $EXTERNAL_VERSION"
echo "    起動時刻: $EXTERNAL_START_TIME"

# 起動時刻の一致確認
if [ "$DOCKER_START_TIME" != "不明" ] && [ "$EXTERNAL_START_TIME" != "不明" ] && [ "$DOCKER_START_TIME" = "$EXTERNAL_START_TIME" ]; then
    echo ""
    echo "✅ 接続確認: 両方とも同じPostgreSQLサーバーに接続しています"
else
    echo ""
    echo "❌ 警告: Docker内部と外部接続で異なるサーバーに接続している可能性があります"
    echo "    Docker起動時刻: $DOCKER_START_TIME"
    echo "    外部起動時刻: $EXTERNAL_START_TIME"
fi

# Step 10: データベース確認
echo ""
echo "📊 Step 10: データベース確認"
echo "----------------------------------------"
SOURCE_COUNT=$(PGPASSWORD=postgres_dev_password psql -h 127.0.0.1 -p 5432 -U postgres -d techtrend_dev -t -c 'SELECT COUNT(*) FROM "Source";' 2>&1 | xargs || echo "0")
echo "  Sourceテーブル: $SOURCE_COUNT 件"

if [ "$SOURCE_COUNT" = "0" ] || [ "$SOURCE_COUNT" = "接続失敗" ]; then
    echo "  ⚠️  データが見つからない、またはテーブルが存在しません"
else
    echo "  ✅ データが正常に確認できました"
fi

# Step 11: 最終確認
echo ""
echo "========================================"
echo "✅ 再起動完了"
echo "========================================"
echo ""
echo "最終状態:"
docker ps --filter name=techtrend-postgres --format '  コンテナ: {{.Names}} ({{.Status}})'
sudo ss -ltnp | grep ':5432' | head -2 | sed 's/^/  ポート: /'
echo ""
