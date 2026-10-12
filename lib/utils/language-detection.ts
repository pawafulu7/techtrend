/**
 * Language detection utilities for text analysis
 */

/**
 * Pattern for detecting Japanese characters (Hiragana, Katakana, Kanji, and Japanese punctuation)
 */
const JAPANESE_CHAR_PATTERN = /[\u3000-\u303F\u3040-\u30FF\u3005-\u3007\u4E00-\u9FFF]/g;

/**
 * Default threshold for Japanese character ratio (30%)
 */
const DEFAULT_JAPANESE_THRESHOLD = 0.3;

/**
 * Determines if the given text is likely to be Japanese based on character composition.
 * A text is considered Japanese if it contains any Japanese characters
 * (Hiragana, Katakana, Kanji, or Japanese punctuation).
 *
 * The function uses an early return for any Japanese character presence to handle
 * edge cases like "Rancher と Terraform" where a single particle indicates Japanese content.
 *
 * @param text - The text to analyze
 * @param threshold - The minimum ratio of Japanese characters (legacy parameter, rarely reached)
 * @returns true if the text is likely Japanese, false otherwise
 *
 * @example
 * isLikelyJapanese("こんにちは世界"); // true
 * isLikelyJapanese("Hello World"); // false
 * isLikelyJapanese("Rancher と Terraform"); // true (single Japanese character)
 * isLikelyJapanese("JavaScript API"); // false (no Japanese characters)
 */
export function isLikelyJapanese(
  text: string,
  _threshold: number = DEFAULT_JAPANESE_THRESHOLD
): boolean {
  if (!text || text.length === 0) {
    return false;
  }

  const japaneseMatches = text.match(JAPANESE_CHAR_PATTERN);
  if (!japaneseMatches) {
    return false;
  }

  // If the text contains any Japanese characters, treat it as Japanese
  // This handles edge cases like "Rancher と Terraform" (1 Japanese character)
  return true;
}

/** 本文の判定で見る先頭の文字数。長い本文を全部数えなくても言語は決まる */
const BODY_SAMPLE_LENGTH = 3000;

/**
 * 本文を日本語とみなす、ひらがなの割合（英字・かな・漢字に占める割合）の下限。
 * 日本語の UI（GitHub・Speaker Deck など）に囲まれた英語の記事は、カタカナと漢字は多いが
 * ひらがなはほぼ無い（2% 未満）。日本語の文章は英語やコードが多くても 2% を超える（issue #725）
 */
const BODY_HIRAGANA_THRESHOLD = 0.02;

const HIRAGANA_PATTERN = /[\u3040-\u309F]/g;
const LETTER_PATTERN = /[A-Za-z\u3040-\u30FF\u4E00-\u9FFF]/g;

/**
 * 記事の本文が日本語かを、先頭のひらがなの割合で判定する。
 * タイトルが英語でも本文が日本語の記事（Zenn など）は、英語の記事として翻訳しない
 *
 * @example
 * isLikelyJapaneseBody('配列の途中の要素にアクセスする命令 const a = [1];'); // true
 * isLikelyJapaneseBody('エクスプローラー ヘルプ サインイン Codeberg is maintained by ...'); // false
 */
export function isLikelyJapaneseBody(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const sample = text.slice(0, BODY_SAMPLE_LENGTH);
  const letters = sample.match(LETTER_PATTERN)?.length ?? 0;
  if (letters === 0) {
    return false;
  }

  const hiragana = sample.match(HIRAGANA_PATTERN)?.length ?? 0;
  return hiragana / letters >= BODY_HIRAGANA_THRESHOLD;
}

/**
 * Calculates the ratio of Japanese characters in the given text.
 *
 * @param text - The text to analyze
 * @returns The ratio of Japanese characters (0.0 to 1.0)
 *
 * @example
 * getJapaneseCharRatio("こんにちは"); // 1.0
 * getJapaneseCharRatio("Hello世界"); // 0.4 (2 out of 5 characters)
 * getJapaneseCharRatio("JavaScript"); // 0.0
 */
export function getJapaneseCharRatio(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  const japaneseMatches = text.match(JAPANESE_CHAR_PATTERN);
  if (!japaneseMatches) {
    return 0;
  }

  return japaneseMatches.length / text.length;
}
