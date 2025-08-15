import { parseSummary } from '../lib/utils/summary-parser';

// 問題があった実際のデータを簡略化したもの
const problematicSummary = `・コメントの基本方針：「What」より「Why」：優れたコメントは、コードから読み取れる
・コードの価値を高める「良いコメント」の具体例：
- 意図や背景を説明するコメント：コードだけでは理解できない
- 複雑なロジックを要約するコメント：難解なアルゴリズムを説明
・コードの価値を下げる「悪いコメント」の具体例：
- コードの「日本語訳」にすぎないコメント：読めばわかることを書く
- メンテナンスされていない古いコメント：コードと食い違いが生じる`;

console.log('=== 修正後の動作確認 ===\n');

const sections = parseSummary(problematicSummary, { summaryVersion: 8 });

console.log(`セクション数: ${sections.length}`);
console.log('\nセクション一覧:');
sections.forEach((section, index) => {
  console.log(`${index + 1}. ${section.title}`);
  if (section.content.includes('\n')) {
    console.log('   (サブ項目を含む)');
  }
});

// 詳細セクションのチェック
const detailSections = sections.filter(s => s.title === '詳細');
console.log(`\n「詳細」セクション数: ${detailSections.length}`);

if (detailSections.length === 0) {
  console.log('✅ 修正成功: 「詳細」セクションが適切に処理されています');
} else {
  console.log('❌ 問題が残っています');
}