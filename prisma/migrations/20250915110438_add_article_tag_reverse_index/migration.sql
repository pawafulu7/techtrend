-- Single statement migration for CONCURRENTLY execution
-- This migration contains only one CREATE INDEX statement to avoid transaction issues
-- Reverse index for tag filtering performance (different query patterns)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_tag_reverse" ON "_ArticleToTag"("B", "A");