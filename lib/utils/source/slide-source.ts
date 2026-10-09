// サムネイルがスライドの1枚目になるソース。切り抜くと文字が欠けるので、一覧・詳細とも全体を収めて表示する
const SLIDE_SOURCE_NAMES = new Set(['Speaker Deck', 'Docswell']);

/**
 * スライド共有サービスのソースかを判定する
 */
export function isSlideSource(sourceName: string | null | undefined): boolean {
  return !!sourceName && SLIDE_SOURCE_NAMES.has(sourceName);
}
