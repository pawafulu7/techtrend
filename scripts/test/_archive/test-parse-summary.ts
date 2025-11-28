import { parseSummary } from '../../lib/utils/summary-parser';

const detailedSummary = `・コメントの基本方針：「What」より「Why」：優れたコメントは、コードから読み取れる「何をしているか(What)」ではなく、「なぜそうしているか(Why)」を説明する必要がある。ビジネス上の背景や技術的な意図を記述することで、コードの理解度を高め、保守性を向上させる。例として、新規ユーザーの強制リダイレクト処理における背景説明が挙げられている。
・コードの価値を高める「良いコメント」の具体例：
- 意図や背景を説明するコメント：コードだけでは理解できないビジネス上の理由や技術的な判断を記述する。例として、GitHub経由の新規ユーザーの電話番号未入力状態への対応が挙げられている。これにより、他の開発者や将来の自分が仕様を理解しやすくなる。
- 複雑なロジックを要約するコメント：正規表現や難解なアルゴリズムなど、理解しにくいコードの前に、平易な言葉で要約する。例として、全角カタカナ、半角カタカナ、長音符のみを許可する正規表現の解説が挙げられている。
- \`TODO\` や \`FIXME\` といったコメント：将来的な対応が必要な事項や既知の問題点を明確に示す。\`TODO\`は今後の機能追加やリファクタリング、\`FIXME\`は修正が必要な箇所を示す。例として、N+1問題の最適化や外部APIのタイムアウト処理への対応が挙げられている。
・コードの価値を下げる「悪いコメント」の具体例：
- コードの「日本語訳」にすぎないコメント：コードを読めばわかることをそのままコメントに書くことは、コードの重複でありノイズとなる。例として、「iを1増やす」というコメントが挙げられている。
- メンテナンスされていない古いコメント：コードを修正した際にコメントを更新しないと、コードとコメントに食い違いが生じ、混乱を招く。間違ったコメントは、コメントがないよりも有害である。
- コメントアウトされたコードの残骸：Gitなどのバージョン管理システムを使用している場合は、不要になったコードはコメントアウトせず、削除するべきである。過去のコードはGitの履歴で管理できる。`;

console.error('=== Testing parseSummary with summaryVersion 8 ===\n');

const sections = parseSummary(detailedSummary, { summaryVersion: 8 });

console.error(`Total sections found: ${sections.length}\n`);

sections.forEach((section, index) => {
  console.error(`Section ${index + 1}:`);
  console.error(`  Title: ${section.title}`);
  console.error(`  Icon: ${section.icon}`);
  console.error(`  Content: ${section.content.substring(0, 100)}${section.content.length > 100 ? '...' : ''}`);
  console.error();
});

// 問題の分析
console.error('=== Analysis ===');
const detailSections = sections.filter(s => s.title === '詳細');
console.error(`Number of "詳細" sections: ${detailSections.length}`);
if (detailSections.length > 0) {
  console.error('\n"詳細" sections content:');
  detailSections.forEach((section, index) => {
    console.error(`  ${index + 1}. ${section.content}`);
  });
}