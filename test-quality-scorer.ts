#!/usr/bin/env node

/**
 * 品質スコアリングシステムのテスト
 */

import { calculateSummaryScore, calculateAverageScore, needsRegeneration } from './lib/utils/quality-scorer';

console.log('🧪 品質スコアリングシステムのテスト\n');
console.log('='.repeat(60));

// テストケース定義
const testCases = [
  {
    name: '正常な要約',
    summary: 'ReactとTypeScriptを用いたカスタムフックの実装方法を解説し、状態管理の複雑さを軽減する実践的なアプローチを提供する。',
    tags: ['React', 'TypeScript', 'カスタムフック'],
    expected: { minScore: 80, maxScore: 100 },
  },
  {
    name: '途切れた要約（Kratix CL。）',
    summary: 'Kratixは、プラットフォームチームがセルフサービス型のインフラストラクチャを構築するためのフレームワークで、KubernetesのCRDを活用してリソースをKratix CL。',
    tags: ['Kubernetes', 'Infrastructure'],
    expected: { minScore: 0, maxScore: 40 },
  },
  {
    name: '短すぎる要約',
    summary: 'Reactの新機能を紹介。',
    tags: ['React'],
    expected: { minScore: 0, maxScore: 50 },
  },
  {
    name: 'ラベル付き要約',
    summary: '要約: ReactとTypeScriptを組み合わせた開発手法について解説。',
    tags: ['React', 'TypeScript'],
    expected: { minScore: 50, maxScore: 80 },
  },
  {
    name: '汎用的な文言を含む要約',
    summary: 'この記事では、Reactの基本的な使い方を説明し、記事内のコード例を参照してください。',
    tags: ['React'],
    expected: { minScore: 30, maxScore: 60 },
  },
  {
    name: '改行を含む要約',
    summary: 'Reactの新機能について\n詳しく解説します。',
    tags: ['React'],
    expected: { minScore: 40, maxScore: 70 },
  },
  {
    name: '長すぎる要約',
    summary: 'ReactとTypeScriptを組み合わせた開発において、カスタムフックを活用することで状態管理の複雑さを大幅に軽減できる。本記事では、実践的なカスタムフックの実装パターンを複数紹介し、それぞれのユースケースと実装方法を詳細に解説する。また、パフォーマンス最適化のテクニックやテスト方法についても言及する。',
    tags: ['React', 'TypeScript', 'カスタムフック'],
    expected: { minScore: 60, maxScore: 85 },
  },
];

// 詳細要約のテストケース
const detailedTestCases = [
  {
    name: '正常な詳細要約',
    summary: `・記事の主題は、ReactとTypeScriptを用いたカスタムフックの実装パターンと、その活用による状態管理の簡素化手法。
・具体的な問題は、複雑な状態管理ロジックがコンポーネントに混在し、再利用性とテスタビリティが低下すること。
・提示されている解決策は、ビジネスロジックをカスタムフックに切り出し、コンポーネントから分離する設計パターン。
・実装方法の詳細については、useCounter、useFetch、useLocalStorageなど実践的な例を通じて段階的に解説。
・期待される効果は、コードの再利用性向上、テストの容易化、保守性の改善。
・実装時の注意点は、フックのルールの遵守、適切な依存配列の管理、メモ化の活用。`,
    tags: ['React', 'TypeScript', 'カスタムフック'],
    isDetailed: true,
    expected: { minScore: 85, maxScore: 100 },
  },
  {
    name: '箇条書きのない詳細要約',
    summary: '詳細な内容について説明します。ReactとTypeScriptの組み合わせは強力です。状態管理が簡単になります。',
    tags: ['React', 'TypeScript'],
    isDetailed: true,
    expected: { minScore: 20, maxScore: 50 },
  },
];

// 各テストケースを実行
console.log('\n📝 個別テストケース\n');

for (const testCase of testCases) {
  const score = calculateSummaryScore(testCase.summary, { 
    tags: testCase.tags,
    targetLength: 120,
  });
  
  const passed = score.totalScore >= testCase.expected.minScore && 
                 score.totalScore <= testCase.expected.maxScore;
  
  console.log(`${passed ? '✅' : '❌'} ${testCase.name}`);
  console.log(`   スコア: ${score.totalScore}点 (期待値: ${testCase.expected.minScore}-${testCase.expected.maxScore}点)`);
  
  if (score.issues.length > 0) {
    console.log(`   問題: ${score.issues.join(', ')}`);
  }
  
  console.log(`   再生成必要: ${needsRegeneration(score) ? 'はい' : 'いいえ'}`);
  console.log(`   内訳: 完全性=${score.breakdown.completeness}, 長さ=${score.breakdown.length}, 構造=${score.breakdown.structure}, キーワード=${score.breakdown.keywords}, 明確性=${score.breakdown.clarity}`);
  console.log('');
}

// 詳細要約のテスト
console.log('\n📝 詳細要約テストケース\n');

for (const testCase of detailedTestCases) {
  const score = calculateSummaryScore(testCase.summary, { 
    tags: testCase.tags,
    isDetailed: testCase.isDetailed,
  });
  
  const passed = score.totalScore >= testCase.expected.minScore && 
                 score.totalScore <= testCase.expected.maxScore;
  
  console.log(`${passed ? '✅' : '❌'} ${testCase.name}`);
  console.log(`   スコア: ${score.totalScore}点 (期待値: ${testCase.expected.minScore}-${testCase.expected.maxScore}点)`);
  
  if (score.issues.length > 0) {
    console.log(`   問題: ${score.issues.join(', ')}`);
  }
  
  console.log(`   推奨事項: ${score.recommendation}`);
  console.log('');
}

// 平均スコアのテスト
console.log('\n📊 平均スコア計算テスト\n');

const allSummaries = [
  ...testCases.map(tc => ({ summary: tc.summary, tags: tc.tags })),
  ...detailedTestCases.map(tc => ({ summary: tc.summary, tags: tc.tags, isDetailed: tc.isDetailed })),
];

const averageResult = calculateAverageScore(allSummaries);

console.log(`平均スコア: ${averageResult.averageScore}点`);
console.log('\n品質分布:');
console.log(`  優秀 (90点以上): ${averageResult.distribution.excellent}件`);
console.log(`  良好 (70-89点): ${averageResult.distribution.good}件`);
console.log(`  可 (50-69点): ${averageResult.distribution.fair}件`);
console.log(`  不良 (50点未満): ${averageResult.distribution.poor}件`);
console.log('\n頻出する問題:');
averageResult.totalIssues.slice(0, 5).forEach(issue => {
  console.log(`  - ${issue}`);
});

console.log('\n' + '='.repeat(60));
console.log('✅ テスト完了\n');