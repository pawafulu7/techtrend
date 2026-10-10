-- Issue #717: 20261011000000 で IF NOT EXISTS 付きで作った trigram 索引が、Article の該当列に
-- GIN + gin_trgm_ops で有効に存在することを確かめる。IF NOT EXISTS は、CONCURRENTLY が途中で失敗して
-- 残った INVALID の索引や、同名で別の定義の索引（本番は手作業で作られた索引）を素通りさせるため。
-- 違えばこの migration を失敗させ、後続の migration を止める。
--
-- 前の migration と分けている理由: Prisma の schema engine は migration を sqlparser で文に分けて
-- 1 文ずつ送るが、DO ブロックのように解釈できない文があると、スクリプト全体を 1 回で送る
-- （暗黙のトランザクションに包まれる）。CREATE INDEX CONCURRENTLY と同じファイルに書くと
-- 「CREATE INDEX CONCURRENTLY はトランザクションブロックの内側では実行できません」で失敗する。
--
-- 失敗したときの復旧: 該当の索引を `DROP INDEX CONCURRENTLY IF EXISTS "<索引名>";` で消し、
-- `npx prisma migrate resolve --rolled-back 20261011000001_verify_article_trgm_search_indexes` の後に
-- `npx prisma migrate deploy` で再適用する（20261011000000 の IF NOT EXISTS は既に適用済みなので、
-- 索引は手で `CREATE INDEX CONCURRENTLY ... USING GIN (<列> gin_trgm_ops)` を流して作り直す）。
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
        AND i.indisvalid AND i.indisready
    ) THEN
      RAISE EXCEPTION 'index % must be a valid GIN (gin_trgm_ops) index on "Article"(%)', names[k], cols[k];
    END IF;
  END LOOP;
END
$$;
