const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkThinkITZenn() {
  const sources = await prisma.source.findMany({
    where: {
      OR: [
        { name: 'Think IT' },
        { name: 'Zenn' }
      ]
    }
  });

  console.log('Think ITとZennの要約状況を確認:\n');

  for (const source of sources) {
    const totalArticles = await prisma.article.count({
      where: { sourceId: source.id }
    });

    const articlesWithSummary = await prisma.article.count({
      where: {
        sourceId: source.id,
        summary: { not: null }
      }
    });

    const articlesWithoutSummary = await prisma.article.count({
      where: {
        sourceId: source.id,
        summary: null
      }
    });

    console.log(`【${source.name}】`);
    console.log(`総記事数: ${totalArticles}`);
    console.log(`要約あり: ${articlesWithSummary}`);
    console.log(`要約なし: ${articlesWithoutSummary}`);

    // 最新の記事10件を確認
    const recentArticles = await prisma.article.findMany({
      where: { sourceId: source.id },
      take: 10,
      orderBy: { publishedAt: 'desc' }
    });

    console.log('\n最新10件の記事:');
    recentArticles.forEach((article, idx) => {
      const summaryStatus = article.summary 
        ? `${article.summary.length}文字, ${article.summary.endsWith('。') ? '完結' : '途切れ'}`
        : '要約なし';
      
      console.log(`${idx + 1}. ${article.title.substring(0, 50)}...`);
      console.log(`   要約: ${article.summary ? article.summary.substring(0, 80) + '...' : '要約なし'}`);
      console.log(`   状態: ${summaryStatus}`);
    });

    // 要約が途切れている記事を検出
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        summary: { not: null }
      }
    });

    const truncatedArticles = articles.filter(a => 
      a.summary && !a.summary.endsWith('。')
    );

    console.log(`\n途切れた要約: ${truncatedArticles.length}件`);
    
    console.log('\n---\n');
  }
}

checkThinkITZenn()
  .catch(console.error)
  .finally(() => prisma.$disconnect());