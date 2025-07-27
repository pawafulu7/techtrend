import { prisma } from '../lib/database';
import { GeminiClient } from '../lib/ai/gemini';

async function testSummaryGeneration() {
  console.log('要約生成テスト...\n');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const geminiClient = new GeminiClient(apiKey);
  
  // テスト用に1件だけ取得
  const article = await prisma.article.findFirst({
    where: {
      OR: [
        { summary: null },
        { summary: '' }
      ]
    },
    include: {
      source: true
    }
  });
  
  if (!article) {
    console.log('要約がない記事が見つかりません');
    return;
  }
  
  console.log('テスト記事:');
  console.log(`タイトル: ${article.title}`);
  console.log(`ソース: ${article.source.name}`);
  console.log(`URL: ${article.url}`);
  console.log('');
  
  try {
    // コンテンツを準備
    let textForSummary = '';
    
    if (article.content && article.content.length > 100) {
      textForSummary = article.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000); // テスト用に短く
    } else {
      textForSummary = article.title;
    }
    
    console.log('要約生成用テキスト（最初の200文字）:');
    console.log(textForSummary.substring(0, 200) + '...\n');
    
    // Gemini APIを呼び出し
    console.log('Gemini APIを呼び出し中...');
    const summary = await geminiClient.generateSummary(article.title, textForSummary);
    
    console.log('\n生成された要約:');
    console.log(summary);
    
    // 要約の品質チェック
    console.log('\n品質チェック:');
    console.log(`- 文字数: ${summary.length}`);
    console.log(`- 日本語含有: ${/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(summary) ? 'あり' : 'なし'}`);
    console.log(`- 30文字以上: ${summary.length >= 30 ? 'OK' : 'NG'}`);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

testSummaryGeneration()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });