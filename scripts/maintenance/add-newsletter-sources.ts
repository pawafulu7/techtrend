/**
 * 分野のニュースレター7本と、実装済みなのに DB に無かった4ソースを登録するスクリプト
 *
 * ニュースレター: JavaScript Weekly / Frontend Focus / React Status / Node Weekly /
 *   Postgres Weekly / SRE Weekly / Data Engineering Weekly（lib/fetchers/curated-newsletter）
 * 未登録だった4つ: DeepMind Blog / NVIDIA Developer Blog / Anthropic News / Rails Releases
 *   （fetcher とワークフローの名前はあったが DB に行が無く、0件で素通りしていた）
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-newsletter-sources.ts
 *
 * 本番実行時は事前に11の id / name の既存行が無いことを SELECT で確認すること
 * （plan_20261018_083105_288_curated_newsletter_sources.md「手順2」）。
 */

import path from 'path';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { assertSourceIdentity } from './utils/source-identity';

/**
 * 登録対象のソース定義。
 *
 * name は createFetcher の case・ワークフローの引数、id は SOURCE_CATEGORIES の sourceIds と
 * 完全一致させる。この一致は newsletter-sources.test.ts がこの定義を import して検証する。
 * そのため、この定義の import が DB 接続等の副作用を持たないよう、Prisma クライアントの
 * 生成は main() 内で行う。
 */
export const NEWSLETTER_SOURCES = [
  { id: 'javascript_weekly', name: 'JavaScript Weekly', url: 'https://javascriptweekly.com', type: 'RSS', enabled: true },
  { id: 'frontend_focus', name: 'Frontend Focus', url: 'https://frontendfoc.us', type: 'RSS', enabled: true },
  { id: 'react_status', name: 'React Status', url: 'https://react.statuscode.com', type: 'RSS', enabled: true },
  { id: 'node_weekly', name: 'Node Weekly', url: 'https://nodeweekly.com', type: 'RSS', enabled: true },
  { id: 'postgres_weekly', name: 'Postgres Weekly', url: 'https://postgresweekly.com', type: 'RSS', enabled: true },
  { id: 'sre_weekly', name: 'SRE Weekly', url: 'https://sreweekly.com', type: 'RSS', enabled: true },
  {
    id: 'data_engineering_weekly',
    name: 'Data Engineering Weekly',
    url: 'https://www.dataengineeringweekly.com',
    type: 'RSS',
    enabled: true,
  },
];

export const DORMANT_SOURCES = [
  { id: 'deepmind_blog', name: 'DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', type: 'RSS', enabled: true },
  {
    id: 'nvidia_developer_blog',
    name: 'NVIDIA Developer Blog',
    url: 'https://developer.nvidia.com/blog/feed',
    type: 'RSS',
    enabled: true,
  },
  // id と url は prisma/seed-ai-sources.ts と同じ
  { id: 'anthropic_news', name: 'Anthropic News', url: 'https://www.anthropic.com/news', type: 'SCRAPER', enabled: true },
  // RailsReleasesFetcher は Source.url をフィードとして読む
  {
    id: 'rails_releases',
    name: 'Rails Releases',
    url: 'https://github.com/rails/rails/releases.atom',
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
    console.log('=== ニュースレター7本と未登録だった4ソースの登録 ===\n');

    // 1件でも失敗したら全件ロールバックし、部分登録状態を作らない。同じ name の行が別の id で
    // あると、create が name の一意制約で失敗して全件が戻る（黙って別の行を作らない）
    const results = await prisma.$transaction(async (tx) => {
      const upserted = [];
      for (const source of [...NEWSLETTER_SOURCES, ...DORMANT_SOURCES]) {
        await assertSourceIdentity(tx, source);
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
        // createFetcher 失敗（名前と switch 文の不一致）時は例外送出でトランザクション全体をロールバック
        createFetcher(row);
        upserted.push(row);
      }
      return upserted;
    });

    for (const row of results) {
      const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
      console.log(`[${isNew ? 'ADDED' : 'UPDATED'}] ${row.name} (id=${row.id}, enabled=${row.enabled})`);
    }
    console.log('[OK] createFetcher() name match verified for all sources');

    // キャッシュ無効化はコミット後に実行（CLAUDE.md ソース追加時ルール）。本番の Redis には
    // この環境から届かないことがある。invalidate() は Redis の失敗を WARN のログにして例外にしない
    // ので、成功とは書かない。失敗していたら、登録は済んでいるので TTL（最大1時間）を待つ
    try {
      await sourceCache.invalidate();
      console.log('[INFO] Source cache invalidation requested (Redis failures, if any, are logged as WARN above)');
    } catch (error) {
      // 接続先がメッセージに入りうるので、summarizeError を通す
      console.warn(
        '[WARN] Source cache invalidation failed (registration is committed; wait for the cache TTL):',
        summarizeError(error)
      );
    }

    console.log('\n=== 完了 ===');
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトとして直接実行された場合のみ main() を走らせる
// （テストから定義を import しても DB 接続が発生しないよう、ファイル名の完全一致で判定する）
if (path.basename(process.argv[1] ?? '') === 'add-newsletter-sources.ts') {
  main()
    .catch((error) => {
      // Prisma のエラーには接続先が入りうる（本番で流すため、生のエラーを出さない）
      console.error('エラーが発生しました:', summarizeError(error, { stack: true }));
      process.exitCode = 1;
    })
    .finally(() => {
      process.exit(process.exitCode ?? 0);
    });
}
