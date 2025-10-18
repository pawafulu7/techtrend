import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { searchRequestSchema } from '@/lib/rag/schemas';
import { ragSearchRateLimit, checkRateLimit, RateLimitError } from '@/lib/rate-limiter';
import { logger, sanitizeError } from '@/lib/logger';
import { ZodError } from 'zod';
import OpenAI from 'openai';

/**
 * RAG Semantic Search API
 *
 * POST /api/rag/search
 *
 * Security layers:
 * 1. Authentication (Auth.js v5) - REQUIRED
 * 2. Rate limiting (Upstash Redis) - 10 req/min/user
 * 3. Input validation (Zod) - searchRequestSchema
 * 4. SQL injection prevention (Prisma.sql)
 *
 * @see .claude/docs/plan/plan_20251018_104352_577_mastra-rag-final-secure.md:1038-1149
 */

// Singleton VectorSearchService (module-scoped for connection pooling)
const searchService = new VectorSearchService(prisma);

export async function POST(request: NextRequest) {
  try {
    // Layer 1: Authentication check (REQUIRED)
    const session = await auth();

    if (!session?.user) {
      logger.warn('Unauthorized RAG search attempt', {
        ip: request.headers.get('x-forwarded-for') || 'unknown',
      });

      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      );
    }

    // Layer 2: Rate limiting (REQUIRED)
    if (ragSearchRateLimit) {
      try {
        await checkRateLimit(`rag:search:${session.user.id}`, ragSearchRateLimit);
      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn('Rate limit exceeded', {
            userId: session.user.id,
            limit: error.limit,
            remaining: error.remaining,
          });

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
                'X-RateLimit-Remaining': error.remaining.toString(),
                'X-RateLimit-Reset': Math.floor(error.reset.getTime() / 1000).toString(),
                'Retry-After': Math.ceil((error.reset.getTime() - Date.now()) / 1000).toString(),
              },
            }
          );
        }
        throw error;
      }
    }

    // Layer 3: Input validation (Zod)
    const body = await request.json();
    const validatedRequest = searchRequestSchema.parse(body);

    logger.info('RAG search request', {
      userId: session.user.id,
      queryPreview: validatedRequest.query.substring(0, 50),
      topK: validatedRequest.topK,
      embeddingKey: validatedRequest.embeddingKey,
    });

    // Layer 4: Execute search (SECURE - Prisma.sql in VectorSearchService)
    const results = await searchService.search(validatedRequest.query, {
      topK: validatedRequest.topK,
      similarityThreshold: validatedRequest.similarityThreshold,
      sourceIds: validatedRequest.filters?.sources,
      tags: validatedRequest.filters?.tags,
      embeddingKey: validatedRequest.embeddingKey,
    });

    // Layer 5: Return results
    return NextResponse.json({
      query: validatedRequest.query,
      results,
      count: results.length,
      model: process.env.RAG_ACTIVE_MODEL || 'text-embedding-3-small',
      version: parseInt(process.env.RAG_ACTIVE_VERSION || '1', 10),
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      logger.warn('Invalid RAG search request', {
        userId: session?.user?.id,
        errors: error.errors,
      });

      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      const status = error.status || 500;

      // Map OpenAI errors to appropriate HTTP status
      if (status === 429) {
        // OpenAI rate limit
        return NextResponse.json(
          {
            error: 'Embedding service rate limit exceeded',
            details: 'Please try again later',
          },
          {
            status: 429,
            headers: {
              'Retry-After': '60', // 1 minute
            },
          }
        );
      } else if (status >= 500) {
        // OpenAI server errors
        logger.error('OpenAI API error', {
          error: sanitizeError(error),
          userId: session?.user?.id,
        });

        return NextResponse.json(
          {
            error: 'Embedding service temporarily unavailable',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          { status: 503 }
        );
      } else {
        // OpenAI 4xx client errors
        logger.error('OpenAI client error', {
          error: sanitizeError(error),
          userId: session?.user?.id,
        });

        return NextResponse.json(
          {
            error: 'Invalid embedding request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          { status: 502 }
        );
      }
    }

    // Handle database connection errors
    if (error instanceof Error && error.message.toLowerCase().includes('prisma')) {
      logger.error('Database connection error', {
        error: sanitizeError(error),
        userId: session?.user?.id,
      });

      return NextResponse.json(
        {
          error: 'Database temporarily unavailable',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 503 }
      );
    }

    // Other unexpected errors
    logger.error('RAG search API error', {
      error: sanitizeError(error),
      userId: session?.user?.id,
    });

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
  }
}
