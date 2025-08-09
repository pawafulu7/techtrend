#!/usr/bin/env tsx
/**
 * LocalLLM冒頭英語パターン分析スクリプト
 * 複数記事で出力される英語パターンを収集・分析
 */

import fetch from 'node-fetch';

interface TestResult {
  articleTitle: string;
  firstLine: string;
  hasEnglishPrefix: boolean;
  englishPattern: string | null;
}

async function analyzePatterns() {
  console.log('🔍 LocalLLM冒頭英語パターン分析\n');
  console.log('================================================================================');
  
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  // 様々なタイプの記事でテスト
  const testArticles = [
    {
      title: 'TypeScriptの型推論を活用した安全なコード設計',
      content: 'TypeScriptの型推論機能を最大限活用することで、明示的な型注釈を減らしつつ型安全性を保つことができます。特にジェネリクスとconst assertionを組み合わせることで、より厳密な型定義が可能になります。'
    },
    {
      title: 'Dockerコンテナのマルチステージビルドによるイメージサイズ削減',
      content: 'Dockerのマルチステージビルドを使用することで、本番環境用のイメージサイズを大幅に削減できます。ビルド用と実行用のステージを分離し、最終イメージには実行に必要なファイルのみを含めることで、セキュリティも向上します。'
    },
    {
      title: 'GitHub Actionsを使った自動デプロイパイプラインの構築',
      content: 'GitHub Actionsを活用することで、コードのプッシュからテスト、ビルド、デプロイまでを完全に自動化できます。環境変数とシークレットを適切に管理し、ブランチ戦略と連携させることが重要です。'
    },
    {
      title: 'GraphQLサブスクリプションによるリアルタイム通信の実装',
      content: 'GraphQLサブスクリプションを使用すると、WebSocketを介したリアルタイム通信を簡単に実装できます。Apollo ServerとApollo Clientを組み合わせることで、型安全なリアルタイム機能を構築できます。'
    },
    {
      title: 'Rustで実装する高速Webサーバーの基礎',
      content: 'Rustを使用してWebサーバーを実装すると、メモリ安全性と高速性を両立できます。Actix-webやRocketなどのフレームワークを使用することで、実用的なAPIサーバーを効率的に開発できます。'
    }
  ];
  
  const results: TestResult[] = [];
  const englishPatterns: Map<string, number> = new Map();
  
  console.log(`📝 ${testArticles.length}記事でパターンを収集\n`);
  
  for (let i = 0; i < testArticles.length; i++) {
    const article = testArticles[i];
    console.log(`\n[記事 ${i + 1}/${testArticles.length}] ${article.title}`);
    console.log('────────────────────────────────────────────────────────────────────────────');
    
    const userPrompt = `
技術記事を分析して、以下の形式で出力してください。

タイトル: ${article.title}
内容: ${article.content}

【必須の出力形式】
一覧要約: [80-120文字で技術的要点をまとめる]

詳細要約:
・この記事の主要なトピックは、[内容]
・技術的な背景として、[内容]
・具体的な実装について、[内容]
・実践する際のポイントは、[内容]
・今後の展望として、[内容]

タグ: [技術タグ3-5個、カンマ区切り]`;
    
    try {
      const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localLLMModel,
          messages: [
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 1500,
          temperature: 0.3
        })
      });
      
      if (!response.ok) {
        console.log('  ❌ API エラー');
        continue;
      }
      
      const data = await response.json() as any;
      const output = data.choices[0].message.content;
      
      // 最初の行を抽出
      const lines = output.split('\n');
      const firstLine = lines[0].trim();
      
      // 英語パターンチェック
      const hasEnglishPrefix = /^[A-Za-z\s.,!?]+/.test(firstLine);
      let englishPattern: string | null = null;
      
      if (hasEnglishPrefix) {
        // 英語部分を抽出
        const match = firstLine.match(/^([A-Za-z\s.,!?]+)/);
        if (match) {
          englishPattern = match[1].trim();
          
          // パターンをカウント
          const count = englishPatterns.get(englishPattern) || 0;
          englishPatterns.set(englishPattern, count + 1);
        }
      }
      
      results.push({
        articleTitle: article.title,
        firstLine: firstLine,
        hasEnglishPrefix,
        englishPattern
      });
      
      console.log(`  最初の行: "${firstLine.substring(0, 60)}${firstLine.length > 60 ? '...' : ''}"`);
      console.log(`  英語プレフィックス: ${hasEnglishPrefix ? `✅ あり ("${englishPattern}")` : '❌ なし'}`);
      
    } catch (error) {
      console.log(`  ❌ エラー: ${error}`);
    }
    
    // API負荷軽減
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // 結果分析
  console.log('\n================================================================================');
  console.log('📊 パターン分析結果');
  console.log('================================================================================\n');
  
  console.log('【検出された英語パターン】');
  if (englishPatterns.size > 0) {
    const sortedPatterns = Array.from(englishPatterns.entries())
      .sort((a, b) => b[1] - a[1]);
    
    sortedPatterns.forEach(([pattern, count]) => {
      console.log(`  "${pattern}": ${count}回`);
    });
    
    // 最頻出パターン
    const mostCommon = sortedPatterns[0];
    console.log(`\n🏆 最頻出パターン: "${mostCommon[0]}" (${mostCommon[1]}/${testArticles.length}回)`);
    
    // 一貫性チェック
    const consistency = (mostCommon[1] / testArticles.length) * 100;
    console.log(`📈 一貫性: ${consistency.toFixed(0)}%`);
    
    if (consistency >= 60) {
      console.log('\n✅ パターンは一貫しています。以下の除去ルールを推奨:');
      console.log('```typescript');
      console.log(`// LocalLLMの出力から冒頭の英語を除去`);
      console.log(`function removeEnglishPrefix(output: string): string {`);
      console.log(`  const lines = output.split('\\n');`);
      console.log(`  const firstLine = lines[0].trim();`);
      console.log(`  `);
      console.log(`  // 最頻出パターンを除去`);
      console.log(`  if (firstLine.startsWith('${mostCommon[0]}')) {`);
      console.log(`    lines.shift(); // 最初の行を削除`);
      console.log(`    return lines.join('\\n').trim();`);
      console.log(`  }`);
      console.log(`  `);
      console.log(`  // その他の英語パターンも除去`);
      console.log(`  if (/^[A-Za-z\\s.,!?]+/.test(firstLine) && !firstLine.includes('要約')) {`);
      console.log(`    lines.shift();`);
      console.log(`    return lines.join('\\n').trim();`);
      console.log(`  }`);
      console.log(`  `);
      console.log(`  return output;`);
      console.log(`}`);
      console.log('```');
    } else {
      console.log('\n⚠️  パターンにばらつきがあります。汎用的な英語除去ルールを推奨:');
      console.log('```typescript');
      console.log(`// 冒頭の英語行を汎用的に除去`);
      console.log(`function removeEnglishPrefix(output: string): string {`);
      console.log(`  const lines = output.split('\\n');`);
      console.log(`  const firstLine = lines[0].trim();`);
      console.log(`  `);
      console.log(`  // 英語で始まり、日本語の「要約」を含まない行を除去`);
      console.log(`  if (/^[A-Za-z][A-Za-z\\s.,!?]*$/.test(firstLine)) {`);
      console.log(`    lines.shift();`);
      console.log(`    return lines.join('\\n').trim();`);
      console.log(`  }`);
      console.log(`  `);
      console.log(`  return output;`);
      console.log(`}`);
      console.log('```');
    }
    
  } else {
    console.log('  英語パターンは検出されませんでした！');
    console.log('\n✅ 完全日本語システムプロンプトは完璧に動作しています！');
  }
  
  // 個別結果の表示
  console.log('\n【記事別詳細】');
  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.articleTitle.substring(0, 30)}...`);
    console.log(`   英語: ${result.hasEnglishPrefix ? `"${result.englishPattern}"` : 'なし'}`);
  });
}

// 実行
analyzePatterns().catch(console.error);