-- Note: CREATE INDEX CONCURRENTLY cannot be used inside Prisma migrations
-- because Prisma runs migrations within transactions by default.
-- If you need to create indexes without locking tables in production,
-- consider one of the following approaches:
-- 1. Run CREATE INDEX CONCURRENTLY manually via psql after deployment
-- 2. Create separate single-statement migration files for each index
-- 3. Use this migration for staging/development, and manual index creation for production

-- CreateIndex for full-text search on Article title
CREATE INDEX IF NOT EXISTS "idx_article_title_gin" ON "Article" USING gin(to_tsvector('english', "title"));

-- CreateIndex for full-text search on Article summary
CREATE INDEX IF NOT EXISTS "idx_article_summary_gin" ON "Article" USING gin(to_tsvector('english', "summary"));

-- CreateIndex for Article category (partial index for non-null values)
CREATE INDEX IF NOT EXISTS "idx_article_category" ON "Article"("category") WHERE "category" IS NOT NULL;

-- Note: idx_article_tag_join on (A, B) is redundant as _ArticleToTag already has a primary key on (A, B)
-- which automatically creates an index. Removed to avoid duplication.

-- Note: idx_article_tag_reverse moved to a separate migration (20250915110438_add_article_tag_reverse_index)
-- to enable CONCURRENTLY execution without transaction issues