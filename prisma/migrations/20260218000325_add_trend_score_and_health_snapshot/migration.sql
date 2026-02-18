-- CreateEnum
CREATE TYPE "TechMaturityStage" AS ENUM ('EMERGING', 'RISING', 'ESTABLISHED', 'DECLINING');

-- CreateTable
CREATE TABLE "TechTrendScore" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "articleMentionGrowth" DOUBLE PRECISION NOT NULL,
    "githubStarsGrowth" DOUBLE PRECISION NOT NULL,
    "npmDownloadsGrowth" DOUBLE PRECISION NOT NULL,
    "soQuestionsGrowth" DOUBLE PRECISION NOT NULL,
    "stage" "TechMaturityStage" NOT NULL,
    "calculatedAt" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TechTrendScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechHealthSnapshot" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "communityActivity" DOUBLE PRECISION NOT NULL,
    "developmentVelocity" DOUBLE PRECISION NOT NULL,
    "articleAttention" DOUBLE PRECISION NOT NULL,
    "adoptionBreadth" DOUBLE PRECISION NOT NULL,
    "overallHealth" DOUBLE PRECISION NOT NULL,
    "calculatedAt" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TechHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_trend_score_stage_score" ON "TechTrendScore"("stage", "score" DESC);

-- CreateIndex
CREATE INDEX "idx_trend_score_entity_history" ON "TechTrendScore"("entityId", "calculatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_trend_score_entity_date" ON "TechTrendScore"("entityId", "calculatedAt");

-- CreateIndex
CREATE INDEX "idx_health_snapshot_overall" ON "TechHealthSnapshot"("overallHealth" DESC);

-- CreateIndex
CREATE INDEX "idx_health_snapshot_entity_history" ON "TechHealthSnapshot"("entityId", "calculatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_health_snapshot_entity_date" ON "TechHealthSnapshot"("entityId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "TechTrendScore" ADD CONSTRAINT "TechTrendScore_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "TechHealthSnapshot_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints for score ranges
ALTER TABLE "TechTrendScore" ADD CONSTRAINT "chk_trend_score_range" CHECK ("score" >= 0 AND "score" <= 100);

ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "chk_health_community" CHECK ("communityActivity" >= 0 AND "communityActivity" <= 100);
ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "chk_health_velocity" CHECK ("developmentVelocity" >= 0 AND "developmentVelocity" <= 100);
ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "chk_health_attention" CHECK ("articleAttention" >= 0 AND "articleAttention" <= 100);
ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "chk_health_breadth" CHECK ("adoptionBreadth" >= 0 AND "adoptionBreadth" <= 100);
ALTER TABLE "TechHealthSnapshot" ADD CONSTRAINT "chk_health_overall" CHECK ("overallHealth" >= 0 AND "overallHealth" <= 100);
