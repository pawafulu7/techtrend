/**
 * 表示してよいサムネイル URL か（http/https だけ。相対パスや javascript: は弾く）。
 * 型述語を string にすると、false の側で「string ではない」と誤って絞り込むので、
 * http/https で始まる文字列の型にする
 */
export function hasValidThumbnail(
  thumbnail: string | null | undefined
): thumbnail is `http://${string}` | `https://${string}` {
  return !!thumbnail && /^https?:\/\//.test(thumbnail);
}

/**
 * /_next/image で最適化できる URL か（Issue #718）。
 * remotePatterns は https だけなので http は最適化しない（next/image が例外を投げる）。
 * SVG は最適化しない（dangerouslyAllowSVG を有効にしないため）
 */
export function canOptimizeImage(src: string): boolean {
  if (!src.startsWith('https://')) return false;
  try {
    return !new URL(src).pathname.toLowerCase().endsWith('.svg');
  } catch {
    return false;
  }
}
