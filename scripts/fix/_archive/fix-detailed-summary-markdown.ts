import { PrismaClient } from '@prisma/client';

async function fixDetailedSummaryMarkdown() {
  const prisma = new PrismaClient();
  
  try {
    // 問題のある記事を取得
    const articles = await prisma.article.findMany({
      where: {
        detailedSummary: {
          contains: '・**'
        }
      }
    });
    
    console.error(`Found ${articles.length} articles with markdown issues`);
    
    if (articles.length === 0) {
      console.error('No articles to fix');
      return;
    }
    
    // 修正前のサンプルを表示
    const sampleArticle = articles[0];
    console.error('\n=== Sample Before Fix ===');
    console.error('Article ID:', sampleArticle.id);
    console.error('Title:', sampleArticle.title);
    console.error('Detailed Summary (first 200 chars):');
    console.error(sampleArticle.detailedSummary?.substring(0, 200));
    
    // 各記事を修正
    let fixedCount = 0;
    for (const article of articles) {
      if (!article.detailedSummary) continue;
      
      // Markdown太字記法を削除
      const fixed = article.detailedSummary
        .replace(/・\*\*([^*]+)\*\*/g, '・$1');
      
      // 変更があった場合のみ更新
      if (fixed !== article.detailedSummary) {
        await prisma.article.update({
          where: { id: article.id },
          data: { detailedSummary: fixed }
        });
        
        fixedCount++;
        console.error(`Fixed article ${fixedCount}/${articles.length}: ${article.id}`);
      }
    }
    
    // 修正後のサンプルを表示
    if (fixedCount > 0) {
      const fixedArticle = await prisma.article.findUnique({
        where: { id: sampleArticle.id }
      });
      
      console.error('\n=== Sample After Fix ===');
      console.error('Article ID:', fixedArticle?.id);
      console.error('Title:', fixedArticle?.title);
      console.error('Detailed Summary (first 200 chars):');
      console.error(fixedArticle?.detailedSummary?.substring(0, 200));
    }
    
    console.error(`\nAll articles fixed successfully (${fixedCount} articles updated)`);
    
  } catch (error) {
    console.error('Error fixing articles:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
fixDetailedSummaryMarkdown().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});