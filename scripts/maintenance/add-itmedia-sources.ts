/**
 * ITmedia系ソースをDBに登録するスクリプト
 *
 * 対象ソース:
 * - ITmedia Security
 * - ITmedia AI+
 * - @IT
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-itmedia-sources.ts
 */

import path from 'path';
import type { Prisma } from '@/lib/prisma-exports';
import { assertSourceIdentity } from './utils/source-identity';

export const ITMEDIA_SOURCES = [
  {
    id: 'itmedia_security',
    name: 'ITmedia Security',
    url: 'https://rss.itmedia.co.jp/rss/2.0/news_security.xml',
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

/**
 * 3本を登録する。1件でも id の取り違えがあれば、何も書かずに止める（このスクリプトは
 * トランザクションを使わないので、書きながら確かめると途中まで更新されたまま止まる）
 */
export async function registerItmediaSources(
  client: Pick<Prisma.TransactionClient, 'source'>
): Promise<{ added: number; updated: number }> {
  for (const source of ITMEDIA_SOURCES) {
    await assertSourceIdentity(client, source);
  }

  let added = 0;
  let updated = 0;
  for (const source of ITMEDIA_SOURCES) {
    const result = await client.source.upsert({
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
      added++;
    } else {
      console.log(`[UPDATED] ${source.name}`);
      updated++;
    }
  }
  return { added, updated };
}

async function main() {
  // テストから定義・関数を import しても DB と Redis に接続しないよう、ここで読み込む
  const { createPrismaClient } = await import('@/lib/prisma/create-client');
  const { sourceCache } = await import('@/lib/cache/source-cache');
  const prisma = createPrismaClient();

  try {
    console.log('=== ITmedia系ソース登録 ===\n');
    const { added, updated } = await registerItmediaSources(prisma);

    await sourceCache.invalidate();
    console.log('[OK] Source cache invalidation attempted');

    console.log('\n=== 完了 ===');
    console.log(`追加: ${added}件`);
    console.log(`更新: ${updated}件`);
    console.log(`合計: ${ITMEDIA_SOURCES.length}件`);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトとして直接実行された場合のみ main() を走らせる（ファイル名の完全一致で判定する）
if (path.basename(process.argv[1] ?? '') === 'add-itmedia-sources.ts') {
  main()
    .catch((error) => {
      console.error('エラーが発生しました:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit(process.exitCode ?? 0);
    });
}
