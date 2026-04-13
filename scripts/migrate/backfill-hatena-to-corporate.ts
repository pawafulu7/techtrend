/**
 * Backfill Hatena articles to corporate sources
 *
 * Updates sourceId for existing articles that were fetched via Hatena
 * but actually belong to corporate blogs (based on URL domain).
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { HATENA_SOURCE_ID } from '@/lib/constants/source-ids';

const prisma = createPrismaClient();

/**
 * Domain to Source ID mapping
 * Based on scripts/migrate/migrate-corporate-articles.ts
 */
const domainToSourceMap: Record<string, string> = {
  'developers.freee.co.jp': 'freee_tech_blog',
  'developers.cyberagent.co.jp': 'cyberagent_tech_blog',
  'engineering.dena.com': 'dena_tech_blog',
  'tech.smarthr.jp': 'smarthr_tech_blog',
  'techblog.lycorp.co.jp': 'lycorp_tech_blog',
  'developers.gmo.jp': 'gmo_tech_blog',
  'buildersbox.corp-sansan.com': 'sansan_tech_blog',
  'engineering.mercari.com': 'mercari_tech_blog',
  'techblog.zozo.com': 'zozo_tech_blog',
  'moneyforward-dev.jp': 'moneyforward_tech_blog',
  'developer.hatenastaff.com': 'hatena_tech_blog',
  'tech.pepabo.com': 'pepabo_tech_blog',
  'techlife.cookpad.com': 'cookpad_tech_blog',
};

async function backfill() {
  console.log('=== はてなブックマーク記事のsourceIdバックフィル ===\n');

  const hatenaArticles = await prisma.article.findMany({
    where: { sourceId: HATENA_SOURCE_ID },
    select: { id: true, url: true, title: true },
  });

  console.log(`対象記事: ${hatenaArticles.length}件\n`);

  let updatedCount = 0;
  let unmappedCount = 0;
  const stats: Record<string, number> = {};

  for (const article of hatenaArticles) {
    try {
      const hostname = new URL(article.url).hostname;
      const corporateSourceId = domainToSourceMap[hostname];

      if (corporateSourceId) {
        await prisma.article.update({
          where: { id: article.id },
          data: { sourceId: corporateSourceId },
        });

        stats[corporateSourceId] = (stats[corporateSourceId] || 0) + 1;
        updatedCount++;

        if (updatedCount % 10 === 0) {
          console.log(`  ${updatedCount}件処理完了...`);
        }
      } else {
        unmappedCount++;
      }
    } catch (error) {
      console.error(`❌ エラー: ${article.title}`, error);
      unmappedCount++;
    }
  }

  console.log(`\n結果:`);
  console.log(`  更新: ${updatedCount}件`);
  console.log(`  未マッピング: ${unmappedCount}件\n`);

  if (Object.keys(stats).length > 0) {
    console.log('企業別更新数:');
    const sortedStats = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    for (const [sourceId, count] of sortedStats) {
      console.log(`  ${sourceId.padEnd(30)} ${count.toString().padStart(3)}件`);
    }
  }

  console.log('\n=== バックフィル完了 ===');
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
