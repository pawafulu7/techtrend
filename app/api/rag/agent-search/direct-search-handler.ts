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

  const { cleanQuery, dateRange, recencyBoost } = parseTemporalQuery(query);

  logger.debug(
    {
      originalQuery: query.substring(0, 50),
      cleanQuery:
        cleanQuery !== query ? cleanQuery.substring(0, 50) : undefined,
      hasDateRange: !!(dateRange && (dateRange.from || dateRange.to)),
      recencyBoost,
    },
    'Direct search started'
  );

  const searchService = new VectorSearchService(prisma);

  // recencyBoost from parseTemporalQuery can be up to 2.0; clamp to [0, 1]
  const clampedRecencyBoost = Math.min(1, recencyBoost);

  // Use recencyBoost only (soft ranking signal), not dateRange (hard filter).
  // Hard date filtering causes 0 results when no recent articles exist,
  // which is worse UX than showing older but relevant results.
  // The LLM agent also used recencyBoost without strict dateRange filtering.
  const { results, metadata } = await searchService.searchWithFallback(
    cleanQuery,
    {
      enableFallback: true,
      topK: 10,
      embeddingKey: 'summary',
      recencyBoost: clampedRecencyBoost,
    }
  );

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
