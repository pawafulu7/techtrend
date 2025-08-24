#!/usr/bin/env tsx
/**
 * 英語除去メソッドのテスト
 * 同一行に混在する英語部分を除去
 */

import fetch from 'node-fetch';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';

// クリーンアップ関数（最終版）
function cleanLocalLLMOutput(output: string): string {
  // ケース1: 「一覧要約:」が含まれる場合
  if (output.includes('一覧要約:') || output.includes('一覧要約：')) {
    // 「一覧要約:」より前のすべてを削除（同一行の英語も含む）
    const summaryMatch = output.match(/(一覧要約[:：][\s\S]*)/);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }
  }
  
  // ケース2: 「一覧要約:」がない場合（詳細要約から始まるパターン）
  // Need/We needで始まる行を削除
  const cleaned = output;
  const lines = cleaned.split('\n');
  const filteredLines = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Need/We needで始まる行をスキップ
    if (/^(Need|We need)/i.test(trimmed)) {
      continue;
    }
    // 純粋な英語行をスキップ（ただし日本語が含まれる行は保持）
    if (/^[A-Za-z][A-Za-z\s.,!?0-9-]*$/.test(trimmed) && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
      continue;
    }
    filteredLines.push(line);
  }
  
  return filteredLines.join('\n').trim();
}

async function testCleanupMethod() {
  console.error('🧹 英語除去メソッドテスト\n');
  console.error('================================================================================');
  
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  // 複数の記事でテスト
  const testArticles = [
    {
      title: 'TypeScriptの型ガードによる安全な型推論',
      content: 'TypeScriptの型ガードを使用することで、ランタイムでの型チェックとコンパイル時の型推論を両立できます。instanceof、typeof、in演算子を活用し、ユーザー定義型ガードも実装可能です。'
    },
    {
      title: 'Kubernetes Operatorパターンの実装',
      content: 'Kubernetes Operatorパターンを使用すると、カスタムリソースの管理を自動化できます。Controllerとカスタムリソース定義（CRD）を組み合わせることで、複雑なアプリケーションのライフサイクル管理が可能になります。'
    },
    {
      title: 'WebAssemblyによるブラウザ上での高速計算',
      content: 'WebAssemblyを使用することで、ブラウザ上でネイティブに近い速度で計算処理を実行できます。RustやC++で書かれたコードをコンパイルし、JavaScriptから呼び出すことが可能です。'
    }
  ];
  
  console.error(`📝 ${testArticles.length}記事でクリーンアップをテスト\n`);
  
  let successCount = 0;
  let totalScore = 0;
  
  for (let i = 0; i < testArticles.length; i++) {
    const article = testArticles[i];
    console.error(`\n[記事 ${i + 1}/${testArticles.length}] ${article.title}`);
    console.error('────────────────────────────────────────────────────────────────────────────');
    
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
        console.error('  ❌ API エラー');
        continue;
      }
      
      const data = await response.json() as any;
      const rawOutput = data.choices[0].message.content;
      
      // 生の出力の最初の部分を表示
      const firstPart = rawOutput.substring(0, 100);
      console.error(`  生の出力: "${firstPart}..."`);
      
      // クリーンアップ実行
      const cleanedOutput = cleanLocalLLMOutput(rawOutput);
      
      // クリーンアップ後の最初の部分を表示
      const cleanedFirstPart = cleanedOutput.substring(0, 100);
      console.error(`  除去後: "${cleanedFirstPart}..."`);
      
      // 英語チェック
      const hasEnglish = /^[A-Za-z][A-Za-z\s.,!?]+/.test(cleanedOutput);
      console.error(`  英語混入: ${hasEnglish ? '❌ あり' : '✅ なし'}`);
      
      // パース処理
      const lines = cleanedOutput.split('\n');
      let summary = '';
      let detailedSummary = '';
      let tags: string[] = [];
      let isDetailedSection = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.match(/^(一覧)?要約[:：]/)) {
          const content = trimmed.replace(/^(一覧)?要約[:：]\s*/, '').trim();
          if (content) summary = content;
        } else if (trimmed.match(/^詳細要約[:：]/)) {
          isDetailedSection = true;
        } else if (trimmed.match(/^タグ[:：]/)) {
          isDetailedSection = false;
          const tagLine = trimmed.replace(/^タグ[:：]\s*/, '').trim();
          if (tagLine) {
            tags = tagLine.split(/[,、，]/).map(t => t.trim()).filter(t => t.length > 0);
          }
        } else if (isDetailedSection && trimmed.startsWith('・')) {
          detailedSummary += (detailedSummary ? '\n' : '') + trimmed;
        }
      }
      
      // 品質スコア計算
      const score = summary ? checkSummaryQuality(summary, detailedSummary).score : 0;
      console.error(`  品質スコア: ${score}点`);
      console.error(`  要約文字数: ${summary.length}文字`);
      console.error(`  タグ数: ${tags.length}個`);
      
      if (!hasEnglish && score > 0) {
        successCount++;
        totalScore += score;
        console.error('  ✅ 成功: 英語除去成功、要約正常');
      } else {
        console.error('  ⚠️  問題あり');
      }
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error}`);
    }
    
    // API負荷軽減
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // 結果サマリー
  console.error('\n================================================================================');
  console.error('📊 テスト結果サマリー');
  console.error('================================================================================');
  
  console.error(`  成功率: ${successCount}/${testArticles.length} (${Math.round(successCount / testArticles.length * 100)}%)`);
  if (successCount > 0) {
    console.error(`  平均品質スコア: ${Math.round(totalScore / successCount)}点`);
  }
  
  if (successCount === testArticles.length) {
    console.error('\n✅ クリーンアップメソッドは完璧に動作しています！');
    console.error('\n【推奨実装】');
    console.error('```typescript');
    console.error('// LocalLLMClient または処理部分に以下を追加');
    console.error('function cleanLocalLLMOutput(output: string): string {');
    console.error('  // 「一覧要約:」より前の英語を除去');
    console.error('  let cleaned = output.replace(');
    console.error('    /^[A-Za-z\\s.,!?]+(?=一覧要約[:：])/m,');
    console.error("    ''");
    console.error('  );');
    console.error('  ');
    console.error('  // 独立した英語行も除去（フォールバック）');
    console.error('  const lines = cleaned.split("\\n");');
    console.error('  while (lines.length > 0 && /^[A-Za-z][A-Za-z\\s.,!?]*$/.test(lines[0].trim())) {');
    console.error('    lines.shift();');
    console.error('  }');
    console.error('  ');
    console.error('  return lines.join("\\n").trim();');
    console.error('}');
    console.error('```');
  } else {
    console.error('\n⚠️  一部の記事で問題が発生しました。追加の調整が必要です。');
  }
}

// 実行
testCleanupMethod().catch(console.error);