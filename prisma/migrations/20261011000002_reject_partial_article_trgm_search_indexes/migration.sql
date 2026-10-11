-- Issue #717（PR #751 のレビュー指摘）: trigram 索引の検査に「部分索引でないこと」を足す。
-- 同名の索引が WHERE 付き（例: WHERE "isHidden" = false）で作られていると、20261011000000 の
-- IF NOT EXISTS は作り直さず、20261011000001 の検査も通ってしまう。部分索引の条件に合わない検索では
-- 索引を使えないので、ここで失敗させる。
-- 20261011000001 はコミット済みで変更しない規則（creating-migration スキル）のため、別の migration にした。
-- 検査は 20261011000001 の条件（存在・GIN・gin_trgm_ops・列・valid/ready）も含めて全部やり直す。
-- この migration だけを復旧で再適用したときに、索引が消えたまま・INVALID のままでも通らないようにするため。
-- CONCURRENTLY を含まないので、DO ブロックを置いてよい。
--
-- 失敗したときの復旧（本番は scripts/db/with-prod-db.sh 経由で接続先を本番に揃える）:
--   1. 該当の索引を `DROP INDEX CONCURRENTLY IF EXISTS "<索引名>";` で消し、
--      `CREATE INDEX CONCURRENTLY "<索引名>" ON "Article" USING GIN ("<列>" gin_trgm_ops);` で作り直す
--   2. `bash scripts/db/with-prod-db.sh --as-database-url npx prisma migrate resolve --rolled-back 20261011000002_reject_partial_article_trgm_search_indexes`
--   3. `bash scripts/db/with-prod-db.sh --as-database-url npx prisma migrate deploy`
DO $$
DECLARE
  names text[] := ARRAY['idx_article_title_trgm', 'idx_article_summary_trgm'];
  cols  text[] := ARRAY['title', 'summary'];
  k int;
BEGIN
  FOR k IN 1..2 LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = c.relam
      JOIN pg_opclass op ON op.oid = i.indclass[0]
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
      WHERE n.nspname = 'public' AND t.relname = 'Article' AND c.relname = names[k]
        AND am.amname = 'gin' AND op.opcname = 'gin_trgm_ops'
        AND i.indnatts = 1 AND a.attname = cols[k]
        AND i.indpred IS NULL
        AND i.indisvalid AND i.indisready
    ) THEN
      RAISE EXCEPTION 'index % must be a valid, non-partial GIN (gin_trgm_ops) index on "Article"(%)', names[k], cols[k];
    END IF;
  END LOOP;
END
$$;
