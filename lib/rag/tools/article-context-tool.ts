/**
 * Article Context Tool
 *
 * Extracts relevant chunks from article content for Conversational Learning Coach.
 * Implements token-aware chunking, semantic scoring, and HTML sanitization.
 *
 * @module article-context-tool
 */

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { sanitizeArticleHtml, stripHtmlTags } from '@/lib/utils/html-sanitizer';
import { countTokens, chunkByTokens } from '@/lib/utils/chunking';
import { cosineSimilarity } from '@/lib/utils/vector-math';
import { EmbeddingService } from '@/lib/rag/embedding-service';

/**
 * Chunk with scoring metadata
 */
interface ScoredChunk {
  chunkId: string;
  chunkIndex: number;
  html: string;
  text: string;
  tokenCount: number;
  score: number;
  startToken: number;
  endToken: number;
  isSummary?: boolean;
}

/**
 * Shared EmbeddingService instance (singleton pattern)
 */
let embeddingServiceInstance: EmbeddingService | null = null;

function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService();
  }
  return embeddingServiceInstance;
}

/**
 * Calculate keyword relevance score
 *
 * Simple TF-IDF-style scoring based on keyword matches.
 * Boosts chunks containing query keywords.
 *
 * @param chunkText - Chunk text
 * @param query - User query
 * @returns Keyword boost score (0-0.2)
 */
function calculateKeywordBoost(chunkText: string, query: string): number {
  const lowerChunk = chunkText.toLowerCase();
  const keywords = query.toLowerCase().split(/\s+/);

  let boost = 0;
  for (const keyword of keywords) {
    if (lowerChunk.includes(keyword)) {
      boost += 0.05; // +0.05 per keyword match

      // Additional boost if keyword appears in code block
      if (
        lowerChunk.includes(`<code>${keyword}`) ||
        lowerChunk.includes(`\`${keyword}\``)
      ) {
        boost += 0.05; // +0.05 for code context
      }
    }
  }

  return Math.min(boost, 0.2); // Cap at 0.2
}

/**
 * Calculate position boost score
 *
 * Prioritizes chunks at the beginning of the article.
 * Gives maximum boost to summary chunks.
 *
 * @param chunkIndex - Chunk index (-1 for summary, 0+ for content)
 * @param isSummary - Whether this is a summary chunk
 * @param totalChunks - Total number of chunks
 * @returns Position boost score (0-0.1)
 */
function calculatePositionBoost(
  chunkIndex: number,
  isSummary: boolean,
  totalChunks: number
): number {
  if (isSummary) {
    return 0.1; // Maximum boost for summary
  }

  if (chunkIndex === 0) {
    return 0.05; // Boost for first chunk
  }

  // Gradual decrease for later chunks
  const positionRatio = 1 - chunkIndex / totalChunks;
  return positionRatio * 0.03; // 0-0.03 range
}

/**
 * Score chunks by relevance to query
 *
 * Combines semantic similarity, keyword matching, and position boost.
 * Final score = semanticScore * 0.8 + keywordBoost + positionBoost
 *
 * Performance note:
 * Currently generates embeddings for all chunks on every request.
 * TODO: Cache chunk embeddings in Redis/DB keyed by (articleId, chunkIndex, updatedAt)
 * to reduce OpenAI API calls (1 + N → 1 per request) and improve latency.
 * Invalidate on article.updatedAt change.
 *
 * @param options - Scoring options
 * @returns Scored chunks sorted by relevance
 */
async function scoreChunks(options: {
  chunks: ScoredChunk[];
  query: string;
  articleId: string;
  minScore: number;
}): Promise<ScoredChunk[]> {
  const { chunks, query, minScore: _minScore } = options;

  if (chunks.length === 0) {
    return [];
  }

  try {
    // Generate embeddings for query and all chunks in a single API call
    const embeddingService = getEmbeddingService();
    const allTexts = [query, ...chunks.map((c) => c.text)];
    const allEmbeddings = await embeddingService.embedBatch(allTexts);

    if (allEmbeddings.length !== allTexts.length) {
      throw new Error(
        `Embedding count mismatch: expected ${allTexts.length}, got ${allEmbeddings.length}`
      );
    }

    const queryEmbedding = allEmbeddings[0];
    const chunkEmbeddings = allEmbeddings.slice(1);

    // Calculate semantic similarity for each chunk
    const scoredChunks = chunks.map((chunk, i) => {
      const semanticScore = cosineSimilarity(
        queryEmbedding,
        chunkEmbeddings[i]
      );

      // Calculate boost scores
      const keywordBoost = calculateKeywordBoost(chunk.html, query);
      const positionBoost = calculatePositionBoost(
        chunk.chunkIndex,
        chunk.isSummary || false,
        chunks.length
      );

      // Final score
      const finalScore = Math.max(
        0,
        Math.min(1, semanticScore * 0.8 + keywordBoost + positionBoost)
      );

      return {
        ...chunk,
        score: finalScore,
      };
    });

    // Sort by score (filtering handled by caller to allow fallback logic)
    return scoredChunks.sort((a, b) => b.score - a.score);
  } catch (error) {
    logger.warn(
      {
        error: sanitizeError(error),
        articleId: options.articleId,
        chunkCount: chunks.length,
      },
      'article-context scoreChunks failed, using keyword-only scoring'
    );

    // Fallback: keyword-only scoring (unfiltered, caller will handle thresholds)
    return chunks
      .map((chunk) => {
        const keywordBoost = calculateKeywordBoost(chunk.html, query);
        const positionBoost = calculatePositionBoost(
          chunk.chunkIndex,
          chunk.isSummary || false,
          chunks.length
        );
        const score = Math.min(1, keywordBoost + positionBoost + 0.5); // Base 0.5 + boosts

        return { ...chunk, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * Article Context Tool
 *
 * Returns sanitized, relevant article chunks (max 3) for grounding
 * Conversational Learning Coach responses.
 */
export const articleContextTool = tool({
  description: `
Extract relevant chunks from article content to answer questions about the article.

Use this tool when the user asks questions about a specific article:
- "What are the prerequisites for this article?"
- "What alternatives does this article mention?"
- "What are the implementation caveats?"
- "Can you summarize this article briefly?"

The tool returns:
- Up to 3 most relevant chunks from the article
- Sanitized HTML (safe tags only)
- Token count for each chunk
- Relevance score for each chunk

DO NOT use this tool for:
- Searching across multiple articles (use semantic-article-search instead)
- Questions unrelated to the specific article
  `.trim(),

  inputSchema: z.object({
    articleId: z.string().cuid().describe('Article ID to extract context from'),

    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .max(400, 'Query too long (max 400 characters)')
      .describe('User question about the article'),

    maxChunks: z
      .number()
      .int()
      .min(1, 'maxChunks must be at least 1')
      .max(3, 'maxChunks cannot exceed 3')
      .default(3)
      .describe('Maximum number of chunks to return (1-3, default: 3)'),

    minScore: z
      .number()
      .min(0, 'minScore must be between 0 and 1')
      .max(1, 'minScore must be between 0 and 1')
      .default(0.35)
      .describe('Minimum relevance score (0-1, default: 0.35)'),

    includeSummary: z
      .boolean()
      .default(true)
      .describe('Include detailed summary as first chunk (default: true)'),
  }),

  outputSchema: z.object({
    chunks: z.array(
      z.object({
        chunkId: z.string(),
        chunkIndex: z.number().int(),
        html: z.string(),
        text: z.string(),
        tokenCount: z.number(),
        score: z.number(),
        startToken: z.number(),
        endToken: z.number(),
      })
    ),
    citations: z.array(
      z.object({
        chunkId: z.string(),
        url: z.string().url(),
        title: z.string(),
        publishedAtISO: z.string(),
      })
    ),
    metadata: z.object({
      articleId: z.string(),
      title: z.string(),
      sourceId: z.string(),
      publishedAtISO: z.string(),
      totalChunksEvaluated: z.number(),
      detailedSummaryUsed: z.boolean(),
      sanitizationFallback: z.boolean().optional(),
    }),
  }),

  execute: async ({
    articleId,
    query,
    maxChunks,
    minScore,
    includeSummary,
  }) => {
    const startTime = Date.now();

    try {
      logger.debug(
        {
          articleId,
          query: query.substring(0, 50),
          maxChunks,
          minScore,
          includeSummary,
        },
        'Tool: article-context executing'
      );

      // Fetch article with necessary fields
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          title: true,
          url: true,
          sourceId: true,
          publishedAt: true,
          content: true,
          detailedSummary: true,
        },
      });

      if (!article) {
        throw new Error(
          `Article ${articleId} not found or content unavailable`
        );
      }

      const rawChunks: ScoredChunk[] = [];
      let sanitizationFallback = false;

      // Add detailed summary as first chunk if available and requested
      if (
        includeSummary &&
        article.detailedSummary &&
        article.detailedSummary !== '__SKIP_DETAILED_SUMMARY__'
      ) {
        try {
          const summaryHtml = sanitizeArticleHtml(article.detailedSummary);
          const summaryText = stripHtmlTags(summaryHtml);
          const summaryTokens = countTokens(summaryText);

          rawChunks.push({
            chunkId: `${articleId}:summary`,
            chunkIndex: -1,
            html: summaryHtml,
            text: summaryText,
            tokenCount: summaryTokens,
            score: 1.0, // Will be adjusted by scoreChunks
            startToken: 0,
            endToken: summaryTokens,
            isSummary: true,
          });
        } catch (error) {
          logger.warn(
            {
              error: sanitizeError(error),
              articleId,
            },
            'article-context summary sanitization failed'
          );
          sanitizationFallback = true;
        }
      }

      // Process content chunks if available
      if (article.content) {
        try {
          const sanitizedContent = sanitizeArticleHtml(article.content);
          const contentTokens = countTokens(sanitizedContent);

          // Only chunk if content is large enough (>1200 tokens)
          if (contentTokens > 1200) {
            const chunks = chunkByTokens(sanitizedContent, 1000, 80);

            for (const chunk of chunks) {
              const chunkHtml = chunk.text; // Already sanitized
              const chunkText = stripHtmlTags(chunkHtml);

              // Skip empty chunks to avoid embedding failures
              if (chunkText.trim().length === 0) {
                continue;
              }

              rawChunks.push({
                chunkId: `${articleId}:${chunk.chunkIndex}`,
                chunkIndex: chunk.chunkIndex,
                html: chunkHtml,
                text: chunkText,
                tokenCount: chunk.tokenCount,
                score: 0.5, // Will be adjusted by scoreChunks
                startToken: chunk.startToken,
                endToken: chunk.endToken,
              });
            }
          } else {
            // Small content: treat as single chunk
            const chunkText = stripHtmlTags(sanitizedContent);

            // Skip empty content
            if (chunkText.trim().length === 0) {
              logger.debug(
                {
                  articleId,
                },
                'article-context: content is empty after sanitization'
              );
            } else {
              rawChunks.push({
                chunkId: `${articleId}:0`,
                chunkIndex: 0,
                html: sanitizedContent,
                text: chunkText,
                tokenCount: contentTokens,
                score: 0.7, // Higher score for single chunk
                startToken: 0,
                endToken: contentTokens,
              });
            }
          }
        } catch (error) {
          logger.warn(
            {
              error: sanitizeError(error),
              articleId,
            },
            'article-context content sanitization failed'
          );
          sanitizationFallback = true;
        }
      }

      // Handle case where no content is available
      if (rawChunks.length === 0) {
        logger.info(
          {
            articleId,
            title: article.title,
          },
          'article-context no content available'
        );

        return {
          chunks: [],
          citations: [],
          metadata: {
            articleId,
            title: article.title,
            sourceId: article.sourceId,
            publishedAtISO: article.publishedAt.toISOString(),
            totalChunksEvaluated: 0,
            detailedSummaryUsed: false,
            sanitizationFallback,
          },
        };
      }

      // Score chunks by relevance
      const scoredChunks = await scoreChunks({
        chunks: rawChunks,
        query,
        articleId,
        minScore,
      });

      let filteredChunks = scoredChunks.filter((c) => c.score >= minScore);
      let relaxedThreshold: number | null = null;
      let relaxedToFirstChunk = false;

      if (filteredChunks.length === 0 && scoredChunks.length > 0) {
        const loweredThreshold = Math.max(0.15, Math.min(0.3, minScore * 0.7));
        filteredChunks = scoredChunks.filter(
          (c) => c.score >= loweredThreshold
        );
        if (filteredChunks.length > 0) {
          relaxedThreshold = loweredThreshold;
        } else {
          filteredChunks = [scoredChunks[0]];
          relaxedThreshold = 0;
          relaxedToFirstChunk = true;
        }
      }

      // Select top chunks
      const topChunks = filteredChunks.slice(0, maxChunks);

      const elapsedMs = Date.now() - startTime;
      const avgScore =
        topChunks.length > 0
          ? (
              topChunks.reduce((sum, c) => sum + c.score, 0) / topChunks.length
            ).toFixed(4)
          : 0;

      logger.info(
        {
          articleId,
          query: query.substring(0, 50),
          chunkCount: topChunks.length,
          totalChunksEvaluated: scoredChunks.length,
          avgScore,
          elapsedMs,
          detailedSummaryUsed: rawChunks.some((c) => c.isSummary),
          scoreRelaxed: relaxedThreshold !== null,
          relaxedThreshold: relaxedThreshold ?? undefined,
          relaxedToFirstChunk,
        },
        'Tool: article-context completed'
      );

      return {
        chunks: topChunks.map((c) => ({
          chunkId: c.chunkId,
          chunkIndex: c.chunkIndex,
          html: c.html,
          text: c.text,
          tokenCount: c.tokenCount,
          score: c.score,
          startToken: c.startToken,
          endToken: c.endToken,
        })),
        citations: topChunks.map((c) => ({
          chunkId: c.chunkId,
          url: article.url,
          title: article.title,
          publishedAtISO: article.publishedAt.toISOString(),
        })),
        metadata: {
          articleId,
          title: article.title,
          sourceId: article.sourceId,
          publishedAtISO: article.publishedAt.toISOString(),
          totalChunksEvaluated: scoredChunks.length,
          detailedSummaryUsed: rawChunks.some((c) => c.isSummary),
          sanitizationFallback,
        },
      };
    } catch (error) {
      logger.error(
        {
          error: sanitizeError(error),
          articleId,
          query: query.substring(0, 50),
        },
        'Tool: article-context failed'
      );

      throw error; // Propagate to agent for error handling
    }
  },
});
