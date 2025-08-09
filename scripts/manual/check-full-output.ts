#!/usr/bin/env tsx
/**
 * LocalLLMのフル出力確認スクリプト
 * 英語部分と日本語部分の構造を詳細に分析
 */

import fetch from 'node-fetch';

async function checkFullOutput() {
  console.log('📝 LocalLLMフル出力確認\n');
  console.log('================================================================================');
  
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  const testArticle = {
    title: 'Next.js App RouterとServer Actionsによる最新Web開発',
    content: `
      Next.js 13で導入されたApp RouterとServer Actionsは、Webアプリケーション開発に革命をもたらしました。
      Server Actionsを使用することで、フォーム送信やデータ更新をサーバー側で直接処理でき、
      APIエンドポイントの作成が不要になります。また、レイアウトの入れ子構造により、
      部分的な再レンダリングが可能になり、パフォーマンスが大幅に向上します。
    `
  };
  
  console.log('📄 テスト記事:');
  console.log(`  タイトル: ${testArticle.title}\n`);
  
  const userPrompt = `
技術記事を分析して、以下の形式で出力してください。

タイトル: ${testArticle.title}
内容: ${testArticle.content}

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
    console.log('⏳ LocalLLMで生成中...\n');
    
    const response = await fetch(`${localLLMUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: localLLMModel,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json() as any;
    const output = data.choices[0].message.content;
    
    console.log('✅ 生成完了\n');
    console.log('【完全な出力内容】');
    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log(output);
    console.log('════════════════════════════════════════════════════════════════════════════\n');
    
    // 行ごとに分析
    const lines = output.split('\n');
    console.log('【行ごとの分析】');
    console.log('────────────────────────────────────────────────────────────────────────────');
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        console.log(`行${index + 1}: [空行]`);
        return;
      }
      
      // 行の種類を判定
      let lineType = '不明';
      if (/^[A-Za-z][A-Za-z\s.,!?]*$/.test(trimmed)) {
        lineType = '🔴 英語のみ';
      } else if (trimmed.match(/^(一覧)?要約[:：]/)) {
        lineType = '🟢 一覧要約ラベル';
      } else if (trimmed.match(/^詳細要約[:：]/)) {
        lineType = '🟢 詳細要約ラベル';
      } else if (trimmed.match(/^タグ[:：]/)) {
        lineType = '🟢 タグラベル';
      } else if (trimmed.startsWith('・')) {
        lineType = '🔵 箇条書き項目';
      } else if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(trimmed)) {
        lineType = '🟡 日本語含む';
      }
      
      console.log(`行${index + 1}: ${lineType}`);
      console.log(`  内容: "${trimmed.substring(0, 60)}${trimmed.length > 60 ? '...' : ''}"`);
    });
    
    console.log('\n【除去ルールの提案】');
    console.log('────────────────────────────────────────────────────────────────────────────');
    
    // 最初の非空行を確認
    const firstNonEmptyLine = lines.find(line => line.trim());
    const isEnglishFirst = firstNonEmptyLine && /^[A-Za-z][A-Za-z\s.,!?]*$/.test(firstNonEmptyLine.trim());
    
    if (isEnglishFirst) {
      // 「一覧要約:」の位置を探す
      const summaryIndex = lines.findIndex(line => line.trim().match(/^(一覧)?要約[:：]/));
      
      if (summaryIndex > 0) {
        console.log('✅ 推奨除去方法:');
        console.log('  1. 「一覧要約:」より前の英語行をすべて除去');
        console.log(`  2. 除去対象: 行1～行${summaryIndex}（${summaryIndex}行）`);
        console.log('\n```typescript');
        console.log('function cleanLocalLLMOutput(output: string): string {');
        console.log('  const lines = output.split("\\n");');
        console.log('  ');
        console.log('  // 「一覧要約:」を探す');
        console.log('  const summaryIndex = lines.findIndex(line => ');
        console.log('    /^(一覧)?要約[:：]/.test(line.trim())');
        console.log('  );');
        console.log('  ');
        console.log('  if (summaryIndex > 0) {');
        console.log('    // 「一覧要約:」から開始');
        console.log('    return lines.slice(summaryIndex).join("\\n");');
        console.log('  }');
        console.log('  ');
        console.log('  // フォールバック: 英語のみの行を除去');
        console.log('  while (lines.length > 0 && /^[A-Za-z][A-Za-z\\s.,!?]*$/.test(lines[0].trim())) {');
        console.log('    lines.shift();');
        console.log('  }');
        console.log('  ');
        console.log('  return lines.join("\\n");');
        console.log('}');
        console.log('```');
      } else if (summaryIndex === 0) {
        console.log('✅ 英語の前置きなし！正常な出力です。');
      } else {
        console.log('⚠️  「一覧要約:」が見つかりません。');
        console.log('  フォールバック: 英語のみの行を除去');
      }
    } else {
      console.log('✅ 英語の前置きなし！完璧な日本語出力です。');
    }
    
    // クリーンアップ後の出力を表示
    if (isEnglishFirst) {
      console.log('\n【クリーンアップ後の出力】');
      console.log('════════════════════════════════════════════════════════════════════════════');
      
      const summaryIndex = lines.findIndex(line => line.trim().match(/^(一覧)?要約[:：]/));
      if (summaryIndex > 0) {
        const cleaned = lines.slice(summaryIndex).join('\n');
        console.log(cleaned);
      }
      console.log('════════════════════════════════════════════════════════════════════════════');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
checkFullOutput().catch(console.error);