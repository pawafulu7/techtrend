-- CreateEnum
CREATE TYPE "TechEntityType" AS ENUM ('FRAMEWORK', 'LANGUAGE', 'TOOL', 'CONCEPT', 'PLATFORM', 'LIBRARY');

-- CreateEnum
CREATE TYPE "TechRelationType" AS ENUM ('DEPENDS_ON', 'ALTERNATIVE', 'EVOLUTION', 'PART_OF', 'INTEGRATES_WITH');

-- CreateEnum
CREATE TYPE "MentionSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('GITHUB_STARS', 'NPM_DOWNLOADS', 'PYPI_DOWNLOADS', 'SO_QUESTIONS');

-- CreateTable
CREATE TABLE "TechEntity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TechEntityType" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "firstSeenAt" TIMESTAMPTZ(6),
    "lastSeenAt" TIMESTAMPTZ(6),
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "externalIds" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TechEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechRelation" (
    "id" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "relationType" "TechRelationType" NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detectedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TechRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechRelationEvidence" (
    "id" TEXT NOT NULL,
    "relationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechRelationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTechMention" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "context" VARCHAR(500),
    "sentiment" "MentionSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleTechMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalMetric" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" "MetricSource" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagEntityMapping" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagEntityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechEntity_name_key" ON "TechEntity"("name");

-- CreateIndex
CREATE INDEX "idx_tech_entity_type" ON "TechEntity"("type");

-- CreateIndex
CREATE INDEX "idx_tech_entity_mention_count" ON "TechEntity"("mentionCount" DESC);

-- CreateIndex
CREATE INDEX "idx_tech_entity_last_seen" ON "TechEntity"("lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_tech_relation" ON "TechRelation"("sourceEntityId", "targetEntityId", "relationType");

-- CreateIndex
CREATE INDEX "idx_tech_relation_target" ON "TechRelation"("targetEntityId");

-- CreateIndex
CREATE INDEX "idx_tech_relation_type" ON "TechRelation"("relationType");

-- CreateIndex
CREATE UNIQUE INDEX "uq_relation_evidence" ON "TechRelationEvidence"("relationId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_article_tech_mention" ON "ArticleTechMention"("articleId", "entityId");

-- CreateIndex
CREATE INDEX "idx_article_tech_mention_entity" ON "ArticleTechMention"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_external_metric" ON "ExternalMetric"("entityId", "source", "measuredAt");

-- CreateIndex
CREATE INDEX "idx_external_metric_source" ON "ExternalMetric"("source");

-- CreateIndex
CREATE INDEX "idx_external_metric_time" ON "ExternalMetric"("measuredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_tag_entity_mapping" ON "TagEntityMapping"("tagId", "entityId");

-- AddForeignKey
ALTER TABLE "TechRelation" ADD CONSTRAINT "TechRelation_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechRelation" ADD CONSTRAINT "TechRelation_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechRelationEvidence" ADD CONSTRAINT "TechRelationEvidence_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "TechRelation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechRelationEvidence" ADD CONSTRAINT "TechRelationEvidence_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTechMention" ADD CONSTRAINT "ArticleTechMention_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTechMention" ADD CONSTRAINT "ArticleTechMention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalMetric" ADD CONSTRAINT "ExternalMetric_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagEntityMapping" ADD CONSTRAINT "TagEntityMapping_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagEntityMapping" ADD CONSTRAINT "TagEntityMapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "TechEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
