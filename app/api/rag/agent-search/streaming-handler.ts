import { NextRequest } from 'next/server';
import { AgentResponseCache } from '@/lib/cache/agent-response-cache';
import { ArticleQACache as _ArticleQACache } from '@/lib/cache/article-qa-cache';
import { VectorSearchService } from '@/lib/rag/vector-search-service';
import { prisma } from '@/lib/prisma';
import { logger, sanitizeError } from '@/lib/logger';
import { trace, context, SpanStatusCode, Span } from '@opentelemetry/api';
import type { Session } from 'next-auth';

import type { RateLimitInfo, ValidatedRequest, ModeContext } from './schemas';
import {
  unwrapToolOutput,
  createSSEResponse,
  createCachedSSEResponse,
  formatResultsAsText,
} from './sse-helpers';
import {
  resolveModeContext,
  enqueueArticleQaNoAnswer,
} from './request-handlers';

const tracer = trace.getTracer('rag-agent');

/**
 * Handle streaming agent search request
 *
 * Resolves mode-specific context (agent, system prompt, cache strategy) prior to
 * streaming and emits SSE events: qa-context (when available), cached, text-delta,
 * tool-start, tool-complete, fallback, finish, error.
 */
export async function handleStreamingRequest(
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
    parentSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Failed to resolve mode context',
    });
    throw error;
  }

  if (modeContext.isArticleQa && !modeContext.qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    parentSpan.recordException(contextError);
    parentSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: contextError.message,
    });
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

  const cacheStrategy = modeContext.isArticleQa
    ? 'article-qa'
    : 'agent-response';
  parentSpan.setAttribute('cache.strategy', cacheStrategy);

  const agentCache = modeContext.isArticleQa
    ? undefined
    : new AgentResponseCache();
  const articleQaCache = modeContext.isArticleQa
    ? new _ArticleQACache()
    : undefined;
  let cachedResponse: string | null = null;

  try {
    if (modeContext.isArticleQa) {
      const qaContext = modeContext.qaContext!;
      cachedResponse = await articleQaCache!.getResponse(
        qaContext.articleId,
        validatedRequest.query,
        modeContext.preferredLang,
        qaContext.updatedAt
      );
    } else {
      cachedResponse = await agentCache!.getResponse(
        `${modeContext.preferredLang}:${validatedRequest.query}`
      );
    }
  } catch (cacheError) {
    logger.warn(
      { error: sanitizeError(cacheError), mode: modeContext.agentType },
      'Cache read failed, treating as miss'
    );
    cachedResponse = null;
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

    return createCachedSSEResponse(
      cachedResponse,
      modeContext.qaContext,
      rateLimitInfo
    );
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
    rateLimitInfo,
    { responseCache: agentCache, articleQaCache }
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
  rateLimitInfo?: RateLimitInfo,
  caches?: {
    responseCache?: AgentResponseCache;
    articleQaCache?: _ArticleQACache;
  }
): Promise<Response> {
  const encoder = new TextEncoder();
  const responseCache =
    caches?.responseCache ??
    (modeContext.isArticleQa ? undefined : new AgentResponseCache());
  const articleQaCache =
    caches?.articleQaCache ??
    (modeContext.isArticleQa ? new _ArticleQACache() : undefined);
  const streamSpan = tracer.startSpan(
    'rag.agent-search.stream',
    {},
    trace.setSpan(context.active(), parentSpan)
  );
  const qaContext = modeContext.qaContext;
  const qaContextPayload =
    modeContext.isArticleQa && qaContext
      ? {
          articleId: qaContext.articleId,
          title: qaContext.title,
          snippet: qaContext.snippet,
          updatedAt: qaContext.updatedAt.toISOString(),
        }
      : undefined;

  if (modeContext.isArticleQa && !qaContext) {
    const contextError = new Error('Article QA mode requires qaContext');
    streamSpan.recordException(contextError);
    streamSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: contextError.message,
    });
    streamSpan.end();
    throw contextError;
  }

  streamSpan.setAttributes({
    'mode.agentType': modeContext.agentType,
    'mode.preferredLang': modeContext.preferredLang,
  });

  streamSpan.setAttribute(
    'cache.strategy',
    modeContext.isArticleQa ? 'article-qa' : 'agent-response'
  );

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

        if (qaContextPayload) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'qa-context',
                context: qaContextPayload,
              })}\n\n`
            )
          );
        }

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
              if (modeContext.isArticleQa) {
                // Article QA: do NOT search all articles - return scoped empty response
                enqueueArticleQaNoAnswer(
                  controller,
                  encoder,
                  modeContext.preferredLang
                );

                streamSpan.setAttribute('streaming.fallbackEmptyText', true);
                streamSpan.setAttribute('streaming.articleQaNoAnswer', true);
                streamSpan.end();
                return;
              }

              // Fallback: Vector search across all articles (article-search mode only)
              try {
                const searchService = new VectorSearchService(prisma);
                const fallbackResults = await searchService.search(
                  validatedRequest.query,
                  { topK: 10 }
                );
                const fallbackText = formatResultsAsText(
                  fallbackResults,
                  modeContext.preferredLang
                );

                // Note: Fallback results are NOT cached (intentional)
                // Avoids caching low-quality fallback responses
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'fallback', text: fallbackText, resultCount: fallbackResults.length })}\n\n`
                  )
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'finish', text: fallbackText, usage: { totalTokens: 0 }, toolCalls: [], cached: false, fallback: true })}\n\n`
                  )
                );
                controller.close();

                streamSpan.setAttribute('streaming.fallbackEmptyText', true);
                streamSpan.end();
                return;
              } catch (fallbackError) {
                streamSpan.setAttribute('streaming.fallbackFailed', true);
                streamSpan.recordException(fallbackError as Error);
                logger.error(
                  {
                    error: sanitizeError(fallbackError),
                    userId: session.user.id,
                  },
                  'Fallback failed for empty text'
                );
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'error',
                      message: 'Failed to generate response',
                    })}\n\n`
                  )
                );
                controller.close();
                streamSpan.end();
                return;
              }
            }

            try {
              if (modeContext.isArticleQa) {
                await articleQaCache!.setResponse(
                  qaContext!.articleId,
                  validatedRequest.query,
                  modeContext.preferredLang,
                  qaContext!.updatedAt,
                  fullText
                );
              } else {
                await responseCache!.setResponse(
                  `${modeContext.preferredLang}:${validatedRequest.query}`,
                  fullText
                );
              }
            } catch (cacheError) {
              logger.warn(
                { error: sanitizeError(cacheError), userId: session.user.id },
                'Failed to cache streaming response'
              );
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
            streamSpan.setAttribute(
              'streaming.toolCallCount',
              toolCalls.length
            );
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

        try {
          if (modeContext.isArticleQa) {
            // Article QA: do NOT search all articles - return scoped empty response
            enqueueArticleQaNoAnswer(
              controller,
              encoder,
              modeContext.preferredLang
            );

            streamSpan.setAttribute('streaming.fallback', true);
            streamSpan.setAttribute('streaming.articleQaNoAnswer', true);
          } else {
            const searchService = new VectorSearchService(prisma);
            const fallbackResults = await searchService.search(
              validatedRequest.query,
              {
                topK: 10,
              }
            );

            const fallbackText = formatResultsAsText(
              fallbackResults,
              modeContext.preferredLang
            );

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
            streamSpan.setAttribute(
              'streaming.fallbackResultCount',
              fallbackResults.length
            );
          }
        } catch (fallbackError) {
          streamSpan.setAttribute('streaming.fallbackFailed', true);
          streamSpan.recordException(fallbackError as Error);

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: 'Failed to generate response',
              })}\n\n`
            )
          );

          controller.close();
        } finally {
          streamSpan.end();
        }
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
