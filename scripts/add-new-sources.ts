import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addNewSources() {
  const newSources = [
    {
      name: 'GitHub Blog',
      type: 'RSS',
      url: 'https://github.blog/',
      enabled: true,
    },
    {
      name: 'Microsoft Developer Blog',
      type: 'RSS',
      url: 'https://devblogs.microsoft.com/',
      enabled: true,
    },
  ];
  
  console.log('=== 新しいソースの追加を開始 ===');
  
  try {
    for (const sourceData of newSources) {
      // 既存のソースをチェック
      const existing = await prisma.source.findUnique({
        where: { name: sourceData.name }
      });
      
      if (existing) {
        console.log(`ℹ️  ${sourceData.name} は既に存在しています`);
        continue;
      }
      
      // 新しいソースを追加
      const source = await prisma.source.create({
        data: sourceData
      });
      
      console.log(`✅ ${source.name} を追加しました (ID: ${source.id})`);
    }
    
    // 追加後の確認
    const allSources = await prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        enabled: true,
        _count: {
          select: { articles: true }
        }
      }
    });
    
    console.log('\n📊 現在のソース一覧:');
    allSources.forEach(source => {
      console.log(`- ${source.name} (${source.type}) - ${source._count.articles}記事 - ${source.enabled ? '有効' : '無効'}`);
    });
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addNewSources().catch(console.error);