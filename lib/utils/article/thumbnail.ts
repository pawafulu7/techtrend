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
