-- Session_token_key already supplies the same BTree lookup and enforces uniqueness.
-- Keep that UNIQUE index; remove only the redundant ordinary index.
-- Rollback: CREATE INDEX CONCURRENTLY "idx_session_token" ON "public"."Session"("token");
DROP INDEX CONCURRENTLY IF EXISTS "public"."idx_session_token";
