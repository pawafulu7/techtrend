import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixGoogleBlogDates() {
  console.log('Google Dev Blogの日付を修正します...');
  
  try {
    // 異常な日付値を持つ記事を取得
    const articles = await prisma.article.findMany({
      where: {
        source: { name: 'Google Developers Blog' },
        OR: [
          { publishedAt: { gte: new Date('2025-01-01') } },
          { publishedAt: { lte: new Date('2020-01-01') } }
        ]
      },
      include: { source: true }
    });
    
    console.log(`対象記事数: ${articles.length}`);
    
    if (articles.length === 0) {
      console.log('修正が必要な記事はありません');
      return;
    }
    
    // 正常な記事の日付範囲を取得
    const normalArticles = await prisma.article.findMany({
      where: {
        sourceId: articles[0].sourceId,
        publishedAt: {
          gte: new Date('2020-01-01'),
          lte: new Date()
        }
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    const latestNormalDate = normalArticles[0]?.publishedAt || new Date();
    
    // 異常な日付の記事を修正
    for (const article of articles) {
      console.log(`修正中: ${article.title.substring(0, 50)}...`);
      console.log(`  現在の日付: ${article.publishedAt.toISOString()}`);
      
      // 最新の正常な記事の日付を使用
      await prisma.article.update({
        where: { id: article.id },
        data: { publishedAt: latestNormalDate }
      });
      
      console.log(`  新しい日付: ${latestNormalDate.toISOString()}`);
    }
    
    console.log('修正完了');
    
    // 修正結果を確認
    const afterCount = await prisma.article.count({
      where: {
        source: { name: 'Google Developers Blog' },
        publishedAt: {
          gte: new Date('2020-01-01'),
          lte: new Date()
        }
      }
    });
    
    console.log(`\n修正後の正常な日付を持つ記事数: ${afterCount}`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixGoogleBlogDates();