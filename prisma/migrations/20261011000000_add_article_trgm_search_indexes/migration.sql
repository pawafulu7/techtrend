-- Issue #717: キーワード検索（title / summary の ILIKE・LIKE）を trigram の GIN 索引で引く。
--
-- 索引は 20251004194303 で追加されたが schema.prisma に宣言されていなかったため、
-- 20251019121142（migrate dev の自動生成）が drift として DROP INDEX を出した。
-- 本番 DB には手で作り直した索引が残っているので、IF NOT EXISTS で何もしない。
-- dev / test / shadow DB は履歴どおり索引が無いので、ここで作る。
-- 今回から schema.prisma にも @@index(type: Gin, ops: raw("gin_trgm_ops")) で宣言したので、
-- migrate dev が再び DROP を生成することはない。
-- CONCURRENTLY は Prisma 7.4.0 以降が文ごとに送るので書ける（creating-migration スキル）。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_title_trgm"
  ON "Article" USING GIN ("title" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_article_summary_trgm"
  ON "Article" USING GIN ("summary" gin_trgm_ops);
