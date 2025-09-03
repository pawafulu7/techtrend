-- パフォーマンス最適化のためのインデックス追加
-- 実行前に既存のインデックスを確認してください

-- 記事の検索・フィルタリング用
CREATE INDEX IF NOT EXISTS idx_article_published_at ON "Article"("publishedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_article_source_id ON "Article"("sourceId");
CREATE INDEX IF NOT EXISTS idx_article_quality_score ON "Article"("qualityScore" DESC);
CREATE INDEX IF NOT EXISTS idx_article_created_at ON "Article"("createdAt" DESC);

-- 複合インデックス（よく使われる組み合わせ）
CREATE INDEX IF NOT EXISTS idx_article_source_published ON "Article"("sourceId", "publishedAt" DESC);

-- タグ検索用
CREATE INDEX IF NOT EXISTS idx_tag_name ON "Tag"("name");
CREATE INDEX IF NOT EXISTS idx_tag_category ON "Tag"("category");

-- ユーザーのお気に入り・閲覧履歴用
CREATE INDEX IF NOT EXISTS idx_favorite_user_created ON "Favorite"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_view_user_viewed ON "ArticleView"("userId", "viewedAt" DESC);

-- 統計クエリ用
CREATE INDEX IF NOT EXISTS idx_article_summary_version ON "Article"("summaryVersion");
CREATE INDEX IF NOT EXISTS idx_article_type ON "Article"("articleType");

-- 注意: これらのインデックスは選択的に適用してください
-- すべてを一度に追加すると、書き込みパフォーマンスに影響する可能性があります