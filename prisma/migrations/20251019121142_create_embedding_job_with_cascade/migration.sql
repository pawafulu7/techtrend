-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "public"."idx_article_summary_trgm";

-- DropIndex
DROP INDEX "public"."idx_article_title_trgm";

-- DropIndex
DROP INDEX "public"."idx_article_chunk_embedding_ivfflat";

-- DropIndex
DROP INDEX "public"."idx_article_embedding_vector_ivfflat";

-- AlterTable
ALTER TABLE "Article" ALTER COLUMN "summaryVersion" SET DEFAULT 8;

-- CreateTable
CREATE TABLE "embedding_jobs" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "queuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedding_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "embedding_jobs_articleId_key" ON "embedding_jobs"("articleId");

-- CreateIndex
CREATE INDEX "idx_embedding_job_status_queued" ON "embedding_jobs"("status", "queuedAt");

-- AddForeignKey
ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
