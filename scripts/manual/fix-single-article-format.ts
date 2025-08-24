#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function fixArticleFormat() {
  const articleId = 'cme3sdz74000fte6gig7urb0t';
  
  console.error('📋 記事の要約を正しい形式で再生成します');
  console.error('=====================================\n');
  
  try {
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📰 記事情報:');
    console.error(`  タイトル: ${article.title}`);
    console.error(`  ソース: ${article.source.name}`);
    console.error(`  URL: ${article.url}\n`);
    
    console.error('❌ 現在の問題:');
    console.error('  1. 一覧要約が「限界。」で途切れている');
    console.error('  2. 詳細要約が箇条書き形式ではない\n');
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // 正しい形式のプロンプト
    const prompt = `以下の技術記事の要約を作成してください。

タイトル: ${article.title}
URL: ${article.url}

記事の内容:
この記事は、「グリッチトークン」と呼ばれる特定の単語を使ってLLM（大規模言語モデル）を意図的に誤動作させる手法について解説しています。
「植物百科通」という単語をGPT-5に入力すると、異常な挙動を示す例を紹介し、LLMの学習データや処理の限界を探る方法を説明しています。

要求事項：

1. 簡潔な要約（150-180文字で、必ず「。」で終わる完結した日本語文）:
   - グリッチトークンという専門用語を含める
   - LLMの脆弱性や誤動作について言及
   - 「植物百科通」という具体例を含める
   - GPT-5への影響について触れる
   - 一文で簡潔にまとめる

2. 詳細な要約（箇条書き形式、300-350文字、各項目は「・」で始まる）:
   以下の5項目を簡潔に50-70文字程度でまとめてください：
   ・記事の主題は、グリッチトークンがLLMに異常動作を引き起こす現象を解説
   ・具体例は、「植物百科通」という単語でGPT-5が異常な挙動を示すこと
   ・原因は、学習データの偏りや処理限界に起因すると考えられる
   ・影響は、出力の不安定化や意味不明な応答が発生する
   ・意義は、LLMの限界を探り、より堅牢なモデル開発に繋がる

回答フォーマット（JSON形式）:
{
  "summary": "80-120文字の完結した要約文。",
  "detailedSummary": "・記事の主題は、〜\\n・具体的な問題は、〜\\n・提示されている解決策は、〜\\n・実装方法の詳細については、〜\\n・期待される効果は、〜\\n・実装時の注意点は、〜",
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;

    console.error('🔄 Gemini APIで正しい形式の要約を生成中...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2500
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as any;
    const responseText = data.candidates[0].content.parts[0].text.trim();
    
    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSONの抽出に失敗しました');
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    console.error('\n✅ 新しい要約（正しい形式）:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('【一覧要約】');
    console.error(`  "${result.summary}"`);
    console.error(`  文字数: ${result.summary.length}文字`);
    console.error(`  文字数チェック: ${result.summary.length >= 150 && result.summary.length <= 180 ? '✅ OK (150-180文字)' : '❌ NG'}`); 
    console.error(`  完結チェック: ${result.summary.endsWith('。') ? '✅ OK' : '❌ NG'}`);
    
    console.error('\n【詳細要約】');
    const detailLines = result.detailedSummary.split('\n');
    detailLines.forEach((line: string) => {
      console.error(`  ${line}`);
    });
    console.error(`  文字数: ${result.detailedSummary.length}文字`);
    console.error(`  文字数チェック: ${result.detailedSummary.length >= 300 && result.detailedSummary.length <= 350 ? '✅ OK (300-350文字)' : '❌ NG'}`);  
    console.error(`  箇条書きチェック: ${result.detailedSummary.startsWith('・') ? '✅ OK' : '❌ NG'}`);
    
    // データベース更新
    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: 6
      }
    });
    
    console.error('\n✅ データベースを更新しました');
    
    // タグの処理
    if (result.tags && result.tags.length > 0) {
      console.error(`\n📌 タグ: ${result.tags.join(', ')}`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行
if (require.main === module) {
  fixArticleFormat()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}