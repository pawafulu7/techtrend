/**
 * AI要約システムの共有定数
 *
 * parseUnifiedResponse（生成時）とfix-summary-format.ts（修正時）で共有
 */

// プロンプト行を検出する正規表現パターン
export const INSTRUCTION_PATTERNS = [
  /^-\s*記事の核心的な内容/,
  /^【条件】/,
  /^【書き方】/,
  /^【重要/,
  /^-\s*技術的価値を/,
  /^ここに.*書く/,
  /^- \d+文字以上の記事/,
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
