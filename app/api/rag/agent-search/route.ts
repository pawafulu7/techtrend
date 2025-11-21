import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { articleQaAgent as _articleQaAgent } from '@/lib/rag/agents/article-qa-agent';
import { checkRateLimit, ragAgentSearchRateLimit, articleQaRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
import { ArticleQACache as _ArticleQACache } from '@/lib/cache/article-qa-cache';
import { detectPromptInjection, sanitizeQuery } from '@/lib/rag/security/prompt-injection-detector';
import { VectorSearchService, SearchResult } from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import { ZodError, z } from 'zod';
import { features } from '@/lib/config/env';
import type { Session } from 'next-auth';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';

/**
 * Custom error for article not found (404)
 */
class ArticleNotFoundError extends Error {
  constructor(articleId: string) {
    super(`Article ${articleId} not found`);
    this.name = 'ArticleNotFoundError';
  }
}

/**
 * Custom error for mode context resolution failures (400)
 */
class ModeContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModeContextError';
  }
}

/**
 * RAG Agent Search API (Vercel AI SDK)
 *
 * POST /api/rag/agent-search
 *
 * Natural language interface for semantic article search using AI agent.
 *
 * Security layers:
 * 1. Authentication (Auth.js v5) - REQUIRED
 * 2. Rate limiting (Upstash Redis) - 5 req/min/user (stricter for cost control)
 * 3. Input validation (Zod + prompt injection detection)
 * 4. Agent guardrails (system prompt with strict rules)
 * 5. Fallback mechanism (direct vector search on agent failure)
 * 6. Response caching (60s TTL, query normalization)
 *
 * Vercel-specific optimizations:
 * - maxDuration: 30 (supports streaming, extends default 10s timeout)
 * - runtime: nodejs (required for Prisma compatibility)
 *
 * @see CodexMCP Review: "Use generate() not respond(), add OTEL tracing, implement fallback"
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:799-1099
 */

// Vercel serverless function configuration
export const maxDuration = 30; // 30 seconds (streaming support)
export const runtime = 'nodejs'; // Required for Prisma

const tracer = trace.getTracer('rag-agent');

/**
 * Agent type schema for pre-validation
 *
 * Used to determine rate limit before full validation.
 * Lightweight schema to prevent DoS attacks.
 */
const agentTypeSchema = z.object({
  agentType: z
    .enum(['article-search', 'article-qa'])
    .optional()
    .default('article-search'),
});

/**
 * Request validation schema
 *
 * Supports two agent types:
 * - article-search: Search across all articles (default)
 * - article-qa: Answer questions about a specific article (requires articleId)
 */
const agentRequestSchema = z.object({
  agentType: z
    .enum(['article-search', 'article-qa'])
    .optional()
    .default('article-search')
    .describe('Agent type: article-search (default) or article-qa'),

  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)')
    .transform((q) => sanitizeQuery(q))
    .refine((q) => q.length > 0, {
      message: 'Query cannot be empty after sanitization',
    }),

  articleId: z
    .string()
    .cuid()
    .optional()
    .describe('Article ID (required for article-qa mode)'),
}).superRefine((data, ctx) => {
  // articleId is required for article-qa mode
  if (data.agentType === 'article-qa' && !data.articleId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['articleId'],
      message: 'articleId is required for article-qa mode',
    });
  }
});

/**
 * Determine preferred language based on request context
 *
 * Priority:
 * 1. Query content (if contains Japanese characters)
 * 2. Accept-Language header (user's browser preference)
 * 3. Default to Japanese (primary user base)
 *
 * Rationale:
 * - Short ASCII queries like "CTO" should respect user's locale
 * - Japanese users expect Japanese responses even for English terms
 * - Browser Accept-Language header is the most reliable indicator
 *
 * @param query - Search query text
 * @param request - HTTP request with headers
 * @returns Preferred language ('ja' or 'en')
 */
function getPreferredLanguage(query: string, request: NextRequest): 'ja' | 'en' {
  // Priority 1: If query contains Japanese characters, use Japanese
  if (/[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/.test(query)) {
    return 'ja';
  }

  // Priority 2: Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    // Parse Accept-Language header (e.g., "ja,en-US;q=0.9,en;q=0.8")
    const languages = acceptLanguage.split(',').map(lang => {
      const [code] = lang.trim().split(';');
      return code.toLowerCase();
    });

    // Check if Japanese is preferred
    for (const lang of languages) {
      if (lang.startsWith('ja')) {
        return 'ja';
      }
      if (lang.startsWith('en')) {
        return 'en';
      }
    }
  }

  // Priority 3: Default to Japanese (primary user base)
  return 'ja';
}

/**
 * Format search results as text (fallback when agent fails)
 *
 * @param results - Search results
 * @param lang - Language for formatting ('ja' or 'en')
 */
function formatResultsAsText(results: SearchResult[], lang: 'ja' | 'en'): string {
  if (results.length === 0) {
    return lang === 'ja'
      ? '該当する記事が見つかりませんでした。キーワードを広げて再検索してください。'
      : 'No articles found for your query. Try using different keywords or broader terms.';
  }

  const lines = results.map((article, idx) => {
    const similarity = (article.similarity * 100).toFixed(1);
    const locale = lang === 'ja' ? 'ja-JP' : 'en-US';
    const date = new Date(article.publishedAt).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const title = article.translatedTitle || article.title;

    return lang === 'ja'
      ? `${idx + 1}. ${title} (一致度: ${similarity}%) - ${date}公開`
      : `${idx + 1}. ${title} (${similarity}% match) - Published: ${date}`;
  });

  return lang === 'ja'
    ? `検索結果 ${results.length}件:\n\n${lines.join('\n')}`
    : `Found ${results.length} articles:\n\n${lines.join('\n')}`;
}

/**
 * Fetch article context for QA mode
 *
 * Retrieves article metadata and generates snippet for context chunk.
 * TODO: Enforce article visibility once visibility model is finalized.
 *
 * @param articleId - Article ID
 * @returns Article context with snippet
 * @throws ArticleNotFoundError if article not found
 */
async function fetchQaContext(articleId: string): Promise<{
  article: {
    id: string;
    title: string;
    updatedAt: Date;
  };
  snippet: string;
}> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      summary: true,
      detailedSummary: true,
    },
  });

  if (!article) {
    throw new ArticleNotFoundError(articleId);
  }

  // TODO: Enforce article.visibility once visibility model is finalized
  // if (article.visibility !== 'public') {
  //   throw new Error(`Article ${articleId} is not accessible`);
  // }

  // Generate snippet (first 100 characters of summary)
  const snippet = (article.detailedSummary || article.summary || article.title).substring(0, 100);

  return {
    article: {
      id: article.id,
      title: article.title,
      updatedAt: article.updatedAt,
    },
    snippet,
  };
}

/**
 * Resolve mode context based on agentType
 *
 * Determines agent, cache strategy, and system message based on request type.
 *
 * Error handling:
 * - Throws Error if article not found (_fetchQaContext fails)
 * - Throws Error if invalid mode configuration
 *
 * @param validatedRequest - Validated request
 * @param request - HTTP request
 * @returns Mode context with agent, lang, and system message
 * @throws Error if article not found or invalid configuration
 */
async function resolveModeContext(
  validatedRequest: ValidatedRequest,
  request: NextRequest
): Promise<ModeContext> {
  const isArticleQa = validatedRequest.agentType === 'article-qa';
  const preferredLang = getPreferredLanguage(validatedRequest.query, request);

  const localeInstruction = preferredLang === 'ja'
    ? 'User locale: Japanese (ja). Respond in Japanese unless the user explicitly asks otherwise.'
    : 'User locale: English (en). Respond in English unless the user explicitly asks otherwise.';

  if (isArticleQa) {
    // Article QA mode
    const qaContext = await fetchQaContext(validatedRequest.articleId!);

    const systemMessage = `${localeInstruction}

Active article: ${qaContext.article.title} (#${qaContext.article.id}, updated ${qaContext.article.updatedAt.toISOString()}).
You MUST restrict all answers to this article.`;

    return {
      agentType: 'article-qa',
      isArticleQa: true,
      agent: _articleQaAgent,
      preferredLang,
      systemMessage,
      qaContext: {
        articleId: qaContext.article.id,
        title: qaContext.article.title,
        updatedAt: qaContext.article.updatedAt,
        snippet: qaContext.snippet,
      },
      traceAttributes: {
        'mode.type': 'article-qa',
        'mode.articleId': qaContext.article.id,
      },
      metricsTag: 'article-qa',
    };
  } else {
    // Article Search mode (existing)
    return {
      agentType: 'article-search',
      isArticleQa: false,
      agent: articleSearchAgent,
      preferredLang,
      systemMessage: localeInstruction,
      traceAttributes: {
        'mode.type': 'article-search',
      },
      metricsTag: 'article-search',
    };
  }
}

/**
 * Attach rate limit headers to response
 *
 * Also sets Cache-Control to prevent intermediary caching.
 */
function attachRateLimitHeaders(
  response: NextResponse,
  rateLimitInfo?: { limit: number; remaining: number; reset: Date }
): NextResponse {
  // Prevent CDN/proxy caching (user-specific, rate-limited responses)
  response.headers.set('Cache-Control', 'private, no-store');

  if (rateLimitInfo) {
    response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
    response.headers.set(
      'X-RateLimit-Reset',
      Math.floor(rateLimitInfo.reset.getTime() / 1000).toString()
    );
  }
  return response;
}

/**
 * Type definitions for request handling
 */
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Validated request type
 *
 * Note: articleId is required when agentType='article-qa' (enforced by superRefine)
 */
interface ValidatedRequest {
  agentType: 'article-search' | 'article-qa';
  query: string;
  articleId?: string;
}

/**
 * Mode context for agent selection and cache management
 *
 * Encapsulates all mode-specific configuration for request handling.
 */
interface ModeContext {
  // Mode identification
  agentType: 'article-search' | 'article-qa';
  isArticleQa: boolean;

  // Agent & execution
  agent: typeof articleSearchAgent | typeof _articleQaAgent;
  systemMessage: string;

  // Language & locale
  preferredLang: 'ja' | 'en';

  // QA-specific context (only when isArticleQa=true)
  qaContext?: {
    articleId: string;
    title: string;
    updatedAt: Date;
    snippet: string;
  };

  // Observability (future extension)
  traceAttributes?: Record<string, string | number | boolean>;
  metricsTag?: string;
}

/**
 * Type guard for Language Model tool result output wrapper
 *
 * Checks for valid LanguageModelV2ToolResultOutput types:
 * - 'json', 'text', 'error-json', 'error-text', 'content'
 */
function isLanguageModelToolResultOutput(
  output: unknown
): output is LanguageModelV2ToolResultOutput {
  if (typeof output !== 'object' || output === null || !('type' in output) || !('value' in output)) {
    return false;
  }
  const validTypes = ['json', 'text', 'error-json', 'error-text', 'content'];
  return validTypes.includes((output as any).type);
}

/**
 * Unwrap tool output from AI SDK wrapper
 *
 * AI SDK wraps tool results in LanguageModelV2ToolResultOutput format.
 * Extracts the value from wrapper types: json, text, error-json, error-text, content.
 */
function unwrapToolOutput(output: unknown): unknown {
  if (!output) return output;
  if (isLanguageModelToolResultOutput(output)) {
    return output.value;
  }
  return output;
}

/**
 * Create SSE response with appropriate headers
 *
 * Server-Sent Events format for streaming agent responses.
 * Includes rate limit headers and cache control.
 */
function createSSEResponse(
  stream: ReadableStream,
  rateLimitInfo?: RateLimitInfo
): Response {
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (rateLimitInfo) {
    headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
    headers.set('X-RateLimit-Remaining', rateLimitInfo.remaining.toString());
    headers.set(
      'X-RateLimit-Reset',
      Math.floor(rateLimitInfo.reset.getTime() / 1000).toString()
    );
  }

  return new Response(stream, { headers });
}

/**
 * Create SSE response for cached results
 *
 * Returns cached text via SSE format for client-side compatibility.
 * Emits 'cached' event followed by 'finish' event.
 */
function createCachedSSEResponse(
  cachedText: string,
  rateLimitInfo?: RateLimitInfo
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'cached',
            text: cachedText,
            timestamp: new Date().toISOString(),
          })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'finish',
            cached: true,
          })}\n\n`
        )
      );

      controller.close();
    },
  });

  return createSSEResponse(stream, rateLimitInfo);
}

/**
 * Handle streaming agent search request
 *
 * Resolves mode-specific context (agent, system prompt, cache strategy) prior to
 * streaming and emits SSE events: cached, text-delta, tool-start, tool-complete,
 * fallback, finish, error.
 *
 * TODO (Phase 3): Send initial context chunk for article-qa mode.
 */
async function handleStreamingRequest(
  validatedRequest: ValidatedRequest,
  session: Session,
  parentSpan: Span,
  request: NextRequest,
  rateLimitInfo?: RateLimitInfo
): Promise<Response> {
  let modeContext: ModeContext;
  try {
    modeContext = await resolveModeContext(validatedRequest, request);
  } catch (error) {
    parentSpan.setAttribute('mode.resolve.failed', true);
    parentSpan.recordException(error as Error);
    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to resolve mode context' });
    throw error;
  }

  if (modeContext.isArticleQa && !modeContext.qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    parentSpan.recordException(contextError);
    parentSpan.setStatus({ code: SpanStatusCode.ERROR, message: contextError.message });
    throw contextError;
  }

  parentSpan.setAttributes({
    'mode.agentType': modeContext.agentType,
    'mode.preferredLang': modeContext.preferredLang,
    'mode.isArticleQa': modeContext.isArticleQa,
  });

  if (modeContext.traceAttributes) {
    parentSpan.setAttributes(modeContext.traceAttributes);
  }

  if (modeContext.metricsTag) {
    parentSpan.setAttribute('mode.metricsTag', modeContext.metricsTag);
  }

  if (modeContext.qaContext) {
    parentSpan.setAttribute('mode.articleId', modeContext.qaContext.articleId);
  }

  const cacheStrategy = modeContext.isArticleQa ? 'article-qa' : 'agent-response';
  parentSpan.setAttribute('cache.strategy', cacheStrategy);

  const agentCache = modeContext.isArticleQa ? undefined : new AgentResponseCache();
  const articleQaCache = modeContext.isArticleQa ? new _ArticleQACache() : undefined;
  let cachedResponse: string | null = null;

  if (modeContext.isArticleQa) {
    const qaContext = modeContext.qaContext!;
    cachedResponse = await articleQaCache!.get(
      qaContext.articleId,
      validatedRequest.query,
      modeContext.preferredLang,
      qaContext.updatedAt
    );
  } else {
    cachedResponse = await agentCache!.get(validatedRequest.query);
  }

  if (cachedResponse) {
    parentSpan.setAttribute('cache.hit', true);
    parentSpan.setAttribute('streaming.cached', true);

    const logBase = {
      userId: session.user.id,
      queryPreview: validatedRequest.query.substring(0, 50),
      mode: modeContext.agentType,
    };

    if (modeContext.isArticleQa) {
      logger.debug(
        {
          ...logBase,
          articleId: modeContext.qaContext!.articleId,
          locale: modeContext.preferredLang,
        },
        'Article QA cache hit (streaming mode)'
      );
    } else {
      logger.debug(logBase, 'Agent cache hit (streaming mode)');
    }

    return createCachedSSEResponse(cachedResponse, rateLimitInfo);
  }

  parentSpan.setAttribute('cache.hit', false);
  parentSpan.setAttribute('streaming.cached', false);

  // Start streaming (implementation in createStreamingResponse)
  return createStreamingResponse(
    validatedRequest,
    session,
    parentSpan,
    request,
    modeContext,
    rateLimitInfo
  );
}

/**
 * Create streaming SSE response with real-time agent execution
 *
 * Emits tool lifecycle events and text deltas for progress calculation.
 */
async function createStreamingResponse(
  validatedRequest: ValidatedRequest,
  session: Session,
  parentSpan: Span,
  _request: NextRequest,
  modeContext: ModeContext,
  rateLimitInfo?: RateLimitInfo
): Promise<Response> {
  const encoder = new TextEncoder();
  const responseCache = modeContext.isArticleQa ? undefined : new AgentResponseCache();
  const articleQaCache = modeContext.isArticleQa ? new _ArticleQACache() : undefined;
  const tracer = trace.getTracer('rag-agent');
  const streamSpan = tracer.startSpan('rag.agent-search.stream', {}, trace.setSpan(context.active(), parentSpan));
  const qaContext = modeContext.qaContext;

  if (modeContext.isArticleQa && !qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    streamSpan.recordException(contextError);
    streamSpan.setStatus({ code: SpanStatusCode.ERROR, message: contextError.message });
    streamSpan.end();
    throw contextError;
  }

  streamSpan.setAttributes({
    'mode.agentType': modeContext.agentType,
    'mode.preferredLang': modeContext.preferredLang,
  });

  streamSpan.setAttribute('cache.strategy', modeContext.isArticleQa ? 'article-qa' : 'agent-response');

  if (modeContext.traceAttributes) {
    streamSpan.setAttributes(modeContext.traceAttributes);
  }

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      const toolCalls: any[] = [];
      let usage: any = {};

      try {
        const streamResult = await modeContext.agent.stream({
          messages: [
            { role: 'system', content: modeContext.systemMessage },
            { role: 'user', content: validatedRequest.query },
          ],
        });

        heartbeatInterval = setInterval(() => {
          controller.enqueue(encoder.encode(':\n\n'));
        }, 10000);

        for await (const chunk of streamResult.fullStream) {
          if (chunk.type === 'text-delta') {
            const textDelta = chunk.text ?? '';
            fullText += textDelta;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'text-delta',
                  delta: textDelta,
                })}\n\n`
              )
            );
          } else if (chunk.type === 'tool-call') {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'tool-start',
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  input: chunk.input,
                })}\n\n`
              )
            );

            toolCalls.push({
              id: chunk.toolCallId,
              name: chunk.toolName,
              input: chunk.input,
            });
          } else if (chunk.type === 'tool-result') {
            const unwrappedOutput = unwrapToolOutput(chunk.output);

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'tool-complete',
                  toolCallId: chunk.toolCallId,
                  result: unwrappedOutput,
                })}\n\n`
              )
            );

            const toolCall = toolCalls.find((tc) => tc.id === chunk.toolCallId);
            if (toolCall) {
              toolCall.output = unwrappedOutput;
              toolCall.dynamic = false;
            }
          } else if (chunk.type === 'finish') {
            usage = chunk.totalUsage;

            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }

            if (!fullText.trim()) {
              // Fallback: Vector search across all articles (both article-search and article-qa modes)
              // Note: QA mode fallback is NOT restricted to the target article
              // This provides broader results when agent fails to respond
              try {
                const searchService = new VectorSearchService(prisma);
                const fallbackResults = await searchService.search(validatedRequest.query, { topK: 10 });
                const fallbackText = formatResultsAsText(fallbackResults, modeContext.preferredLang);

                // Note: Fallback results are NOT cached (intentional)
                // Avoids caching low-quality fallback responses
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'fallback', text: fallbackText, resultCount: fallbackResults.length })}\n\n`));
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'finish', text: fallbackText, usage: { totalTokens: 0 }, toolCalls: [], cached: false, fallback: true })}\n\n`));
                controller.close();

                streamSpan.setAttribute('streaming.fallbackEmptyText', true);
                streamSpan.end();
                return;
              } catch (fallbackError) {
                logger.error({ error: sanitizeError(fallbackError), userId: session.user.id }, 'Fallback failed for empty text');
                throw fallbackError;
              }
            }

            try {
              if (modeContext.isArticleQa) {
                await articleQaCache!.set(
                  qaContext!.articleId,
                  validatedRequest.query,
                  modeContext.preferredLang,
                  qaContext!.updatedAt,
                  fullText
                );
              } else {
                await responseCache!.set(validatedRequest.query, fullText);
              }
            } catch (cacheError) {
              logger.warn({ error: sanitizeError(cacheError), userId: session.user.id }, 'Failed to cache streaming response');
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  text: fullText,
                  usage,
                  toolCalls,
                  cached: false,
                  fallback: false,
                })}\n\n`
              )
            );

            controller.close();

            streamSpan.setAttribute('streaming.success', true);
            streamSpan.setAttribute('streaming.textLength', fullText.length);
            streamSpan.setAttribute('streaming.toolCallCount', toolCalls.length);
            streamSpan.end();

            logger.info(
              {
                userId: session.user.id,
                queryPreview: validatedRequest.query.substring(0, 50),
                toolCalls: toolCalls.length,
                textLength: fullText.length,
                totalTokens: usage?.totalTokens || 0,
              },
              'Agent streaming completed'
            );
          }
        }
      } catch (agentError) {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        streamSpan.setAttribute('streaming.failed', true);
        streamSpan.recordException(agentError as Error);

        logger.warn(
          {
            error: sanitizeError(agentError),
            userId: session.user.id,
            queryPreview: validatedRequest.query.substring(0, 50),
          },
          'Agent streaming failed, using fallback'
        );

        const searchService = new VectorSearchService(prisma);
        const fallbackResults = await searchService.search(validatedRequest.query, {
          topK: 10,
        });

        const fallbackText = formatResultsAsText(fallbackResults, modeContext.preferredLang);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'fallback',
              text: fallbackText,
              resultCount: fallbackResults.length,
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'finish',
              text: fallbackText,
              usage: { totalTokens: 0 },
              toolCalls: [],
              cached: false,
              fallback: true,
            })}\n\n`
          )
        );

        controller.close();

        streamSpan.setAttribute('streaming.fallback', true);
        streamSpan.setAttribute('streaming.fallbackResultCount', fallbackResults.length);
        streamSpan.end();
      }
    },
    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      streamSpan.setAttribute('streaming.cancelled', true);
      streamSpan.end();
    },
  });

  return createSSEResponse(stream, rateLimitInfo);
}

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
async function handleBatchRequest(
  validatedRequest: ValidatedRequest,
  session: Session,
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
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Failed to resolve mode context' });
    throw error;
  }

  if (modeContext.isArticleQa && !modeContext.qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    span.recordException(contextError);
    span.setStatus({ code: SpanStatusCode.ERROR, message: contextError.message });
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
  const responseCache = modeContext.isArticleQa ? undefined : new AgentResponseCache();
  const articleQaCache = modeContext.isArticleQa ? new _ArticleQACache() : undefined;
  const cacheStrategy = modeContext.isArticleQa ? 'article-qa' : 'agent-response';
  span.setAttribute('cache.strategy', cacheStrategy);

  const contextPayload = modeContext.isArticleQa && qaContext
    ? {
        articleId: qaContext.articleId,
        title: qaContext.title,
        snippet: qaContext.snippet,
        updatedAt: qaContext.updatedAt.toISOString(),
      }
    : undefined;

  let cachedResponse: string | null = null;

  if (modeContext.isArticleQa) {
    cachedResponse = await articleQaCache!.get(
      qaContext!.articleId,
      validatedRequest.query,
      modeContext.preferredLang,
      qaContext!.updatedAt
    );
  } else {
    cachedResponse = await responseCache!.get(validatedRequest.query);
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
      response: cachedResponse,
      cached: true,
      fallback: false,
      toolCalls: [],
      usage: {},
    };

    if (contextPayload) {
      cachedPayload.context = contextPayload;
    }

    const response = NextResponse.json(cachedPayload);
    return attachRateLimitHeaders(response, rateLimitInfo);
  }

  span.setAttribute('cache.hit', false);

  // Layer 6: Agent execution with fallback
  let agentResponse: string;
  let toolCalls: any[] = [];
  let usage: any = {};
  let fallback = false;

  try {
    const result = await modeContext.agent.generate({
      messages: [
        { role: 'system', content: modeContext.systemMessage },
        { role: 'user', content: validatedRequest.query },
      ],
    });

    const allToolCalls = result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
    const allToolResults = result.steps?.flatMap((step) => step.toolResults ?? []) ?? [];

    const toolResultsMap = new Map(allToolResults.map((r) => [r.toolCallId, r]));

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
      throw new Error('Agent returned empty response (tool-only mode detected)');
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

    // Fallback: Vector search across all articles (both article-search and article-qa modes)
    // Note: QA mode fallback is NOT restricted to the target article
    // This provides broader results when agent fails to respond
    const searchService = new VectorSearchService(prisma);
    const fallbackResults = await searchService.search(validatedRequest.query, {
      topK: 10,
    });

    agentResponse = formatResultsAsText(fallbackResults, modeContext.preferredLang);
    fallback = true;

    span.setAttribute('fallback.used', true);
    span.setAttribute('fallback.resultCount', fallbackResults.length);
  }

  // Cache successful responses
  // Note: Fallback results ARE cached in batch mode (differs from streaming)
  // Streaming: Fallback NOT cached (intentional, avoid low-quality cache)
  // Batch: Fallback cached (for consistency, user may retry)
  // TODO: Consider aligning policies if this causes confusion
  try {
    if (modeContext.isArticleQa) {
      await articleQaCache!.set(
        qaContext!.articleId,
        validatedRequest.query,
        modeContext.preferredLang,
        qaContext!.updatedAt,
        agentResponse
      );
    } else {
      await responseCache!.set(validatedRequest.query, agentResponse);
    }
  } catch (cacheError) {
    logger.warn(
      {
        error: sanitizeError(cacheError),
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
        mode: modeContext.agentType,
      },
      'Failed to cache batch response'
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

export async function POST(request: NextRequest) {
  return tracer.startActiveSpan('rag.agent-search', async (span) => {
    const session = await auth();

    try {
      // Layer 1: Authentication
      if (!session?.user) {
        span.setAttribute('auth.status', 'unauthorized');

        // Mask IP for PII minimization (GDPR compliance)
        const rawIp = request.headers.get('x-forwarded-for') || 'unknown';
        const maskedIp = rawIp.includes(':')
          ? rawIp.split(':').slice(0, 4).join(':') + ':*' // IPv6: keep first 4 segments
          : rawIp.split(',')[0].trim().split('.').slice(0, 3).join('.') + '.x'; // IPv4: mask last octet

        logger.warn(
          {
            ip: maskedIp,
          },
          'Unauthorized agent search attempt'
        );

        return NextResponse.json(
          { error: 'Unauthorized - Authentication required' },
          { status: 401 }
        );
      }

      span.setAttribute('auth.userId', session.user.id);

      // Layer 2: Pre-parse agentType for rate limiting
      let body;
      let agentType: 'article-search' | 'article-qa';

      try {
        body = await request.json();
      } catch (error) {
        span.setAttribute('validation.malformedJson', true);
        logger.warn(
          {
            userId: session.user.id,
            error: error instanceof Error ? error.message : 'Unknown',
          },
          'Malformed JSON in agent search request'
        );

        return NextResponse.json(
          {
            error: 'Invalid JSON payload',
            details: 'Request body must be valid JSON',
          },
          { status: 400 }
        );
      }

      // Stage 1: Parse agentType only (lightweight, DoS-safe)
      try {
        const typeValidation = agentTypeSchema.parse(body);
        agentType = typeValidation.agentType;
      } catch (_error) {
        // Default to article-search on parsing error
        agentType = 'article-search';
      }

      span.setAttribute('agent.type', agentType);

      // Layer 3: Rate limiting (agent-type-specific)
      const rateLimit = agentType === 'article-qa' ? articleQaRateLimit : ragAgentSearchRateLimit;
      const rateKey = `rag:agent:${agentType}:${session.user.id}`;
      let rateLimitInfo: { limit: number; remaining: number; reset: Date } | undefined;

      try {
        rateLimitInfo = await checkRateLimit(rateKey, rateLimit);
        span.setAttribute('rateLimit.remaining', rateLimitInfo.remaining);
        span.setAttribute('rateLimit.limit', rateLimitInfo.limit);
      } catch (error) {
        if (error instanceof RateLimitError) {
          span.setAttribute('rateLimit.exceeded', true);
          logger.warn(
            {
              userId: session.user.id,
              agentType,
              limit: error.limit,
            },
            'Agent rate limit exceeded'
          );

          return NextResponse.json(
            {
              error: 'Rate limit exceeded',
              agentType,
              limit: error.limit,
              remaining: error.remaining,
              reset: error.reset.toISOString(),
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': error.limit.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': Math.floor(error.reset.getTime() / 1000).toString(),
                'Retry-After': Math.ceil((error.reset.getTime() - Date.now()) / 1000).toString(),
              },
            }
          );
        }
        throw error;
      }

      // Layer 4: Full input validation (Stage 2)
      const validatedRequest = agentRequestSchema.parse(body);

      // Layer 5: Prompt injection detection
      if (detectPromptInjection(validatedRequest.query)) {
        span.setAttribute('security.promptInjection', true);
        logger.warn(
          {
            userId: session.user.id,
            queryPreview: validatedRequest.query.substring(0, 50),
          },
          'Prompt injection detected'
        );

        return NextResponse.json(
          { error: 'Invalid query detected' },
          { status: 400 }
        );
      }

      span.setAttributes({
        'query.length': validatedRequest.query.length,
        'query.preview': validatedRequest.query.substring(0, 50),
      });

      logger.info(
        {
          userId: session.user.id,
          queryPreview: validatedRequest.query.substring(0, 50),
        },
        'Agent search request'
      );

      // Router: Streaming vs. Batch based on feature flag
      if (features.isAgentStreamingEnabled()) {
        return await handleStreamingRequest(validatedRequest, session, span, request, rateLimitInfo);
      } else {
        return await handleBatchRequest(validatedRequest, session, span, request, rateLimitInfo);
      }
    } catch (error) {
      span.setAttribute('error', true);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });

      // Article not found errors (404)
      if (error instanceof ArticleNotFoundError) {
        logger.warn(
          {
            userId: session?.user?.id,
            articleId: (error as any).articleId,
          },
          'Article not found'
        );

        return NextResponse.json(
          {
            error: 'Article not found',
            details: error.message,
          },
          { status: 404 }
        );
      }

      // Mode context errors (400)
      if (error instanceof ModeContextError) {
        logger.warn(
          {
            userId: session?.user?.id,
            error: error.message,
          },
          'Mode context resolution failed'
        );

        return NextResponse.json(
          {
            error: 'Invalid request configuration',
            details: error.message,
          },
          { status: 400 }
        );
      }

      // Zod validation errors
      if (error instanceof ZodError) {
        logger.warn(
          {
            userId: session?.user?.id,
            errors: error.errors,
          },
          'Invalid agent search request'
        );

        return NextResponse.json(
          {
            error: 'Invalid request parameters',
            details: error.errors.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
          { status: 400 }
        );
      }

      // Rate limit errors (shouldn't reach here, but defensive)
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            limit: error.limit,
            remaining: error.remaining,
            reset: error.reset.toISOString(),
          },
          { status: 429 }
        );
      }

      // Other unexpected errors
      logger.error(
        {
          error: sanitizeError(error),
          userId: session?.user?.id,
        },
        'Agent search API error'
      );

      return NextResponse.json(
        {
          error: 'Internal server error',
          details:
            process.env.NODE_ENV === 'development' && error instanceof Error
              ? error.message
              : undefined,
        },
        { status: 500 }
      );
    } finally {
      span.end();
    }
  });
}
