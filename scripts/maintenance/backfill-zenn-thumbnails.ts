/**
 * Zenn記事のthumbnailがNULLのものにCloudinary OGPサムネイルをバックフィルするスクリプト
 *
 * 対象: URLが https://zenn.dev/*/articles/* の記事（ソース問わず）
 * はてなブックマーク経由のZenn記事も対象に含まれる
 *
 * 実行方法: npx tsx scripts/maintenance/backfill-zenn-thumbnails.ts
 */

import { PrismaClient } from '@prisma/client';
import { generateZennThumbnail } from '../../lib/utils/zenn-thumbnail';

async function main() {
  const prisma = new PrismaClient();

  try {
    // 1. URLベースで thumbnail が NULL の Zenn 記事を取得（ソース問わず）
    const articles = await prisma.article.findMany({
      where: {
        thumbnail: null,
        url: {
          startsWith: 'https://zenn.dev/',
          contains: '/articles/',
        },
      },
      select: {
        id: true,
        url: true,
        title: true,
        source: { select: { name: true } },
      },
    });

    console.log(`Target articles: ${articles.length}`);

    if (articles.length === 0) {
      console.log('No articles to update.');
      return;
    }

    // 2. 各記事のサムネイルを生成・更新
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const updatedBySource: Record<string, number> = {};

    for (const article of articles) {
      try {
        const thumbnail = generateZennThumbnail(article.url, article.title);
        const sourceName = article.source?.name ?? 'Unknown';

        if (thumbnail) {
          await prisma.article.update({
            where: { id: article.id },
            data: { thumbnail },
          });
          updated++;
          updatedBySource[sourceName] = (updatedBySource[sourceName] ?? 0) + 1;
          console.log(`Updated: [${sourceName}] ${article.url}`);
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(
          `Failed to process article ${article.id} (${article.url}):`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // 3. 結果出力
    console.log('\n--- Result ---');
    console.log(`Total:   ${articles.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed:  ${failed}`);

    // 4. ソース別サマリ
    if (Object.keys(updatedBySource).length > 0) {
      console.log('\n--- Updated by Source ---');
      for (const [source, count] of Object.entries(updatedBySource).sort(
        (a, b) => b[1] - a[1]
      )) {
        console.log(`  ${source}: ${count}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
