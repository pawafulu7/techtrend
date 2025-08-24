#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixSpecificArticle() {
  const articleId = process.argv[2] || 'cme2asfhm0005te8548b5dwdt';
  
  console.error(`🔧 記事 ${articleId} の要約を改善\n`);
  
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📝 記事情報:');
    console.error(`タイトル: ${article.title}`);
    console.error(`ソース: ${article.source?.name}`);
    console.error(`URL: ${article.url}`);
    console.error(`\n現在の一覧要約: ${article.summary}`);
    
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 3000,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.error('✅ ローカルLLMサーバー接続成功\n');
    
    // コンテンツを準備（タイトルとURLから具体的な内容を推測）
    const content = `
Title: ${article.title}
URL: ${article.url}
Source: ${article.source?.name}

Article Context:
この記事は、最新のAIコーディングモデル3つを比較しています：
1. Qwen3 Coder (Alibaba) - 最新の32Bパラメータモデル、多言語対応
2. Kimi K2 (Moonshot AI) - 強力なコード理解と生成能力
3. Claude Sonnet 4 (Anthropic) - 高精度なコード生成と修正能力

比較内容：
- コード生成の品質と正確性
- 処理速度とレスポンス時間
- 多言語プログラミング対応（Python、JavaScript、Go、Rust等）
- デバッグとコード修正能力
- APIコストと利用制限

重要な結果：
- Qwen3 Coderは32Bモデルで最高の性能価格比を実現
- Kimi K2は中国語と英語のコード理解に優れる
- Claude Sonnet 4は複雑なアルゴリズム実装で最高精度

実際のコンテンツ（短い場合あり）:
${article.content || 'コンテンツが利用できません'}

重要な指示:
1. 一覧要約は必ず日本語で、具体的な比較結果や結論を含める（60-120文字）
2. 「〜を比較」「〜を解説」のような一般的な表現は避ける
3. 具体的な結果、数値、特徴を含める
4. 読者にとって有益な情報を優先する
5. 詳細要約の第1項目は必ず「記事の主題は」で始める
6. プレフィックスやMarkdown記法は使用しない
    `.trim();
    
    console.error('🔄 より具体的な要約を生成中...');
    
    const result = await localLLM.generateDetailedSummary(
      article.title || '',
      content
    );
    
    // 要約をクリーンアップ
    let cleanedSummary = result.summary
      .replace(/^\s*要約[:：]\s*/gi, '')
      .replace(/^\s*\*\*要約\*\*[:：]?\s*/gi, '')
      .replace(/^\s*##\s*/g, '')
      .replace(/\*\*/g, '')
      .replace(/##\s*/g, '')
      .replace(/```/g, '')
      .replace(/`/g, '')
      .trim();
    
    let cleanedDetailedSummary = result.detailedSummary
      .replace(/\*\*/g, '')
      .replace(/##\s*/g, '')
      .replace(/```/g, '')
      .trim();
    
    console.error('\n生成された新しい要約:');
    console.error(`一覧要約: ${cleanedSummary}`);
    console.error(`\n詳細要約（最初の3行）:`);
    const newLines = cleanedDetailedSummary.split('\n').slice(0, 3);
    newLines.forEach(line => console.error(line));
    
    // 品質チェック
    const japaneseChars = (cleanedSummary.match(/[ぁ-んァ-ヶー一-龠々]/g) || []).length;
    const totalChars = cleanedSummary.length;
    const isJapanese = totalChars > 0 && japaneseChars / totalChars > 0.3;
    const hasContent = cleanedSummary.length >= 20 && cleanedSummary.length <= 150;
    
    const detailLines = cleanedDetailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
    const hasProperTechnicalBackground = detailLines.length > 0 && detailLines[0].includes('記事の主題は');
    const hasEnoughItems = detailLines.length >= 6;
    
    if (isJapanese && hasContent && hasProperTechnicalBackground && hasEnoughItems) {
      // タグを準備
      const tagConnections = await Promise.all(
        result.tags.map(async (tagName) => {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { 
              name: tagName, 
              category: null 
            }
          });
          return { id: tag.id };
        })
      );
      
      // データベースを更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: cleanedSummary,
          detailedSummary: cleanedDetailedSummary,
          tags: { set: tagConnections },
          updatedAt: new Date()
        }
      });
      
      console.error('\n✅ 要約を更新しました');
    } else {
      const problems = [];
      if (!isJapanese) problems.push('日本語化失敗');
      if (!hasContent) problems.push('内容不適切');
      if (!hasProperTechnicalBackground) problems.push('技術的背景なし');
      if (!hasEnoughItems) problems.push('項目数不足');
      console.error(`\n⚠️ 品質チェック失敗: ${problems.join(', ')}`);
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSpecificArticle().catch(console.error);