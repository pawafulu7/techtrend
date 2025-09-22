-- DropIndex
DROP INDEX "public"."idx_favorite_user_article";

-- DropIndex
DROP INDEX "public"."idx_article_tag_join";

-- DropIndex
DROP INDEX "public"."idx_article_tag_reverse";

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "public"."ProcessingLog" (
    "id" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "lastProcessedAt" TIMESTAMP(3) NOT NULL,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingLog_processName_key" ON "public"."ProcessingLog"("processName");

-- CreateIndex
CREATE INDEX "idx_processing_log_name" ON "public"."ProcessingLog"("processName");

-- CreateIndex
CREATE INDEX "idx_processing_log_processed_at" ON "public"."ProcessingLog"("lastProcessedAt");

-- CreateIndex
CREATE INDEX "idx_weekly_digest_created_at" ON "public"."WeeklyDigest"("createdAt" DESC);
