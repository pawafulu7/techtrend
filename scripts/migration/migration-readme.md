# データベース移行手順

## 概要
このディレクトリには、SQLiteからPostgreSQLへのデータベース移行に必要なスクリプトが含まれています。

## 前提条件
- Node.js 18以上
- Docker Desktop
- tsx（`npm install -g tsx`）

## 移行手順

### 1. Docker環境の起動
```bash
# PostgreSQLとRedisを起動
docker-compose -f docker-compose.dev.yml up -d

# コンテナの状態確認
docker-compose -f docker-compose.dev.yml ps
```

### 2. データのエクスポート（SQLiteから）
```bash
# SQLiteデータベースから全データをJSON形式でエクスポート
npx tsx scripts/migration/export-sqlite-data.ts

# エクスポートされたファイルの確認
ls -la scripts/migration/exported-data/
```

エクスポートされるファイル:
- `sources.json` - ソース情報
- `tags.json` - タグ情報
- `articles.json` - 記事データ
- `article-tag-relations.json` - 記事とタグの関連
- `manifest.json` - エクスポート情報

### 3. PostgreSQLスキーマの作成
```bash
# Prismaスキーマを使用してデータベースを初期化
npx prisma migrate dev --schema=prisma/schema.postgresql.prisma --name init

# または、既存のマイグレーションを適用
npx prisma db push --schema=prisma/schema.postgresql.prisma
```

### 4. データのインポート（PostgreSQLへ）
```bash
# データをPostgreSQLにインポート（--forceフラグ必須）
npx tsx scripts/migration/import-to-postgresql.ts --force
```

### 5. データ検証
```bash
# PostgreSQLに接続して確認
docker exec -it techtrend-postgres psql -U postgres -d techtrend_dev

# レコード数の確認
SELECT COUNT(*) FROM "Article";
SELECT COUNT(*) FROM "Source";
SELECT COUNT(*) FROM "Tag";

# 終了
\q
```

### 6. アプリケーションの動作確認
```bash
# 環境変数を設定
export DATABASE_URL=$DATABASE_URL_POSTGRESQL

# 開発サーバー起動
npm run dev

# ブラウザでアクセス
# http://localhost:3000
```

## トラブルシューティング

### PostgreSQLに接続できない場合
```bash
# コンテナの再起動
docker-compose -f docker-compose.dev.yml restart postgres

# ログの確認
docker-compose -f docker-compose.dev.yml logs postgres
```

### データインポートが失敗する場合
```bash
# データベースをリセット
npx prisma migrate reset --schema=prisma/schema.postgresql.prisma --force

# 再度インポート
npx tsx scripts/migration/import-to-postgresql.ts --force
```

### Docker環境のクリーンアップ
```bash
# コンテナとボリュームを削除
docker-compose -f docker-compose.dev.yml down -v

# 全てをクリーンアップ
docker-compose -f docker-compose.dev.yml down -v --rmi all
```

## 本番環境への移行

### Supabaseプロジェクトの作成
1. [Supabase](https://supabase.com)でアカウント作成
2. 新規プロジェクト作成
3. 接続情報を`.env.local`に設定

### 本番データの移行
```bash
# 環境変数を本番用に設定
export DATABASE_URL_POSTGRESQL=$DATABASE_URL_SUPABASE

# データインポート
npx tsx scripts/migration/import-to-postgresql.ts --force
```

## ロールバック手順

SQLiteに戻す必要がある場合:

1. `.env.local`の`DATABASE_URL`をSQLite設定に戻す
2. `prisma/schema.prisma`を使用するように戻す
3. アプリケーションを再起動

バックアップは`prisma/backup/`ディレクトリに保存されています。