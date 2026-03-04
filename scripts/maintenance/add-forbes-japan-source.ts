/**
 * Forbes Japan AI ソースをDBに登録するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-forbes-japan-source.ts
 */

import { PrismaClient } from '@prisma/client';
import { sourceCache } from '../../lib/cache/source-cache';

const prisma = new PrismaClient();

const FORBES_JAPAN_SOURCE = {
  id: 'forbes_japan_ai',
  name: 'Forbes Japan AI',
  url: 'https://forbesjapan.com/category/technology_ai',
  type: 'SCRAPER',
  enabled: true,
};

async function main() {
  console.log('=== Forbes Japan AI ソース登録 ===\n');

  const result = await prisma.source.upsert({
    where: { id: FORBES_JAPAN_SOURCE.id },
    update: {
      name: FORBES_JAPAN_SOURCE.name,
      url: FORBES_JAPAN_SOURCE.url,
      type: FORBES_JAPAN_SOURCE.type,
      enabled: FORBES_JAPAN_SOURCE.enabled,
    },
    create: FORBES_JAPAN_SOURCE,
  });

  // createdAtとupdatedAtの比較で新規/更新を判定
  if (result.createdAt.getTime() === result.updatedAt.getTime()) {
    console.log(`[ADDED] ${FORBES_JAPAN_SOURCE.name}`);
  } else {
    console.log(`[UPDATED] ${FORBES_JAPAN_SOURCE.name}`);
  }

  // Post-check: createFetcher()で名前一致を検証
  const { createFetcher } = await import('@/lib/fetchers/index');
  try {
    createFetcher(result);
    console.log(`[OK] createFetcher() name match verified: "${result.name}"`);
  } catch (error) {
    console.error(
      `[ERROR] createFetcher() name mismatch! DB name="${result.name}" does not match any switch case.`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }

  await sourceCache.invalidate();
  console.log('[OK] Source cache invalidation attempted');

  console.log('\n=== 完了 ===');
}

main()
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
