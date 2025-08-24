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
      console.error('Speaker Deckソースが見つかりません');
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
      console.error('要約がないSpeaker Deck記事が見つかりません');
      return;
    }
    
    console.error('=== テスト対象記事 ===');
    console.error(`タイトル: ${article.title}`);
    console.error(`コンテンツ: ${article.content}`);
    console.error(`説明: ${article.description}`);
    console.error('');
    
    const content = article.content || article.description || '';
    console.error(`要約生成に使用するコンテンツ: "${content}"`);
    console.error(`コンテンツ長: ${content.length}文字`);
    console.error('');
    
    if (content.length < 50) {
      console.error('⚠️ 警告: コンテンツが短すぎます（50文字未満）');
      console.error('この状態では適切な要約を生成できない可能性があります。');
    }
    
    // 実際のプロンプトの一部を表示
    const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${article.title}
内容: ${content.substring(0, 4000)}

以下の観点で分析し、指定された形式で回答してください：
...（省略）`;
    
    console.error('=== Gemini APIに送るプロンプト（一部） ===');
    console.error(prompt.substring(0, 300) + '...');
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSpeakerDeckSummary();