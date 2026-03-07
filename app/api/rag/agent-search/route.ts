import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import type { Session } from 'next-auth';
import {
  checkRateLimit,
  ragAgentSearchRateLimit,
  articleQaRateLimit,
  RateLimitError,
} from '@/lib/rate-limiter';
import { detectPromptInjection } from '@/lib/rag/security/prompt-injection-detector';
import { logger, sanitizeError } from '@/lib/logger';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ZodError } from 'zod';
import { features } from '@/lib/config/env';
import {
  validateUser,
  createUserDeletedResponse,
} from '@/lib/middleware/with-user-validation';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';

import {
  agentTypeSchema,
  agentRequestSchema,
  ArticleNotFoundError,
  ModeContextError,
} from './schemas';
import type { RateLimitInfo } from './schemas';
import { handleStreamingRequest } from './streaming-handler';
import { handleBatchRequest } from './batch-handler';

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

async function postHandler(request: NextRequest) {
  return tracer.startActiveSpan('rag.agent-search', async (span) => {
    let session: Session | null = null;
    try {
      session = await auth();
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

      // Layer 1.5: User validation (check if user is deleted)
      const validatedUser = await validateUser(session);
      if (!validatedUser) {
        span.setAttribute('auth.status', 'user_deleted');
        return createUserDeletedResponse();
      }

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
      const rateLimit =
        agentType === 'article-qa'
          ? articleQaRateLimit
          : ragAgentSearchRateLimit;
      const rateKey = `rag:agent:${agentType}:${session.user.id}`;
      let rateLimitInfo: RateLimitInfo | undefined;

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
                'X-RateLimit-Reset': Math.floor(
                  error.reset.getTime() / 1000
                ).toString(),
                'Retry-After': Math.max(
                  0,
                  Math.ceil((error.reset.getTime() - Date.now()) / 1000)
                ).toString(),
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
        return await handleStreamingRequest(
          validatedRequest,
          session,
          span,
          request,
          rateLimitInfo
        );
      } else {
        return await handleBatchRequest(
          validatedRequest,
          session,
          span,
          request,
          rateLimitInfo
        );
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
            articleId: error.articleId,
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

export const POST = withCSRFProtection(postHandler);
