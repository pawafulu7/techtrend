import {
  VectorSearchService,
  SearchResult,
} from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { RAG_TOOL_NAMES } from '@/lib/rag/constants';
import { DIRECT_SEARCH_TIMEOUT_MS } from '@/lib/rag/agent-timeouts';
import { parseTemporalQuery } from './request-handlers';
import { formatResultsAsText } from './sse-helpers';

export interface DirectSearchResult {
  query: string;
  response: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    dynamic: boolean;
  }>;
  usage: { totalTokens: number };
  fallback: boolean;
  cached: boolean;
}

/**
 * Execute direct vector search for article-search mode (no LLM)
 *
 * Bypasses the agent/LLM layer and performs vector search directly.
 * Used by batch-handler and streaming-handler for article-search mode
 * to eliminate LLM latency and token costs.
 *
 * @param query - User search query
 * @param preferredLang - Response language preference
 * @param options - Optional AbortSignal for cancellation
 * @returns DirectSearchResult with pseudo toolCalls for cache compatibility
 */
export async function executeDirectSearch(
  query: string,
  preferredLang: 'ja' | 'en',
  options?: { signal?: AbortSignal }
): Promise<DirectSearchResult> {
  // Build effective abort signal with direct search timeout
  const signals: AbortSignal[] = [
    AbortSignal.timeout(DIRECT_SEARCH_TIMEOUT_MS),
  ];
  if (options?.signal) signals.push(options.signal);
  const effectiveSignal = AbortSignal.any(signals);

  if (effectiveSignal.aborted) {
    throw new Error('Request aborted');
  }

  const { cleanQuery, dateRange, recencyBoost, strict } =
    parseTemporalQuery(query);

  logger.debug(
    {
      originalQuery: query.substring(0, 50),
      cleanQuery:
        cleanQuery !== query ? cleanQuery.substring(0, 50) : undefined,
      hasDateRange: !!(dateRange && (dateRange.from || dateRange.to)),
      recencyBoost,
      strict,
    },
    'Direct search started'
  );

  const searchService = new VectorSearchService(prisma);

  // recencyBoost from parseTemporalQuery can be up to 2.0; clamp to [0, 1]
  const clampedRecencyBoost = Math.min(1, recencyBoost);

  let results: SearchResult[];
  let metadata: {
    phase: 1 | null;
    finalThreshold: number;
    attemptCount: number;
    usedFallback: boolean;
  };

  if (strict && dateRange) {
    // Strict temporal (e.g., "先週の", "昨日の"): try dateRange first, fallback without
    const strictResult = await searchService.searchWithFallback(cleanQuery, {
      enableFallback: true,
      topK: 10,
      embeddingKey: 'summary',
      dateRange,
      recencyBoost: clampedRecencyBoost,
    });

    if (strictResult.results.length >= 3) {
      results = strictResult.results;
      metadata = strictResult.metadata;
    } else {
      // Fallback: remove dateRange, keep recencyBoost
      logger.debug(
        {
          resultCount: strictResult.results.length,
          query: query.substring(0, 50),
        },
        'Strict temporal search insufficient, falling back to recencyBoost only'
      );
      const fallbackResult = await searchService.searchWithFallback(
        cleanQuery,
        {
          enableFallback: true,
          topK: 10,
          embeddingKey: 'summary',
          recencyBoost: clampedRecencyBoost,
        }
      );
      results = fallbackResult.results;
      metadata = fallbackResult.metadata;
    }
  } else {
    // Vague recency (e.g., "最新の", "latest"): recencyBoost only, no hard filter
    const searchResult = await searchService.searchWithFallback(cleanQuery, {
      enableFallback: true,
      topK: 10,
      embeddingKey: 'summary',
      recencyBoost: clampedRecencyBoost,
    });
    results = searchResult.results;
    metadata = searchResult.metadata;
  }

  // Check for cancellation after search completes
  if (effectiveSignal.aborted) {
    throw new Error('Request aborted');
  }

  logger.debug(
    {
      resultCount: results.length,
      usedFallback: metadata.usedFallback,
      finalThreshold: metadata.finalThreshold,
    },
    'Direct search completed'
  );

  const toolCallId = `direct-search-${Date.now()}`;
  const toolOutput = {
    articles: results.map((r: SearchResult) => ({
      articleId: r.articleId,
      title: r.title,
      summary: r.summary,
      translatedTitle: r.translatedTitle,
      similarity: r.similarity,
      publishedAt:
        r.publishedAt instanceof Date
          ? r.publishedAt.toISOString().split('T')[0]
          : String(r.publishedAt),
      sourceId: r.sourceId,
    })),
    count: results.length,
    originalQuery: query,
    expandedQuery: cleanQuery !== query ? cleanQuery : query,
    expansionMethod: 'dictionary' as const,
    fallbackMetadata: metadata,
  };

  const responseText = formatResultsAsText(results, preferredLang);

  return {
    query,
    response: responseText,
    toolCalls: [
      {
        id: toolCallId,
        name: RAG_TOOL_NAMES.SEMANTIC_SEARCH,
        input: { query: cleanQuery, topK: 10, enableFallback: true },
        output: toolOutput,
        dynamic: false,
      },
    ],
    usage: { totalTokens: 0 },
    fallback: false,
    cached: false,
  };
}
