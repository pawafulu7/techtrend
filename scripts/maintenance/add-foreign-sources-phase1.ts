/**
 * Phase 1: 海外技術ブログソースをDBに登録するスクリプト
 *
 * 対象ソース:
 * - Meta Engineering
 * - Netflix TechBlog
 * - Spotify Engineering
 * - Pinterest Engineering
 *
 * 使用方法:
 *   npx tsx scripts/maintenance/add-foreign-sources-phase1.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PHASE1_SOURCES = [
  {
    id: 'meta_engineering',
    name: 'Meta Engineering',
    url: 'https://engineering.fb.com/feed/',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'netflix_techblog',
    name: 'Netflix TechBlog',
    url: 'https://netflixtechblog.medium.com/feed',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'spotify_engineering',
    name: 'Spotify Engineering',
    url: 'https://engineering.atspotify.com/feed/',
    type: 'RSS',
    enabled: true,
  },
  {
    id: 'pinterest_engineering',
    name: 'Pinterest Engineering',
    url: 'https://medium.com/feed/pinterest-engineering',
    type: 'RSS',
    enabled: true,
  },
];

async function main() {
  console.log('=== Phase 1: 海外技術ブログソース登録 ===\n');

  let addedCount = 0;
  let skippedCount = 0;

  for (const source of PHASE1_SOURCES) {
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

  console.log('\n=== 完了 ===');
  console.log(`追加: ${addedCount}件`);
  console.log(`スキップ: ${skippedCount}件`);
  console.log(`合計: ${PHASE1_SOURCES.length}件`);
}

main()
  .catch((error) => {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
