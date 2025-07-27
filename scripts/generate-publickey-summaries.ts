import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function generatePublickeySummaries() {
  console.log('Publickeyの記事に日本語要約を生成します...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // Publickeyのソースを取得
  const publickeySource = await prisma.source.findFirst({
    where: { name: 'Publickey' }
  });
  
  if (!publickeySource) {
    console.log('Publickeyソースが見つかりません');
    return;
  }
  
  // 要約がない記事を取得
  const articles = await prisma.article.findMany({
    where: {
      sourceId: publickeySource.id,
      OR: [
        { summary: null },
        { summary: '' }
      ]
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  console.log(`処理対象: ${articles.length}件\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of articles) {
    try {
      console.log(`[${successCount + errorCount + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
      
      // コンテンツを準備
      let textForSummary = '';
      
      if (article.content && article.content.length > 50) {
        textForSummary = article.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        textForSummary = article.title;
      }
      
      // 文字数制限
      if (textForSummary.length > 2000) {
        textForSummary = textForSummary.substring(0, 2000);
      }
      
      // 日本語要約を生成
      const japaneseSummary = await geminiClient.generateSummary(article.title, textForSummary);
      
      if (japaneseSummary && japaneseSummary.length >= 30) {
        await prisma.article.update({
          where: { id: article.id },
          data: { summary: japaneseSummary }
        });
        
        console.log(`✓ 成功: ${japaneseSummary.substring(0, 60)}...`);
        successCount++;
      } else {
        console.log(`✗ 失敗: 要約の生成に失敗`);
        errorCount++;
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
      
      // エラー時は少し長めに待機
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n処理完了:');
  console.log(`- 成功: ${successCount}件`);
  console.log(`- エラー: ${errorCount}件`);
}

generatePublickeySummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });