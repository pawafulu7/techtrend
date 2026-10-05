-- AlterTable
ALTER TABLE "Article" ADD COLUMN "storyId" TEXT,
ADD COLUMN "storySize" INTEGER;

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_story_id" ON "Article"("storyId");
