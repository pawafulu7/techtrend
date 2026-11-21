/**
 * rss-parser の HTML 除去（utils.stripHtml）を、同じ結果を返す線形の実装に差し替える
 *
 * rss-parser（3.13.0。2023 年から更新が無い）は、記事ごとに contentSnippet を作るとき、本文に次の 2 つの
 * 正規表現を掛ける（node_modules/rss-parser/lib/utils.js）。
 *
 *   1. /([^\n])<\/?(h|br|p|ul|ol|li|blockquote|section|table|tr|div)(?:.|\n)*?>([^\n])/gm → '$1\n$3'
 *   2. /<(?:.|\n)*?>/gm → ''
 *
 * どちらも `>` の無い `<img<img<img…` のような本文で、開始位置ごとに入力の終わりまで読み直すので、計算量が
 * 入力長の 2 乗に増える（128KB で約 4 秒）。本文は配信元が自由に書け、正規表現は同期処理なので収集の
 * タイムアウトも効かない。ここでは同じ照合を、次の `>` と次の改行以外の区切り文字の位置を覚えながら
 * 1 回の走査で行う。contentSnippet は記事の本文の代わりにも使うので、結果は元の正規表現と 1 文字も
 * 変えない（`(?:.|\n)` は `\r`・U+2028・U+2029 を越えない、などの癖も含めて再現する）。
 *
 * 差し替えは fetch-feed.ts を読み込んだときに 1 回だけ行う（rss-parser を使う fetcher はすべて
 * fetch-feed.ts を通る）。rss-parser の中身が変わって差し替えが効かなくなったら、
 * __tests__/lib/fetchers/rss-parser-strip-html.test.ts の時間の検査が落ちる。
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rssParserUtils = require('rss-parser/lib/utils') as {
  stripHtml: (str: string) => string;
};

/** `(?:.|\n)` が越えられない文字（JavaScript の `.` は \n・\r・U+2028・U+2029 に一致しない） */
const BARRIER = /[\r\u2028\u2029]/g;

const BLOCK_TAG_NAMES = [
  'h',
  'br',
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'section',
  'table',
  'tr',
  'div',
];

/**
 * 前から順に調べる位置について、条件を満たす次の位置を返す（調べる位置は増える一方なので、
 * 前回の答えがまだ先にあれば使い回す。全体で入力を 1 回読むだけになる）
 */
function createForwardSearch(find: (from: number) => number): (from: number) => number {
  let cachedFrom = -1;
  let cached = -1;
  return (from: number) => {
    if (cachedFrom !== -1 && from >= cachedFrom && (cached === -1 || from <= cached)) {
      return cached;
    }
    cachedFrom = from;
    cached = find(from);
    return cached;
  };
}

function nextBarrierFinder(str: string): (from: number) => number {
  return createForwardSearch((from) => {
    BARRIER.lastIndex = from;
    const match = BARRIER.exec(str);
    return match ? match.index : str.length;
  });
}

/** 1 の置き換え（ブロック要素のタグを、前後の文字を残して改行 1 つにする） */
function replaceBlockTags(str: string): string {
  const n = str.length;
  const nextBarrier = nextBarrierFinder(str);
  // 後ろに改行以外の文字が続く、次の `>`
  const nextGoodGt = createForwardSearch((from) => {
    let q = str.indexOf('>', from);
    while (q !== -1 && (q + 1 >= n || str[q + 1] === '\n')) {
      q = str.indexOf('>', q + 1);
    }
    return q;
  });

  const parts: string[] = [];
  let copied = 0;
  let i = str.indexOf('<', 1) - 1;
  while (i >= 0 && i + 1 < n) {
    let matchedEnd = -1;
    if (str[i] !== '\n') {
      let j = i + 2;
      if (str[j] === '/') j++;
      const name = BLOCK_TAG_NAMES.find((tag) => str.startsWith(tag, j));
      if (name !== undefined) {
        const k = j + name.length;
        const q = nextGoodGt(k);
        if (q !== -1 && q < nextBarrier(k)) matchedEnd = q + 1;
      }
    }

    if (matchedEnd !== -1) {
      parts.push(str.slice(copied, i + 1), '\n', str[matchedEnd]);
      copied = matchedEnd + 1;
      const next = str.indexOf('<', copied + 1);
      i = next === -1 ? -1 : next - 1;
    } else {
      const next = str.indexOf('<', i + 2);
      i = next === -1 ? -1 : next - 1;
    }
  }
  parts.push(str.slice(copied));
  return parts.join('');
}

/** 2 の置き換え（`<` から、区切り文字を越えずに届く最初の `>` までを消す） */
function removeTags(str: string): string {
  const nextBarrier = nextBarrierFinder(str);
  const nextGt = createForwardSearch((from) => str.indexOf('>', from));

  const parts: string[] = [];
  let copied = 0;
  let searchFrom = 0;
  for (;;) {
    const lt = str.indexOf('<', searchFrom);
    if (lt === -1) break;
    const gt = nextGt(lt + 1);
    if (gt === -1) break; // 後ろに `>` が無ければ、以降の `<` も一致しない
    if (gt < nextBarrier(lt + 1)) {
      parts.push(str.slice(copied, lt));
      copied = gt + 1;
      searchFrom = gt + 1;
    } else {
      searchFrom = lt + 1;
    }
  }
  parts.push(str.slice(copied));
  return parts.join('');
}

/** rss-parser の utils.stripHtml と同じ結果を、入力長に比例する時間で返す */
export function stripHtmlLinear(str: string): string {
  return removeTags(replaceBlockTags(str));
}

let installed = false;

/** rss-parser の utils.stripHtml を差し替える（何度呼んでも 1 回だけ） */
export function installLinearStripHtml(): void {
  if (installed) return;
  rssParserUtils.stripHtml = stripHtmlLinear;
  installed = true;
}
