/**
 * Phase 2: 海外技術ブログソースをDBに登録するスクリプト
 *
 * 対象ソース:
 * - Stripe Engineering
 * - Discord Engineering
 * - Slack Engineering
 * - The New Stack
 * - CNCF Blog
 * - Chrome Developers
 * - Kubernetes Blog
 * - Go Blog
 * - Rust Blog
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-foreign-sources-phase2.ts
 */

import { PrismaClient } from '@prisma/client';
import { sourceCache } from '../../lib/cache/source-cache';

const prisma = new PrismaClient();

const PHASE2_SOURCES = [
  // 大手テック企業
  {
    id: 'stripe_engineering',
    name: 'Stripe Engineering',
    url: 'https://stripe.com/blog/feed.rss',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'discord_engineering',
    name: 'Discord Engineering',
    url: 'https://discord.com/blog/rss.xml',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'slack_engineering',
    name: 'Slack Engineering',
    url: 'https://slack.engineering/feed/',
    type: 'RSS',
    enabled: true,
  },
  // クラウドネイティブ・Web
  {
    id: 'the_new_stack',
    name: 'The New Stack',
    url: 'https://thenewstack.io/feed/',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'cncf_blog',
    name: 'CNCF Blog',
    url: 'https://www.cncf.io/feed/',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'chrome_developers',
    name: 'Chrome Developers',
    url: 'https://developer.chrome.com/blog/feed.xml',
    type: 'RSS',
    enabled: true,
  },
  // 言語公式ブログ
  {
    id: 'kubernetes_blog',
    name: 'Kubernetes Blog',
    url: 'https://kubernetes.io/feed.xml',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'go_blog',
    name: 'Go Blog',
    url: 'https://go.dev/blog/feed.atom',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'rust_blog',
    name: 'Rust Blog',
    url: 'https://blog.rust-lang.org/feed.xml',
    type: 'RSS',
    enabled: true,
  },
];

async function main() {
  console.log('=== Phase 2: 海外技術ブログソース登録 ===\n');

  let addedCount = 0;
  let skippedCount = 0;

  for (const source of PHASE2_SOURCES) {
    // IDとnameの両方でチェック（nameはユニーク制約があるため）
    const existingById = await prisma.source.findUnique({
      where: { id: source.id },
    });
    const existingByName = await prisma.source.findUnique({
      where: { name: source.name },
    });

    if (existingById || existingByName) {
      const reason = existingById ? 'ID' : 'name';
      console.log(`[SKIP] ${source.name} - 既に登録済み (${reason})`);
      skippedCount++;
      continue;
    }

    await prisma.source.create({ data: source });
    console.log(`[ADDED] ${source.name}`);
    addedCount++;
  }

  await sourceCache.invalidate();
  console.log('[OK] Source cache invalidation attempted');

  console.log('\n=== 完了 ===');
  console.log(`追加: ${addedCount}件`);
  console.log(`スキップ: ${skippedCount}件`);
  console.log(`合計: ${PHASE2_SOURCES.length}件`);
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
