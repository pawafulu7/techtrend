import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStatsData() {
  console.log('統計データ確認中...\n');

  try {
    // 基本統計
    const totalArticles = await prisma.article.count();
    const totalSources = await prisma.source.count({ where: { enabled: true } });
    const totalTags = await prisma.tag.count();
    
    console.log('【基本統計】');
    console.log(`- 総記事数: ${totalArticles}`);
    console.log(`- 有効なソース数: ${totalSources}`);
    console.log(`- タグ数: ${totalTags}`);
    
    // 期間別統計
    const last7Days = await prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });
    
    const last30Days = await prisma.article.count({
      where: {
        publishedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    });
    
    console.log('\n【期間別統計】');
    console.log(`- 過去7日間: ${last7Days}件`);
    console.log(`- 過去30日間: ${last30Days}件`);
    console.log(`- 日平均: ${Math.round(last30Days / 30)}件`);
    
    // 日別集計のテスト
    console.log('\n【日別集計テスト（SQLクエリ）】');
    const dailyStats = await prisma.$queryRaw`
      SELECT 
        DATE(publishedAt) as date,
        COUNT(*) as count
      FROM Article
      WHERE publishedAt >= datetime('now', '-7 days')
      GROUP BY DATE(publishedAt)
      ORDER BY date DESC
    ` as { date: string; count: bigint }[];
    
    dailyStats.forEach(stat => {
      console.log(`- ${stat.date}: ${Number(stat.count)}件`);
    });
    
    // ソース別統計
    console.log('\n【ソース別統計】');
    const sourceStats = await prisma.source.findMany({
      where: { enabled: true },
      include: {
        _count: {
          select: { articles: true },
        },
      },
      orderBy: {
        articles: {
          _count: 'desc',
        },
      },
      take: 5,
    });
    
    sourceStats.forEach(source => {
      const percentage = totalArticles > 0 
        ? Math.round((source._count.articles / totalArticles) * 100) 
        : 0;
      console.log(`- ${source.name}: ${source._count.articles}件 (${percentage}%)`);
    });
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkStatsData().catch(console.error);