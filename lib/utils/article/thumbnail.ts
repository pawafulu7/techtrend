/**
 * 表示してよいサムネイル URL か（http/https だけ。相対パスや javascript: は弾く）
 */
export function hasValidThumbnail(
  thumbnail: string | null | undefined
): thumbnail is string {
  return !!thumbnail && /^https?:\/\//.test(thumbnail);
}
