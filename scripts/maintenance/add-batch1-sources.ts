/**
 * Batch 1 国内メディア4ソースをDBに登録するスクリプト (Issue #628)
 *
 * 対象: JSer.info / CodeZine / gihyo.jp / Findy Engineer Lab
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-batch1-sources.ts
 *
 * 本番実行時は事前に4つの id / name の既存行有無を SELECT で確認すること
 * （plan_20260802_160815_batch1_sources.md「本番反映手順」参照）。
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { sourceCache } from '@/lib/cache/source-cache';

const prisma = createPrismaClient();

const BATCH1_SOURCES = [
  {
    id: 'jser_info',
    name: 'JSer.info',
    url: 'https://jser.info',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'codezine',
    name: 'CodeZine',
    url: 'https://codezine.jp',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'gihyo_jp',
    name: 'gihyo.jp',
    url: 'https://gihyo.jp',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'findy_engineer_lab',
    name: 'Findy Engineer Lab',
    url: 'https://engineer-lab.findy-code.io',
    type: 'RSS',
    enabled: true,
  },
];

async function main() {
  console.log('=== Batch 1 国内メディア4ソース登録 (Issue #628) ===\n');

  const { createFetcher } = await import('@/lib/fetchers/index');

  // 4件を単一トランザクションで登録（1件でも失敗したら全件ロールバックし、
  // 部分登録状態を作らない）
  const results = await prisma.$transaction(async (tx) => {
    const upserted = [];
    for (const source of BATCH1_SOURCES) {
      const row = await tx.source.upsert({
        where: { id: source.id },
        // 既存行の enabled は上書きしない（enabled=false による緊急停止を
        // スクリプト再実行で黙って解除してしまわないため。create 時のみ true）
        update: {
          name: source.name,
          url: source.url,
          type: source.type,
        },
        create: source,
      });
      // createFetcher 失敗（設定辞書・switch 文との名前不一致）時は
      // 例外送出でトランザクション全体をロールバック
      createFetcher(row);
      upserted.push(row);
    }
    return upserted;
  });

  for (const row of results) {
    const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
    console.log(
      `[${isNew ? 'ADDED' : 'UPDATED'}] ${row.name} (id=${row.id}, enabled=${row.enabled})`
    );
  }
  console.log('[OK] createFetcher() name match verified for all sources');

  // キャッシュ無効化はコミット後に実行（CLAUDE.md ソース追加時ルール）
  await sourceCache.invalidate();
  console.log('[OK] Source cache invalidated');

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
