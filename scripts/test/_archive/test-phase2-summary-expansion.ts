#!/usr/bin/env -S tsx
/**
 * Phase 2 テストスクリプト - 一覧要約の文字数拡張機能
 * 
 * 目的:
 * - expandSummaryIfNeeded関数の動作確認
 * - 統合テストによる文字数適合率の測定
 * - 品質スコアの維持確認
 */

import { PrismaClient } from '@prisma/client';
import { 
  checkSummaryQuality,
  expandSummaryIfNeeded,
  calculateQualityStats,
  generateQualityReport,
  type QualityCheckResult
} from '@/lib/utils/summary-quality-checker';

const prisma = new PrismaClient();

// テスト用の記事データ
const TEST_ARTICLES = [
  {
    title: "Next.js 14の新機能とApp Routerの改善点",
    content: "Next.js 14では、App Routerのパフォーマンスが大幅に改善されました。特にサーバーコンポーネントのレンダリング速度が向上し、初期表示が高速化されています。",
    previousSummary: "Next.js 14ではApp Routerのパフォーマンスが大幅に改善され、サーバーコンポーネントのレンダリング速度向上により初期表示が高速化", // 124文字
    expectedLength: 150
  },
  {
    title: "TypeScriptの型推論とGenericsの活用方法",
    content: "TypeScriptの型推論機能を最大限に活用することで、より安全で保守性の高いコードを書くことができます。Genericsを使用することで、再利用可能な型安全なコンポーネントを作成できます。",
    previousSummary: "TypeScriptの型推論機能を最大限に活用することで、より安全で保守性の高いコードを実現できる。Genericsを使用した再利用可能な型安全なコンポーネントの作成方法について解説", // 162文字（適正）
    expectedLength: 150
  },
  {
    title: "GitHub ActionsでCI/CDパイプラインを構築",
    content: "GitHub Actionsを使用してCI/CDパイプラインを構築する方法を解説。自動テストとデプロイメントを実現します。",
    previousSummary: "GitHub ActionsでCI/CDパイプラインを構築する方法", // 58文字（大幅不足）
    expectedLength: 150
  },
  {
    title: "Rustのメモリ管理と所有権システムの理解",
    content: "Rustの所有権システムは、メモリ安全性を保証する革新的な機能です。借用チェッカーにより、データ競合やメモリリークを防ぎます。",
    previousSummary: "Rustの所有権システムはメモリ安全性を保証する革新的な機能で、借用チェッカーによりデータ競合やメモリリークを防ぐ仕組みについて詳しく解説", // 146文字（やや不足）
    expectedLength: 150
  },
  {
    title: "TensorFlow Liteでエッジデバイス向けAIモデルを最適化",
    content: "TensorFlow Liteを使用して、モバイルデバイスやIoTデバイス向けにAIモデルを最適化する方法を解説。量子化とプルーニングにより、モデルサイズを削減しながら推論速度を向上させます。",
    previousSummary: "TensorFlow Liteを使用してモバイルデバイスやIoTデバイス向けにAIモデルを最適化する方法を解説。量子化とプルーニングによりモデルサイズを削減しながら推論速度を向上させる手法を紹介", // 179文字（適正）
    expectedLength: 150
  }
];

// 詳細要約のテンプレート（テスト用）
const DETAILED_SUMMARY_TEMPLATE = `・主題と背景: 技術記事の主要テーマと技術的文脈について、現在の技術トレンドとの関連性を含めて説明する内容となっている
・核心的内容: 記事の最重要情報や発見について、具体的なデータや実装例を交えながら詳しく解説している部分である
・具体的詳細: 実装方法や手順について、コード例やコマンドラインの操作を含めた実践的な内容を提供している
・価値と効果: この技術を導入することによるメリットや改善効果について、具体的な数値や事例を用いて説明している
・補足情報: 実装時の制約や注意点について、エラー対処法やベストプラクティスを含めて詳しく記載している`;

/**
 * 単体テスト: expandSummaryIfNeeded関数
 */
async function testExpandSummaryFunction(): Promise<void> {
  console.error('\n=== 単体テスト: expandSummaryIfNeeded関数 ===\n');
  
  const testCases = [
    { input: "短い要約", expected: 150, description: "極端に短い要約" },
    { input: "これは58文字の要約です。GitHub ActionsでCI/CDパイプラインを構築する方法", expected: 150, description: "58文字の要約" },
    { input: "これは146文字の要約です。Rustの所有権システムはメモリ安全性を保証する革新的な機能で、借用チェッカーによりデータ競合やメモリリークを防ぐ仕組みについて詳しく解説", expected: 150, description: "146文字の要約" },
    { input: "これは既に150文字以上ある要約です。TypeScriptの型推論機能を最大限に活用することで、より安全で保守性の高いコードを実現できる。Genericsを使用した再利用可能な型安全なコンポーネントの作成方法", expected: 150, description: "既に150文字以上" }
  ];
  
  console.error('テストケース数:', testCases.length);
  let passedCount = 0;
  
  for (const testCase of testCases) {
    const result = expandSummaryIfNeeded(testCase.input, '');
    const passed = result.length >= testCase.expected;
    
    console.error(`\n[${testCase.description}]`);
    console.error(`  入力: ${testCase.input.length}文字`);
    console.error(`  出力: ${result.length}文字`);
    console.error(`  判定: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    if (testCase.input !== result) {
      console.error(`  拡張内容: "${result.substring(testCase.input.replace(/。$/, '').length)}"`);
    }
    
    if (passed) passedCount++;
  }
  
  console.error(`\n結果: ${passedCount}/${testCases.length} テスト成功`);
}

/**
 * 統合テスト: 実際の要約生成フロー
 */
async function testIntegrationFlow(): Promise<void> {
  console.error('\n=== 統合テスト: 要約生成フロー ===\n');
  
  const results: QualityCheckResult[] = [];
  const lengthStats = {
    before: { under150: 0, appropriate: 0, over180: 0 },
    after: { under150: 0, appropriate: 0, over180: 0 }
  };
  
  for (let i = 0; i < TEST_ARTICLES.length; i++) {
    const article = TEST_ARTICLES[i];
    console.error(`\nテスト ${i + 1}: ${article.title}`);
    console.error('-'.repeat(60));
    
    // Phase 2前（元の要約）
    const beforeLength = article.previousSummary.length;
    console.error(`Phase 2前: ${beforeLength}文字`);
    
    // Phase 2後（拡張処理適用）
    const expandedSummary = expandSummaryIfNeeded(article.previousSummary, article.title);
    const afterLength = expandedSummary.length;
    console.error(`Phase 2後: ${afterLength}文字`);
    
    // 文字数統計
    if (beforeLength < 150) lengthStats.before.under150++;
    else if (beforeLength > 180) lengthStats.before.over180++;
    else lengthStats.before.appropriate++;
    
    if (afterLength < 150) lengthStats.after.under150++;
    else if (afterLength > 180) lengthStats.after.over180++;
    else lengthStats.after.appropriate++;
    
    // 品質チェック
    const qualityCheck = checkSummaryQuality(expandedSummary, DETAILED_SUMMARY_TEMPLATE);
    results.push(qualityCheck);
    
    console.error(`品質スコア: ${qualityCheck.score}/100`);
    console.error(`判定: ${qualityCheck.isValid ? '✅ 合格' : '❌ 不合格'}`);
    
    if (qualityCheck.issues.length > 0) {
      console.error('問題点:');
      qualityCheck.issues.forEach(issue => {
        console.error(`  - [${issue.severity}] ${issue.message}`);
      });
    }
    
    if (beforeLength !== afterLength) {
      console.error(`拡張内容: "${expandedSummary.substring(article.previousSummary.replace(/。$/, '').length)}"`);
    }
  }
  
  // 統計情報の表示
  console.error('\n=== 文字数適合率の比較 ===\n');
  console.error('Phase 2前:');
  console.error(`  150文字未満: ${lengthStats.before.under150}件`);
  console.error(`  適正(150-180): ${lengthStats.before.appropriate}件`);
  console.error(`  180文字超過: ${lengthStats.before.over180}件`);
  console.error(`  適合率: ${(lengthStats.before.appropriate / TEST_ARTICLES.length * 100).toFixed(0)}%`);
  
  console.error('\nPhase 2後:');
  console.error(`  150文字未満: ${lengthStats.after.under150}件`);
  console.error(`  適正(150-180): ${lengthStats.after.appropriate}件`);
  console.error(`  180文字超過: ${lengthStats.after.over180}件`);
  console.error(`  適合率: ${(lengthStats.after.appropriate / TEST_ARTICLES.length * 100).toFixed(0)}%`);
  
  // 品質統計
  const stats = calculateQualityStats(results);
  console.error('\n=== 品質統計 ===\n');
  console.error(`平均スコア: ${stats.averageScore}/100`);
  console.error(`合格数: ${stats.validCount}/${results.length}`);
  console.error(`Critical問題: ${stats.criticalIssuesCount}件`);
  console.error(`Major問題: ${stats.majorIssuesCount}件`);
  console.error(`Minor問題: ${stats.minorIssuesCount}件`);
  console.error(`再生成率: ${stats.regenerationRate}%`);
}

/**
 * パフォーマンステスト
 */
async function testPerformance(): Promise<void> {
  console.error('\n=== パフォーマンステスト ===\n');
  
  const iterations = 1000;
  const testSummary = "短い要約テキスト";
  
  const startTime = Date.now();
  for (let i = 0; i < iterations; i++) {
    expandSummaryIfNeeded(testSummary, 'テストタイトル');
  }
  const endTime = Date.now();
  
  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;
  
  console.error(`実行回数: ${iterations}回`);
  console.error(`総実行時間: ${totalTime}ms`);
  console.error(`平均実行時間: ${avgTime.toFixed(3)}ms/回`);
  console.error(`判定: ${avgTime < 1 ? '✅ 高速（1ms未満）' : '⚠️ 要最適化'}`);
}

/**
 * メイン実行関数
 */
async function main(): Promise<void> {
  console.error('====================================');
  console.error('  Phase 2 テスト - 要約文字数拡張  ');
  console.error('====================================');
  console.error(`実行日時: ${new Date().toISOString()}`);
  
  try {
    // 1. 単体テスト
    await testExpandSummaryFunction();
    
    // 2. 統合テスト
    await testIntegrationFlow();
    
    // 3. パフォーマンステスト
    await testPerformance();
    
    console.error('\n====================================');
    console.error('         テスト完了                 ');
    console.error('====================================');
    
  } catch (error) {
    console.error('\n❌ テスト実行中にエラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行

