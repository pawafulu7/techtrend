/**
 * AI要約システムの共有定数
 *
 * parseUnifiedResponse（生成時）とfix-summary-format.ts（修正時）で共有
 */

// プロンプト行を検出する正規表現パターン
export const INSTRUCTION_PATTERNS = [
  // 既存パターン
  /^-\s*記事の核心的な内容/,
  /^【条件】/,
  /^【書き方】/,
  /^【重要/,
  /^-\s*技術的価値を/,
  /^ここに.*書く/,
  /^- \d+文字以上の記事/,
  /^-\s*[0-9０-９]+(?:\s*[-〜~～]\s*[0-9０-９]+)?\s*文字.*の記事.*(?:作成|必ず|以上|以内)/,  // 範囲形式対応（「の記事」+指示語で誤検知防止）

  // 新規追加パターン（プロンプト混入問題対応）
  /^【文末】/,
  /^-\s*冗長な表現/,
  /^-\s*技術用語は略称/,
  /^【システム指示】/,
  /^【指示】/,

  // プロンプト指示文混入問題対応（2025-11-24追加 + CodexMCP推奨）
  // 基本パターン
  /^【形式】/,
  /^\s*【形式】[:：]/,          // コロン付き、先頭空白対応
  /^【出力形式】/,
  /^【項目数の必須要件】/,
  /^【各項目の必須要件】/,
  /^【指針】/,
  /^【推奨】/,
  /^【注意事項】/,               // 「【注意】」を限定（誤検出防止）
  /^【注意点】/,

  // 番号付きパターン
  /^\d+\.\s*【/,                // 「1. 【形式】」等

  // 箇条書き先頭記号（先頭空白対応）
  /^\s*[・\-●\*]\s*【/,        // 「  ・【形式】」「- 【条件】」等

  // 汎用パターン
  /^【.*】$/,           // 任意の【】記号のみの行
  /^-\s*.*→.*/,        // 略称指示パターン (例: JavaScript→JS)
  /^\[ここに.*\]/,     // テンプレート指示 (例: [ここに要約を出力])
  /^-\s*文字数[:：]/,  // 文字数指示

  // 再発防止パターン（2025-10-07追加）
  /^【記事文字数要件】/,
  /^INTERNAL METADATA/,
  /^Article content length:/,
  /^Summary requirements:/,
  /^IMPORTANT: The above metadata/,
  /DO NOT OUTPUT/,  // 部分一致（行頭以外でも検出）
];

// カテゴリ的なラベル（削除対象）
export const CATEGORY_LABELS = [
  '技術概要',
  '詳細',
  '背景',
  '概要',
  '実装',
  '効果',
  '結果',
  '考察',
  '展望',
  '課題',
  '問題',
  '解決策',
  '方法',
  '手順',
  '注意点',
];

// タイトル判定のしきい値
export const TITLE_CHAR_THRESHOLD = 60;

// 文末記号（句点が不要な記号）
export const SENTENCE_MARKERS = /[。．！？]/;

// プロンプト汚染検出用の検索文字列
// Prismaのcontains検索で使用する部分文字列のリスト
// INSTRUCTION_PATTERNSと同期して保守すること
export const CONTAMINATION_SEARCH_TERMS = [
  '【条件】',
  '【書き方】',
  '【文末】',
  '【システム指示】',
  '【指示】',
  '- 記事の核心的な',
  '- 技術的価値を',
  '- 冗長な表現',
  '- 技術用語は略称',
  '[ここに',
  '- 文字数',

  // 再発防止用（2025-10-07追加）
  '【記事文字数要件】',
  'INTERNAL METADATA',
  'DO NOT OUTPUT',
  'Article content length:',
  'Summary requirements:',
  'IMPORTANT: The above metadata',

  // 範囲形式パターン（2025-10-16追加）
  '文字の記事',
  '文字以上',

  // プロンプト指示文混入問題対応（2025-11-24追加）
  '【形式】',
  '【出力形式】',
  '【項目数の必須要件】',
  '【各項目の必須要件】',
  '【指針】',
  '【推奨】',
  '【注意事項】',
  '【注意点】',
];

/**
 * コンテンツ長に基づく項目数ルール
 * prompt-builder.ts と quality-checker.ts で共有
 * 変更時は両ファイルの整合性を保つこと
 */
export interface ItemCountRule {
  minLength: number;      // このルールが適用されるコンテンツ長の下限
  minItems: number;       // 最小項目数
  maxItems: number;       // 最大項目数
  recommendedItems: string; // 推奨表示用文字列
}

// コンテンツ長の降順でソート（大きいものから評価）
export const ITEM_COUNT_RULES: ItemCountRule[] = [
  { minLength: 10000, minItems: 7, maxItems: 9, recommendedItems: '7-9' },
  { minLength: 5000,  minItems: 5, maxItems: 7, recommendedItems: '5-7' },
  { minLength: 3000,  minItems: 4, maxItems: 5, recommendedItems: '4-5' },
  { minLength: 1000,  minItems: 3, maxItems: 4, recommendedItems: '3-4' },
  { minLength: 400,   minItems: 2, maxItems: 3, recommendedItems: '2-3' },
  { minLength: 0,     minItems: 0, maxItems: 0, recommendedItems: '0' }, // 短文は箇条書き不要
];

/**
 * コンテンツ長から適用されるルールを取得
 */
export function getItemCountRule(contentLength: number): ItemCountRule {
  for (const rule of ITEM_COUNT_RULES) {
    if (contentLength >= rule.minLength) {
      return rule;
    }
  }
  return ITEM_COUNT_RULES[ITEM_COUNT_RULES.length - 1];
}
