/**
 * Hatena Blog Dev 過去記事バックフィルスクリプト
 *
 * 初回実行用: 過去30ページ分（約600記事）を一括取得
 *
 * 使用方法:
 *   npx tsx scripts/one-time/backfill-hatena-blog-dev.ts
 *
 * 環境変数:
 *   HATENA_BLOG_DEV_BACKFILL_PAGES: 取得ページ数（デフォルト: 30）
 */

import { PrismaClient, Prisma, ArticleCategory } from '@prisma/client';
import { HatenaBlogDevFetcher } from '@/lib/fetchers/hatena-blog-dev';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { normalizeTag } from '@/lib/utils/tag-normalizer';
import { adjustTimezoneForArticle } from '@/lib/utils/date';

const prisma = new PrismaClient();

// 取得ページ数（デフォルト30ページ = 約600記事）
const MAX_PAGES = parseInt(process.env.HATENA_BLOG_DEV_BACKFILL_PAGES || '30', 10);

interface BackfillResult {
  total: number;
  newArticles: number;
  duplicates: number;
  enriched: number;
  errors: number;
}

/**
 * GraphQL APIから記事を取得（ページネーション対応）
 */
async function fetchAllArticles(): Promise<ReturnType<HatenaBlogDevFetcher['fetch']>['articles']> {
  // ソース情報を取得
  const source = await prisma.source.findUnique({
    where: { id: 'hatena_blog_dev' }
  });

  if (!source) {
    throw new Error('hatena_blog_dev ソースが見つかりません。先にDBに登録してください。');
  }

  // 環境変数を一時的に上書き
  const originalMaxPages = process.env.HATENA_BLOG_DEV_MAX_PAGES;
  process.env.HATENA_BLOG_DEV_MAX_PAGES = String(MAX_PAGES);

  try {
    console.log(`\n📥 Fetching articles (${MAX_PAGES} pages, ~${MAX_PAGES * 20} articles)...`);

    const fetcher = new HatenaBlogDevFetcher(source);
    const { articles, errors } = await fetcher.fetch();

    if (errors.length > 0) {
      console.error('\n⚠️ Fetch errors:');
      errors.forEach(err => console.error(`  - ${err.message}`));
    }

    console.log(`✅ Fetched ${articles.length} articles`);
    return articles;
  } finally {
    // 環境変数を元に戻す
    if (originalMaxPages) {
      process.env.HATENA_BLOG_DEV_MAX_PAGES = originalMaxPages;
    } else {
      delete process.env.HATENA_BLOG_DEV_MAX_PAGES;
    }
  }
}

/**
 * 記事を保存
 */
async function saveArticles(
  articles: Awaited<ReturnType<typeof fetchAllArticles>>
): Promise<BackfillResult> {
  const result: BackfillResult = {
    total: articles.length,
    newArticles: 0,
    duplicates: 0,
    enriched: 0,
    errors: 0
  };

  const enricherFactory = new ContentEnricherFactory();
  const newArticleIds: string[] = [];

  console.log(`\n💾 Saving ${articles.length} articles...`);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const progress = `[${i + 1}/${articles.length}]`;

    try {
      // 既存チェック
      const existing = await prisma.article.findFirst({
        where: { url: article.url }
      });

      if (existing) {
        result.duplicates++;
        if ((i + 1) % 100 === 0) {
          console.log(`${progress} Skipping duplicates...`);
        }
        continue;
      }

      // タグの処理
      const tagConnections = article.tagNames?.length
        ? {
            connectOrCreate: article.tagNames.map(name => {
              const normalizedName = normalizeTag(name);
              return {
                where: { name: normalizedName },
                create: { name: normalizedName }
              };
            })
          }
        : undefined;

      // タイムゾーン調整
      const adjustedDate = adjustTimezoneForArticle(
        article.publishedAt,
        article.url
      );

      // 記事作成
      const created = await prisma.article.create({
        data: {
          title: article.title,
          url: article.url,
          summary: article.summary || null,
          thumbnail: article.thumbnail || null,
          content: article.content || null,
          publishedAt: adjustedDate,
          sourceId: article.sourceId,
          category: ArticleCategory.frontend,
          tags: tagConnections,
        }
      });

      newArticleIds.push(created.id);
      result.newArticles++;

      if ((i + 1) % 50 === 0) {
        console.log(`${progress} New: ${result.newArticles}, Duplicates: ${result.duplicates}`);
      }
    } catch (error) {
      result.errors++;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          result.duplicates++;
          continue;
        }
      }
      console.error(`${progress} Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n✅ Saved: ${result.newArticles} new, ${result.duplicates} duplicates, ${result.errors} errors`);

  // エンリッチメント処理（新規記事のみ）
  if (newArticleIds.length > 0) {
    console.log(`\n🔄 Enriching ${newArticleIds.length} new articles...`);

    let enrichedCount = 0;
    for (let i = 0; i < newArticleIds.length; i++) {
      const articleId = newArticleIds[i];
      const progress = `[${i + 1}/${newArticleIds.length}]`;

      try {
        const articleData = await prisma.article.findUnique({
          where: { id: articleId },
          include: { source: true }
        });

        if (!articleData) continue;

        const enricher = enricherFactory.createEnricher(articleData.source.type);
        if (!enricher) continue;

        const enriched = await enricher.enrich({
          url: articleData.url,
          title: articleData.title,
          content: articleData.content || undefined,
          thumbnail: articleData.thumbnail || undefined
        });

        if (enriched.content || enriched.thumbnail) {
          await prisma.article.update({
            where: { id: articleId },
            data: {
              content: enriched.content || articleData.content,
              thumbnail: enriched.thumbnail || articleData.thumbnail,
              contentUpdatedAt: new Date()
            }
          });
          enrichedCount++;
        }

        if ((i + 1) % 20 === 0) {
          console.log(`${progress} Enriched: ${enrichedCount}`);
        }

        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`${progress} Enrich error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    result.enriched = enrichedCount;
    console.log(`✅ Enriched: ${enrichedCount} articles`);
  }

  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Hatena Blog Dev Backfill Script');
  console.log(`  Target: ${MAX_PAGES} pages (~${MAX_PAGES * 20} articles)`);
  console.log('═══════════════════════════════════════════════════════════════');

  const startTime = Date.now();

  try {
    // 記事取得
    const articles = await fetchAllArticles();

    if (articles.length === 0) {
      console.log('\n⚠️ No articles fetched. Exiting.');
      return;
    }

    // 保存＆エンリッチメント
    const result = await saveArticles(articles);

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total fetched:  ${result.total}`);
    console.log(`  New articles:   ${result.newArticles}`);
    console.log(`  Duplicates:     ${result.duplicates}`);
    console.log(`  Enriched:       ${result.enriched}`);
    console.log(`  Errors:         ${result.errors}`);
    console.log(`  Duration:       ${duration}s`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (result.newArticles > 0) {
      console.log('\n💡 Tip: Run `npx tsx scripts/scheduled/manage-summaries.ts` to generate summaries');
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
