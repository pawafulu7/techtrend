import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function testSpeakerDeckSummary() {
  try {
    // Speaker Deckの記事を1件取得
    const source = await prisma.source.findFirst({
      where: { name: 'Speaker Deck' }
    });
    
    if (!source) {
      console.log('Speaker Deckソースが見つかりません');
      return;
    }
    
    const article = await prisma.article.findFirst({
      where: { 
        sourceId: source.id,
        summary: null
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    if (!article) {
      console.log('要約がないSpeaker Deck記事が見つかりません');
      return;
    }
    
    console.log('=== テスト対象記事 ===');
    console.log(`タイトル: ${article.title}`);
    console.log(`コンテンツ: ${article.content}`);
    console.log(`説明: ${article.description}`);
    console.log('');
    
    const content = article.content || article.description || '';
    console.log(`要約生成に使用するコンテンツ: "${content}"`);
    console.log(`コンテンツ長: ${content.length}文字`);
    console.log('');
    
    if (content.length < 50) {
      console.log('⚠️ 警告: コンテンツが短すぎます（50文字未満）');
      console.log('この状態では適切な要約を生成できない可能性があります。');
    }
    
    // 実際のプロンプトの一部を表示
    const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${article.title}
内容: ${content.substring(0, 4000)}

以下の観点で分析し、指定された形式で回答してください：
...（省略）`;
    
    console.log('=== Gemini APIに送るプロンプト（一部） ===');
    console.log(prompt.substring(0, 300) + '...');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSpeakerDeckSummary();