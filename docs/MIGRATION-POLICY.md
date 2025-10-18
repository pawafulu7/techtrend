# マイグレーションポリシー

## 🚨 重要なルール

### マイグレーションファイルの取り扱い

**絶対に守るべきルール:**

1. **既存のマイグレーションファイルは絶対に編集しない**
   - 一度作成されたマイグレーションファイルは不変として扱う
   - 本番環境で適用済みの可能性があるため、編集は厳禁

2. **修正が必要な場合は必ず新規マイグレーションファイルを作成**
   - 例: インデックスの追加忘れ → 新規マイグレーションで追加
   - 例: カラムの型変更 → 新規マイグレーションで ALTER TABLE

3. **エラー対応時も新規ファイルで対応**
   - DROP INDEX でエラーが出る場合 → 新規マイグレーションで `DROP INDEX IF EXISTS` を使用
   - カラム追加でエラーが出る場合 → 新規マイグレーションで条件付き追加

## 正しいマイグレーション手順

### 1. 新規マイグレーション作成
```bash
# スキーマを編集後
npx prisma migrate dev --name 変更内容の説明

# 例
npx prisma migrate dev --name add_content_tracking_timestamps
```

### 2. エラーが発生した場合の対処
```bash
# ❌ 間違った対処法
# 既存のマイグレーションファイルを編集する

# ✅ 正しい対処法
# 1. エラーの内容を確認
# 2. 新規マイグレーションを作成して修正
npx prisma migrate dev --name fix_migration_error_description

# 3. 必要に応じて手動でSQLを調整（IF EXISTS追加など）
```

### 3. 本番環境への適用
```bash
# 本番環境では必ず deploy を使用
DATABASE_URL=$PRODUCTION_DATABASE_URL npx prisma migrate deploy
```

## 実例：2025年9月22日の対応

### 問題
- `20250922043747_add_content_tracking_timestamps` でインデックス削除時にエラー
- 原因: テスト環境に存在しないインデックスを削除しようとした

### 誤った対処（今回実施してしまった）
```sql
-- 既存のマイグレーションファイルを編集
DROP INDEX IF EXISTS "public"."idx_favorite_user_article";
```

### 正しい対処法（今後はこうする）
```bash
# 新規マイグレーションを作成
npx prisma migrate dev --name fix_missing_indexes

# 新規ファイルで条件付き削除
DROP INDEX IF EXISTS "public"."idx_favorite_user_article";
```

## チェックリスト

マイグレーション作成時の確認事項：

- [ ] スキーマ変更は `prisma/schema.prisma` で行ったか
- [ ] `npx prisma migrate dev` で新規マイグレーションを作成したか
- [ ] 既存のマイグレーションファイルを編集していないか
- [ ] テスト環境で動作確認したか
- [ ] 本番環境への影響を検討したか

## 参考資料

- [Prisma Migration Best Practices](https://www.prisma.io/docs/concepts/components/prisma-migrate/migration-histories)
- [Migration Troubleshooting](https://www.prisma.io/docs/guides/database/troubleshooting-orm/migration-troubleshooting)