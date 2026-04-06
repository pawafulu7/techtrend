-- Partial HNSW index for summary embeddings only
-- Rationale: existing full HNSW (idx_article_embedding_hnsw_cosine) is not used
-- when WHERE embeddingKey = 'summary' filter is present. This partial index
-- enables HNSW usage in a 2-stage query pattern.
-- Using non-CONCURRENTLY for Prisma migration compatibility.
-- For production, consider running CONCURRENTLY manually during low-traffic hours.

CREATE INDEX IF NOT EXISTS "idx_article_embedding_hnsw_summary"
ON "ArticleEmbedding"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE "embeddingKey" = 'summary'::"EmbeddingKey";
