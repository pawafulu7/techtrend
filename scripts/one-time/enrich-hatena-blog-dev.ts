/**
 * Hatena Blog Dev 記事エンリッチメントスクリプト
 *
 * contentがnullまたは空の記事に対してエンリッチメント処理を行う
 *
 * 使用方法:
 *   npx tsx scripts/one-time/enrich-hatena-blog-dev.ts
 *
 * オプション:
 *   --dry-run   実際の更新なし
 *   --limit N   処理する記事数を制限
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '@/lib/enrichers';

const prisma = new PrismaClient();

interface Options {
  dryRun: boolean;
  limit?: number;
}

// コマンドライン引数をパース
const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    limit: args.includes('--limit')
      ? parseInt(args[args.indexOf('--limit') + 1], 10)
      : undefined,
  };
};

// 遅延処理
const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function main() {
  const options = parseArgs();
  const enricherFactory = new ContentEnricherFactory();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Hatena Blog Dev Enrichment Script');
  console.log(`  Mode: ${options.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  if (options.limit) console.log(`  Limit: ${options.limit} articles`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // contentがnullまたは空の記事を取得
    const articles = await prisma.article.findMany({
      where: {
        sourceId: 'hatena_blog_dev',
        OR: [
          { content: null },
          { content: '' },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: options.limit,
    });

    console.log(`📋 Found ${articles.length} articles without content\n`);

    if (articles.length === 0) {
      console.log('✅ No articles need enrichment');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;

      const enricher = enricherFactory.getEnricher(article.url);

      if (!enricher) {
        console.log(`${progress} [SKIP] No enricher for: ${article.url}`);
        skipCount++;
        continue;
      }

      try {
        console.log(`${progress} Enriching: ${article.title.substring(0, 50)}...`);

        if (options.dryRun) {
          console.log(`  [DRY-RUN] Would enrich: ${article.url}`);
          successCount++;
          continue;
        }

        const enrichedResult = await enricher.enrich(article.url);

        if (enrichedResult && enrichedResult.content && enrichedResult.content.length > 100) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              content: enrichedResult.content,
              thumbnail: enrichedResult.thumbnail || article.thumbnail,
              contentUpdatedAt: new Date(),
            },
          });

          console.log(`  ✅ Success: ${enrichedResult.content.length} chars`);
          successCount++;
        } else {
          console.log(`  ❌ Failed: Content too short or empty`);
          failCount++;
        }

        // レート制限対策
        await delay(200);
      } catch (error) {
        console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        failCount++;
      }

      // 進捗表示（50件ごと）
      if ((i + 1) % 50 === 0) {
        console.log(`\n📊 Progress: ${successCount} success, ${failCount} failed, ${skipCount} skipped\n`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total:     ${articles.length}`);
    console.log(`  Success:   ${successCount}`);
    console.log(`  Failed:    ${failCount}`);
    console.log(`  Skipped:   ${skipCount}`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (successCount > 0 && !options.dryRun) {
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
