import { normalizeTag } from '@/lib/utils/tag-normalizer';

// テスト用のparseSummaryAndTags関数（generate-summaries.tsからコピー）
interface SummaryAndTags {
  summary: string;
  detailedSummary: string;
  tags: string[];
  articleType?: string;
}

function cleanupText(text: string): string {
  return text
    .replace(/\*\*/g, '') // マークダウン除去
    .replace(/^(本記事は、|本記事は|本稿では、|本稿では|記事では、|記事では|この記事は、|この記事は)/g, '')
    .trim();
}

function finalCleanup(text: string): string {
  if (!text) return text;
  
  // 冒頭の重複ラベル除去
  const cleanupPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/,
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/,
    /^【?\d+-\d+文字.*?】?\s*/,  // プロンプト指示の除去
    /^【?簡潔にまとめ.*?】?\s*/
  ];
  
  cleanupPatterns.forEach(pattern => {
    text = text.replace(pattern, '');
  });
  
  // 先頭の句読点を除去
  text = text.replace(/^[、。]\s*/, '');
  
  // 改行の正規化
  text = text.replace(/\n+/g, '\n').trim();
  
  // 文末に句点がない場合は追加（箇条書きの場合は除く）
  if (text && !text.includes('・') && !text.match(/[。！？]$/)) {
    text += '。';
  }
  
  return text;
}

function parseSummaryAndTags(text: string): SummaryAndTags {
  const lines = text.split('\n');
  let summary = '';
  let detailedSummary = '';
  let tags: string[] = [];
  let isDetailedSummary = false;
  let tagSectionStarted = false; // タグセクション開始フラグを追加
  
  // パターン定義
  const summaryPatterns = [
    /^(\*\*)?要約[:：]\s*(\*\*)?/,
    /^【要約】[:：]?\s*/,
    /^(\*\*)?短い要約[:：]\s*(\*\*)?/,
    /^【短い要約】[:：]?\s*/
  ];
  
  const detailedSummaryPatterns = [
    /^(\*\*)?詳細要約[:：]\s*(\*\*)?/,
    /^【詳細要約】[:：]?\s*/
  ];
  
  const promptPatterns = [
    /^\d+-\d+文字の日本語で/,
    /^簡潔にまとめ/,
    /^以下の観点で/,
    /^記事が解決する問題/,
    /^以下の要素を箇条書き/
  ];

  let summaryStarted = false;
  let detailedSummaryStarted = false;

  for (const line of lines) {
    // プロンプト指示行をスキップ
    if (promptPatterns.some(pattern => pattern.test(line))) {
      continue;
    }
    
    // summary処理
    if (!summaryStarted && summaryPatterns.some(pattern => pattern.test(line))) {
      summary = line;
      summaryPatterns.forEach(pattern => {
        summary = summary.replace(pattern, '');
      });
      summary = cleanupText(summary);
      summaryStarted = true;
      isDetailedSummary = false;
    }
    // summaryの続きの行（空行が来るまで）
    else if (summaryStarted && !detailedSummaryStarted && line.trim() && 
             !detailedSummaryPatterns.some(pattern => pattern.test(line)) && 
             !line.match(/^タグ[:：]/)) {
      summary += '\n' + cleanupText(line);
    }
    // detailedSummary処理
    else if (detailedSummaryPatterns.some(pattern => pattern.test(line))) {
      detailedSummary = line;
      detailedSummaryPatterns.forEach(pattern => {
        detailedSummary = detailedSummary.replace(pattern, '');
      });
      detailedSummary = cleanupText(detailedSummary);
      detailedSummaryStarted = true;
      isDetailedSummary = true;
    }
    // detailedSummaryの続きの行
    else if (isDetailedSummary && line.trim() && !line.match(/^タグ[:：]/)) {
      // 箇条書きの場合はそのまま追加（cleanupTextを適用しない）
      if (line.trim().startsWith('・')) {
        detailedSummary += '\n' + line.trim();
      } else {
        detailedSummary += '\n' + cleanupText(line);
      }
    }
    // タグ処理（修正版）
    else if (line.match(/^タグ[:：]/)) {
      isDetailedSummary = false;
      tagSectionStarted = true; // フラグを立てる
      
      // 同一行にタグがある場合（後方互換性）
      const tagLine = line.replace(/^タグ[:：]\s*/, '');
      if (tagLine.trim()) {
        tags = tagLine.split(/[,、，]/)
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0 && tag.length <= 30)
          .map(tag => normalizeTag(tag));
        tagSectionStarted = false;
      }
    }
    // タグが次行にある場合の処理（追加）
    else if (tagSectionStarted && line.trim() && !line.match(/^(要約|詳細要約)[:：]/)) {
      tags = line.split(/[,、，]/)
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0 && tag.length <= 30)
        .map(tag => normalizeTag(tag));
      tagSectionStarted = false;
    }
    // 空行でセクション終了
    else if (!line.trim()) {
      if (summaryStarted && !detailedSummaryStarted) {
        summaryStarted = false;
      }
      tagSectionStarted = false; // タグセクションも終了
    }
  }
  
  // 最終クリーンアップ
  summary = finalCleanup(summary);
  detailedSummary = finalCleanup(detailedSummary);
  
  // フォールバック
  if (!summary) {
    summary = text.substring(0, 150);
  }
  if (!detailedSummary) {
    detailedSummary = text.substring(0, 300);
  }

  return { summary, detailedSummary, tags };
}

// テストケース
const testCases = [
  {
    name: "新形式（タグが次行）",
    input: `要約:
TypeScriptの新機能について、型推論の改善とパフォーマンスの向上を中心に解説。

詳細要約:
以下の要素を箇条書きで記載：
・型推論アルゴリズムの最適化
・ビルド時間の短縮（約30%改善）
・新しい型ユーティリティの追加

タグ:
TypeScript, JavaScript, フロントエンド, 型システム`,
    expected: ["TypeScript", "JavaScript", "フロントエンド", "型システム"]
  },
  {
    name: "旧形式（タグが同一行）",
    input: `要約:
TypeScriptの新機能について、型推論の改善とパフォーマンスの向上を中心に解説。

詳細要約:
以下の要素を箇条書きで記載：
・型推論アルゴリズムの最適化
・ビルド時間の短縮（約30%改善）

タグ: TypeScript, JavaScript, フロントエンド`,
    expected: ["TypeScript", "JavaScript", "フロントエンド"]
  },
  {
    name: "タグがコロン（：）の場合",
    input: `要約：
記事の要約内容

タグ：
React、Next.js、Web開発`,
    expected: ["React", "Next.js", "Web開発"]
  },
  {
    name: "タグがない場合",
    input: `要約:
記事の要約内容

詳細要約:
詳細な説明`,
    expected: []
  }
];

// テスト実行
console.log('=== タグパーステストを開始 ===\n');

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`テストケース ${index + 1}: ${testCase.name}`);
  
  const result = parseSummaryAndTags(testCase.input);
  const tagsMatch = JSON.stringify(result.tags.sort()) === JSON.stringify(testCase.expected.sort());
  
  if (tagsMatch) {
    console.log('✅ 成功');
    console.log(`  期待値: ${JSON.stringify(testCase.expected)}`);
    console.log(`  実際値: ${JSON.stringify(result.tags)}`);
    passed++;
  } else {
    console.log('❌ 失敗');
    console.log(`  期待値: ${JSON.stringify(testCase.expected)}`);
    console.log(`  実際値: ${JSON.stringify(result.tags)}`);
    failed++;
  }
  
  console.log('');
});

console.log('=== テスト結果 ===');
console.log(`成功: ${passed}件`);
console.log(`失敗: ${failed}件`);
console.log(`合計: ${passed + failed}件`);

if (failed === 0) {
  console.log('\n✅ すべてのテストが成功しました！');
  process.exit(0);
} else {
  console.log('\n❌ 一部のテストが失敗しました。');
  process.exit(1);
}