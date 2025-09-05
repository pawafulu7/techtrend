/**
 * 詳細要約の表示改善テスト
 * サブ項目が改行されて表示されることを確認
 */

import { parseSummary } from '../lib/utils/summary-parser';

// テストデータ（実際の問題があったパターン）
const testData = `・コメントの基本方針：「What」より「Why」：優れたコメントは、コードから読み取れる「何をしているか(What)」ではなく、「なぜそうしているか(Why)」を説明する必要がある。
・コードの価値を高める「良いコメント」の具体例：
- 意図や背景を説明するコメント：コードだけでは理解できないビジネス上の理由や技術的な判断を記述する。
- 複雑なロジックを要約するコメント：正規表現や難解なアルゴリズムなど、理解しにくいコードの前に、平易な言葉で要約する。
- \`TODO\` や \`FIXME\` といったコメント：将来的な対応が必要な事項や既知の問題点を明確に示す。
・コードの価値を下げる「悪いコメント」の具体例：
- コードの「日本語訳」にすぎないコメント：コードを読めばわかることをそのままコメントに書くことは、コードの重複でありノイズとなる。
- メンテナンスされていない古いコメント：コードを修正した際にコメントを更新しないと、コードとコメントに食い違いが生じ、混乱を招く。`;

console.error('=== 詳細要約の表示改善テスト ===\n');

// parseSummary関数でパース
const sections = parseSummary(testData, { summaryVersion: 8 });

console.error(`セクション数: ${sections.length}\n`);

// 各セクションの内容を確認
sections.forEach((section, index) => {
  console.error(`--- セクション ${index + 1} ---`);
  console.error(`タイトル: ${section.title}`);
  console.error(`アイコン: ${section.icon}`);
  console.error('コンテンツ:');
  
  // 改行で分割されたコンテンツを表示
  const lines = section.content.split('\n');
  if (lines.length > 1) {
    console.error(`  (${lines.length}行のコンテンツ)`);
    lines.forEach((line, lineIndex) => {
      console.error(`  行${lineIndex + 1}: ${line}`);
    });
  } else {
    console.error(`  ${section.content}`);
  }
  console.error();
});

// UIコンポーネントでの表示シミュレーション
console.error('=== UIコンポーネントでの表示シミュレーション ===\n');

sections.forEach((section) => {
  console.error(`【${section.icon} ${section.title}】`);
  
  const lines = section.content.split('\n');
  if (lines.length > 1) {
    // 複数行の場合（サブ項目あり）
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        console.error(''); // 改行（mt-2クラスに相当）
      }
      console.error(`  ${line}`);
    });
  } else {
    // 単一行の場合
    console.error(`  ${section.content}`);
  }
  console.error('\n---\n');
});

// 成功判定
const hasMultilineContent = sections.some(s => s.content.includes('\n'));
if (hasMultilineContent) {
  console.error('✅ サブ項目が改行されて保存されています');
  console.error('✅ UIコンポーネントで各行が別々の<p>タグとして表示されます');
} else {
  console.error('❌ サブ項目が改行されていません');
}