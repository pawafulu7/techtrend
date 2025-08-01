import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeUnusedSources() {
  const unusedSources = ['InfoQ Japan', 'Qiita', 'connpass'];
  
  console.log('=== 未使用ソースの削除を開始 ===');
  console.log(`削除対象: ${unusedSources.join(', ')}`);
  
  try {
    // 削除前に関連記事数を確認
    for (const sourceName of unusedSources) {
      const source = await prisma.source.findUnique({
        where: { name: sourceName },
        include: {
          _count: {
            select: { articles: true }
          }
        }
      });
      
      if (source) {
        console.log(`${sourceName}: ${source._count.articles}記事が関連付けられています`);
      } else {
        console.log(`${sourceName}: ソースが見つかりません`);
      }
    }
    
    // 削除実行の確認
    console.log('\n削除を実行します...');
    
    // 実際の削除処理
    const result = await prisma.source.deleteMany({
      where: {
        name: {
          in: unusedSources
        }
      }
    });
    
    console.log(`\n✅ ${result.count}個のソースを削除しました`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeUnusedSources().catch(console.error);