-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify pgvector is available
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension is required but not installed';
  END IF;
END $$;

-- Create EmbeddingKey enum type
CREATE TYPE "EmbeddingKey" AS ENUM ('title', 'summary', 'content');

-- Create ArticleEmbedding table
CREATE TABLE "ArticleEmbedding" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "embeddingKey" "EmbeddingKey" NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleEmbedding_pkey" PRIMARY KEY ("id")
);

-- Create ArticleChunk table
CREATE TABLE "ArticleChunk" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleChunk_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX "ArticleEmbedding_articleId_embeddingKey_model_version_key" ON "ArticleEmbedding"("articleId", "embeddingKey", "model", "version");

CREATE UNIQUE INDEX "ArticleChunk_articleId_chunkIndex_model_version_key" ON "ArticleChunk"("articleId", "chunkIndex", "model", "version");

-- Create BTREE indexes for JOIN performance and filtering
CREATE INDEX "idx_article_embedding_article_id" ON "ArticleEmbedding"("articleId");

CREATE INDEX "idx_article_embedding_model_version" ON "ArticleEmbedding"("model", "version");

CREATE INDEX "idx_article_embedding_key" ON "ArticleEmbedding"("embeddingKey");

CREATE INDEX "idx_article_embedding_computed_at" ON "ArticleEmbedding"("computedAt");

CREATE INDEX "idx_article_chunk_article_index" ON "ArticleChunk"("articleId", "chunkIndex");

-- Create vector similarity indexes (IVFFLAT for POC)
-- lists parameter: 10 for ~100 articles (sqrt(total_rows))
CREATE INDEX "idx_article_embedding_vector_ivfflat" ON "ArticleEmbedding" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 10);

CREATE INDEX "idx_article_chunk_embedding_ivfflat" ON "ArticleChunk" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 10);

-- Add foreign key constraints with CASCADE delete
ALTER TABLE "ArticleEmbedding" ADD CONSTRAINT "ArticleEmbedding_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleChunk" ADD CONSTRAINT "ArticleChunk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Performance optimization settings
SET maintenance_work_mem = '256MB';
SET max_parallel_maintenance_workers = 4;

-- Analyze tables for query planner
ANALYZE "ArticleEmbedding";
ANALYZE "ArticleChunk";

-- Add table and column comments for documentation
COMMENT ON TABLE "ArticleEmbedding" IS 'Vector embeddings for semantic search (RAG)';
COMMENT ON COLUMN "ArticleEmbedding"."embeddingKey" IS 'Field type: title, summary, content';
COMMENT ON COLUMN "ArticleEmbedding"."model" IS 'OpenAI model: text-embedding-3-small, etc.';
COMMENT ON COLUMN "ArticleEmbedding"."version" IS 'Embedding version for A/B testing';

COMMENT ON TABLE "ArticleChunk" IS 'Content chunks for long articles (>8k tokens)';
COMMENT ON COLUMN "ArticleChunk"."chunkIndex" IS 'Chunk index (0-based ordering)';
