import { NextRequest } from 'next/server';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { articleQaAgent as _articleQaAgent } from '@/lib/rag/agents/article-qa-agent';
import { prisma } from '@/lib/prisma';
import { stripHtmlTags } from '@/lib/utils/html-sanitizer';

import type { ValidatedRequest, ModeContext } from './schemas';
import { ArticleNotFoundError } from './schemas';

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
export function getPreferredLanguage(
  query: string,
  request: NextRequest
): 'ja' | 'en' {
  // Priority 1: If query contains Japanese characters, use Japanese
  if (/[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/.test(query)) {
    return 'ja';
  }

  // Priority 2: Check Accept-Language header
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    // Parse Accept-Language header (e.g., "ja,en-US;q=0.9,en;q=0.8")
    const languages = acceptLanguage
      .split(',')
      .map((part) => {
        const [codePart, ...params] = part.trim().split(';');
        const qParam = params.find((p) => p.trim().startsWith('q='));
        const rawQ = qParam
          ? Number.parseFloat(qParam.split('=')[1] ?? '1')
          : 1;
        const q = Number.isFinite(rawQ) ? Math.min(1, Math.max(0, rawQ)) : 0;
        return {
          code: codePart.toLowerCase(),
          q,
        };
      })
      .filter(({ q }) => q > 0)
      .sort((a, b) => b.q - a.q);

    // Check if Japanese is preferred
    for (const { code } of languages) {
      if (code.startsWith('ja')) {
        return 'ja';
      }
      if (code.startsWith('en')) {
        return 'en';
      }
    }
  }

  // Priority 3: Default to Japanese (primary user base)
  return 'ja';
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
export async function fetchQaContext(articleId: string): Promise<{
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
  const detailedSummary =
    article.detailedSummary &&
    article.detailedSummary !== '__SKIP_DETAILED_SUMMARY__'
      ? stripHtmlTags(article.detailedSummary)
      : '';
  const summarySource =
    detailedSummary || stripHtmlTags(article.summary ?? '') || '';
  const snippetSource = summarySource || article.title;
  const snippet = snippetSource.slice(0, 160);

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
 * - article-qa mode: May throw ArticleNotFoundError if article not found
 * - article-search mode: No errors (always succeeds)
 *
 * @param validatedRequest - Validated request
 * @param request - HTTP request
 * @returns Mode context with agent, lang, and system message
 * @throws ArticleNotFoundError if article not found in QA mode
 */
export async function resolveModeContext(
  validatedRequest: ValidatedRequest,
  request: NextRequest
): Promise<ModeContext> {
  const isArticleQa = validatedRequest.agentType === 'article-qa';
  const preferredLang = getPreferredLanguage(validatedRequest.query, request);

  const localeInstruction =
    preferredLang === 'ja'
      ? 'User locale: Japanese (ja). Respond in Japanese unless the user explicitly asks otherwise.'
      : 'User locale: English (en). Respond in English unless the user explicitly asks otherwise.';

  if (isArticleQa) {
    // Article QA mode
    const qaContext = await fetchQaContext(validatedRequest.articleId!);

    const summaryLine = qaContext.snippet
      ? `- Summary preview: ${qaContext.snippet}`
      : '- Summary preview: (not available)';
    const systemMessage = `${localeInstruction}

Active article metadata:
- Title: ${qaContext.article.title}
- Article ID: ${qaContext.article.id}
- Last updated: ${qaContext.article.updatedAt.toISOString()}
${summaryLine}

Article QA protocol:
1. ALWAYS call the article-context tool first with { articleId: ${qaContext.article.id}, includeSummary: true } before replying.
2. Include the user's question keywords plus helpful context terms (e.g., "概要", "メリット", "implementation caveats") in the tool query.
3. If article-context returns no high-score chunks, retry once with a broader query and summarize the best chunk even if the score is low.
4. Do NOT ask the user to repeat the question; interpret it using the article context.
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
 * Get localized no-answer text for article QA mode
 */
export function getArticleQaNoAnswerText(preferredLang: 'ja' | 'en'): string {
  return preferredLang === 'ja'
    ? 'この記事の内容からは回答を生成できませんでした。'
    : 'Could not generate an answer from this article.';
}

/**
 * Enqueue article-qa no-answer events to SSE stream
 */
export function enqueueArticleQaNoAnswer(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  preferredLang: 'ja' | 'en'
): void {
  const noAnswerText = getArticleQaNoAnswerText(preferredLang);
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: 'fallback',
        text: noAnswerText,
        resultCount: 0,
      })}\n\n`
    )
  );
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: 'finish',
        text: noAnswerText,
        usage: { totalTokens: 0 },
        toolCalls: [],
        cached: false,
        fallback: true,
      })}\n\n`
    )
  );
  controller.close();
}
