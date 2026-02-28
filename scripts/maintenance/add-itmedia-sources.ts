/**
 * ITmedia系ソースをDBに登録するスクリプト
 *
 * 対象ソース:
 * - ITmedia NEWS
 * - ITmedia AI+
 * - @IT
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-itmedia-sources.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ITMEDIA_SOURCES = [
  {
    id: 'itmedia_news',
    name: 'ITmedia NEWS',
    url: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'itmedia_aiplus',
    name: 'ITmedia AI+',
    url: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'atit',
    name: '@IT',
    url: 'https://rss.itmedia.co.jp/rss/2.0/ait.xml',
    type: 'RSS',
    enabled: true,
  },
];

async function main() {
  console.log('=== ITmedia系ソース登録 ===\n');

  let addedCount = 0;
  let updatedCount = 0;

  for (const source of ITMEDIA_SOURCES) {
    const result = await prisma.source.upsert({
      where: { id: source.id },
      update: {
        name: source.name,
        url: source.url,
        type: source.type,
        enabled: source.enabled,
      },
      create: source,
    });

    // createdAtとupdatedAtの比較で新規/更新を判定
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      console.log(`[ADDED] ${source.name}`);
      addedCount++;
    } else {
      console.log(`[UPDATED] ${source.name}`);
      updatedCount++;
    }
  }

  console.log('\n=== 完了 ===');
  console.log(`追加: ${addedCount}件`);
  console.log(`更新: ${updatedCount}件`);
  console.log(`合計: ${ITMEDIA_SOURCES.length}件`);
}

main()
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
