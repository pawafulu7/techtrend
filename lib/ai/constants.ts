/**
 * AI要約システムの共有定数
 *
 * parseUnifiedResponse（生成時）とfix-summary-format.ts（修正時）で共有
 */

import type { DetailPolicy } from './adapter/summary-provider.interface';

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
  /^-\s*[0-9０-９]+(?:\s*[-〜~～]\s*[0-9０-９]+)?\s*文字.*の記事.*(?:作成|必ず|以上|以内)/, // 範囲形式対応（「の記事」+指示語で誤検知防止）

  // 新規追加パターン（プロンプト混入問題対応）
  /^【文末】/,
  /^-\s*冗長な表現/,
  /^-\s*技術用語は略称/,
  /^【システム指示】/,
  /^【指示】/,

  // プロンプト指示文混入問題対応（2025-11-24追加 + CodexMCP推奨）
  // 基本パターン
  /^【形式】/,
  /^\s*【形式】[:：]/, // コロン付き、先頭空白対応
  /^【出力形式】/,
  /^【項目数の必須要件】/,
  /^【各項目の必須要件】/,
  /^【指針】/,
  /^【推奨】/,
  /^【注意事項】/, // 「【注意】」を限定（誤検出防止）
  /^【注意点】/,

  // 番号付きパターン
  /^\d+\.\s*【/, // 「1. 【形式】」等

  // 箇条書き先頭記号（先頭空白対応）
  /^\s*[・\-●\*]\s*【/, // 「  ・【形式】」「- 【条件】」等

  // 汎用パターン
  /^【.*】$/, // 任意の【】記号のみの行
  /^-\s*.*→.*/, // 略称指示パターン (例: JavaScript→JS)
  /^\[ここに.*\]/, // テンプレート指示 (例: [ここに要約を出力])
  /^-?\s*文字数[:：]/, // 文字数指示（ダッシュあり/なし両対応）

  // 再発防止パターン（2025-10-07追加）
  /^【記事文字数要件】/,
  /^INTERNAL METADATA/,
  /^Article content length:/,
  /^Summary requirements:/,
  /^IMPORTANT: The above metadata/,
  /DO NOT OUTPUT/, // 部分一致（行頭以外でも検出）
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
 * 一覧要約(summary)の長さ規定（通常コンテンツ向け）
 *
 * この定数がプロンプトと品質チェックの唯一の出典。
 * プロンプト側（prompt-builder.ts / article-type-prompts.ts）と
 * 検証側（service/quality-checker.ts）は必ずここを参照すること。
 *
 * 値は quality-checker.ts が従来運用していた非 thin-content 判定に一致させている。
 * 短記事（thin content）の判定値は contentAnalysis 側の推奨値を優先するため、
 * ここには含めない。
 */
export const SUMMARY_LENGTH = {
  /** これを下回ると major 扱い */
  absoluteMin: 50,
  /** 理想帯の下限（これを下回ると minor 減点） */
  idealMin: 150,
  /** 理想帯の上限（表示用。減点判定は hardMax） */
  idealMax: 250,
  /** これを超えると minor 減点 */
  hardMax: 250,
} as const;

/** プロンプトに埋め込む推奨レンジ表記 */
export const SUMMARY_LENGTH_HINT = `${SUMMARY_LENGTH.idealMin}-${SUMMARY_LENGTH.idealMax}文字`;

/**
 * 短記事（thin content）の一覧要約の長さ規定
 *
 * 通常コンテンツより短くする。contentAnalysis が推奨値を持つ場合はそちらが優先されるが、
 * 推奨値が無い場合のフォールバックと、プロンプト側の指示文はこの値を使う。
 * 通常用の SUMMARY_LENGTH をそのまま短記事に適用すると、
 * 「プロンプトは100-180文字を要求、検証層は上限100文字」という衝突が起きる。
 */
export const THIN_SUMMARY_LENGTH = {
  absoluteMin: 40,
  idealMin: 60,
  idealMax: 100,
  hardMax: 100,
} as const;

/** 短記事向けの推奨レンジ表記 */
export const THIN_SUMMARY_LENGTH_HINT = `${THIN_SUMMARY_LENGTH.idealMin}-${THIN_SUMMARY_LENGTH.idealMax}文字`;

/** 短記事とみなすコンテンツ長の上限（プロンプト側の分岐と揃える） */
export const THIN_CONTENT_MAX_LENGTH = 400;

/**
 * コンテンツ長に基づく項目数ルール
 * prompt-builder.ts と quality-checker.ts で共有
 * 変更時は両ファイルの整合性を保つこと
 */
export interface ItemCountRule {
  minLength: number; // このルールが適用されるコンテンツ長の下限
  minItems: number; // 最小項目数
  maxItems: number; // 最大項目数
  recommendedItems: string; // 推奨表示用文字列
}

// コンテンツ長の降順でソート（大きいものから評価）
export const ITEM_COUNT_RULES: ItemCountRule[] = [
  { minLength: 10000, minItems: 7, maxItems: 9, recommendedItems: '7-9' },
  { minLength: 5000, minItems: 5, maxItems: 7, recommendedItems: '5-7' },
  { minLength: 3000, minItems: 4, maxItems: 5, recommendedItems: '4-5' },
  { minLength: 1000, minItems: 3, maxItems: 4, recommendedItems: '3-4' },
  { minLength: 400, minItems: 2, maxItems: 3, recommendedItems: '2-3' },
  { minLength: 0, minItems: 0, maxItems: 0, recommendedItems: '0' }, // 短文は箇条書き不要
];

/**
 * 詳細要約の長さ規定（コンテンツ長の帯ごと）
 *
 * プロンプト側（prompt-builder.ts / article-type-prompts.ts）と
 * 検証側（service/quality-checker.ts）の唯一の出典。
 * totalMin / totalMax は quality-checker の詳細要約判定と一致させること。
 * ここを二重管理すると「プロンプトは1500文字まで許可、検証層は1200文字で減点」
 * のような、指示に従うほど減点される状態が生まれる。
 * minLength は ITEM_COUNT_RULES と同じ境界値に揃えること。
 */
export interface DetailLengthBand {
  minLength: number;
  /** 記事長の呼び方（「（非常に長い）」等） */
  label: string;
  /** 各項目の長さ指示（末尾の句点を含む） */
  itemContentHint: string;
  /** 詳細要約全体の下限 */
  totalMin: number;
  /** 詳細要約全体の上限 */
  totalMax: number;
  /** 項目数と文字数のどちらを優先するかの指示 */
  priorityHint: string;
}

export const DETAIL_LENGTH_BANDS: DetailLengthBand[] = [
  {
    minLength: 10000,
    label: '（非常に長い）',
    itemContentHint:
      '具体的な詳細（バージョン、数値、日付、コマンド等）を含め120-180文字。',
    totalMin: 900,
    totalMax: 1500,
    priorityHint: '項目数を優先し、1項目あたりの長さは抑えてください。',
  },
  {
    minLength: 5000,
    label: '（長い）',
    itemContentHint: '具体的な詳細を含め120-200文字。',
    totalMin: 600,
    totalMax: 1200,
    priorityHint: '合計文字数を優先してください。',
  },
  {
    minLength: 3000,
    label: '',
    itemContentHint: '150-200文字。',
    totalMin: 600,
    totalMax: 1000,
    priorityHint: '合計文字数を優先してください。',
  },
  {
    minLength: 1000,
    label: '',
    itemContentHint: '130-175文字。',
    totalMin: 400,
    totalMax: 700,
    priorityHint: '合計文字数を優先してください。',
  },
  {
    minLength: 400,
    label: '（短い）',
    itemContentHint: '80-200文字。',
    totalMin: 80,
    totalMax: 600,
    priorityHint: '合計文字数を優先してください。',
  },
];

/** コンテンツ長から詳細要約の長さ帯を取得（400文字未満は箇条書き不要なので null） */
export function getDetailLengthBand(
  contentLength: number
): DetailLengthBand | null {
  return (
    DETAIL_LENGTH_BANDS.find((band) => contentLength >= band.minLength) ?? null
  );
}

/** 詳細度ポリシーごとの項目数倍率 */
const DETAIL_POLICY_MULTIPLIER: Record<DetailPolicy, number> = {
  short: 0.8,
  medium: 1.0,
  long: 1.2,
};

/**
 * コンテンツ長から適用されるルールを取得
 *
 * `policy` はプロンプト側と検証側で必ず同じ値を渡すこと。
 * 片側だけが倍率を適用すると「プロンプトが要求した項目数を
 * 検証側が範囲外と判定する」不整合が発生する。
 * 現状 detailPolicy は 'medium'（倍率1.0）固定なので既定値も 'medium'。
 * 設定可能にする際は quality-checker 側にも同じ policy を渡すこと。
 */
export function getItemCountRule(
  contentLength: number,
  policy: DetailPolicy = 'medium'
): ItemCountRule {
  const base =
    ITEM_COUNT_RULES.find((rule) => contentLength >= rule.minLength) ??
    ITEM_COUNT_RULES[ITEM_COUNT_RULES.length - 1];

  const multiplier = DETAIL_POLICY_MULTIPLIER[policy];
  if (multiplier === 1.0 || base.maxItems === 0) {
    return base;
  }

  const minItems = Math.max(
    base.minItems,
    Math.floor(base.minItems * multiplier)
  );
  const maxItems = Math.max(minItems, Math.floor(base.maxItems * multiplier));
  return {
    minLength: base.minLength,
    minItems,
    maxItems,
    recommendedItems: `${minItems}-${maxItems}`,
  };
}
