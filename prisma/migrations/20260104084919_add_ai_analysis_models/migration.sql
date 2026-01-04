-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "DiffSummary" (
    "id" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "currentPeriod" TEXT NOT NULL,
    "baselinePeriod" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "unchanged" TEXT[],
    "status" "BatchStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiffSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewpointMap" (
    "id" TEXT NOT NULL,
    "topicSlug" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "issues" JSONB NOT NULL,
    "articleIds" TEXT[],
    "status" "BatchStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewpointMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeTip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "tags" TEXT[],
    "sourceArticleId" TEXT NOT NULL,
    "quality" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "extractedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_diff_summary_generated_at" ON "DiffSummary"("generatedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_diff_summary_status" ON "DiffSummary"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_diff_summary_category_period" ON "DiffSummary"("categorySlug", "currentPeriod");

-- CreateIndex
CREATE INDEX "idx_viewpoint_map_generated_at" ON "ViewpointMap"("generatedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_viewpoint_map_status" ON "ViewpointMap"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_viewpoint_map_topic_period" ON "ViewpointMap"("topicSlug", "period");

-- CreateIndex
CREATE INDEX "idx_code_tip_language" ON "CodeTip"("language");

-- CreateIndex
CREATE INDEX "idx_code_tip_extracted_at" ON "CodeTip"("extractedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_code_tip_article_hash" ON "CodeTip"("sourceArticleId", "codeHash");

-- AddForeignKey
ALTER TABLE "CodeTip" ADD CONSTRAINT "CodeTip_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
