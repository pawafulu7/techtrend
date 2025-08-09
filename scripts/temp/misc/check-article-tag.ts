import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkArticleTag() {
  try {
    // articleタグの存在確認
    const articleTag = await prisma.tag.findFirst({
      where: { name: 'article' }
    });
    
    if (articleTag) {
      console.log('Article tag found:', articleTag);
      
      // このタグを持つ記事数をカウント
      const count = await prisma.article.count({
        where: {
          tags: {
            some: {
              id: articleTag.id
            }
          }
        }
      });
      
      console.log('Number of articles with article tag:', count);
      
      // 最近の記事でarticleタグを持つものを5件取得
      const recentArticles = await prisma.article.findMany({
        where: {
          tags: {
            some: {
              id: articleTag.id
            }
          }
        },
        take: 5,
        orderBy: { publishedAt: 'desc' },
        select: {
          title: true,
          sourceId: true,
          publishedAt: true
        }
      });
      
      console.log('\nRecent articles with article tag:');
      recentArticles.forEach(article => {
        console.log(`- ${article.title.substring(0, 50)}... (source: ${article.sourceId})`);
      });
      
      // 各ソースごとのarticleタグ使用状況
      const sources = await prisma.source.findMany();
      console.log('\nArticle tag usage by source:');
      for (const source of sources) {
        const sourceCount = await prisma.article.count({
          where: {
            sourceId: source.id,
            tags: {
              some: {
                id: articleTag.id
              }
            }
          }
        });
        if (sourceCount > 0) {
          console.log(`- ${source.name}: ${sourceCount} articles`);
        }
      }
    } else {
      console.log('No article tag found in database');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkArticleTag();