/**
 * @jest-environment node
 */
import Parser from 'rss-parser';
import { stripHtmlLinear } from '@/lib/fetchers/rss-parser-strip-html';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rssParserUtils = require('rss-parser/lib/utils') as {
  stripHtml: (str: string) => string;
};

// fetch-feed.ts を読み込む前の、rss-parser の元の実装
const originalStripHtml = rssParserUtils.stripHtml;

describe('stripHtmlLinear', () => {
  // 元の正規表現の癖（改行の前の `>` を越えて次の `>` まで消す、\r と U+2028 を越えない、
  // 大文字のタグは改行にしない、など）も含めて同じ結果になること
  it.each([
    ['ブロック要素の間を改行にする', 'a<p>b</p>c<br>d<li>e</li>f'],
    ['改行の前の > を越えて消す', 'a<p>\nb</p>c'],
    ['\\r を越えない', 'a<p\r>b</p>c<span\r>d</span>'],
    ['U+2028 を越えない', 'a<div\u2028>b</div>c'],
    ['閉じない <', 'x<img<img<img src="a"'],
    ['大文字のタグ', 'a<P>b</P>c'],
    [
      '入れ子と属性',
      '<div class="a"><p>本文<b>太字</b></p><table><tr><td>1</td></tr></table></div>',
    ],
    ['ジェネリクスの <', 'Mutex<Option<T>> or other'],
    ['空', ''],
  ])('%s', (_label, html) => {
    expect(stripHtmlLinear(html)).toBe(originalStripHtml(html));
  });

  it('細工した本文（約 1MB）でも 1 秒かからない', () => {
    const start = performance.now();
    stripHtmlLinear('x' + '<img'.repeat(250_000));
    stripHtmlLinear('x' + '<p '.repeat(330_000));
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('fetch-feed.ts を読み込んだ後の rss-parser', () => {
  beforeAll(async () => {
    await import('@/lib/fetchers/fetch-feed');
  });

  it('HTML の除去が差し替わっている', () => {
    expect(rssParserUtils.stripHtml).toBe(stripHtmlLinear);
  });

  // 元の実装は 128KB で約 4 秒かかった（rss-parser の中身が変わって差し替えが効かなくなると落ちる）
  it('本文を細工したフィードの解析が 1 秒かからない', async () => {
    const evil = '<img'.repeat(50_000);
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
      <item><title>a</title><link>https://example.com/a</link>
      <description><![CDATA[x${evil}]]></description></item></channel></rss>`;

    const start = performance.now();
    const feed = await new Parser().parseString(xml);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(feed.items).toHaveLength(1);
  });
});
