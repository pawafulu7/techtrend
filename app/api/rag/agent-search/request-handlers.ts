import { NextRequest } from 'next/server';
import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { articleQaAgent as _articleQaAgent } from '@/lib/rag/agents/article-qa-agent';
import { prisma } from '@/lib/prisma';
import { stripHtmlTags } from '@/lib/utils/html-sanitizer';

import type { ValidatedRequest, ModeContext } from './schemas';
import { ArticleNotFoundError } from './schemas';

export type TemporalPattern = {
  regex: RegExp;
  dateRange?: { from?: string; to?: string };
  recencyBoost: number;
  strict: boolean; // true = explicit period, false = vague recency
};

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
      isHidden: true,
    },
  });

  if (!article) {
    throw new ArticleNotFoundError(articleId);
  }

  if (article.isHidden) {
    throw new ArticleNotFoundError(articleId);
  }

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

export function parseTemporalQuery(query: string): {
  cleanQuery: string;
  dateRange?: { from?: string; to?: string };
  recencyBoost: number;
  strict: boolean; // true = explicit period (先週, 昨日), false = vague recency (最新, latest)
} {
  const now = new Date();

  const toISOStart = (d: Date) =>
    new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
    ).toISOString();
  const toISOEnd = (d: Date) =>
    new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        23,
        59,
        59,
        999
      )
    ).toISOString();

  const todayEnd = toISOEnd(now);

  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() + mondayOffset);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);

  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);

  const thisMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const lastYearEnd = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31));

  const patterns: TemporalPattern[] = [
    // Vague recency (strict: false) - use recencyBoost only, no hard date filter
    {
      regex: /最新の?|最近の?|直近の?/,
      recencyBoost: 2.0,
      strict: false,
    },
    {
      regex: /\b(?:latest|recent)\b/i,
      recencyBoost: 2.0,
      strict: false,
    },
    // Explicit periods (strict: true) - use dateRange as hard filter with fallback
    {
      regex: /先週の?/,
      dateRange: { from: toISOStart(lastMonday), to: toISOEnd(lastSunday) },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /今週の?/,
      dateRange: { from: toISOStart(thisMonday), to: todayEnd },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /今月の?/,
      dateRange: {
        from: toISOStart(thisMonthStart),
        to: todayEnd,
      },
      recencyBoost: 1.0,
      strict: true,
    },
    {
      regex: /昨日の?/,
      dateRange: { from: toISOStart(yesterday), to: toISOEnd(yesterday) },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /今年の?/,
      dateRange: { from: toISOStart(thisYearStart), to: todayEnd },
      recencyBoost: 0.5,
      strict: true,
    },
    {
      regex: /去年の?|昨年の?/,
      dateRange: { from: toISOStart(lastYearStart), to: toISOEnd(lastYearEnd) },
      recencyBoost: 0,
      strict: true,
    },
    {
      regex: /\blast\s+week\b/i,
      dateRange: { from: toISOStart(lastMonday), to: toISOEnd(lastSunday) },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /\bthis\s+week\b/i,
      dateRange: { from: toISOStart(thisMonday), to: todayEnd },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /\bthis\s+month\b/i,
      dateRange: {
        from: toISOStart(thisMonthStart),
        to: todayEnd,
      },
      recencyBoost: 1.0,
      strict: true,
    },
    {
      regex: /\byesterday\b/i,
      dateRange: { from: toISOStart(yesterday), to: toISOEnd(yesterday) },
      recencyBoost: 1.5,
      strict: true,
    },
    {
      regex: /\bthis\s+year\b/i,
      dateRange: { from: toISOStart(thisYearStart), to: todayEnd },
      recencyBoost: 0.5,
      strict: true,
    },
    {
      regex: /\blast\s+year\b/i,
      dateRange: { from: toISOStart(lastYearStart), to: toISOEnd(lastYearEnd) },
      recencyBoost: 0,
      strict: true,
    },
  ];

  // Prefer strict matches (explicit periods) over vague recency patterns
  const matches = patterns
    .map((pattern) => ({ pattern, match: query.match(pattern.regex) }))
    .filter(
      (entry): entry is { pattern: TemporalPattern; match: RegExpMatchArray } =>
        entry.match !== null
    )
    .sort((a, b) => {
      // strict: true wins over strict: false
      if (a.pattern.strict !== b.pattern.strict) {
        return Number(b.pattern.strict) - Number(a.pattern.strict);
      }
      // Among same-strict patterns, prefer earliest match position
      return (
        (a.match.index ?? Number.MAX_SAFE_INTEGER) -
        (b.match.index ?? Number.MAX_SAFE_INTEGER)
      );
    });

  const matchedEntry = matches[0];
  if (matchedEntry) {
    const rawClean = query
      .replace(matchedEntry.pattern.regex, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanQuery = rawClean.length > 0 ? rawClean : query;
    return {
      cleanQuery,
      dateRange: matchedEntry.pattern.dateRange,
      recencyBoost: matchedEntry.pattern.recencyBoost,
      strict: matchedEntry.pattern.strict,
    };
  }

  return { cleanQuery: query, recencyBoost: 0, strict: false };
}
