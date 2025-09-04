import { checkContentQuality, fixSummary } from '@/lib/utils/content-quality-checker';

console.error('====================================');
console.error('品質チェック統合機能テスト');
console.error('====================================\n');

// テストケース1: 短すぎる要約
const shortSummary = 'Dockerの使い方';
console.error('=== テスト1: 短すぎる要約 ===');
const result1 = checkContentQuality(shortSummary);
console.error(`入力: "${shortSummary}"`);
console.error(`スコア: ${result1.score}/100`);
console.error(`問題: ${result1.issues.map(i => i.type).join(', ')}`);
console.error(`再生成必要: ${result1.requiresRegeneration}`);

// テストケース2: 途切れた要約
const truncatedSummary = 'Dockerコンテナの設定方法について、';
console.error('\n=== テスト2: 途切れた要約 ===');
const result2 = checkContentQuality(truncatedSummary);
console.error(`入力: "${truncatedSummary}"`);
console.error(`スコア: ${result2.score}/100`);
console.error(`問題: ${result2.issues.map(i => i.type).join(', ')}`);
const fixed2 = fixSummary(truncatedSummary, result2.issues);
console.error(`修正後: "${fixed2}"`);

// テストケース3: 英語混入
const englishMixedSummary = 'This システムは高速に動作し、パフォーマンスが向上。';
console.error('\n=== テスト3: 英語混入 ===');
const result3 = checkContentQuality(englishMixedSummary);
console.error(`入力: "${englishMixedSummary}"`);
console.error(`スコア: ${result3.score}/100`);
console.error(`問題: ${result3.issues.map(i => i.type).join(', ')}`);
const fixed3 = fixSummary(englishMixedSummary, result3.issues);
console.error(`修正後: "${fixed3}"`);

// テストケース4: 理想的な要約
const goodSummary = 'DockerとKubernetesを使用したマイクロサービスアーキテクチャの構築方法を解説。CI/CDパイプラインの実装例も紹介。';
console.error('\n=== テスト4: 理想的な要約 ===');
const result4 = checkContentQuality(goodSummary);
console.error(`入力: "${goodSummary}"`);
console.error(`スコア: ${result4.score}/100`);
console.error(`問題数: ${result4.issues.length}`);
console.error(`再生成必要: ${result4.requiresRegeneration}`);

// テストケース5: 長すぎる要約
const longSummary = 'この記事では、DockerとKubernetesを使用したマイクロサービスアーキテクチャの構築方法について詳細に解説します。具体的には、コンテナ化の基本概念から始まり、実際のデプロイメント手順までを網羅的に説明。';
console.error('\n=== テスト5: 長すぎる要約 ===');
const result5 = checkContentQuality(longSummary);
console.error(`入力文字数: ${longSummary.length}文字`);
console.error(`スコア: ${result5.score}/100`);
const fixed5 = fixSummary(longSummary, result5.issues);
console.error(`修正後文字数: ${fixed5.length}文字`);
console.error(`修正後: "${fixed5}"`);

// 統計サマリー
console.error('\n====================================');
console.error('テスト結果サマリー');
console.error('====================================');
const scores = [result1.score, result2.score, result3.score, result4.score, result5.score];
const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
console.error(`平均スコア: ${avgScore.toFixed(1)}/100`);
console.error(`再生成必要: ${[result1, result2, result3, result4, result5].filter(r => r.requiresRegeneration).length}/5件`);
console.error(`自動修正可能: ${[result1, result2, result3, result4, result5].filter(r => !r.requiresRegeneration && r.issues.length > 0).length}/5件`);

// 環境変数の確認
console.error('\n=== 環境変数設定 ===');
console.error(`QUALITY_CHECK_ENABLED: ${process.env.QUALITY_CHECK_ENABLED}`);
console.error(`QUALITY_MIN_SCORE: ${process.env.QUALITY_MIN_SCORE}`);
console.error(`QUALITY_AUTO_FIX: ${process.env.QUALITY_AUTO_FIX}`);

