-- AlterTable
ALTER TABLE "Article" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "idx_article_is_hidden" ON "Article"("isHidden");
