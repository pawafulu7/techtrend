-- CreateIndex
-- Note: CONCURRENTLY removed for Prisma compatibility (shadow database).
-- For production zero-downtime deployment:
--   Option 1: Apply manually with CONCURRENTLY, then run `prisma migrate resolve --applied`
--   Option 2: Run migration with PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS=1
CREATE INDEX IF NOT EXISTS "idx_article_user_votes" ON "Article"("userVotes" DESC);

-- CreateIndex
-- idx_article_category may already exist in production DB (created manually), this ensures schema alignment
CREATE INDEX IF NOT EXISTS "idx_article_category" ON "Article"("category");
