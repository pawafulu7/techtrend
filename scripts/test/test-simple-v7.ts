#!/usr/bin/env -S tsx
/**
 * 簡易版 summaryVersion 7テスト
 */

import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { parseSummary } from '../../lib/utils/summary-parser';

async function testSimpleV7() {
  console.error('========================================');
  console.error('summaryVersion 7 簡易テスト');
  console.error('========================================\n');

  // テスト記事
  const testArticle = {
    title: 'GPT-5の初期評価レポート',
    content: `
      GPT-5がリリースされ、初期評価を実施した。
      性能は既存モデルと同等だが、速度が5-10倍遅い。
      価格はGPT-4の半額で魅力的。
      ツール利用は改善されているが、モデル選択機能が廃止された。
    `
  };

  console.error('【1. 要約生成テスト】');
  const service = new UnifiedSummaryService();
  
  try {
    const result = await service.generate(
      testArticle.title,
      testArticle.content
    );

    console.error(`✅ summaryVersion: ${result.summaryVersion}`);
    console.error(`✅ 品質スコア: ${result.qualityScore}`);
    console.error(`✅ 一覧要約: ${result.summary.substring(0, 50)}...`);
    console.error();

    console.error('【2. パーサーテスト】');
    const sections = parseSummary(result.detailedSummary, { 
      summaryVersion: result.summaryVersion 
    });

    console.error(`✅ パース結果: ${sections.length}個のセクション`);
    sections.forEach((section, i) => {
      console.error(`  ${i+1}. ${section.icon} ${section.title}`);
    });
    console.error();

    console.error('【3. 詳細要約の内容】');
    console.error(result.detailedSummary);
    console.error();

    console.error('【4. 検証結果】');
    const hasFlexibleItems = sections.some(s => 
      !['主要トピック', '課題・問題点', '解決策・アプローチ', '実装・技術詳細', '効果・結果'].includes(s.title)
    );
    console.error(`✅ 柔軟な項目名: ${hasFlexibleItems ? 'あり' : 'なし（固定項目）'}`);
    console.error(`✅ バージョン: ${result.summaryVersion === 7 ? '正しい' : '誤り'}`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }

  console.error('\n========================================');
  console.error('テスト完了');
  console.error('========================================');
}

// 実行
testSimpleV7();