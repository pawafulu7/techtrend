-- DropIndex
DROP INDEX "idx_article_bookmarks";

-- DropIndex
DROP INDEX "idx_article_qualityScore";

-- DropIndex
DROP INDEX "idx_article_sourceId";

-- DropIndex
DROP INDEX "idx_article_publishedAt";

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "category" TEXT;
