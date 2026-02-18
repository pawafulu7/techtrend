-- Add CHECK constraint for growth rate fields.
-- Growth rates are clipped to [-100, 500] by application logic (GROWTH_RATE_CLIP),
-- so we enforce the same range at the database level as a safety net.
ALTER TABLE "TechTrendScore" ADD CONSTRAINT "chk_trend_score_growth_range"
  CHECK (
    "articleMentionGrowth" >= -100 AND "articleMentionGrowth" <= 500
    AND "githubStarsGrowth" >= -100 AND "githubStarsGrowth" <= 500
    AND "npmDownloadsGrowth" >= -100 AND "npmDownloadsGrowth" <= 500
    AND "soQuestionsGrowth" >= -100 AND "soQuestionsGrowth" <= 500
  );

-- Drop redundant indexes: the unique constraints uq_trend_score_entity_date and
-- uq_health_snapshot_entity_date already create BTree indexes on (entityId, calculatedAt).
-- PostgreSQL BTree indexes support reverse scans, so descending order queries
-- are served efficiently by the unique index alone.
DROP INDEX IF EXISTS "idx_trend_score_entity_history";
DROP INDEX IF EXISTS "idx_health_snapshot_entity_history";
