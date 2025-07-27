import { prisma } from '../lib/database';

async function checkDevToPublickeySummaries() {
  console.log('Dev.toとPublickeyの要約状況を確認します...\n');
  
  // Dev.toの記事を確認
  const devtoSource = await prisma.source.findFirst({
    where: { name: 'Dev.to' }
  });
  
  if (devtoSource) {
    const devtoArticles = await prisma.article.findMany({
      where: { sourceId: devtoSource.id },
      orderBy: { publishedAt: 'desc' },
      take: 10
    });
    
    console.log(`【Dev.to】記事数: ${devtoArticles.length}件`);
    devtoArticles.forEach((article, index) => {
      const isEnglish = article.summary && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(article.summary);
      console.log(`${index + 1}. ${article.title.substring(0, 50)}...`);
      console.log(`   要約: ${article.summary ? article.summary.substring(0, 50) + '...' : 'なし'}`);
      console.log(`   ${!article.summary ? '❌ 要約なし' : isEnglish ? '❌ 英語のまま' : '✓ 日本語'}`);
      console.log('');
    });
  }
  
  // Publickeyの記事を確認
  const publickeySource = await prisma.source.findFirst({
    where: { name: 'Publickey' }
  });
  
  if (publickeySource) {
    const publickeyArticles = await prisma.article.findMany({
      where: { sourceId: publickeySource.id },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`\n【Publickey】記事数: ${publickeyArticles.length}件`);
    publickeyArticles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title.substring(0, 50)}...`);
      console.log(`   要約: ${article.summary ? article.summary.substring(0, 50) + '...' : 'なし'}`);
      console.log(`   ${!article.summary ? '❌ 要約なし' : '✓ あり'}`);
      console.log('');
    });
  }
  
  // 統計
  const devtoNoSummary = await prisma.article.count({
    where: {
      sourceId: devtoSource?.id,
      OR: [
        { summary: null },
        { summary: '' }
      ]
    }
  });
  
  const publickeyNoSummary = await prisma.article.count({
    where: {
      sourceId: publickeySource?.id,
      OR: [
        { summary: null },
        { summary: '' }
      ]
    }
  });
  
  console.log('\n【統計】');
  console.log(`Dev.to 要約なし: ${devtoNoSummary}件`);
  console.log(`Publickey 要約なし: ${publickeyNoSummary}件`);
}

checkDevToPublickeySummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });