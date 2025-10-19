import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { checkRateLimit, ragAgentSearchRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
import { detectPromptInjection, sanitizeQuery } from '@/lib/rag/security/prompt-injection-detector';
import { VectorSearchService, SearchResult } from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ZodError, z } from 'zod';

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

        agentResponse = result.text.trim();
        toolCalls =
          result.toolCalls?.map((call) => ({
            id: call.toolCallId,
            name: call.toolName,
            input: call.input,
            dynamic: call.dynamic ?? false,
          })) ?? [];
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
