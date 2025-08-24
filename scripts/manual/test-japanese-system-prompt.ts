#!/usr/bin/env tsx
/**
 * 完全日本語システムプロンプトのテスト
 * 英語混入を防ぐための検証
 */

import fetch from 'node-fetch';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';

async function testJapanesePrompt() {
  console.error('🎌 完全日本語システムプロンプトテスト\n');
  console.error('================================================================================');
  
  const localLLMUrl = process.env.LOCAL_LLM_URL || 'http://192.168.11.7:1234';
  const localLLMModel = process.env.LOCAL_LLM_MODEL || 'openai/gpt-oss-20b';
  
  // テスト記事
  const testArticle = {
    title: 'React Server Componentsによるパフォーマンス最適化の実践',
    content: `
      React Server Components（RSC）を使用することで、クライアントへのJavaScriptバンドルサイズを
      大幅に削減できます。従来のクライアントサイドレンダリングと比較して、初期ロード時間が
      50%以上改善された事例も報告されています。特にデータフェッチングをサーバー側で完結させることで、
      ウォーターフォール問題を解決し、ユーザー体験を向上させることができます。
      実装時はuse serverディレクティブを適切に使用し、サーバーとクライアントの境界を明確にすることが重要です。
    `
  };
  
  console.error('📝 テスト記事:');
  console.error(`  タイトル: ${testArticle.title}`);
  console.error(`  内容長: ${testArticle.content.length}文字\n`);
  
  // ユーザープロンプト（統一フォーマット用）
  const userPrompt = `
技術記事を分析して、以下の形式で出力してください。

タイトル: ${testArticle.title}
内容: ${testArticle.content}

【必須の出力形式】
一覧要約: [80-120文字で技術的要点をまとめる]

詳細要約:
・この記事の主要なトピックは、[技術的背景と使用技術]
・技術的な背景として、[前提知識や関連技術]
・具体的な実装や手法について、[コード例や設定方法]
・実践する際のポイントは、[注意点や推奨事項]
・今後の展望や応用として、[発展的な内容]

タグ: [技術タグ3-5個、カンマ区切り]

【重要】
- 日本語のみで出力
- 思考過程は出力しない
- 指定形式を厳守`;
  
  try {
    console.error('⏳ LocalLLMで生成中...\n');
    const startTime = Date.now();
    
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
    const processingTime = Date.now() - startTime;
    
    console.error('✅ 生成完了\n');
    console.error('【生成結果】');
    console.error('────────────────────────────────────────────────────────────────────────────');
    console.error(output);
    console.error('────────────────────────────────────────────────────────────────────────────\n');
    
    // 英語混入チェック
    const englishPatterns = [
      /\b(let me|I need|I will|count|roughly|chars?|think|first|now|should|must|can)\b/i,
      /^[A-Za-z\s]+:/m,
      /Let's|I'll|we'll/i,
      /\d+\s*chars/i
    ];
    
    const englishMatches = englishPatterns.filter(pattern => pattern.test(output));
    const hasEnglish = englishMatches.length > 0;
    
    // 結果パース
    const lines = output.split('\n');
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
    
    // 統一フォーマットチェック
    const hasUnifiedFormat = detailedSummary.split('\n').every(line => 
      !line.trim() || line.trim().startsWith('・')
    );
    
    // 品質スコア計算
    const score = summary ? checkSummaryQuality(summary, detailedSummary).score : 0;
    
    console.error('📊 分析結果');
    console.error('────────────────────────────────────────────────────────────────────────────');
    console.error(`  処理時間: ${processingTime}ms`);
    console.error(`  英語混入: ${hasEnglish ? '❌ あり' : '✅ なし'}`);
    if (hasEnglish) {
      console.error(`  検出パターン: ${englishMatches.map(p => p.toString()).join(', ')}`);
    }
    console.error(`  統一フォーマット: ${hasUnifiedFormat ? '✅ 対応' : '❌ 非対応'}`);
    console.error(`  品質スコア: ${score}点`);
    console.error(`  要約文字数: ${summary.length}文字`);
    console.error(`  タグ数: ${tags.length}個`);
    
    if (summary) {
      console.error(`\n  要約内容: ${summary.substring(0, 50)}...`);
    }
    if (tags.length > 0) {
      console.error(`  タグ: ${tags.join(', ')}`);
    }
    
    // 成功判定
    console.error('\n✨ 判定結果');
    console.error('────────────────────────────────────────────────────────────────────────────');
    
    if (!hasEnglish && hasUnifiedFormat && score >= 40 && summary.length <= 130) {
      console.error('✅ 完全日本語システムプロンプトは成功です！');
      console.error('   - 英語混入なし');
      console.error('   - 統一フォーマット対応');
      console.error('   - 適切な品質スコア');
      console.error('   - 文字数制限遵守');
    } else {
      console.error('⚠️  改善が必要な点:');
      if (hasEnglish) console.error('   - 英語が混入している');
      if (!hasUnifiedFormat) console.error('   - 統一フォーマットに非対応');
      if (score < 40) console.error(`   - 品質スコアが低い (${score}点)`);
      if (summary.length > 130) console.error(`   - 要約が長すぎる (${summary.length}文字)`);
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 実行
testJapanesePrompt().catch(console.error);