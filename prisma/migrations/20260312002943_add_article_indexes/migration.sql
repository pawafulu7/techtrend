-- CreateIndex
-- Note: For production zero-downtime deployment, run with CONCURRENTLY via manual script
CREATE INDEX IF NOT EXISTS "idx_article_user_votes" ON "Article"("userVotes" DESC);

-- CreateIndex
-- idx_article_category may already exist in production DB (created manually), this ensures schema alignment
CREATE INDEX IF NOT EXISTS "idx_article_category" ON "Article"("category");
