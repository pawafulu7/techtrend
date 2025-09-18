-- CreateTable
CREATE TABLE "WeeklyDigest" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "articleCount" INTEGER NOT NULL,
    "topArticles" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "categories" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_weekly_digest_dates" CHECK ("weekEndDate" > "weekStartDate"),
    CONSTRAINT "ck_weekly_digest_article_count" CHECK ("articleCount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDigest_weekStartDate_key" ON "WeeklyDigest"("weekStartDate");

-- CreateIndex
CREATE INDEX "idx_weekly_digest_created_at" ON "WeeklyDigest"("createdAt" DESC);
