/**
 * 要約品質ルール定義
 * 推測表現パターンの定義と検出機能
 */

export interface SpeculativeExpressionResult {
  count: number;
  ratio: number;
  expressions: string[];
}

// 推測表現のパターン
export const SPECULATIVE_PATTERNS = [
  'と考えられます',
  'と考えられる',
  'と推測されます',
  'と推測される',
  'かもしれません',
  'かもしれない',
  'と思われます',
  'と思われる',
  'ようです',
  'でしょう',
  'だろう',
  '可能性が高い',
  '可能性があります',
  '予想されます',
  '予想される',
  'おそらく', // 追加
  '恐らく', // 追加（漢字版）
  'たぶん', // 追加
  '多分', // 追加（漢字版）
];

/**
 * 推測表現を検出
 * @param text 検証するテキスト
 * @returns 推測表現の検出結果
 */
export function detectSpeculativeExpressions(
  text: string
): SpeculativeExpressionResult {
  if (!text) {
    return { count: 0, ratio: 0, expressions: [] };
  }

  const expressions: string[] = [];
  let totalCount = 0;

  for (const pattern of SPECULATIVE_PATTERNS) {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    if (matches) {
      totalCount += matches.length;
      matches.forEach((match) => {
        if (!expressions.includes(match)) {
          expressions.push(match);
        }
      });
    }
  }

  // 文の数を推定（。で区切られた数）
  const sentenceCount = (text.match(/。/g) || []).length || 1;
  const ratio = sentenceCount > 0 ? totalCount / sentenceCount : 0;

  return {
    count: totalCount,
    ratio: Math.round(ratio * 100) / 100,
    expressions,
  };
}
