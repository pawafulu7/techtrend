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
  /^-\s*[0-9０-９]+(?:\s*[-〜~～]\s*[0-9０-９]+)?\s*文字(?:以上)?(?:の記事)?[:：]?/,  // 範囲形式対応（全角数字・チルダ・スペース含む）

  // 新規追加パターン（プロンプト混入問題対応）
  /^【文末】/,
  /^-\s*冗長な表現/,
  /^-\s*技術用語は略称/,
  /^【システム指示】/,
  /^【指示】/,

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
];
