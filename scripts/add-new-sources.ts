import { prisma } from '../lib/database';
import { SourceType } from '@prisma/client';

async function addNewSources() {
  console.log('新しいソースを追加します...\n');

  const newSources = [
    {
      name: 'connpass',
      url: 'https://connpass.com/',
      type: SourceType.API,
      enabled: true,
    },
    {
      name: 'Stack Overflow Blog',
      url: 'https://stackoverflow.blog/',
      type: SourceType.RSS,
      enabled: true,
    },
    {
      name: 'InfoQ Japan',
      url: 'https://www.infoq.com/jp/',
      type: SourceType.RSS,
      enabled: true,
    },
    {
      name: 'Think IT',
      url: 'https://thinkit.co.jp/',
      type: SourceType.RSS,
      enabled: true,
    },
  ];

  for (const sourceData of newSources) {
    try {
      // 既存チェック
      const existing = await prisma.source.findFirst({
        where: { name: sourceData.name }
      });

      if (existing) {
        console.log(`✓ ${sourceData.name} は既に存在します`);
        continue;
      }

      // 新規作成
      const source = await prisma.source.create({
        data: sourceData
      });

      console.log(`✓ ${source.name} を追加しました`);
      console.log(`  URL: ${source.url}`);
      console.log(`  タイプ: ${source.type}`);
      console.log('');
    } catch (error) {
      console.error(`✗ ${sourceData.name} の追加に失敗:`, error);
    }
  }

  // 全ソースを表示
  console.log('\n現在のソース一覧:');
  const allSources = await prisma.source.findMany({
    orderBy: { createdAt: 'asc' }
  });

  allSources.forEach((source, index) => {
    console.log(`${index + 1}. ${source.name} (${source.enabled ? '有効' : '無効'})`);
  });
}

addNewSources()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });