import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function regenerateSummaries() {
  console.log('要約を再生成します...\n');
  
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
        { summary: '' },
        { summary: { contains: '...' } },
      ]
    },
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  console.log(`再生成対象: ${articles.length}件\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const article of articles) {
    try {
      console.log(`処理中: ${article.title}`);
      console.log(`  ソース: ${article.source.name}`);
      
      // コンテンツから要約を生成
      // contentがない場合はタイトルとURLから生成
      let textForSummary = '';
      
      if (article.content && article.content.length > 100) {
        // HTMLタグを除去
        textForSummary = article.content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        // コンテンツがない場合はタイトルをベースに
        textForSummary = `タイトル: ${article.title}\nソース: ${article.source.name}`;
      }
      
      // 文字数制限（Gemini APIのトークン制限対策）
      if (textForSummary.length > 3000) {
        textForSummary = textForSummary.substring(0, 3000) + '...';
      }
      
      // Gemini APIで要約を生成
      const summary = await geminiClient.generateSummary(article.title, textForSummary);
      
      // 要約が適切に生成されたか確認
      if (summary && summary.length >= 30 && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary)) {
        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: { summary }
        });
        
        console.log(`✓ 要約生成完了`);
        console.log(`  要約: ${summary.substring(0, 100)}...`);
        successCount++;
      } else {
        console.log(`✗ 要約生成失敗: 品質基準を満たしていません`);
        errorCount++;
      }
      
      console.log('');
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1500));
      
    } catch (error) {
      console.error(`✗ エラー: ${error instanceof Error ? error.message : String(error)}`);
      console.log('');
      errorCount++;
      
      // エラー時は少し長めに待機
      await new Promise(resolve => setTimeout(resolve, 3000));
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

regenerateSummaries()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });