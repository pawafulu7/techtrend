import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTags() {
  console.log('タグ設定状況を確認中...\n');
  
  try {
    // 1. 最新の記事10件を取得
    const recentArticles = await prisma.article.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 10,
      include: {
        tags: true,
        source: true
      }
    });
    
    console.log('【最新10件の記事のタグ状況】');
    console.log('='.repeat(80));
    
    for (const article of recentArticles) {
      const date = article.publishedAt.toISOString().split('T')[0];
      const tags = article.tags.map(t => t.name).join(', ');
      console.log(`[${date}] ${article.source.name}`);
      console.log(`  タイトル: ${article.title.substring(0, 50)}...`);
      console.log(`  タグ: ${tags || 'なし'}`);
      console.log('');
    }
    
    // 2. タグの統計情報
    const totalArticles = await prisma.article.count();
    const articlesWithTags = await prisma.article.count({
      where: {
        tags: {
          some: {}
        }
      }
    });
    
    const articlesWithoutTags = totalArticles - articlesWithTags;
    const taggedPercentage = ((articlesWithTags / totalArticles) * 100).toFixed(1);
    
    console.log('【タグ設定統計】');
    console.log('='.repeat(80));
    console.log(`総記事数: ${totalArticles}件`);
    console.log(`タグあり: ${articlesWithTags}件 (${taggedPercentage}%)`);
    console.log(`タグなし: ${articlesWithoutTags}件`);
    console.log('');
    
    // 3. 最近7日間の記事のタグ設定状況
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentArticlesCount = await prisma.article.count({
      where: {
        publishedAt: {
          gte: sevenDaysAgo
        }
      }
    });
    
    const recentArticlesWithTags = await prisma.article.count({
      where: {
        publishedAt: {
          gte: sevenDaysAgo
        },
        tags: {
          some: {}
        }
      }
    });
    
    console.log('【最近7日間のタグ設定状況】');
    console.log('='.repeat(80));
    console.log(`総記事数: ${recentArticlesCount}件`);
    console.log(`タグあり: ${recentArticlesWithTags}件`);
    console.log(`タグなし: ${recentArticlesCount - recentArticlesWithTags}件`);
    
    // 4. タグの一覧と使用回数
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: { articles: true }
        }
      },
      orderBy: {
        articles: {
          _count: 'desc'
        }
      },
      take: 20
    });
    
    console.log('\n【人気タグTOP20】');
    console.log('='.repeat(80));
    
    tags.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag.name}: ${tag._count.articles}件`);
    });
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTags();