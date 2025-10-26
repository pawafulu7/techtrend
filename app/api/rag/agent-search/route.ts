import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { checkRateLimit, ragAgentSearchRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
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
 * Request validation schema
 */
const agentRequestSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(500, 'Query too long (max 500 characters)')
    .transform((q) => sanitizeQuery(q))
    .refine((q) => q.length > 0, {
      message: 'Query cannot be empty after sanitization',
    }),
});

/**
 * Detect query language (Japanese or English)
 */
function detectLang(query: string): 'ja' | 'en' {
  // Check for Japanese characters (Hiragana, Katakana, Kanji)
  return /[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/.test(query) ? 'ja' : 'en';
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

interface ValidatedRequest {
  query: string;
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
 * Uses articleSearchAgent.stream() for real-time progress updates.
 * Emits SSE events: cached, text-delta, tool-start, tool-complete, fallback, finish, error.
 */
async function handleStreamingRequest(
  validatedRequest: ValidatedRequest,
  session: Session,
  parentSpan: Span,
  rateLimitInfo?: RateLimitInfo
): Promise<Response> {
  // Check cache first
  const responseCache = new AgentResponseCache();
  const cachedResponse = await responseCache.get(validatedRequest.query);

  if (cachedResponse) {
    parentSpan.setAttribute('cache.hit', true);
    parentSpan.setAttribute('streaming.cached', true);
    logger.debug(
      {
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
      },
      'Agent cache hit (streaming mode)'
    );

    return createCachedSSEResponse(cachedResponse, rateLimitInfo);
  }

  parentSpan.setAttribute('cache.hit', false);

  // Start streaming (implementation in createStreamingResponse)
  return createStreamingResponse(validatedRequest, session, parentSpan, rateLimitInfo);
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
  rateLimitInfo?: RateLimitInfo
): Promise<Response> {
  const encoder = new TextEncoder();
  const responseCache = new AgentResponseCache();
  const tracer = trace.getTracer('rag-agent');
  const streamSpan = tracer.startSpan('rag.agent-search.stream', {}, trace.setSpan(context.active(), parentSpan));
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      const toolCalls: any[] = [];
      let usage: any = {};

      try {
        const streamResult = await articleSearchAgent.stream({
          messages: [{ role: 'user', content: validatedRequest.query }],
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
              try {
                const searchService = new VectorSearchService(prisma);
                const fallbackResults = await searchService.search(validatedRequest.query, { topK: 10 });
                const queryLang = detectLang(validatedRequest.query);
                const fallbackText = formatResultsAsText(fallbackResults, queryLang);

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
              await responseCache.set(validatedRequest.query, fullText);
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

        const queryLang = detectLang(validatedRequest.query);
        const fallbackText = formatResultsAsText(fallbackResults, queryLang);

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
 */
async function handleBatchRequest(
  validatedRequest: ValidatedRequest,
  session: Session,
  span: Span,
  rateLimitInfo?: RateLimitInfo
): Promise<NextResponse> {
  // Layer 5: Response cache check
  const responseCache = new AgentResponseCache();
  const cachedResponse = await responseCache.get(validatedRequest.query);

  if (cachedResponse) {
    span.setAttribute('cache.hit', true);
    logger.debug(
      {
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
      },
      'Agent cache hit'
    );

    const response = NextResponse.json({
      query: validatedRequest.query,
      response: cachedResponse,
      cached: true,
    });

    return attachRateLimitHeaders(response, rateLimitInfo);
  }

  span.setAttribute('cache.hit', false);

  // Layer 6: Agent execution with fallback
  let agentResponse: string;
  let toolCalls: any[] = [];
  let usage: any = {};
  let fallback = false;

  try {
    const result = await articleSearchAgent.generate({
      messages: [{ role: 'user', content: validatedRequest.query }],
    });

    const allToolCalls = result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
    const allToolResults = result.steps?.flatMap((step) => step.toolResults ?? []) ?? [];

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
      },
      'Agent result received'
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

    // Handle empty response as agent failure (tool-only response with no text)
    if (!agentResponse) {
      throw new Error('Agent returned empty response (tool-only mode detected)');
    }

    span.setAttributes({
      'agent.toolCallCount': toolCalls.length,
      'agent.responseLength': agentResponse.length,
      'agent.promptTokens': usage.promptTokens || 0,
      'agent.completionTokens': usage.completionTokens || 0,
    });

    logger.info(
      {
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
        toolCalls: toolCalls.length,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      },
      'Agent search completed'
    );
  } catch (agentError) {
    span.setAttribute('agent.failed', true);
    span.recordException(agentError as Error);

    logger.warn(
      {
        error: sanitizeError(agentError),
        userId: session.user.id,
        queryPreview: validatedRequest.query.substring(0, 50),
      },
      'Agent failed, using fallback'
    );

    // Fallback: Direct vector search
    const searchService = new VectorSearchService(prisma);
    const fallbackResults = await searchService.search(validatedRequest.query, {
      topK: 10,
    });

    const queryLang = detectLang(validatedRequest.query);
    agentResponse = formatResultsAsText(fallbackResults, queryLang);
    fallback = true;

    span.setAttribute('fallback.used', true);
    span.setAttribute('fallback.resultCount', fallbackResults.length);
  }

  // Cache successful responses (both agent and fallback)
  await responseCache.set(validatedRequest.query, agentResponse);

  // Return response with metadata
  const responseData = {
    query: validatedRequest.query,
    response: agentResponse,
    toolCalls,
    usage,
    fallback,
    cached: false,
  };

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

      // Layer 2: Rate limiting
      let rateLimitInfo: { limit: number; remaining: number; reset: Date } | undefined;

      try {
        rateLimitInfo = await checkRateLimit(
          `rag:agent:${session.user.id}`,
          ragAgentSearchRateLimit
        );
        span.setAttribute('rateLimit.remaining', rateLimitInfo.remaining);
      } catch (error) {
        if (error instanceof RateLimitError) {
          span.setAttribute('rateLimit.exceeded', true);
          logger.warn(
            {
              userId: session.user.id,
              limit: error.limit,
            },
            'Agent rate limit exceeded'
          );

          return NextResponse.json(
            {
              error: 'Rate limit exceeded',
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

      // Layer 3: Input validation
      let body;
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

      const validatedRequest = agentRequestSchema.parse(body);

      // Layer 4: Prompt injection detection
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
        return await handleStreamingRequest(validatedRequest, session, span, rateLimitInfo);
      } else {
        return await handleBatchRequest(validatedRequest, session, span, rateLimitInfo);
      }
    } catch (error) {
      span.setAttribute('error', true);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });

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
