-- DBアクセス最適化のためのインデックス追加
-- Phase 1: 即効性のある改善

-- 空コンテンツ除外用の部分インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_content_not_empty
ON "Article" (id)
WHERE content IS NOT NULL AND content != '';

-- カテゴリ用複合インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_category_published
ON "Article" (category, "publishedAt" DESC)
WHERE category IS NOT NULL;

-- タイプ用複合インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_type_published
ON "Article" ("articleType", "publishedAt" DESC)
WHERE "articleType" IS NOT NULL;

-- ユーザ固有データ取得用インデックス
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_favorite_user_article
ON "Favorite" ("userId", "articleId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_article_view_user_article_read
ON "ArticleView" ("userId", "articleId", "isRead")
WHERE "isRead" = true;

-- ソース名検索用インデックス（大文字小文字を区別しない検索用）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_source_name_lower
ON "Source" (LOWER(name));