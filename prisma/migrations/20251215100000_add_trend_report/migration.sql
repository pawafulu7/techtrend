-- CreateEnum
CREATE TYPE "TrendPeriodType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "TrendReport" (
    "id" TEXT NOT NULL,
    "periodType" "TrendPeriodType" NOT NULL,
    "periodStart" TIMESTAMPTZ(6) NOT NULL,
    "periodEnd" TIMESTAMPTZ(6) NOT NULL,
    "articleCount" INTEGER NOT NULL,
    "topArticles" JSONB NOT NULL,
    "categories" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "aiSummary" TEXT,
    "aiModel" TEXT,
    "promptVersion" TEXT,
    "generatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TrendReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint for period type and start date
CREATE UNIQUE INDEX "TrendReport_periodType_periodStart_key" ON "TrendReport"("periodType", "periodStart");

-- CreateIndex: Performance index for queries by period type and date
CREATE INDEX "idx_trend_report_period" ON "TrendReport"("periodType", "periodStart" DESC);
