import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticleQuality() {
  console.log('=== 記事品質チェック ===\n');

  // 各ソースの記事数と品質を確認
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: {
      _count: {
        select: { articles: true }
      }
    }
  });

  for (const source of sources) {
    console.log(`\n【${source.name}】`);
    
    // 最新記事10件を確認
    const recentArticles = await prisma.article.findMany({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: { 
        title: true, 
        bookmarks: true,
        publishedAt: true,
        tags: {
          select: { name: true }
        }
      }
    });

    // Dev.toの場合、反応数0の記事数を確認
    if (source.name === 'Dev.to') {
      const lowQualityCount = await prisma.article.count({
        where: {
          sourceId: source.id,
          bookmarks: 0
        }
      });
      console.log(`反応数0の記事: ${lowQualityCount}件`);
    }

    console.log(`総記事数: ${source._count.articles}件`);
    console.log(`最新記事:`);
    recentArticles.forEach(article => {
      const tags = article.tags.map(t => t.name).join(', ');
      console.log(`  [${article.bookmarks || 0}] ${article.title.substring(0, 50)}... (${tags})`);
    });
  }

  // 低品質記事の削除対象を確認
  console.log('\n=== 削除候補 ===');
  
  // Dev.to: 反応数0の記事
  const devtoLowQuality = await prisma.article.findMany({
    where: {
      source: { name: 'Dev.to' },
      bookmarks: 0
    },
    select: { id: true, title: true }
  });
  
  console.log(`\nDev.to 反応数0: ${devtoLowQuality.length}件`);
  if (devtoLowQuality.length > 0) {
    console.log('削除対象例:');
    devtoLowQuality.slice(0, 5).forEach(a => {
      console.log(`  - ${a.title.substring(0, 60)}...`);
    });
  }

  await prisma.$disconnect();
}

checkArticleQuality().catch(console.error);