-- Add pg_trgm indexes for LIKE/ILIKE search optimization
-- Supports both English and Japanese search keywords

-- Ensure pg_trgm extension is installed
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram indexes on title and summary columns
-- These indexes will significantly speed up LIKE/ILIKE queries
-- Note: CONCURRENTLY cannot be used in migration (transaction block)

CREATE INDEX IF NOT EXISTS idx_article_title_trgm
  ON "Article" USING gin(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_article_summary_trgm
  ON "Article" USING gin(summary gin_trgm_ops);

-- Note:
-- - Existing to_tsvector indexes are not removed (can be used for English-specific advanced search)
-- - Trigram indexes support all languages including Japanese
-- - PostgreSQL will automatically use these indexes for ILIKE queries
