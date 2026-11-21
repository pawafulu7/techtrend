/**
 * フィードの本文（HTML）から画像の URL を取り出す
 *
 * フィードの本文は配信元が自由に書ける入力で、上限は 20MB ある（fetch-feed.ts）。
 * `<img[^>]*src="…"` のようにタグの中身を `[^>]*` で読む正規表現は、`>` の無い `<img<img<img…`
 * のような入力で、開始位置ごとに入力の終わりまで読み直すので、計算量が入力長の 2 乗に増える。
 * 正規表現は同期処理でイベントループを止めるので、収集のタイムアウトも働かない。
 *
 * ここではタグを `<img\b[^>]*` で切り出してから属性を読む。切り出す式の後ろに条件が無いので
 * 照合はやり直しにならず、matchAll は前の一致の終わりから次を探す。各文字を読むのは 1 回だけになり、
 * 計算量は入力長に比例する（`>` の無い入力では、残りがまとめて 1 つのタグになる）。
 * 属性値の中の `<`（`alt="x < y"`）も従来どおりタグの一部として読む。
 */

/** タグ名から次の `>` か入力の終わりまで（閉じていない末尾のタグも読む） */
const META_TAG = /<meta\b[^>]*/gi;
const IMG_TAG = /<img\b[^>]*/gi;

const OG_IMAGE_PROPERTY = /property=(?:"og:image"|'og:image')/i;
const CONTENT_ATTRIBUTE = /content=(?:"([^"]*)"|'([^']*)')/i;
const SRC_ATTRIBUTE = /src=(?:"([^"]*)"|'([^']*)')/gi;

/**
 * `<meta property="og:image" content="…">` の content を返す
 *
 * 従来の正規表現と同じく、property より後ろにある content だけを読む。
 */
export function findOgImageUrl(html: string): string | null {
  if (!html) return null;

  for (const [tag] of html.matchAll(META_TAG)) {
    const property = OG_IMAGE_PROPERTY.exec(tag);
    if (!property) continue;

    const content = CONTENT_ATTRIBUTE.exec(
      tag.slice(property.index + property[0].length)
    );
    const url = content?.[1] ?? content?.[2];
    if (url) return url;
  }

  return null;
}

/**
 * 最初の `<img>` の src を返す
 *
 * 1 つのタグに `src=` が複数ある（`data-src` など）ときは、従来の正規表現（`[^>]*` の最長一致）と
 * 同じく最後のものを使う。src の無い img は読み飛ばして次の img を見る。
 */
export function findFirstImageSrc(html: string): string | null {
  if (!html) return null;

  for (const [tag] of html.matchAll(IMG_TAG)) {
    let last: string | null = null;
    for (const match of tag.matchAll(SRC_ATTRIBUTE)) {
      const url = match[1] ?? match[2];
      if (url) last = url;
    }
    if (last) return last;
  }

  return null;
}

/** 並びを切る文字（従来の式の `[^"'\s]` の外側） */
const RUN_BREAK = /["'\s]/;

/** ASCII の英字だけを小文字にする（文字数が変わらない。`/i` で ASCII の接頭辞と一致する範囲と同じ） */
function lowerAscii(text: string): string {
  return text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
}

/**
 * 決まったホストの画像 URL（`https://deepmind.google/….png` など）を本文から探す
 *
 * 従来の `/https:\/\/deepmind\.google[^"'\s]+(\.jpg|\.png|…)/i` と同じ結果を返す: 接頭辞から始まる、
 * 引用符と空白を含まない文字の並びのうち、最初に見つかったもので、接頭辞の後ろに 1 文字以上あってから
 * 現れる最後の拡張子までを返す（ASCII の英字の大文字小文字は区別しない）。従来の式は拡張子の無い並びで
 * 開始位置ごとに末尾まで読み直したが、ここでは並びを 1 回だけ読み、拡張子は lastIndexOf で探す。
 * 接頭辞は文字列のまま探し、正規表現に組み立てない（`.` が任意の 1 文字に一致する取り違えを起こさない）。
 */
export function findImageUrlByPrefix(
  text: string,
  prefix: string,
  extensions: readonly string[]
): string | null {
  if (!text) return null;

  const lowerText = lowerAscii(text);
  const lowerPrefix = lowerAscii(prefix);
  const lowerExtensions = extensions.map(lowerAscii);

  let searchFrom = 0;
  for (;;) {
    const start = lowerText.indexOf(lowerPrefix, searchFrom);
    if (start === -1) return null;

    let end = start + lowerPrefix.length;
    while (end < text.length && !RUN_BREAK.test(text[end])) end++;

    // 従来の式は最長一致から戻るので、開始位置が最も後ろの拡張子が選ばれる（同じ位置なら列挙順で先のもの）
    const run = lowerText.slice(start, end);
    let bestStart = -1;
    let bestEnd = -1;
    for (const ext of lowerExtensions) {
      const at = run.lastIndexOf(ext);
      if (at >= lowerPrefix.length + 1 && at > bestStart) {
        bestStart = at;
        bestEnd = at + ext.length;
      }
    }
    if (bestEnd > 0) return text.slice(start, start + bestEnd);

    // 従来の式（matchAll と同じく）は、並びの終わりから次を探す
    searchFrom = end;
  }
}

/** og:image を優先し、無ければ最初の img の src を返す */
export function findThumbnailInHtml(html: string): string | null {
  return findOgImageUrl(html) ?? findFirstImageSrc(html);
}
