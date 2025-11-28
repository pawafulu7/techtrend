#!/usr/bin/env -S tsx
/**
 * 短いコンテンツでの要約生成テスト
 */

import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

async function testShortContent() {
  const summaryService = new UnifiedSummaryService();
  
  // テストケース
  const testCases = [
    {
      title: "小規模オープンソースプロジェクトの商標が250億円超を調達したベンチャーに取り消されてしまう",
      content: "小規模OSSプロジェクト「Deepkit」のEU商標が、250億円超調達ベンチャー「Deepki」の訴えにより取り消された。Hacker Newsへの投稿で明らかになったこの事件は、資金力のある企業による商標権濫用の懸念を呼び起こしている。",
      contentLength: 206
    },
    {
      title: "Chart.js完全ガイド：実務で使える構造とTips",
      content: "Chart.jsは強力なJavaScriptチャートライブラリです。この記事では、実務で活用するための基本的な使い方から、カスタマイズ方法、パフォーマンス最適化のテクニックまでを解説します。レスポンシブデザインへの対応やアニメーション設定、データの動的更新など、プロダクション環境で必要となる実装パターンを豊富なコード例とともに紹介。",
      contentLength: 300
    },
    {
      title: "TypeScript 5.3の新機能",
      content: "TypeScript 5.3では、import attributesのサポート、switch文での型絞り込みの改善、Boolean型の型絞り込み機能が追加されました。",
      contentLength: 150
    }
  ];
  
  console.error('===================================');
  console.error('短いコンテンツの要約生成テスト');
  console.error('===================================\n');
  
  for (const testCase of testCases) {
    console.error(`\n📝 テストケース: ${testCase.title}`);
    console.error(`   コンテンツ長: ${testCase.contentLength}文字`);
    console.error('-----------------------------------');
    
    try {
      const result = await summaryService.generate(
        testCase.title,
        testCase.content,
        {
          maxRetries: 1,
          retryDelay: 3000,
          minQualityScore: 50
        }
      );
      
      console.error('\n✅ 生成成功');
      console.error('\n【一覧要約】(' + result.summary.length + '文字)');
      console.error(result.summary);
      
      console.error('\n【詳細要約】(' + result.detailedSummary.length + '文字)');
      if (result.detailedSummary === '__SKIP_DETAILED_SUMMARY__') {
        console.error('(スキップされました)');
      } else {
        console.error(result.detailedSummary);
      }
      
      console.error('\n【タグ】');
      console.error(result.tags.join(', '));
      
      console.error('\n【メタデータ】');
      console.error(`品質スコア: ${result.qualityScore}`);
      console.error(`要約バージョン: ${result.summaryVersion}`);
      
      // バランスチェック
      if (result.detailedSummary !== '__SKIP_DETAILED_SUMMARY__') {
        const summaryLen = result.summary.length;
        const detailedLen = result.detailedSummary.length;
        const ratio = detailedLen / summaryLen;
        
        console.error('\n【バランス分析】');
        console.error(`一覧要約/詳細要約 比率: 1:${ratio.toFixed(1)}`);
        if (ratio < 1.5) {
          console.error('⚠️ 詳細要約が短すぎる可能性があります');
        } else if (ratio > 5) {
          console.error('⚠️ 詳細要約が長すぎる可能性があります'); 
        } else {
          console.error('✅ バランスは適切です');
        }
      }
      
    } catch (error) {
      console.error('❌ エラー:', error instanceof Error ? error.message : error);
    }
    
    // API制限を考慮
    console.error('\n⏸ 5秒待機中...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.error('\n===================================');
  console.error('テスト完了');
  console.error('===================================');
}

testShortContent().catch(console.error);