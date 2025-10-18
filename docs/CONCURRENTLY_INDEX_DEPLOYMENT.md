# CONCURRENTLY インデックス本番適用手順

## 概要
Prismaのトランザクション制限により、`CREATE INDEX CONCURRENTLY`を含むマイグレーションは特別な手順が必要です。

## 新規作成したマイグレーション

### 1. 20250915110420_add_article_search_indexes
- **目的**: タイトルとサマリーの複合全文検索インデックス
- **特徴**: weighted tsvector（タイトル重み'A'、サマリー重み'B'）

### 2. 20250915110438_add_article_tag_reverse_index
- **目的**: タグフィルタリングの逆順インデックス
- **特徴**: (B, A)順でのインデックス（異なるクエリパターン用）

## 本番環境への適用方法

### オプション1: Prisma Migrate経由（推奨）

```bash
# 1. 本番環境の状態確認
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate status

# 2. マイグレーション適用（単一ステートメントなのでトランザクション外で実行される可能性が高い）
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate deploy

# 3. エラーが発生した場合は、オプション2へ
```

### オプション2: 手動適用 + migrate resolve

```bash
# 1. psqlで直接インデックス作成
psql "[PRODUCTION_URL]" << EOF
-- 複合検索インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_search_gin" ON "Article" USING gin (
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("summary", '')), 'B')
);

-- 逆順インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_tag_reverse" ON "_ArticleToTag"("B", "A");
EOF

# 2. マイグレーション履歴を更新
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate resolve --applied "20250915110420_add_article_search_indexes"
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate resolve --applied "20250915110438_add_article_tag_reverse_index"

# 3. 状態確認
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate status
```

## インデックス作成の確認

```sql
-- インデックス一覧確認
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
AND (tablename = 'Article' OR tablename = '_ArticleToTag')
ORDER BY tablename, indexname;

-- インデックスの詳細確認
\di idx_article_search_gin
\di idx_article_tag_reverse
```

## 注意事項

1. **CREATE INDEX CONCURRENTLY**は長時間かかる可能性があります
   - 本番DBのサイズに応じて数分〜数時間
   - 途中でキャンセルすると「INVALID」状態のインデックスが残る

2. **INVALIDインデックスの処理**
   ```sql
   -- INVALIDインデックスの確認
   SELECT indexname FROM pg_indexes
   JOIN pg_index ON indexname = indexrelid::regclass::text
   WHERE NOT indisvalid;

   -- INVALIDインデックスの削除
   DROP INDEX CONCURRENTLY IF EXISTS "idx_name";
   ```

3. **パフォーマンス確認**
   ```sql
   -- 検索クエリの実行計画確認
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT * FROM "Article"
   WHERE to_tsvector('english', "title") || to_tsvector('english', "summary")
   @@ plainto_tsquery('english', 'search term');
   ```

## ロールバック手順

```bash
# インデックスの削除
psql "[PRODUCTION_URL]" << EOF
DROP INDEX CONCURRENTLY IF EXISTS "idx_article_search_gin";
DROP INDEX CONCURRENTLY IF EXISTS "idx_article_tag_reverse";
EOF

# マイグレーション履歴のロールバック
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate resolve --rolled-back "20250915110438_add_article_tag_reverse_index"
DATABASE_URL="[PRODUCTION_URL]" npx prisma migrate resolve --rolled-back "20250915110420_add_article_search_indexes"
```

## 更新履歴
- 2025-09-15: 初版作成