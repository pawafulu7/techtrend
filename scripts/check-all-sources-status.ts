import { prisma } from '../lib/database';

async function checkAllSourcesStatus() {
  console.log('全ソースの記事状況を確認します...\n');
  
  const sources = await prisma.source.findMany({
    orderBy: { name: 'asc' }
  });
  
  for (const source of sources) {
    const totalCount = await prisma.article.count({
      where: { sourceId: source.id }
    });
    
    const noSummaryCount = await prisma.article.count({
      where: {
        sourceId: source.id,
        OR: [
          { summary: null },
          { summary: '' }
        ]
      }
    });
    
    // 最新記事を3件取得
    const latestArticles = await prisma.article.findMany({
      where: { sourceId: source.id },
      orderBy: { publishedAt: 'desc' },
      take: 3
    });
    
    console.log(`【${source.name}】${source.enabled ? '✓ 有効' : '✗ 無効'}`);
    console.log(`記事数: ${totalCount}件 (要約なし: ${noSummaryCount}件)`);
    
    if (latestArticles.length > 0) {
      console.log('最新記事:');
      latestArticles.forEach((article, index) => {
        const hasJapaneseSummary = article.summary && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(article.summary);
        console.log(`  ${index + 1}. ${article.title.substring(0, 40)}...`);
        if (article.summary) {
          console.log(`     要約: ${hasJapaneseSummary ? '✓ 日本語' : '✗ 英語'} - ${article.summary.substring(0, 50)}...`);
        } else {
          console.log(`     要約: ✗ なし`);
        }
      });
    }
    
    console.log('');
  }
  
  // 全体統計
  const totalArticles = await prisma.article.count();
  const articlesWithSummary = await prisma.article.count({
    where: {
      NOT: {
        OR: [
          { summary: null },
          { summary: '' }
        ]
      }
    }
  });
  
  console.log('【全体統計】');
  console.log(`総記事数: ${totalArticles}件`);
  console.log(`要約あり: ${articlesWithSummary}件 (${Math.round(articlesWithSummary / totalArticles * 100)}%)`);
  console.log(`要約なし: ${totalArticles - articlesWithSummary}件`);
}

checkAllSourcesStatus()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });