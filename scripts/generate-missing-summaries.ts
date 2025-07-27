import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function generateMissingSummaries() {
  console.log('要約がない記事の要約を生成します...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // 要約がない記事を取得
  const articlesWithoutSummary = await prisma.article.findMany({
    where: {
      OR: [
        { summary: null },
        { summary: '' }
      ]
    },
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  console.log(`要約生成対象: ${articlesWithoutSummary.length}件\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of articlesWithoutSummary) {
    try {
      console.log(`処理中: ${article.title}`);
      
      // コンテンツがある場合はそれを使用、なければタイトルとURLから生成
      const textToSummarize = article.content || `${article.title}\n\n記事URL: ${article.url}`;
      
      // Gemini APIで要約を生成
      const summary = await geminiClient.generateSummary(article.title, textToSummarize);
      
      // データベースを更新
      await prisma.article.update({
        where: { id: article.id },
        data: { summary }
      });
      
      console.log(`✓ 要約生成完了`);
      console.log(`  要約: ${summary.substring(0, 100)}...`);
      console.log('');
      
      successCount++;
      
      // レート制限対策として少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
      console.log('');
      errorCount++;
    }
  }
  
  console.log('\n処理完了:');
  console.log(`- 成功: ${successCount}件`);
  console.log(`- エラー: ${errorCount}件`);
}

generateMissingSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });