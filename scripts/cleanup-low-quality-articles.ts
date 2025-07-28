import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupLowQualityArticles() {
  console.log('🧹 低品質記事のクリーンアップを開始します...\n');
  
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // 1. 削除対象の記事を取得
    // - 品質スコア30未満で1週間以上経過
    // - 品質スコア20未満で3日以上経過
    // - ユーザー投票0で1ヶ月以上経過
    const articlesToDelete = await prisma.article.findMany({
      where: {
        OR: [
          {
            AND: [
              { qualityScore: { lt: 30 } },
              { publishedAt: { lt: oneWeekAgo } },
              { userVotes: 0 }
            ]
          },
          {
            AND: [
              { qualityScore: { lt: 20 } },
              { publishedAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } }
            ]
          },
          {
            AND: [
              { userVotes: 0 },
              { publishedAt: { lt: oneMonthAgo } },
              { qualityScore: { lt: 50 } }
            ]
          }
        ]
      },
      include: {
        source: true
      }
    });
    
    console.log(`【削除対象記事】${articlesToDelete.length}件`);
    
    if (articlesToDelete.length > 0) {
      // ソース別の削除数を集計
      const deleteCountBySource: Record<string, number> = {};
      articlesToDelete.forEach(article => {
        const sourceName = article.source.name;
        deleteCountBySource[sourceName] = (deleteCountBySource[sourceName] || 0) + 1;
      });
      
      console.log('\nソース別削除数:');
      Object.entries(deleteCountBySource)
        .sort(([, a], [, b]) => b - a)
        .forEach(([source, count]) => {
          console.log(`  - ${source}: ${count}件`);
        });
      
      // 削除実行
      const deleteResult = await prisma.article.deleteMany({
        where: {
          id: {
            in: articlesToDelete.map(a => a.id)
          }
        }
      });
      
      console.log(`\n✅ ${deleteResult.count}件の低品質記事を削除しました`);
    }
    
    // 2. 使用されていないタグの削除
    console.log('\n【未使用タグの削除】');
    const unusedTags = await prisma.tag.findMany({
      where: {
        articles: {
          none: {}
        }
      }
    });
    
    if (unusedTags.length > 0) {
      const deleteTagResult = await prisma.tag.deleteMany({
        where: {
          id: {
            in: unusedTags.map(t => t.id)
          }
        }
      });
      
      console.log(`✅ ${deleteTagResult.count}件の未使用タグを削除しました`);
    } else {
      console.log('未使用タグはありません');
    }
    
    // 3. 統計情報の表示
    const remainingStats = await prisma.article.groupBy({
      by: ['sourceId'],
      _count: {
        id: true
      },
      _avg: {
        qualityScore: true
      }
    });
    
    const sources = await prisma.source.findMany({
      where: {
        id: {
          in: remainingStats.map(s => s.sourceId)
        }
      }
    });
    
    const sourceMap = new Map(sources.map(s => [s.id, s.name]));
    
    console.log('\n【クリーンアップ後の統計】');
    const totalArticles = await prisma.article.count();
    console.log(`総記事数: ${totalArticles}件`);
    
    console.log('\nソース別記事数と平均品質スコア:');
    remainingStats
      .sort((a, b) => b._count.id - a._count.id)
      .forEach(stat => {
        const sourceName = sourceMap.get(stat.sourceId) || 'Unknown';
        console.log(`  - ${sourceName}: ${stat._count.id}件 (平均スコア: ${stat._avg.qualityScore?.toFixed(1)})`);
      });
    
    console.log('\n✅ クリーンアップが完了しました');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された場合
if (require.main === module) {
  cleanupLowQualityArticles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { cleanupLowQualityArticles };