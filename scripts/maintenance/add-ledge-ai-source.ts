/**
 * Ledge.ai ソースをDBに登録するスクリプト
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-ledge-ai-source.ts
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { sourceCache } from '../../lib/cache/source-cache';

const prisma = createPrismaClient();

const LEDGE_AI_SOURCE = {
  id: 'ledge_ai',
  name: 'Ledge.ai',
  url: 'https://ledge.ai',
  type: 'SCRAPER',
  enabled: true,
};

async function main() {
  console.log('=== Ledge.ai ソース登録 ===\n');

  const result = await prisma.source.upsert({
    where: { id: LEDGE_AI_SOURCE.id },
    update: {
      name: LEDGE_AI_SOURCE.name,
      url: LEDGE_AI_SOURCE.url,
      type: LEDGE_AI_SOURCE.type,
      enabled: LEDGE_AI_SOURCE.enabled,
    },
    create: LEDGE_AI_SOURCE,
  });

  // createdAtとupdatedAtの比較で新規/更新を判定
  if (result.createdAt.getTime() === result.updatedAt.getTime()) {
    console.log(`[ADDED] ${LEDGE_AI_SOURCE.name}`);
  } else {
    console.log(`[UPDATED] ${LEDGE_AI_SOURCE.name}`);
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
    throw error;
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
