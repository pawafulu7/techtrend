import { NextRequest, NextResponse } from 'next/server';
import { type AgentCachedResponse } from '@/lib/cache/agent-response-cache';
import { type ArticleQACachedResponse } from '@/lib/cache/article-qa-cache';
import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { resolveCaches, safeReadCache, safeWriteCache } from './cache-helpers';
import { SpanStatusCode, Span } from '@opentelemetry/api';
import type { BetterAuthSession } from '@/lib/auth/auth';

import type { RateLimitInfo, ValidatedRequest, ModeContext } from './schemas';
import { AGENT_TIMEOUT_MS } from '@/lib/rag/agent-timeouts';
import {
  attachRateLimitHeaders,
  unwrapToolOutput,
  formatResultsAsText,
} from './sse-helpers';
import {
  resolveModeContext,
  getArticleQaNoAnswerText,
} from './request-handlers';
import { executeDirectSearch } from './direct-search-handler';

/**
 * Handle batch (non-streaming) agent search request
 *
 * This is the original generate() implementation, extracted for dual-path support.
 * Used when AGENT_STREAMING_ENABLED=false or as fallback.
 *
 * TODO (Phase 3): Add agent selection based on validatedRequest.agentType
 * - article-search: articleSearchAgent (existing)
 * - article-qa: articleQaAgent (new)
 * Also update cache selection (AgentResponseCache vs ArticleQACache).
 */
export async function handleBatchRequest(
  validatedRequest: ValidatedRequest,
  session: BetterAuthSession,
  span: Span,
  request: NextRequest,
  rateLimitInfo?: RateLimitInfo
): Promise<NextResponse> {
  let modeContext: ModeContext;
  try {
    modeContext = await resolveModeContext(validatedRequest, request);
  } catch (error) {
    span.setAttribute('mode.resolve.failed', true);
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Failed to resolve mode context',
    });
    throw error;
  }

  if (modeContext.isArticleQa && !modeContext.qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    span.recordException(contextError);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: contextError.message,
    });
    throw contextError;
  }

  span.setAttributes({
    'mode.agentType': modeContext.agentType,
    'mode.preferredLang': modeContext.preferredLang,
    'mode.isArticleQa': modeContext.isArticleQa,
  });

  if (modeContext.traceAttributes) {
    span.setAttributes(modeContext.traceAttributes);
  }

  if (modeContext.metricsTag) {
    span.setAttribute('mode.metricsTag', modeContext.metricsTag);
  }

  if (modeContext.qaContext) {
    span.setAttribute('mode.articleId', modeContext.qaContext.articleId);
  }

  const qaContext = modeContext.qaContext;
  const caches = resolveCaches(modeContext);
  const cacheStrategy = modeContext.isArticleQa
    ? 'article-qa'
    : 'agent-response';
  span.setAttribute('cache.strategy', cacheStrategy);

  const contextPayload =
    modeContext.isArticleQa && qaContext
      ? {
          articleId: qaContext.articleId,
          title: qaContext.title,
          snippet: qaContext.snippet,
          updatedAt: qaContext.updatedAt.toISOString(),
        }
      : undefined;

  let cachedResponse: AgentCachedResponse | ArticleQACachedResponse | null =
    null;

  if (caches.isArticleQa) {
    cachedResponse = await safeReadCache(
      () =>
        caches.articleQaCache.getResponse(
          qaContext!.articleId,
          validatedRequest.query,
          modeContext.preferredLang,
          qaContext!.updatedAt
        ),
      modeContext.agentType
    );
  } else if (caches.agentCache) {
    cachedResponse = await safeReadCache(
      () =>
        caches.agentCache!.getResponse(
          `${modeContext.preferredLang}:${validatedRequest.query}`
        ),
      modeContext.agentType
    );
  }

  const cacheLogBase = {
    userId: session.user.id,
    queryPreview: validatedRequest.query.substring(0, 50),
    mode: modeContext.agentType,
  };

  if (cachedResponse) {
    span.setAttribute('cache.hit', true);

    if (modeContext.isArticleQa) {
      logger.debug(
        {
          ...cacheLogBase,
          articleId: qaContext!.articleId,
          locale: modeContext.preferredLang,
        },
        'Article QA cache hit (batch mode)'
      );
    } else {
      logger.debug(cacheLogBase, 'Agent cache hit (batch mode)');
    }

    const cachedPayload: Record<string, unknown> = {
      query: validatedRequest.query,
      response: cachedResponse.text,
      cached: true,
      fallback: false,
      toolCalls: cachedResponse.toolCalls,
      usage: { totalTokens: 0 },
    };

    if (contextPayload) {
      cachedPayload.context = contextPayload;
    }

    const response = NextResponse.json(cachedPayload);
    return attachRateLimitHeaders(response, rateLimitInfo);
  }

  span.setAttribute('cache.hit', false);

  // Article search: use direct vector search (no LLM)
  if (!modeContext.isArticleQa) {
    try {
      const directResult = await executeDirectSearch(
        validatedRequest.query,
        modeContext.preferredLang,
        { signal: request.signal }
      );

      if (caches.agentCache) {
        await safeWriteCache(
          () =>
            caches.agentCache!.setResponse(
              `${modeContext.preferredLang}:${validatedRequest.query}`,
              { text: directResult.response, toolCalls: directResult.toolCalls }
            ),
          {
            userId: session.user.id,
            queryPreview: validatedRequest.query.substring(0, 50),
            mode: modeContext.agentType,
          }
        );
      }

      span.setAttributes({
        'directSearch.resultCount':
          ((directResult.toolCalls[0]?.output as Record<string, unknown>)
            ?.count as number) ?? 0,
        'directSearch.responseLength': directResult.response.length,
      });

      const responseData: Record<string, unknown> = {
        ...directResult,
        query: validatedRequest.query,
      };
      const responseObject = NextResponse.json(responseData);
      return attachRateLimitHeaders(responseObject, rateLimitInfo);
    } catch (error) {
      if (request.signal.aborted) {
        span.setAttribute('directSearch.clientDisconnected', true);
        return attachRateLimitHeaders(
          NextResponse.json({ error: 'Request cancelled' }, { status: 499 }),
          rateLimitInfo
        );
      }

      span.setAttribute('directSearch.failed', true);
      span.recordException(error as Error);
      logger.warn(
        {
          error: sanitizeError(error),
          userId: session.user.id,
          queryPreview: validatedRequest.query.substring(0, 50),
          mode: modeContext.agentType,
        },
        'Direct search failed (batch)'
      );
      throw error;
    }
  }

  // Layer 6: Agent execution with fallback
  let agentResponse: string;
  let toolCalls: any[] = [];
  let usage: any = {};
  let fallback = false;

  try {
    const agentAbortSignal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(AGENT_TIMEOUT_MS),
    ]);

    // abortSignal is passed through to generateText via spread in Agent.generate()
    // but not exposed in Agent's type definition (ai@5.x). Runtime-safe.
    const generateOptions = {
      messages: [
        { role: 'system' as const, content: modeContext.systemMessage },
        { role: 'user' as const, content: validatedRequest.query },
      ],
      abortSignal: agentAbortSignal,
    };
    const result = await modeContext.agent.generate(generateOptions);

    const allToolCalls =
      result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
    const allToolResults =
      result.steps?.flatMap((step) => step.toolResults ?? []) ?? [];

    const toolResultsMap = new Map(
      allToolResults.map((r) => [r.toolCallId, r])
    );

    logger.debug(
      {
        textPreview: result.text?.slice(0, 100),
        stepsCount: result.steps?.length || 0,
        toolCallsCount: allToolCalls.length,
        toolResultsCount: allToolResults.length,
        toolCallNames: allToolCalls.map((tc) => tc.toolName),
        finishReason: result.finishReason,
        mode: modeContext.agentType,
      },
      'Agent result received (batch)'
    );

    agentResponse = (result.text ?? '').trim();
    toolCalls = allToolCalls.map((call) => {
      const toolResult = toolResultsMap.get(call.toolCallId);
      const unwrappedOutput = unwrapToolOutput(toolResult?.output);
      return {
        id: call.toolCallId,
        name: call.toolName,
        input: call.input,
        output: unwrappedOutput,
        dynamic: call.dynamic ?? false,
      };
    });
    usage = result.usage;

    if (!agentResponse) {
      throw new Error(
        'Agent returned empty response (tool-only mode detected)'
      );
    }

    span.setAttributes({
      'agent.toolCallCount': toolCalls.length,
      'agent.responseLength': agentResponse.length,
      'agent.promptTokens': usage?.promptTokens || 0,
      'agent.completionTokens': usage?.completionTokens || 0,
    });

    logger.info(
      {
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
        toolCalls: toolCalls.length,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        mode: modeContext.agentType,
      },
      'Agent search completed (batch)'
    );
  } catch (agentError) {
    // クライアント切断: フォールバックせずエラー応答
    if (request.signal.aborted) {
      span.setAttribute('agent.clientDisconnected', true);
      logger.info(
        { userId: session.user.id },
        'Client disconnected, skipping fallback'
      );
      return attachRateLimitHeaders(
        NextResponse.json({ error: 'Request cancelled' }, { status: 499 }),
        rateLimitInfo
      );
    }

    // サーバー側タイムアウト or その他のエラー: 既存フォールバック実行
    span.setAttribute('agent.failed', true);
    span.recordException(agentError as Error);

    logger.warn(
      {
        error: sanitizeError(agentError),
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
        mode: modeContext.agentType,
      },
      'Agent failed, using fallback'
    );

    if (modeContext.isArticleQa) {
      // Article QA: do NOT search all articles - return scoped empty response
      agentResponse = getArticleQaNoAnswerText(modeContext.preferredLang);
      span.setAttribute('fallback.articleQaNoAnswer', true);
    } else {
      // Fallback: Vector search across all articles (article-search mode only)
      const searchService = new VectorSearchService(prisma);
      const fallbackResults = await searchService.search(
        validatedRequest.query,
        {
          topK: 10,
        }
      );

      agentResponse = formatResultsAsText(
        fallbackResults,
        modeContext.preferredLang
      );
      span.setAttribute('fallback.resultCount', fallbackResults.length);
    }
    fallback = true;

    span.setAttribute('fallback.used', true);
  }

  // Cache successful responses
  // Note: Fallback results are NOT cached (both streaming and batch modes)
  // Rationale: Avoid caching low-quality fallback responses
  // Agent failures may be temporary; retry may succeed
  if (!fallback) {
    await safeWriteCache(
      () => {
        if (caches.isArticleQa) {
          return caches.articleQaCache.setResponse(
            qaContext!.articleId,
            validatedRequest.query,
            modeContext.preferredLang,
            qaContext!.updatedAt,
            { text: agentResponse, toolCalls }
          );
        } else {
          return caches.agentCache?.setResponse(
            `${modeContext.preferredLang}:${validatedRequest.query}`,
            { text: agentResponse, toolCalls }
          );
        }
      },
      {
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
        mode: modeContext.agentType,
      }
    );
  }

  const responseData: Record<string, unknown> = {
    query: validatedRequest.query,
    response: agentResponse,
    toolCalls,
    usage,
    fallback,
    cached: false,
  };

  if (contextPayload) {
    responseData.context = contextPayload;
  }

  const responseObject = NextResponse.json(responseData);

  return attachRateLimitHeaders(responseObject, rateLimitInfo);
}
