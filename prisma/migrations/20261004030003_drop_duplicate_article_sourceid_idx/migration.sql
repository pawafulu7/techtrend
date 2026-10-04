-- Keep the mapped Article indexes and both Tag UNIQUE indexes.
-- One statement per migration: multiple CONCURRENTLY statements in one script
-- are sent together by the PostgreSQL adapter and form an implicit transaction.
DROP INDEX CONCURRENTLY IF EXISTS "public"."Article_sourceId_idx";
