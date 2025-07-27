import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function generateNewSourcesSummaries() {
  console.log('新しいソースの記事に日本語要約を生成します...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // 新しいソースを取得
  const newSources = await prisma.source.findMany({
    where: {
      name: {
        in: ['Stack Overflow Blog', 'Think IT']
      }
    }
  });
  
  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;
  
  for (const source of newSources) {
    console.log(`【${source.name}の記事を処理】\n`);
    
    // 要約がない記事を取得
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
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
    
    for (const article of articles) {
      try {
        totalProcessed++;
        console.log(`[${totalProcessed}] ${article.title.substring(0, 50)}...`);
        
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
        
        // 要約が適切に生成されたか確認
        if (japaneseSummary && japaneseSummary.length >= 30 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(japaneseSummary)) {
          await prisma.article.update({
            where: { id: article.id },
            data: { summary: japaneseSummary }
          });
          
          console.log(`✓ 成功: ${japaneseSummary.substring(0, 60)}...`);
          successCount++;
        } else {
          console.log(`✗ 失敗: 日本語要約の生成に失敗`);
          errorCount++;
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
        
        // エラー時は少し長めに待機
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('');
  }
  
  console.log('\n処理完了:');
  console.log(`- 成功: ${successCount}件`);
  console.log(`- エラー: ${errorCount}件`);
}

generateNewSourcesSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });