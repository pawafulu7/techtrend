const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSummaries() {
  // 各ソースから最新の記事を数件ずつ取得
  const sources = await prisma.source.findMany({
    where: { enabled: true }
  });
  
  console.log('各ソースの最新記事と要約を確認:\n');
  
  for (const source of sources) {
    const articles = await prisma.article.findMany({
      where: { sourceId: source.id },
      take: 3,
      orderBy: { publishedAt: 'desc' }
    });
    
    if (articles.length === 0) {
      console.log(`【${source.name}】記事なし\n`);
      continue;
    }
    
    console.log(`【${source.name}】`);
    articles.forEach((article, idx) => {
      console.log(`${idx + 1}. ${article.title}`);
      console.log(`   要約: ${article.summary || '要約なし'}`);
      console.log(`   文字数: ${article.summary ? article.summary.length : 0}`);
      console.log(`   完結: ${article.summary && article.summary.endsWith('。') ? 'OK' : 'NG'}`);
      console.log('');
    });
    console.log('---\n');
  }
  
  // 要約の統計
  const totalArticles = await prisma.article.count();
  const articlesWithSummary = await prisma.article.count({
    where: { summary: { not: null } }
  });
  
  console.log('=== 要約の統計 ===');
  console.log(`総記事数: ${totalArticles}`);
  console.log(`要約あり: ${articlesWithSummary}`);
  console.log(`要約なし: ${totalArticles - articlesWithSummary}`);
  console.log(`要約率: ${((articlesWithSummary / totalArticles) * 100).toFixed(1)}%`);
}

checkSummaries()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
