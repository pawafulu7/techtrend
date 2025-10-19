import { tool } from 'ai';
import { z } from 'zod';
import { VectorSearchService, SearchResult } from '../vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';

/**
 * Semantic Article Search Tool
 *
 * Wraps VectorSearchService for use by Vercel AI SDK agents.
 *
 * Security features:
 * - Input clamping (topK: 1-20 for agents, stricter than API limit of 100)
 * - Parameter validation via Zod schemas
 * - Reuses VectorSearchService security (Prisma.sql, SQL injection prevention)
 * - Singleton pattern for Prisma client (performance optimization)
 *
 * @see CodexMCP Review: "Clamp parameters so agent cannot craft extreme queries"
 * @see CodexMCP Review: "Use shared Prisma client (singleton or DI)"
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:503-643
 */

/**
 * Shared VectorSearchService instance (singleton pattern)
 *
 * Avoids creating new Prisma connections per tool call.
 * Improves performance and prevents connection pool exhaustion.
 *
 * @see CodexMCP Review: "Avoid instantiating VectorSearchService per tool call"
 */
let searchServiceInstance: VectorSearchService | null = null;

function getSearchService(): VectorSearchService {
  if (!searchServiceInstance) {
    searchServiceInstance = new VectorSearchService(prisma);
  }
  return searchServiceInstance;
}

/**
 * Convert Date or string to ISO string
 *
 * Handles cases where publishedAt might be Date (from Prisma) or string (from mocks/raw queries)
 */
function toIsoDate(input: Date | string): string {
  return input instanceof Date ? input.toISOString() : new Date(input).toISOString();
}

/**
 * Tool output schema (for agent consumption)
 *
 * Simplified version of SearchResult for agent responses.
 */
const toolOutputSchema = z.object({
  articles: z.array(
    z.object({
      articleId: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      translatedTitle: z.string().nullable(),
      similarity: z.number(),
      publishedAt: z.string(), // ISO 8601 format
      sourceId: z.string(),
    })
  ),
  count: z.number(),
});

/**
 * Semantic Article Search Tool
 *
 * Enables agents to search for technical articles using semantic similarity.
 */
export const semanticSearchTool = tool({
  description: `
Search for technical articles using semantic similarity.

Use this tool when users ask for:
- Articles on specific topics (e.g., "React performance", "TypeScript tips")
- Latest articles on a technology
- Articles from specific sources or tags

Examples of WHEN to use:
- "Find articles about Next.js image optimization"
- "Show me recent React articles"
- "Search for TypeScript best practices"
- "最新のReact記事を3件教えて"

DO NOT use this tool for:
- General questions unrelated to article search
- Coding help or technical support
- Requests for full article content (only titles and summaries available)

The tool returns articles ranked by semantic similarity (0-1 scale, higher is better).
  `.trim(),

  inputSchema: z.object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .max(200, 'Query too long for tool (max 200 characters)') // Stricter than API limit (500)
      .describe('Search query text'),

    topK: z
      .number()
      .int()
      .min(1, 'topK must be at least 1')
      .max(20, 'topK cannot exceed 20') // Agent limit: 20 (stricter than API limit: 100)
      .default(10)
      .describe('Number of results to return (1-20, default: 10)'),

    similarityThreshold: z
      .number()
      .min(0, 'Similarity threshold must be between 0 and 1')
      .max(1, 'Similarity threshold must be between 0 and 1')
      .default(0.3)
      .describe('Minimum similarity score (0-1, default: 0.3)'),

    filters: z
      .object({
        sources: z
          .array(z.string())
          .max(10, 'Too many source filters (max 10 for agents)') // Clamped to 10 (API allows 50)
          .optional(),
        tags: z
          .array(z.string())
          .max(10, 'Too many tag filters (max 10 for agents)') // Clamped to 10 (API allows 20)
          .optional(),
      })
      .optional()
      .describe('Optional filters for sources and tags'),
  }),

  outputSchema: toolOutputSchema,

  execute: async ({ query, topK, similarityThreshold, filters }) => {
    try {
      logger.debug(
        {
          query: query.substring(0, 50),
          topK,
          similarityThreshold,
          hasFilters: !!filters,
        },
        'Tool: semantic-article-search executing'
      );

      const searchService = getSearchService();

      const results: SearchResult[] = await searchService.search(query, {
        topK,
        similarityThreshold,
        sourceIds: filters?.sources,
        tags: filters?.tags,
        embeddingKey: 'summary', // Default to summary search
      });

      logger.info(
        {
          query: query.substring(0, 50),
          resultCount: results.length,
          avgSimilarity:
            results.length > 0
              ? (results.reduce((sum, r) => sum + r.similarity, 0) / results.length).toFixed(4)
              : 0,
        },
        'Tool: semantic-article-search completed'
      );

      // Transform results to tool output format
      return {
        articles: results.map((r) => ({
          articleId: r.articleId,
          title: r.title,
          summary: r.summary,
          translatedTitle: r.translatedTitle,
          similarity: r.similarity,
          publishedAt: toIsoDate(r.publishedAt as any),
          sourceId: r.sourceId,
        })),
        count: results.length,
      };
    } catch (error) {
      logger.error(
        {
          error: sanitizeError(error),
          query: query.substring(0, 50),
          topK,
        },
        'Tool: semantic-article-search failed'
      );

      throw error; // Propagate to agent for error handling
    }
  },
});
