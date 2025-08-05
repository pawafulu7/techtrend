# N+1問題の解決とRedisキャッシュ実装 (2025年8月)

## 概要
TechTrendプロジェクトにおけるN+1クエリ問題の解決とRedisキャッシュによるパフォーマンス最適化を実装。

## Phase 1: 関連記事APIの最適化

### 問題点
- `/api/articles/[id]/related`: 1リクエストあたり11個のSQLクエリ実行
- Prismaのinclude文による非効率なN+1クエリ

### 解決策
単一の最適化されたSQLクエリに置き換え：
```sql
WITH RelatedArticles AS (
  SELECT DISTINCT
    a.id, a.title, a.summary, a.url, a.publishedAt,
    a.sourceId, s.name as sourceName, a.qualityScore,
    a.difficulty, COUNT(DISTINCT at.B) as commonTags
  FROM Article a
  JOIN _ArticleToTag at ON a.id = at.A
  JOIN Source s ON a.sourceId = s.id
  WHERE at.B IN (...)
  AND a.id != ?
  AND a.qualityScore >= 30
  GROUP BY a.id, ...
  HAVING commonTags > 0
  ORDER BY commonTags DESC, a.publishedAt DESC
  LIMIT 10
)
SELECT ra.*, GROUP_CONCAT(t.id || '::' || t.name, '||') as tags
FROM RelatedArticles ra
LEFT JOIN _ArticleToTag at2 ON ra.id = at2.A
LEFT JOIN Tag t ON at2.B = t.id
GROUP BY ra.id, ...
```

### 結果
- 11クエリ → 1クエリに削減
- Redisキャッシュ追加（TTL: 10分）

## Phase 2: Redisキャッシュの拡張

### 実装したキャッシュクラス

1. **TagCache** (`lib/cache/tag-cache.ts`)
   - getAllTags, getPopularTags, findTagsByName, getTag
   - TTL: 1時間

2. **SourceCache** (`lib/cache/source-cache.ts`)
   - getAllSources, getSource, getSourceByName, getTopSources
   - TTL: 1時間

3. **PopularCache** (`lib/cache/popular-cache.ts`)
   - 期間別の人気記事キャッシュ
   - TTL: hour=10分, day=30分, week=1時間, month=3時間, all=6時間
   - 複数のRedisCacheインスタンスを使用（内部プロパティ問題を回避）

### 適用したエンドポイント
- `/api/tags/cloud` - タグクラウド（30分キャッシュ）
- `/api/sources` - ソース一覧
- `/api/articles/popular` - 人気記事（期間別キャッシュ）

## キャッシュ無効化の実装

### CacheInvalidator (`lib/cache/cache-invalidator.ts`)
記事の変更時に関連するキャッシュを適切に無効化：

```typescript
class CacheInvalidator {
  async onArticleCreated(article: Partial<Article>)
  async onArticleUpdated(articleId: string)
  async onArticleDeleted(articleId: string)
  async onTagUpdated(tagId: string)
  async onSourceUpdated(sourceId: string)
  async onBulkImport()
}
```

### 無効化を実装した箇所

1. **API エンドポイント**
   - `/api/articles/[id]` - 記事の更新・削除時
   - `/api/ai/summarize` - 要約生成時

2. **バッチ処理スクリプト**
   - `scripts/collect-feeds.ts` - フィード収集後
   - `scripts/generate-summaries.ts` - 要約生成後
   - `scripts/core/manage-summaries.ts` - 要約管理処理後
   - `scripts/generate-tags.ts` - タグ生成後
   - `scripts/delete-low-quality-articles.ts` - 記事削除後

## パフォーマンス改善結果

### 関連記事API
- Before: 11 SQLクエリ
- After: 1 SQLクエリ + Redisキャッシュ
- レスポンス時間: 大幅に短縮

### その他のAPI
- タグクラウド: DBアクセス削減
- ソース一覧: キャッシュによる高速化
- 人気記事: 期間別の効率的なキャッシュ

## 技術的な注意点

1. **BigInt変換**: SQLite3のCOUNT結果はBigIntで返るため、Number()での変換が必要
2. **Redisインスタンス**: 内部プロパティへの直接アクセスを避け、複数インスタンスで管理
3. **キャッシュ整合性**: データ更新時は必ずcacheInvalidatorを呼び出す

## 今後の課題（Phase 3）
- PrismaClientのシングルトン化
- データベースインデックスの最適化
- count() + findMany()パターンの最適化