import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function testSummaryGeneration() {
  console.log('新しい要約生成設定のテスト...\n');
  
  // テスト用の記事を取得（最新の1件）
  const article = await prisma.article.findFirst({
    where: { content: { not: null } },
    orderBy: { publishedAt: 'desc' }
  });
  
  if (!article || !article.content) {
    console.error('テスト用の記事が見つかりません');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`テスト記事: ${article.title}\n`);
  
  // APIキーの確認
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    await prisma.$disconnect();
    return;
  }
  
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const prompt = `以下の技術記事を詳細に分析してください。

タイトル: ${article.title}
内容: ${article.content.substring(0, 4000)}

以下の観点で分析し、指定された形式で回答してください：

【分析観点】
1. 記事の主要なトピックと技術的な焦点
2. 解決しようとしている問題や課題
3. 提示されている解決策やアプローチ
4. 実装の具体例やコードの有無
5. 対象読者のレベル（初級/中級/上級）

【回答形式】
※重要: 各セクションのラベル（要約:、詳細要約:、タグ:）のみ記載し、それ以外の説明や指示文は一切含めないでください。

要約:
記事が解決する問題や提供する価値を明確に示す120-150文字程度の完結した文章。技術的な要素と具体的な効果を含め、必ず句点「。」で終わること。冒頭に句読点を置かないこと。

詳細要約:
以下の要素を箇条書きで記載（各項目は「・」で開始）：
・記事の主題と背景
・解決しようとしている具体的な問題
・提示されている解決策やアプローチ
・実装方法や技術的な詳細
・期待される効果やメリット
・注意点や考慮事項

タグ:
技術名,フレームワーク名,カテゴリ名,概念名

【タグの例】
JavaScript, React, フロントエンド, 状態管理`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('API request failed:', error);
      await prisma.$disconnect();
      return;
    }
    
    const data = await response.json() as any;
    const responseText = data.candidates[0].content.parts[0].text.trim();
    
    console.log('=== 生成結果 ===\n');
    console.log(responseText);
    console.log('\n=== 要約の文字数チェック ===\n');
    
    // 要約部分を抽出
    const summaryMatch = responseText.match(/要約:\s*\n([\s\S]*?)(?=\n\n|詳細要約:|$)/);
    if (summaryMatch) {
      const summary = summaryMatch[1].trim();
      console.log(`要約: ${summary}`);
      console.log(`文字数: ${summary.length}文字`);
      console.log(`目標範囲: 120-150文字 ${summary.length >= 120 && summary.length <= 150 ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  await prisma.$disconnect();
}

// 直接実行された場合
if (require.main === module) {
  testSummaryGeneration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}