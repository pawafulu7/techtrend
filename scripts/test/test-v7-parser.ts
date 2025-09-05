#!/usr/bin/env -S tsx
/**
 * summaryVersion 7のパーサーテストスクリプト
 */

import { parseSummary } from '../../lib/utils/summary-parser';

// テスト用の詳細要約（summaryVersion 7形式）
const testSummary = `・性能評価：ベンチマーク結果ではGPT-5は既存トップモデルと同等の精度を示し、劇的な性能向上は確認されなかった
・ツール利用：複雑なツールの利用に積極的で、より強力なエージェント構築を容易にする可能性を秘める一方、使用するツールの再検討が必要となる
・速度：デフォルト設定では速度が5～10倍低下しており、\`reasoning_effort\`と\`verbosity\`パラメータの調整が重要
・モデル制御：モデル選択機能の廃止により、自然言語とパラメータ調整による制御が必要となり、OpenAIによる新たなプロンプトガイドが公開された
・価格とトークン消費：GPT-4より価格が半額と魅力的だが、トークン消費は10～20%増加`;

// ハイフン形式のテスト
const testSummaryWithHyphen = `- 性能評価：ベンチマーク結果では同等の精度
- ツール利用：複雑なツールの利用に積極的
- 速度：5～10倍低下`;

console.error('========================================');
console.error('summaryVersion 7 パーサーテスト');
console.error('========================================\n');

console.error('【テスト1: 中黒（・）形式】');
const sections1 = parseSummary(testSummary, { summaryVersion: 7 });
console.error(`パース結果: ${sections1.length}個のセクション\n`);
sections1.forEach((section, index) => {
  console.error(`セクション${index + 1}:`);
  console.error(`  タイトル: ${section.title}`);
  console.error(`  アイコン: ${section.icon}`);
  console.error(`  内容: ${section.content.substring(0, 50)}...`);
  console.error();
});

console.error('【テスト2: ハイフン（-）形式】');
const sections2 = parseSummary(testSummaryWithHyphen, { summaryVersion: 7 });
console.error(`パース結果: ${sections2.length}個のセクション\n`);
sections2.forEach((section, index) => {
  console.error(`セクション${index + 1}:`);
  console.error(`  タイトル: ${section.title}`);
  console.error(`  アイコン: ${section.icon}`);
  console.error(`  内容: ${section.content}`);
  console.error();
});

console.error('【テスト3: 旧形式（summaryVersion 6）との比較】');
const oldSummary = `・核心：GPT-5の初期評価と、その性能、利点、欠点の分析
・背景：GPT-5のリリースと、既存モデルとの比較、更なる性能向上への期待
・解決策：既存モデルの改善、ツール利用の向上、プロンプトエンジニアリングの活用`;

const sections3 = parseSummary(oldSummary, { summaryVersion: 5, articleType: 'unified' });
console.error(`旧形式パース結果: ${sections3.length}個のセクション`);
sections3.forEach((section, index) => {
  console.error(`  ${index + 1}. ${section.title}: ${section.content.substring(0, 30)}...`);
});

console.error('\n========================================');
console.error('テスト完了');
console.error('========================================');