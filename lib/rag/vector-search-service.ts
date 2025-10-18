import { PrismaClient, Prisma } from '@prisma/client';
import { EmbeddingService } from './embedding-service';
import { logger, sanitizeError } from '@/lib/logger';
import { searchOptionsSchema, SearchOptionsInput } from './schemas';

/**
 * Vector Search Service
 *
 * Performs semantic search using pgvector cosine similarity with:
 * - SQL injection防止 (Prisma.sql parameterized queries)
 * - Filter support (sources, tags, embeddingKey)
 * - Runtime validation (Zod schemas)
 * - Secure error handling
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:914-1143
 */

export interface SearchResult {
  articleId: string;
  title: string;
  summary: string | null;
  translatedTitle: string | null;
  similarity: number;
  publishedAt: Date;
  sourceId: string;
  embeddingKey: string;
}

export class VectorSearchService {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService;
  private activeModel: string;
  private activeVersion: number;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.embeddingService = new EmbeddingService();
    this.activeModel = process.env.RAG_ACTIVE_MODEL || 'text-embedding-3-small';
    this.activeVersion = parseInt(process.env.RAG_ACTIVE_VERSION || '1', 10);
  }

  /**
   * Perform semantic search
   *
   * @param query - Search query text
   * @param options - Search options (topK, filters, etc.)
   * @returns Array of articles ranked by similarity
   */
  async search(query: string, options: SearchOptionsInput = {}): Promise<SearchResult[]> {
    try {
      // Validate options with Zod schema
      const validated = searchOptionsSchema.parse(options);

      const { topK, similarityThreshold, sourceIds, tags, embeddingKey } = validated;

      logger.info({
        query: query.substring(0, 50),
        topK,
        similarityThreshold,
        embeddingKey,
        hasSourceFilter: !!sourceIds,
        hasTagFilter: !!tags,
      }, 'Vector search started');

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.embedText(query);

      // Serialize vector with toFixed for PostgreSQL compatibility
      const vectorString = `[${queryEmbedding.map(v => v.toFixed(8)).join(',')}]`;

      // Build embedding key filter using Prisma.sql (SECURE)
      const embeddingKeyFilter =
        embeddingKey === 'both'
          ? Prisma.sql`AND e."embeddingKey" IN ('title', 'summary')`
          : Prisma.sql`AND e."embeddingKey" = ${embeddingKey}::"EmbeddingKey"`;

      // Build source filter (SECURE: parameter binding)
      const sourceFilter =
        sourceIds && sourceIds.length > 0
          ? Prisma.sql`AND a."sourceId" = ANY(${sourceIds})`
          : Prisma.empty;

      // Build tag filter (SECURE: subquery with parameter binding)
      const tagFilter =
        tags && tags.length > 0
          ? Prisma.sql`
              AND EXISTS (
                SELECT 1 FROM "_ArticleToTag" at
                INNER JOIN "Tag" t ON t.id = at."B"
                WHERE at."A" = a.id
                AND t.name = ANY(${tags})
              )
            `
          : Prisma.empty;

      // Execute search with Prisma.sql (SECURE - parameter binding)
      // Cosine similarity: 1 - (embedding <=> query_vector)
      const results = await this.prisma.$queryRaw<SearchResult[]>`
        SELECT
          a.id as "articleId",
          a.title,
          a.summary,
          a."translatedTitle",
          a."publishedAt",
          a."sourceId",
          e."embeddingKey",
          1 - (e.embedding <=> ${vectorString}::vector) as similarity
        FROM "ArticleEmbedding" e
        INNER JOIN "Article" a ON a.id = e."articleId"
        WHERE e.model = ${this.activeModel}
          AND e.version = ${this.activeVersion}
          ${embeddingKeyFilter}
          AND 1 - (e.embedding <=> ${vectorString}::vector) >= ${similarityThreshold}
          ${sourceFilter}
          ${tagFilter}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `;

      logger.info({
        query: query.substring(0, 50),
        resultCount: results.length,
        model: this.activeModel,
        embeddingKey,
        topK,
        avgSimilarity:
          results.length > 0
            ? (results.reduce((sum, r) => sum + r.similarity, 0) / results.length).toFixed(4)
            : 0,
      }, 'Vector search completed');

      return results;
    } catch (error) {
      logger.error({
        error: sanitizeError(error),
        query: query.substring(0, 50),
        options: {
          topK: options.topK,
          embeddingKey: options.embeddingKey,
        },
      }, 'Vector search failed');

      throw error;
    }
  }
}
