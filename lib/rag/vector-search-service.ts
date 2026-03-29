import { PrismaClient, Prisma } from '@prisma/client';
import { EmbeddingService } from './embedding-service';
import { logger, sanitizeError } from '@/lib/logger';
import { searchOptionsSchema, SearchOptionsInput } from './schemas';
import { getDynamicThreshold } from './query-utils';
import {
  QueryExpansionService,
  QueryExpansionResult,
} from './query-expansion-service';
import { env } from '@/lib/config/env';

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
  // Phase 2: Optional fields for graph visualization
  qualityScore?: number;
  sourceName?: string;
  tags?: Array<{ id: string; name: string }>;
  thumbnail?: string | null;
}

export class VectorSearchService {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService | null;
  private queryExpansionService: QueryExpansionService;
  private activeModel: string;
  private activeVersion: number;

  constructor(
    prisma: PrismaClient,
    embeddingService?: EmbeddingService | null
  ) {
    this.prisma = prisma;
    if (embeddingService !== undefined) {
      this.embeddingService = embeddingService;
    } else if (env.OPENAI_API_KEY) {
      this.embeddingService = new EmbeddingService();
    } else {
      this.embeddingService = null;
    }

    if (!this.embeddingService) {
      logger.warn(
        'EmbeddingService unavailable (missing OPENAI_API_KEY); vector search will be limited'
      );
    }
    this.queryExpansionService = new QueryExpansionService();
    this.activeModel = env.RAG_ACTIVE_MODEL || 'text-embedding-3-small';
    this.activeVersion = env.RAG_ACTIVE_VERSION;
  }

  /**
   * Check if EmbeddingService is configured and ready
   */
  isEmbeddingServiceAvailable(): boolean {
    return (
      this.embeddingService !== null && this.embeddingService !== undefined
    );
  }

  /**
   * Perform semantic search with expansion metadata
   *
   * @param query - Search query text
   * @param options - Search options (topK, filters, etc.)
   * @returns Search results with expansion metadata
   */
  async searchWithExpansion(
    query: string,
    options: SearchOptionsInput = {}
  ): Promise<{
    results: SearchResult[];
    expansion: QueryExpansionResult;
    originalQuery: string;
  }> {
    try {
      if (!this.embeddingService) {
        logger.warn(
          'Vector search requested but EmbeddingService is not configured (missing OPENAI_API_KEY)'
        );
        throw new Error(
          'Vector search is unavailable because no EmbeddingService is configured'
        );
      }

      const embeddingService = this.embeddingService;
      const thresholdProvided = options.similarityThreshold !== undefined;

      // Validate options with Zod schema
      const validated = searchOptionsSchema.parse(options);

      const {
        topK,
        similarityThreshold,
        sourceIds,
        tags,
        embeddingKey,
        dateRange,
        recencyBoost,
      } = validated;

      // Expand query before embedding generation (Phase 2)
      const expansion = await this.queryExpansionService.expandQuery(query);
      const effectiveQuery = expansion.expandedQuery;

      // Use dynamic threshold if not explicitly specified
      // Explicit threshold takes priority (backward compatibility)
      const effectiveThreshold = thresholdProvided
        ? similarityThreshold
        : getDynamicThreshold(query);

      logger.info(
        {
          originalQuery: query.substring(0, 50),
          expandedQuery:
            effectiveQuery !== query
              ? effectiveQuery.substring(0, 50)
              : undefined,
          expansionMethod: expansion.method,
          expansionLatency: expansion.latencyMs,
          topK,
          requestedThreshold: thresholdProvided
            ? similarityThreshold
            : undefined,
          effectiveThreshold,
          thresholdSource: thresholdProvided ? 'explicit' : 'dynamic',
          embeddingKey,
          hasSourceFilter: !!sourceIds,
          hasTagFilter: !!tags,
          hasDateFilter: !!(dateRange && (dateRange.from || dateRange.to)),
          recencyBoost,
        },
        'Vector search started'
      );

      // Generate query embedding (using expanded query)
      const queryEmbedding = await embeddingService.embedText(effectiveQuery);

      // Serialize vector with toFixed for PostgreSQL compatibility
      const vectorString = `[${queryEmbedding.map((v) => v.toFixed(8)).join(',')}]`;

      // Execute search using shared helper (Phase 2: refactored)
      const results = await this.executeVectorSearch(vectorString, {
        topK,
        similarityThreshold: effectiveThreshold,
        embeddingKey,
        sourceIds,
        tags,
        dateRange,
        recencyBoost,
      });

      logger.info(
        {
          query: query.substring(0, 50),
          resultCount: results.length,
          model: this.activeModel,
          embeddingKey,
          topK,
          hasDateFilter: !!(dateRange && (dateRange.from || dateRange.to)),
          recencyBoost,
          avgSimilarity:
            results.length > 0
              ? (
                  results.reduce((sum, r) => sum + r.similarity, 0) /
                  results.length
                ).toFixed(4)
              : '0.0000',
        },
        'Vector search completed'
      );

      return { results, expansion, originalQuery: query };
    } catch (error) {
      logger.error(
        {
          error: sanitizeError(error),
          query: query.substring(0, 50),
          options: {
            topK: options.topK,
            embeddingKey: options.embeddingKey,
            hasDateFilter: !!(
              options.dateRange &&
              (options.dateRange.from || options.dateRange.to)
            ),
            recencyBoost: options.recencyBoost,
          },
        },
        'Vector search failed'
      );

      throw error;
    }
  }

  /**
   * Search with automatic threshold fallback
   *
   * Implements progressive threshold relaxation to improve recall:
   * - Phase 1: Try thresholds [0.55, 0.50, 0.45, 0.40, 0.375, 0.35]
   * - Stop when resultCount >= 3
   * - Return results with metadata (phase, finalThreshold, attemptCount)
   *
   * @param query - Search query
   * @param options - Search options with enableFallback flag
   * @returns Results and fallback metadata
   */
  async searchWithFallback(
    query: string,
    options: SearchOptionsInput & { enableFallback?: boolean } = {}
  ): Promise<{
    results: SearchResult[];
    metadata: {
      phase: 1 | null;
      finalThreshold: number;
      attemptCount: number;
      usedFallback: boolean;
    };
  }> {
    const { enableFallback = false, ...searchOptions } = options;

    if (!enableFallback) {
      const thresholdProvided = searchOptions.similarityThreshold !== undefined;
      const { results } = await this.searchWithExpansion(query, searchOptions);
      return {
        results,
        metadata: {
          phase: null,
          finalThreshold: thresholdProvided
            ? (searchOptions.similarityThreshold as number)
            : getDynamicThreshold(query),
          attemptCount: 1,
          usedFallback: false,
        },
      };
    }

    if (!this.embeddingService) {
      logger.warn(
        'Vector search requested but EmbeddingService is not configured (missing OPENAI_API_KEY)'
      );
      throw new Error(
        'Vector search is unavailable because no EmbeddingService is configured'
      );
    }

    const embeddingService = this.embeddingService;

    // Validate options with Zod schema
    const validated = searchOptionsSchema.parse(searchOptions);
    const { topK, sourceIds, tags, embeddingKey, dateRange, recencyBoost } =
      validated;

    // Expand query once before threshold loop
    const expansionStart = Date.now();
    const expansion = await this.queryExpansionService.expandQuery(query);
    const effectiveQuery = expansion.expandedQuery;
    const expansionLatency = Date.now() - expansionStart;

    logger.info(
      {
        originalQuery: query.substring(0, 50),
        expandedQuery:
          effectiveQuery !== query
            ? effectiveQuery.substring(0, 50)
            : undefined,
        expansionMethod: expansion.method,
        expansionLatency,
        topK,
        embeddingKey,
        hasSourceFilter: !!sourceIds,
        hasTagFilter: !!tags,
        hasDateFilter: !!(dateRange && (dateRange.from || dateRange.to)),
        recencyBoost,
      },
      'Vector search started (fallback mode)'
    );

    // Generate embedding once for all threshold iterations
    const queryEmbedding = await embeddingService.embedText(effectiveQuery);
    const vectorString = `[${queryEmbedding.map((v) => v.toFixed(8)).join(',')}]`;

    logger.info(
      {
        query: query.substring(0, 50),
        embeddingDim: queryEmbedding.length,
      },
      'Embedding generated (reused across threshold attempts)'
    );

    const thresholds = [0.55, 0.5, 0.45, 0.4, 0.375, 0.35];
    let attemptCount = 0;
    let lastResults: SearchResult[] = [];

    for (const threshold of thresholds) {
      attemptCount++;
      const results = await this.executeVectorSearch(vectorString, {
        topK,
        similarityThreshold: threshold,
        embeddingKey,
        sourceIds,
        tags,
        dateRange,
        recencyBoost,
      });

      lastResults = results;

      logger.info(
        {
          phase: 1,
          attempt: attemptCount,
          threshold,
          resultCount: results.length,
          query: query.substring(0, 50),
        },
        'Threshold fallback attempt'
      );

      if (results.length >= 3) {
        logger.info(
          {
            query: query.substring(0, 50),
            resultCount: results.length,
            model: this.activeModel,
            embeddingKey,
            topK,
            hasDateFilter: !!(dateRange && (dateRange.from || dateRange.to)),
            recencyBoost,
            avgSimilarity:
              results.length > 0
                ? (
                    results.reduce((sum, r) => sum + r.similarity, 0) /
                    results.length
                  ).toFixed(4)
                : '0.0000',
          },
          'Vector search completed'
        );

        return {
          results,
          metadata: {
            phase: 1,
            finalThreshold: threshold,
            attemptCount,
            usedFallback: attemptCount > 1,
          },
        };
      }
    }

    logger.info(
      {
        query: query.substring(0, 50),
        resultCount: lastResults.length,
        model: this.activeModel,
        embeddingKey,
        topK,
        hasDateFilter: !!(dateRange && (dateRange.from || dateRange.to)),
        recencyBoost,
        avgSimilarity:
          lastResults.length > 0
            ? (
                lastResults.reduce((sum, r) => sum + r.similarity, 0) /
                lastResults.length
              ).toFixed(4)
            : '0.0000',
      },
      'Vector search completed'
    );

    logger.warn(
      {
        query: query.substring(0, 50),
        attemptCount,
        finalThreshold: 0.35,
      },
      'Threshold fallback completed but result count < 3'
    );

    return {
      results: lastResults,
      metadata: {
        phase: 1,
        finalThreshold: 0.35,
        attemptCount,
        usedFallback: true,
      },
    };
  }

  /**
   * Perform semantic search
   *
   * @param query - Search query text
   * @param options - Search options (topK, filters, etc.)
   * @returns Array of articles ranked by similarity
   */
  async search(
    query: string,
    options: SearchOptionsInput = {}
  ): Promise<SearchResult[]> {
    const { results } = await this.searchWithExpansion(query, options);
    return results;
  }

  /**
   * Search for similar articles by article ID (Phase 2)
   *
   * Uses the article's stored embedding to find semantically similar articles
   * via pgvector cosine similarity
   *
   * @param articleId - Article ID to find similar articles for
   * @param options - Search options (embeddingKey, topK, threshold)
   * @returns Array of similar articles ranked by similarity
   */
  async searchByArticleId(
    articleId: string,
    options: {
      embeddingKey?: 'title' | 'summary';
      topK?: number;
      similarityThreshold?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      embeddingKey = 'summary',
      topK = 20,
      similarityThreshold = 0.3,
    } = options;

    if (!this.embeddingService) {
      logger.warn(
        { articleId, embeddingKey },
        'EmbeddingService unavailable (no OPENAI_API_KEY), returning empty results'
      );
      return [];
    }

    try {
      // 1. Fetch article embedding via $queryRaw (Unsupported type)
      // CodexMCP: Cast to ::text to get string representation
      const rows = await this.prisma.$queryRaw<Array<{ embedding: string }>>`
        SELECT embedding::text AS embedding
        FROM "ArticleEmbedding"
        WHERE "articleId" = ${articleId}
          AND "embeddingKey" = ${embeddingKey}::"EmbeddingKey"
          AND model = ${this.activeModel}
          AND version = ${this.activeVersion}
        LIMIT 1
      `;

      // Short-circuit if no embedding (CodexMCP: return empty + log)
      if (rows.length === 0) {
        logger.warn(
          { articleId, embeddingKey },
          'No embedding found for article'
        );
        return [];
      }

      // 2. Parse embedding string to array (pgvector returns "[v1,v2,...]")
      const embeddingString = rows[0].embedding;

      // Validate format (CodeRabbit: handle malformed data)
      if (!embeddingString.startsWith('[') || !embeddingString.endsWith(']')) {
        logger.error(
          {
            articleId,
            embeddingKey,
            format: embeddingString.substring(0, 50),
          },
          'Invalid embedding format'
        );
        return [];
      }

      const embeddingArray = embeddingString
        .slice(1, -1)
        .split(',')
        .map((value) => {
          const num = Number(value.trim());
          if (isNaN(num)) {
            throw new Error(`Invalid embedding value: ${value}`);
          }
          return num;
        });

      // Validate dimension (CodeRabbit: detect data corruption)
      const MIN_EMBEDDING_DIM = 10; // Most models have at least 10 dimensions
      if (
        embeddingArray.length === 0 ||
        embeddingArray.length < MIN_EMBEDDING_DIM
      ) {
        logger.error(
          {
            articleId,
            embeddingKey,
            actualDim: embeddingArray.length,
            model: this.activeModel,
          },
          'Invalid embedding dimension'
        );
        return [];
      }

      // 3. Serialize vector (same format as search())
      const vectorString = `[${embeddingArray.map((v) => v.toFixed(8)).join(',')}]`;

      // 4. Execute search using shared helper
      const results = await this.executeVectorSearch(vectorString, {
        topK,
        similarityThreshold,
        embeddingKey,
        excludeArticleId: articleId, // Exclude self from results
      });

      logger.info(
        {
          articleId,
          embeddingKey,
          resultCount: results.length,
          avgSimilarity:
            results.length > 0
              ? (
                  results.reduce((sum, r) => sum + r.similarity, 0) /
                  results.length
                ).toFixed(4)
              : '0.0000',
        },
        'Article similarity search completed'
      );

      return results;
    } catch (error) {
      logger.error(
        {
          error: sanitizeError(error),
          articleId,
          embeddingKey,
        },
        'Article similarity search failed'
      );

      throw error;
    }
  }

  /**
   * Execute vector search with precomputed vector string
   *
   * Shared helper for search() and searchByArticleId() (Phase 2)
   * Performs pgvector cosine similarity search with filters
   *
   * @param vectorString - Serialized vector string "[v1,v2,...]"
   * @param options - Search options
   * @returns Array of articles ranked by similarity
   */
  private async executeVectorSearch(
    vectorString: string,
    options: {
      topK: number;
      similarityThreshold: number;
      embeddingKey: 'title' | 'summary' | 'both';
      sourceIds?: string[];
      tags?: string[];
      dateRange?: { from?: string; to?: string };
      recencyBoost?: number;
      excludeArticleId?: string;
    }
  ): Promise<SearchResult[]> {
    const {
      topK,
      similarityThreshold,
      embeddingKey,
      sourceIds,
      tags,
      dateRange,
      recencyBoost = 0,
      excludeArticleId,
    } = options;

    // Build embedding key filter
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

    // Build date filter (index-friendly)
    const dateFilter =
      dateRange && (dateRange.from || dateRange.to)
        ? Prisma.sql`
            ${dateRange.from ? Prisma.sql`AND a."publishedAt" >= ${dateRange.from}::timestamptz` : Prisma.empty}
            ${dateRange.to ? Prisma.sql`AND a."publishedAt" <= ${dateRange.to}::timestamptz` : Prisma.empty}
          `
        : Prisma.empty;

    // Build exclude filter (Phase 2: for searchByArticleId)
    const excludeFilter = excludeArticleId
      ? Prisma.sql`AND a.id != ${excludeArticleId}`
      : Prisma.empty;

    // Execute search with LATERAL JOIN for tags (Phase 2)
    // JSONB will be auto-decoded by Prisma driver
    const results = await this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        a.id as "articleId",
        a.title,
        a.summary,
        a."translatedTitle",
        a."publishedAt",
        a."sourceId",
        a."qualityScore",
        s.name AS "sourceName",
        a.thumbnail,
        e."embeddingKey",
        CASE
          WHEN ${recencyBoost} > 0 THEN
            LEAST(
              (1 - (e.embedding <=> ${vectorString}::vector)) *
              (1 + ${recencyBoost} *
                exp(-ln(2) * EXTRACT(EPOCH FROM (NOW() - a."publishedAt")) / (30 * 24 * 3600))
              ),
              1.0
            )
          ELSE
            1 - (e.embedding <=> ${vectorString}::vector)
        END as similarity,
        COALESCE(tags.tag_list, '[]'::jsonb) AS tags
      FROM "ArticleEmbedding" e
      INNER JOIN "Article" a ON a.id = e."articleId"
      LEFT JOIN "Source" s ON s.id = a."sourceId"
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name)) AS tag_list
        FROM "_ArticleToTag" at
        JOIN "Tag" t ON t.id = at."B"
        WHERE at."A" = a.id
      ) tags ON TRUE
      WHERE e.model = ${this.activeModel}
        AND e.version = ${this.activeVersion}
        ${embeddingKeyFilter}
        AND 1 - (e.embedding <=> ${vectorString}::vector) >= ${similarityThreshold}
        AND a."isHidden" = false
        ${sourceFilter}
        ${tagFilter}
        ${dateFilter}
        ${excludeFilter}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;

    return results;
  }
}
