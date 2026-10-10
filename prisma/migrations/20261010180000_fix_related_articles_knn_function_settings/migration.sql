-- related_articles_knn を作り直す（20261010150000 は本番で失敗した）
--
-- 20261010150000 は pgvector の設定（hnsw.*）を関数の SET に書いていた。スーパーユーザーでない
-- ロール（本番の neondb_owner）は、その接続で読み込まれていない拡張の設定を関数に保存できず、
-- 「permission denied to set parameter "hnsw.ef_search"」で失敗した（開発・テストの DB は
-- スーパーユーザーなので通っていた）。本番の 20261010150000 は何もしていない（0 ステップ）。
--
-- - PostgreSQL 本体の設定（計画の固定と jit）は、これまでどおり関数の SET に持たせる
-- - pgvector の設定は、関数の中で set_config(..., true) で掛ける。拡張がまだ読み込まれていなくても
--   仮の値として受け付けられ、索引を使うときに読み込まれた拡張がその値を引き継ぐ（開発 DB で
--   スーパーユーザーでないロールで確認）。関数の SET に書いた本体の設定は関数を抜けると戻るが、
--   set_config で掛けた値はトランザクションの終わりまで残る。関連記事と関係グラフは自動コミットの
--   1 文で呼ぶので、ほかの問い合わせには影響しない（Stage 1 も自分の値を毎回掛ける）
-- - 本文は PL/pgSQL にする（設定を掛けてから問い合わせを流す順序を、文の並びで確実にするため。
--   PL/pgSQL は RETURN QUERY の文に来たときに計画を立てる）
--
-- 検索の中身は 20261010150000 と同じ（設定と一致率の根拠はそちらのコメント）
CREATE OR REPLACE FUNCTION related_articles_knn(
  p_article_id text,
  p_model text,
  p_version integer,
  p_top_k integer,
  p_min_similarity double precision
)
RETURNS TABLE (
  "articleId" text,
  title text,
  summary text,
  "translatedTitle" text,
  "publishedAt" timestamptz,
  "sourceId" text,
  "qualityScore" double precision,
  "sourceName" text,
  thumbnail text,
  "embeddingKey" text,
  similarity double precision,
  tags jsonb
)
LANGUAGE plpgsql
SET enable_seqscan = off
SET enable_bitmapscan = off
SET enable_sort = off
SET jit = off
AS $$
#variable_conflict use_column
BEGIN
  PERFORM
    set_config('hnsw.ef_search', '100', true),
    set_config('hnsw.iterative_scan', 'relaxed_order', true),
    set_config('hnsw.scan_mem_multiplier', '2', true);

  RETURN QUERY
  SELECT
    nn.article_id,
    nn.article_title,
    nn.article_summary,
    nn.article_translated_title,
    nn.article_published_at,
    nn.article_source_id,
    nn.article_quality_score,
    s.name,
    nn.article_thumbnail,
    nn.embedding_key::text,
    1 - nn.distance,
    COALESCE(t.tag_list, '[]'::jsonb)
  FROM (
    SELECT target_embedding.embedding
    FROM "ArticleEmbedding" target_embedding
    WHERE target_embedding."articleId" = p_article_id
      AND target_embedding."embeddingKey" = 'summary'::"EmbeddingKey"
      AND target_embedding.model = p_model
      AND target_embedding.version = p_version
    LIMIT 1
  ) target
  CROSS JOIN LATERAL (
    SELECT
      a.id AS article_id,
      a.title AS article_title,
      a.summary AS article_summary,
      a."translatedTitle" AS article_translated_title,
      a."publishedAt" AS article_published_at,
      a."sourceId" AS article_source_id,
      a."qualityScore" AS article_quality_score,
      a.thumbnail AS article_thumbnail,
      e."embeddingKey" AS embedding_key,
      e.embedding <=> target.embedding AS distance
    FROM "ArticleEmbedding" e
    INNER JOIN "Article" a ON a.id = e."articleId"
    WHERE e."embeddingKey" = 'summary'::"EmbeddingKey"
      AND e.model = p_model
      AND e.version = p_version
      AND a."isHidden" = false
      AND a."sourceId" IN (SELECT src.id FROM "Source" src WHERE src.enabled = true)
      AND a.id <> p_article_id
    ORDER BY distance
    LIMIT p_top_k
  ) nn
  LEFT JOIN "Source" s ON s.id = nn.article_source_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name)) AS tag_list
    FROM "_ArticleToTag" article_tag
    JOIN "Tag" tag ON tag.id = article_tag."B"
    WHERE article_tag."A" = nn.article_id
  ) t ON TRUE
  WHERE 1 - nn.distance >= p_min_similarity;
END;
$$;
