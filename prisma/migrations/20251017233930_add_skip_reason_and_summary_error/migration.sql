-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('PDF', 'SLIDE', 'THIN_CONTENT', 'CONTENT_FETCH_FAILED', 'QUALITY_FAILED');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "skipReason" "SkipReason",
ADD COLUMN     "summaryError" TEXT;

-- CreateIndex
CREATE INDEX "idx_article_skip_reason" ON "Article"("skipReason");
