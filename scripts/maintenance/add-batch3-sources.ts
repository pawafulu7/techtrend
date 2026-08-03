/**
 * Batch 3 海外企業・プロダクトブログ5ソースをDBに登録するスクリプト (Issue #628)
 *
 * 対象: Vercel Blog / TypeScript Blog / VS Code Blog / Dropbox Tech / Fly.io Blog
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-batch3-sources.ts
 *
 * 本番実行時は事前に5つの id / name の既存行有無を SELECT で確認すること
 * （plan_20260803_111504_issue628_batch3_sources.md「本番反映」参照）。
 */

import path from 'path';

/**
 * 登録対象のソース定義。
 *
 * name は FOREIGN_SOURCE_CONFIGS のキー、id は SOURCE_CATEGORIES.foreign の
 * sourceIds と完全一致させる必要がある。この一致は create-fetcher /
 * scheduler-yaml-consistency の各テストでは検証されないため、
 * batch3-sources.test.ts がこの定義を import して検証する。
 *
 * そのため、この定義の import が DB 接続等の副作用を持たないよう、
 * Prisma クライアントの生成は main() 内で行う。
 */
export const BATCH3_SOURCES = [
  {
    id: 'vercel_blog',
    name: 'Vercel Blog',
    url: 'https://vercel.com/blog',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'typescript_blog',
    name: 'TypeScript Blog',
    url: 'https://devblogs.microsoft.com/typescript',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'vscode_blog',
    name: 'VS Code Blog',
    url: 'https://code.visualstudio.com/blogs',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'dropbox_tech',
    name: 'Dropbox Tech',
    url: 'https://dropbox.tech',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'flyio_blog',
    name: 'Fly.io Blog',
    url: 'https://fly.io/blog',
    type: 'RSS',
    enabled: true,
  },
];

async function main() {
  const { createPrismaClient } = await import('@/lib/prisma/create-client');
  const { sourceCache } = await import('@/lib/cache/source-cache');
  const { createFetcher } = await import('@/lib/fetchers/index');

  const prisma = createPrismaClient();

  try {
    console.log(
      '=== Batch 3 海外企業・プロダクトブログ5ソース登録 (Issue #628) ===\n'
    );

    // 5件を単一トランザクションで登録（1件でも失敗したら全件ロールバックし、
    // 部分登録状態を作らない）
    const results = await prisma.$transaction(async (tx) => {
      const upserted = [];
      for (const source of BATCH3_SOURCES) {
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
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトとして直接実行された場合のみ main() を走らせる
// （テストから BATCH3_SOURCES を import しても DB 接続が発生しないようにする）。
// 部分一致だと `verify-add-batch3-sources.ts` のような別スクリプトからの
// import でも DB 更新が走るため、ファイル名の完全一致で判定する
if (path.basename(process.argv[1] ?? '') === 'add-batch3-sources.ts') {
  main()
    .catch((error) => {
      console.error('エラーが発生しました:', error);
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit(process.exitCode ?? 0);
    });
}
