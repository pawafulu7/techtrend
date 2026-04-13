/**
 * Business Insider ソースをDBに登録するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-business-insider-source.ts
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { sourceCache } from '@/lib/cache/source-cache';

const prisma = createPrismaClient();

const BUSINESS_INSIDER_SOURCE = {
  id: 'business_insider',
  name: 'Business Insider',
  url: 'https://www.businessinsider.com',
  type: 'RSS',
  enabled: true,
};

async function main() {
  console.log('=== Business Insider ソース登録 ===\n');

  const { createFetcher } = await import('@/lib/fetchers/index');

  const result = await prisma.$transaction(async (tx) => {
    const upserted = await tx.source.upsert({
      where: { id: BUSINESS_INSIDER_SOURCE.id },
      update: {
        name: BUSINESS_INSIDER_SOURCE.name,
        url: BUSINESS_INSIDER_SOURCE.url,
        type: BUSINESS_INSIDER_SOURCE.type,
        enabled: BUSINESS_INSIDER_SOURCE.enabled,
      },
      create: BUSINESS_INSIDER_SOURCE,
    });

    // createFetcher失敗時はトランザクション全体をロールバック
    createFetcher(upserted);
    return upserted;
  });

  // createdAtとupdatedAtの比較で新規/更新を判定
  if (result.createdAt.getTime() === result.updatedAt.getTime()) {
    console.log(`[ADDED] ${BUSINESS_INSIDER_SOURCE.name}`);
  } else {
    console.log(`[UPDATED] ${BUSINESS_INSIDER_SOURCE.name}`);
  }
  console.log(`[OK] createFetcher() name match verified: "${result.name}"`);

  await sourceCache.invalidateSource(result.id);
  console.log(`[OK] Source cache invalidated: ${result.id}`);

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
