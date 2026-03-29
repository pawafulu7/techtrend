-- Remove Knowledge Graph tables (children first, then parent)
DROP TABLE IF EXISTS "TechHealthSnapshot" CASCADE;
DROP TABLE IF EXISTS "TechTrendScore" CASCADE;
DROP TABLE IF EXISTS "TagEntityMapping" CASCADE;
DROP TABLE IF EXISTS "ExternalMetric" CASCADE;
DROP TABLE IF EXISTS "ArticleTechMention" CASCADE;
DROP TABLE IF EXISTS "TechRelationEvidence" CASCADE;
DROP TABLE IF EXISTS "TechRelation" CASCADE;
DROP TABLE IF EXISTS "TechEntity" CASCADE;

-- Remove Knowledge Graph enums
DROP TYPE IF EXISTS "TechEntityType";
DROP TYPE IF EXISTS "TechRelationType";
DROP TYPE IF EXISTS "MentionSentiment";
DROP TYPE IF EXISTS "MetricSource";
DROP TYPE IF EXISTS "TechMaturityStage";
