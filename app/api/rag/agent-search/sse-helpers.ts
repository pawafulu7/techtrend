import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';
import type { NextResponse } from 'next/server';
import type { RateLimitInfo, ModeContext } from './schemas';

/**
 * Attach rate limit headers to response
 *
 * Also sets Cache-Control to prevent intermediary caching.
 */
export function attachRateLimitHeaders(
  response: NextResponse,
  rateLimitInfo?: { limit: number; remaining: number; reset: Date }
): NextResponse {
  // Prevent CDN/proxy caching (user-specific, rate-limited responses)
  response.headers.set('Cache-Control', 'private, no-store');

  if (rateLimitInfo) {
    response.headers.set('X-RateLimit-Limit', rateLimitInfo.limit.toString());
    response.headers.set(
      'X-RateLimit-Remaining',
      rateLimitInfo.remaining.toString()
    );
    response.headers.set(
      'X-RateLimit-Reset',
      Math.floor(rateLimitInfo.reset.getTime() / 1000).toString()
    );
  }
  return response;
}

/**
 * Type guard for Language Model tool result output wrapper
 *
 * Checks for valid LanguageModelV2ToolResultOutput types:
 * - 'json', 'text', 'error-json', 'error-text', 'content'
 */
export function isLanguageModelToolResultOutput(
  output: unknown
): output is LanguageModelV2ToolResultOutput {
  if (
    typeof output !== 'object' ||
    output === null ||
    !('type' in output) ||
    !('value' in output)
  ) {
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
export function unwrapToolOutput(output: unknown): unknown {
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
export function createSSEResponse(
  stream: ReadableStream,
  rateLimitInfo?: RateLimitInfo
): Response {
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
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
 * Emits 'cached' event followed by 'finish' event (with text and toolCalls).
 */
export function createCachedSSEResponse(
  cachedText: string,
  toolCalls: unknown[],
  qaContext?: ModeContext['qaContext'],
  rateLimitInfo?: RateLimitInfo
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      if (qaContext) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'qa-context',
              context: {
                articleId: qaContext.articleId,
                title: qaContext.title,
                snippet: qaContext.snippet,
                updatedAt: qaContext.updatedAt.toISOString(),
              },
            })}\n\n`
          )
        );
      }

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
            text: cachedText,
            toolCalls,
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
 * Format search results as text (fallback when agent fails)
 *
 * @param results - Search results
 * @param lang - Language for formatting ('ja' or 'en')
 */
export function formatResultsAsText(
  results: Array<{
    similarity: number;
    publishedAt: Date;
    translatedTitle?: string | null;
    title: string;
  }>,
  lang: 'ja' | 'en'
): string {
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
