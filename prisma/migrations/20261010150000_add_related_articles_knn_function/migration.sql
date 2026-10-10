-- 記事に内容が近い記事の kNN（関連記事・関係グラフ。lib/rag/article-knn.ts から呼ぶ）
--
-- 計画の固定と HNSW の設定を関数の SET に持たせ、埋め込みの取得も含めて 1 回の往復で済ませる。
-- アプリから設定・トランザクション・埋め込みの取得を別々に送ると 5 往復かかり、関数（東京）と
-- DB（シンガポール）の間では 1 往復が約 80ms かかるため。
--
-- - 部分 HNSW（idx_article_embedding_hnsw_summary）を使うため、距離で並べて上位 k 件を読む。
--   非表示・無効なソース・自分自身・モデルの条件は iterative scan の中で掛け、閾値は外で掛ける
--   （中に入れると、閾値を満たす行が k 件に満たない記事で hnsw.max_scan_tuples まで読み続ける）
-- - 無効なソースの条件は lib/database/enabled-source-filter.ts の enabledSourceSql と同じ
-- - hnsw.ef_search は 100。本番の冷えた状態で 400 の 1.3〜5.5 秒に対し 1.0〜2.2 秒（ページを読む
--   量で決まる）。開発 DB の 30 記事の上位 10 件で、厳密な検索との一致は 400 が 100%、100 が 97.9%
-- - 計画の固定で無効にした手段のコストは巨大になり、汎用の計画（引数の値を知らない）で LIMIT を
--   多めに見積もると JIT が走るので、jit も切る
-- - 並べ替えは呼び出し側で行う（relaxed_order では距離の順が前後し得るが、ここで並べ直すと
--   enable_sort=off の Sort になる）
-- - 列は別名付きで書く（RETURNS TABLE の列名と同じ名前を、本文で修飾なしに使わない）
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
LANGUAGE sql
STABLE
SET enable_seqscan = off
SET enable_bitmapscan = off
SET enable_sort = off
SET jit = off
SET hnsw.ef_search = 100
SET hnsw.iterative_scan = relaxed_order
SET hnsw.scan_mem_multiplier = 2
AS $$
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
  WHERE 1 - nn.distance >= p_min_similarity
$$;
