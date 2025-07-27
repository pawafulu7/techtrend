import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function fixAllSummaries() {
  console.log('すべての要約を修正します...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // 要約がない、または品質が低い記事を取得
  const articles = await prisma.article.findMany({
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
  
  console.log(`修正対象: ${articles.length}件\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of articles) {
    try {
      console.log(`[${successCount + errorCount + 1}/${articles.length}] ${article.title}`);
      
      // コンテンツを準備
      let textForSummary = '';
      
      if (article.content && article.content.length > 50) {
        // HTMLタグを除去してテキストを抽出
        textForSummary = article.content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // コンテンツが短すぎる場合はタイトルを使用
      if (textForSummary.length < 50) {
        textForSummary = `${article.title}。${article.source.name}に投稿された技術記事。`;
      }
      
      // 文字数制限
      if (textForSummary.length > 2000) {
        textForSummary = textForSummary.substring(0, 2000);
      }
      
      // Gemini APIで要約を生成
      const summary = await geminiClient.generateSummary(article.title, textForSummary);
      
      // 要約が適切か確認
      if (summary && summary.length >= 30) {
        await prisma.article.update({
          where: { id: article.id },
          data: { summary }
        });
        
        console.log(`✓ 成功: ${summary.substring(0, 60)}...`);
        successCount++;
      } else {
        console.log(`✗ 失敗: 要約が短すぎます（${summary?.length || 0}文字）`);
        errorCount++;
      }
      
      // レート制限対策（1秒待機）
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
      
      // エラー時は2秒待機
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n処理完了:');
  console.log(`- 成功: ${successCount}件`);
  console.log(`- エラー: ${errorCount}件`);
  
  // 処理後の状態を確認
  const remainingWithoutSummary = await prisma.article.count({
    where: {
      OR: [
        { summary: null },
        { summary: '' }
      ]
    }
  });
  
  console.log(`\n残りの要約なし記事: ${remainingWithoutSummary}件`);
}

fixAllSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });