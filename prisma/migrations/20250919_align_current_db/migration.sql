-- Align migrations with current production schema without data changes
-- Ensures new environments match the existing database defaults and indexes

-- Keep Article summaryVersion default in sync with production (already 7)
ALTER TABLE "Article" ALTER COLUMN "summaryVersion" SET DEFAULT 7;

-- WeeklyDigest columns are NOT NULL and do not use defaults in production
ALTER TABLE "WeeklyDigest" ALTER COLUMN "topArticles" DROP DEFAULT;
ALTER TABLE "WeeklyDigest" ALTER COLUMN "categories" DROP DEFAULT;

-- The created_at index was manually dropped; ensure migrations reflect that
DROP INDEX IF EXISTS "idx_weekly_digest_created_at";

-- Maintain the forward index on the join table used in production
CREATE INDEX IF NOT EXISTS "idx_article_tag_join" ON "_ArticleToTag"("A", "B");
