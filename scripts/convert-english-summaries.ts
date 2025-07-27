import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function convertEnglishSummaries() {
  console.log('英語の要約を日本語に変換します...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // 英語要約のソースを取得
  const sources = await prisma.source.findMany({
    where: {
      name: {
        in: ['Dev.to', 'Stack Overflow Blog']
      }
    }
  });
  
  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;
  
  for (const source of sources) {
    console.log(`【${source.name}の記事を処理】\n`);
    
    // 英語の要約を持つ記事を取得（日本語文字が含まれていない要約）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        NOT: {
          OR: [
            { summary: null },
            { summary: '' }
          ]
        }
      }
    });
    
    // 日本語が含まれていない要約をフィルタ
    const englishOnlyArticles = articles.filter(article => 
      article.summary && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(article.summary)
    );
    
    console.log(`処理対象: ${englishOnlyArticles.length}件\n`);
    
    for (const article of englishOnlyArticles) {
      try {
        totalProcessed++;
        console.log(`[${totalProcessed}] ${article.title.substring(0, 50)}...`);
        
        // 既存の英語要約も含めてコンテンツを準備
        let textForSummary = `${article.title}\n\n${article.summary}`;
        
        if (article.content && article.content.length > 50) {
          const cleanContent = article.content
            .replace(/<[^>]*>/g, ' ')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanContent.length > 1000) {
            textForSummary += '\n\n' + cleanContent.substring(0, 1000);
          } else {
            textForSummary += '\n\n' + cleanContent;
          }
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
        
        // エラー時は少し長めに待機
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log('');
  }
  
  console.log('\n処理完了:');
  console.log(`- 成功: ${successCount}件`);
  console.log(`- エラー: ${errorCount}件`);
}

convertEnglishSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });