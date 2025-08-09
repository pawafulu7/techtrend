import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTaggedArticles() {
  try {
    const articles = await prisma.article.findMany({
      where: {
        tags: {
          some: {}
        }
      },
      include: { 
        source: true,
        tags: true 
      },
      orderBy: { publishedAt: 'desc' },
      take: 10
    });
    
    console.log('最近タグ付けされた記事:');
    articles.forEach((article, i) => {
      console.log(`\n${i + 1}. [${article.source.name}] ${article.title.substring(0, 60)}...`);
      console.log(`   タグ: ${article.tags.map(t => t.name).join(', ')}`);
      console.log(`   公開日: ${article.publishedAt.toLocaleDateString('ja-JP')}`);
    });
    
    // タグの統計
    const tagStats = await prisma.tag.findMany({
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
    
    console.log('\n\n人気のタグ TOP20:');
    tagStats.forEach((tag, i) => {
      console.log(`${i + 1}. ${tag.name}: ${tag._count.articles}件`);
    });
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTaggedArticles();