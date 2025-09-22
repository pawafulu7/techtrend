-- DropIndex (if exists to avoid error)
DROP INDEX IF EXISTS "public"."idx_favorite_user_article";

-- DropIndex (if exists to avoid error)
DROP INDEX IF EXISTS "public"."idx_article_tag_join";

-- DropIndex (if exists to avoid error)
DROP INDEX IF EXISTS "public"."idx_article_tag_reverse";

-- AlterTable
ALTER TABLE "public"."Article" ADD COLUMN     "contentUpdatedAt" TIMESTAMP(6),
ADD COLUMN     "qualityScoreComputedAt" TIMESTAMP(6),
ADD COLUMN     "summaryComputedAt" TIMESTAMP(6);

-- Set initial values for existing data
UPDATE "public"."Article" SET "contentUpdatedAt" = "createdAt" WHERE "contentUpdatedAt" IS NULL;
UPDATE "public"."Article" SET "qualityScoreComputedAt" = "updatedAt" WHERE "qualityScore" IS NOT NULL AND "qualityScore" > 0;
UPDATE "public"."Article" SET "summaryComputedAt" = "updatedAt" WHERE "summary" IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_article_updated_at" ON "public"."Article"("updatedAt");

-- CreateIndex
CREATE INDEX "idx_article_content_updated_at" ON "public"."Article"("contentUpdatedAt");

-- CreateIndex
CREATE INDEX "idx_article_quality_score_computed_at" ON "public"."Article"("qualityScoreComputedAt");

-- CreateIndex
CREATE INDEX "idx_article_summary_computed_at" ON "public"."Article"("summaryComputedAt");
