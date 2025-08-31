# データベースマイグレーション管理

## 概要
このプロジェクトではPrismaのマイグレーション機能を使用してデータベーススキーマを管理しています。

## 重要なルール

### ✅ 必ず守るべきこと
1. **開発環境でのスキーマ変更時は必ず`migrate dev`を使用**
   ```bash
   npx prisma migrate dev --name 変更内容の説明
   ```

2. **本番環境では`migrate deploy`のみ使用**
   ```bash
   npx prisma migrate deploy
   ```

3. **マイグレーションファイルは必ずGitで管理**
   - `prisma/migrations/`ディレクトリを必ずコミット
   - マイグレーションファイルは一度作成したら編集禁止

### ❌ やってはいけないこと
1. **`db push`を本番環境で使用しない**
   - マイグレーション履歴が残らない
   - データ損失のリスクがある

2. **マイグレーションファイルを手動で編集しない**
   - 一度作成されたマイグレーションは不変

3. **`prisma/migrations/`をgitignoreしない**
   - チーム全体で同じマイグレーション履歴を共有する必要がある

## CI/CDでの自動実行

### Vercelデプロイ
`vercel-build`スクリプトが自動的にマイグレーションを実行します：
```json
"vercel-build": "prisma generate && prisma migrate deploy && next build"
```

### GitHub Actions
テスト環境でもマイグレーションを使用（フォールバックあり）：
```yaml
run: |
  npx prisma generate
  npx prisma migrate deploy || npx prisma db push
```

## ローカル開発環境

### 初回セットアップ
```bash
# Dockerでデータベースを起動
docker-compose -f docker-compose.dev.yml up -d

# マイグレーションを実行
npx prisma migrate dev
```

### スキーマ変更時
```bash
# 1. schema.prismaを編集

# 2. マイグレーションを作成
npx prisma migrate dev --name add_user_profile_fields

# 3. 変更をコミット
git add prisma/
git commit -m "db: add user profile fields migration"
```

## トラブルシューティング

### マイグレーションが失敗する場合
```bash
# 1. データベースの状態を確認
npx prisma migrate status

# 2. 必要に応じてリセット（開発環境のみ）
npx prisma migrate reset

# 3. 再度マイグレーションを実行
npx prisma migrate dev
```

### 本番環境でのマイグレーションエラー
```bash
# 1. マイグレーション履歴を確認
DATABASE_URL=$PRODUCTION_DB_URL npx prisma migrate status

# 2. ペンディングのマイグレーションを適用
DATABASE_URL=$PRODUCTION_DB_URL npx prisma migrate deploy
```

## 参考リンク
- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Migration troubleshooting](https://www.prisma.io/docs/guides/migrate/production-troubleshooting)