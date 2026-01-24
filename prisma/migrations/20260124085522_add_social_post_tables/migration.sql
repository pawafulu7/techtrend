-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'REVIEWED', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SocialPostSource" AS ENUM ('ARTICLE', 'DAILY_TREND', 'DIFF_SUMMARY', 'MANUAL');

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalContent" TEXT,
    "hashtags" TEXT[],
    "sourceUrls" TEXT[],
    "source" "SocialPostSource" NOT NULL,
    "sourceIds" TEXT[],
    "contentHash" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "contextSummary" TEXT,
    "scheduledAt" TIMESTAMPTZ(6),
    "postedAt" TIMESTAMPTZ(6),
    "externalPostId" TEXT,
    "postError" TEXT,
    "createdBy" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostAuditLog" (
    "id" TEXT NOT NULL,
    "socialPostId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "previousData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialPostAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_social_post_status_created" ON "SocialPost"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_social_post_source" ON "SocialPost"("source");

-- CreateIndex
CREATE INDEX "idx_social_post_scheduled_at" ON "SocialPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "idx_social_post_posted_at" ON "SocialPost"("postedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_social_post_created_by" ON "SocialPost"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "uq_social_post_content_hash" ON "SocialPost"("contentHash");

-- CreateIndex
CREATE INDEX "idx_social_post_audit_log" ON "SocialPostAuditLog"("socialPostId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_social_post_audit_user" ON "SocialPostAuditLog"("userId");

-- CreateIndex
CREATE INDEX "idx_social_post_audit_action" ON "SocialPostAuditLog"("action");

-- AddForeignKey
ALTER TABLE "SocialPostAuditLog" ADD CONSTRAINT "SocialPostAuditLog_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
