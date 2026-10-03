-- Issue #686: title と summary の両方を含む全体の HNSW 索引を削除する。
-- アプリのベクトル検索は summary だけの部分索引 idx_article_embedding_hnsw_summary を使う
-- （パーソナライズの Stage 1）。RAG（lib/rag/vector-search-service.ts）は類似度の式で並べるため
-- HNSW を使えない。全体の索引は Stage 1 のプランナーが ef_search 次第で選んでしまい
-- （title の行をフィルタで捨てながら走査する）、本番では部分索引とキャッシュを奪い合う。
-- 戻すときは 20251213100302_add_hnsw_vector_index の CREATE INDEX を CONCURRENTLY で流す。
-- Prisma 7.4.0 以降は文ごとに送るので CONCURRENTLY を書ける。
DROP INDEX CONCURRENTLY IF EXISTS "idx_article_embedding_hnsw_cosine";
