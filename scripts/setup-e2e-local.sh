#!/bin/bash

echo "E2Eテスト環境セットアップ開始..."

# 1. テスト用DBとRedisの起動
echo "テスト用DBとRedisを起動中..."
docker-compose -f docker-compose.test.yml up -d

# 2. DB接続待機
echo "DBの起動を待機中..."
for i in {1..30}; do
  if docker exec techtrend-postgres-test pg_isready -U postgres > /dev/null 2>&1; then
    echo "DBが起動しました"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "DBの起動がタイムアウトしました"
    exit 1
  fi
  sleep 1
done

# 3. スキーマ適用とシード投入
echo "スキーマを適用中..."
export DATABASE_URL="postgresql://postgres:postgres_dev_password@localhost:5433/techtrend_test"
npx prisma db push

echo "シードデータを投入中..."
npx tsx prisma/seed-test.ts

# 4. 開発サーバーの確認
echo "開発サーバーの状態を確認中..."
if ! curl -s http://localhost:3000 > /dev/null; then
  echo "開発サーバーが起動していません。npm run dev を実行してください"
  exit 1
fi

echo "E2Eテスト環境の準備が完了しました"