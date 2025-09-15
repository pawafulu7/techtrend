-- CreateIndex for full-text search on Article title
CREATE INDEX IF NOT EXISTS "idx_article_title_gin" ON "Article" USING gin(to_tsvector('english', "title"));

-- CreateIndex for full-text search on Article summary
CREATE INDEX IF NOT EXISTS "idx_article_summary_gin" ON "Article" USING gin(to_tsvector('english', "summary"));

-- CreateIndex for Article category (partial index for non-null values)
CREATE INDEX IF NOT EXISTS "idx_article_category" ON "Article"("category") WHERE "category" IS NOT NULL;

-- CreateIndex for _ArticleToTag join table (composite index)
CREATE INDEX IF NOT EXISTS "idx_article_tag_join" ON "_ArticleToTag"("A", "B");

-- Additional index for tag filtering performance
CREATE INDEX IF NOT EXISTS "idx_article_tag_reverse" ON "_ArticleToTag"("B", "A");