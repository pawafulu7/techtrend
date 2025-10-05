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
 * A text is considered Japanese if at least 30% of its characters are Japanese characters
 * (Hiragana, Katakana, Kanji, or Japanese punctuation).
 *
 * @param text - The text to analyze
 * @param threshold - The minimum ratio of Japanese characters (default: 0.3)
 * @returns true if the text is likely Japanese, false otherwise
 *
 * @example
 * isLikelyJapanese("こんにちは世界"); // true
 * isLikelyJapanese("Hello World"); // false
 * isLikelyJapanese("JavaScriptで作るメモアプリ"); // true (>30% Japanese)
 * isLikelyJapanese("JavaScript API"); // false (<30% Japanese)
 */
export function isLikelyJapanese(
  text: string,
  threshold: number = DEFAULT_JAPANESE_THRESHOLD
): boolean {
  if (!text || text.length === 0) {
    return false;
  }

  const japaneseMatches = text.match(JAPANESE_CHAR_PATTERN);
  if (!japaneseMatches) {
    return false;
  }

  // Calculate the ratio of Japanese characters to total characters
  const japaneseRatio = japaneseMatches.length / text.length;
  return japaneseRatio >= threshold;
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
