/**
 * Article QA Demo Script
 *
 * Demonstrates Article QA Agent functionality without API layer.
 * Useful for validation, testing, and product owner demos.
 *
 * Usage:
 *   npx tsx lib/scripts/article-qa-demo.ts <articleId> "<question>"
 *
 * Example:
 *   npx tsx lib/scripts/article-qa-demo.ts cm123abc "この記事の前提となる概念を教えて"
 *
 * @module article-qa-demo
 */

import { prisma } from '@/lib/prisma';
import { articleQaAgent } from '@/lib/rag/agents/article-qa-agent';
import { ArticleQACache } from '@/lib/cache/article-qa-cache';

/**
 * Normalize query for cache key (matches ArticleQACache.normalizeQuery)
 *
 * NOTE: This duplicates ArticleQACache's private normalizeQuery logic.
 * If ArticleQACache normalization changes, update this function to match.
 * This duplication is intentional for demo script independence.
 *
 * @param query - Raw query
 * @returns Normalized query
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[!?。、；：！？、]/g, '');
}

interface DemoResult {
  question: string;
  answer: string;
  toolCalls: any[];
  usage: any;
  cached: boolean;
  elapsedMs: number;
  cacheInfo: {
    hit: boolean;
    key: string;
  };
}

async function runArticleQA(
  articleId: string,
  question: string
): Promise<DemoResult> {
  const startTime = Date.now();

  // Fetch article metadata
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      url: true,
      updatedAt: true,
    },
  });

  if (!article) {
    throw new Error(`Article ${articleId} not found`);
  }

  // Check cache
  const cache = new ArticleQACache();
  const locale: 'ja' | 'en' = /[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF]/.test(
    question
  )
    ? 'ja'
    : 'en';
  const cachedResponse = await cache.getResponse(
    articleId,
    question,
    locale,
    article.updatedAt
  );

  if (cachedResponse) {
    const elapsedMs = Date.now() - startTime;
    const normalizedQuestion = normalizeQuery(question);
    return {
      question,
      answer: cachedResponse,
      toolCalls: [],
      usage: { totalTokens: 0 },
      cached: true,
      elapsedMs,
      cacheInfo: {
        hit: true,
        key: `article-qa:${articleId}:${normalizedQuestion}:${locale}:${article.updatedAt.getTime()}`,
      },
    };
  }

  // Execute agent
  const localeInstruction =
    locale === 'ja'
      ? 'User locale: Japanese (ja). Respond in Japanese unless the user explicitly asks otherwise.'
      : 'User locale: English (en). Respond in English unless the user explicitly asks otherwise.';

  const result = await articleQaAgent.generate({
    messages: [
      {
        role: 'system',
        content: `${localeInstruction}\n\nArticle ID: ${articleId}\nArticle Title: ${article.title}`,
      },
      { role: 'user', content: question },
    ],
  });

  const answer = result.text ?? '';
  const toolCalls = result.steps?.flatMap((step) => step.toolCalls ?? []) ?? [];
  const usage = result.usage ?? { totalTokens: 0 };

  // Cache response
  await cache.setResponse(
    articleId,
    question,
    locale,
    article.updatedAt,
    answer
  );

  const elapsedMs = Date.now() - startTime;
  const normalizedQuestion = normalizeQuery(question);

  return {
    question,
    answer,
    toolCalls,
    usage,
    cached: false,
    elapsedMs,
    cacheInfo: {
      hit: false,
      key: `article-qa:${articleId}:${normalizedQuestion}:${locale}:${article.updatedAt.getTime()}`,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      'Usage: npx tsx lib/scripts/article-qa-demo.ts <articleId> "<question>"'
    );
    console.error(
      'Example: npx tsx lib/scripts/article-qa-demo.ts cm123abc "この記事の前提となる概念を教えて"'
    );
    throw new Error('Invalid arguments');
  }

  const [articleId, question] = args;

  console.log('='.repeat(80));
  console.log('Article QA Demo - Phase 1 Foundation');
  console.log('='.repeat(80));
  console.log();
  console.log(`Article ID: ${articleId}`);
  console.log(`Question: ${question}`);
  console.log();
  console.log('Executing Article QA Agent...');
  console.log();

  try {
    const result = await runArticleQA(articleId, question);

    console.log('='.repeat(80));
    console.log('RESULT');
    console.log('='.repeat(80));
    console.log();
    console.log(
      `Cached: ${result.cached ? 'YES (cache hit)' : 'NO (fresh generation)'}`
    );
    console.log(`Elapsed: ${result.elapsedMs}ms`);
    console.log(`Tokens: ${result.usage.totalTokens || 0}`);
    console.log(`Tool Calls: ${result.toolCalls.length}`);
    console.log();
    console.log('Cache Info:');
    console.log(`  Hit: ${result.cacheInfo.hit}`);
    console.log(`  Key: ${result.cacheInfo.key}`);
    console.log();
    console.log('Answer:');
    console.log('-'.repeat(80));
    console.log(result.answer);
    console.log('-'.repeat(80));
    console.log();

    if (result.toolCalls.length > 0) {
      console.log('Tool Calls:');
      console.log('-'.repeat(80));
      result.toolCalls.forEach((call, idx) => {
        console.log(`${idx + 1}. ${call.toolName}`);
        console.log(
          `   Input: ${JSON.stringify(call.input, null, 2).substring(0, 200)}...`
        );
      });
      console.log('-'.repeat(80));
      console.log();
    }

    console.log('Demo completed successfully!');
    console.log();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('='.repeat(80));
  console.error('ERROR');
  console.error('='.repeat(80));
  console.error();
  console.error(error instanceof Error ? error.message : 'Unknown error');
  console.error();
  console.error(error);
  process.exit(1);
});
