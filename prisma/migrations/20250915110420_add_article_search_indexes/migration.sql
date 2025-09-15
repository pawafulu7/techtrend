-- Single statement migration for CONCURRENTLY execution
-- This migration contains only one CREATE INDEX statement to avoid transaction issues
-- Title and Summary combined full-text search index with weighted tsvector
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_search_gin" ON "Article" USING gin ((
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("summary", '')), 'B')
));