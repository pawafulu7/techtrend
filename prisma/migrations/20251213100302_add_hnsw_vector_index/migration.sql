-- Add HNSW vector index for ArticleEmbedding
-- HNSW provides better query performance than IVFFlat (10-100x improvement)
-- Parameters: m=16 (connections per node), ef_construction=64 (build quality)
-- Note: This requires PRISMA_MIGRATION_ENGINE_SKIP_TRANSACTIONS=1 for CONCURRENTLY

-- Drop existing IVFFlat index (will be replaced by HNSW)
DROP INDEX IF EXISTS "idx_article_embedding_vector_ivfflat";

-- Create HNSW index for cosine similarity search
-- Using non-CONCURRENTLY for Prisma migration compatibility
-- For production with large data, run CONCURRENTLY manually outside of migration
CREATE INDEX IF NOT EXISTS "idx_article_embedding_hnsw_cosine"
ON "ArticleEmbedding"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Also create HNSW index for ArticleChunk if needed
DROP INDEX IF EXISTS "idx_article_chunk_embedding_ivfflat";

CREATE INDEX IF NOT EXISTS "idx_article_chunk_embedding_hnsw_cosine"
ON "ArticleChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
