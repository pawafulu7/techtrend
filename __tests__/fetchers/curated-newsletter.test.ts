/**
 * CuratedNewsletterFetcher（分野のニュースレターの号から、編集者が選んだ記事を取り出す）のテスト
 *
 * fixture は実際の号の HTML の形を写し、文を置き換えたもの（__tests__/fixtures/feeds/newsletters/）。
 * fetch はテストごとに差し替え、フィードと Cooperpress の転送 URL だけに答える。
 */

import fs from 'fs';
import path from 'path';
import { CuratedNewsletterFetcher } from '@/lib/fetchers/curated-newsletter';
import { SourceFormatError } from '@/lib/fetchers/errors';
import type { Source } from '@/lib/prisma-exports';

const FIXTURES = path.join(__dirname, '../fixtures/feeds/newsletters');
const COOPERPRESS_ISSUE = fs.readFileSync(path.join(FIXTURES, 'cooperpress-issue.html'), 'utf8');
const SRE_ISSUE = fs.readFileSync(path.join(FIXTURES, 'sre-weekly-issue.html'), 'utf8');
const DEW_ISSUE = fs.readFileSync(path.join(FIXTURES, 'data-engineering-weekly-issue.html'), 'utf8');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-18T00:00:00Z');

function source(id: string, name: string): Source {
  return { id, name, url: 'https://example.com', type: 'RSS', enabled: true } as unknown as Source;
}

interface FeedPost {
  title: string;
  link: string;
  daysAgo: number;
  html: string;
}

/** base（既定は NOW）から daysAgo 日前に出た号のフィード */
function feedXml(posts: FeedPost[], base: number = NOW): string {
  const items = posts
    .map(
      (p) => `<item><title>${p.title}</title><link>${p.link}</link>
<pubDate>${new Date(base - p.daysAgo * DAY).toUTCString()}</pubDate>
<content:encoded><![CDATA[${p.html}]]></content:encoded></item>`
    )
    .join('\n');
  return `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Feed</title>${items}</channel></rss>`;
}

function textResponse(body: string, status = 200) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(), body: null, text: async () => body };
}

function redirectResponse(location: string, status = 301) {
  return { status, ok: false, headers: new Headers({ location }), body: null, text: async () => '' };
}

/** Cooperpress の転送 URL の番号 → 記事の URL（1005 は LinkedIn に転送される） */
function articleUrlFor(href: string): string {
  const id = href.match(/\/link\/(\d+)\/rss/)?.[1];
  return id === '1005'
    ? 'https://www.linkedin.com/pulse/some-post'
    : `https://articles.example/post-${id}?utm_source=javascriptweekly&id=keep#section`;
}

/** フィードは feedBody を返し、Cooperpress の転送 URL には Location で答える fetch */
function installFetch(feedBody: string, onLink?: (href: string, init: RequestInit) => unknown) {
  const fetchMock = jest.fn(async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith('https://cprss.s3.amazonaws.com/') || url.endsWith('/feed') || url.endsWith('/feed/')) {
      return textResponse(feedBody);
    }
    if (/\/link\/\d+\/rss$/.test(url)) {
      return (onLink?.(url, init) ?? redirectResponse(articleUrlFor(url))) as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

/** 決まった種から作る乱数（実行ごとに違う並びを、再現できる形で作る） */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jsWeekly = () =>
  new CuratedNewsletterFetcher(source('javascript_weekly', 'JavaScript Weekly'), { now: () => NOW });

describe('CuratedNewsletterFetcher: Cooperpress', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('記事の欄の記事だけを取り出し、転送を解決して追跡パラメータと # を落とす', async () => {
    installFetch(feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 5, html: COOPERPRESS_ISSUE }]));

    const { articles, errors } = await jsWeekly().fetch();

    expect(errors).toEqual([]);
    expect(articles.map((a) => [a.title, a.url]).sort()).toEqual(
      [
        ['Lead Article One', 'https://articles.example/post-1001?id=keep'],
        ['Article Section Feature', 'https://articles.example/post-1008?id=keep'],
        ['Compact Feature Without Host Hint', 'https://articles.example/post-1009?id=keep'],
        ['Short Article One', 'https://articles.example/post-1010?id=keep'],
        ['Short Article Two', 'https://articles.example/post-1012?id=keep'],
      ].sort()
    );
    for (const article of articles) {
      expect(article.content).toBeUndefined();
      expect(article.sourceId).toBe('javascript_weekly');
      expect(article.tagNames).toEqual(['JavaScript']);
      expect(article.publishedAt.getTime()).toBe(Date.parse(new Date(NOW - 5 * DAY).toUTCString()));
    }
  });

  it('転送ホストには HEAD で問い合わせ、記事ページには問い合わせない', async () => {
    const fetchMock = installFetch(feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 1, html: COOPERPRESS_ISSUE }]));

    await jsWeekly().fetch();

    const linkCalls = fetchMock.mock.calls.filter(([url]) => /\/link\//.test(String(url)));
    expect(linkCalls).toHaveLength(6);
    for (const [, init] of linkCalls) {
      expect(init).toEqual(expect.objectContaining({ method: 'HEAD', redirect: 'manual' }));
    }
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('https://articles.example/'))).toBe(false);
  });

  it('HEAD が 405 のときは同じ URL に GET で問い合わせる', async () => {
    installFetch(
      feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 1, html: COOPERPRESS_ISSUE }]),
      (href, init) => (href.includes('/1001/') && init.method === 'HEAD' ? textResponse('', 405) : undefined)
    );

    const { articles } = await jsWeekly().fetch();

    expect(articles.map((a) => a.url)).toContain('https://articles.example/post-1001?id=keep');
  });

  it('転送しないリンクと、転送ホストでないリンクは、問い合わせずに・失敗として飛ばす', async () => {
    const html = COOPERPRESS_ISSUE.replace(
      'https://javascriptweekly.com/link/1008/rss',
      'https://evil.example/link/1008/rss'
    );
    const fetchMock = installFetch(
      feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 1, html }]),
      (href) => (href.includes('/1009/') ? textResponse('<html></html>', 200) : undefined)
    );

    const { articles, errors } = await jsWeekly().fetch();

    const titles = articles.map((a) => a.title);
    expect(titles).not.toContain('Article Section Feature');
    expect(titles).not.toContain('Compact Feature Without Host Hint');
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('https://evil.example/'))).toBe(false);
    expect(errors.map((e) => e.message)).toEqual(['JavaScript Weekly: 転送の解決に失敗 2 本、締め切りで未処理 0 本']);
  });

  it('最新の2号を読む。休みで2週以上空いても、30日以内なら最新号を読む', async () => {
    const issue = (n: number, daysAgo: number) => ({
      title: `Issue ${n}`,
      link: `https://javascriptweekly.com/issues/${n}`,
      daysAgo,
      html: COOPERPRESS_ISSUE.replace(/\/link\/(\d+)\/rss/g, `/link/${n}$1/rss`),
    });
    installFetch(feedXml([issue(9, 16), issue(8, 23), issue(7, 30.5)]));

    const { articles } = await jsWeekly().fetch();

    const days = [...new Set(articles.map((a) => Math.round((NOW - a.publishedAt.getTime()) / DAY)))].sort();
    expect(days).toEqual([16, 23]);
    expect(articles).toHaveLength(12);
  });

  it('30日より古い号しか無いときは、何も返さず失敗にもしない（休み）', async () => {
    installFetch(feedXml([{ title: 'Issue 1', link: 'https://javascriptweekly.com/issues/1', daysAgo: 31, html: COOPERPRESS_ISSUE }]));

    const { articles, errors } = await jsWeekly().fetch();

    expect(articles).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('号はあるのに記事を1本も取り出せないときは SourceFormatError', async () => {
    installFetch(feedXml([{ title: 'Issue 900', link: 'https://javascriptweekly.com/issues/900', daysAgo: 1, html: '<div><p>New template</p></div>' }]));

    const { articles, errors } = await jsWeekly().fetch();

    expect(articles).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SourceFormatError);
  });

  it('フィードを取れないときは例外を投げずにエラーを返す', async () => {
    global.fetch = jest.fn(async () => textResponse('', 503)) as unknown as typeof global.fetch;

    const { articles, errors } = await jsWeekly().fetch();

    expect(articles).toEqual([]);
    expect(errors[0].message).toContain('JavaScript Weekly: フィードの取得に失敗');
  });

  it('締め切りを過ぎたら、解決できた分だけ返し、その後は問い合わせを始めない', async () => {
    // 1001 だけすぐに転送を返し、ほかは中断されるまで応答しない
    const fetchMock = installFetch(
      feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 1, html: COOPERPRESS_ISSUE }], Date.now()),
      (href, init) =>
        href.includes('/1001/')
          ? undefined
          : new Promise((_, reject) =>
              init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            )
    );
    const fetcher = new CuratedNewsletterFetcher(source('javascript_weekly', 'JavaScript Weekly'), {
      deadlineMs: 150,
      random: () => 0.999, // 並べ替えない（1001 が最初に問い合わせられる）
    });

    const result = await fetcher.fetch();
    const callsAtReturn = fetchMock.mock.calls.length;
    const articlesAtReturn = [...result.articles];
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(result.articles.map((a) => a.title)).toEqual(['Lead Article One']);
    expect(result.errors.map((e) => e.message)).toEqual([
      'JavaScript Weekly: 転送の解決に失敗 0 本、締め切りで未処理 5 本',
    ]);
    expect(fetchMock.mock.calls.length).toBe(callsAtReturn);
    expect(result.articles).toEqual(articlesAtReturn);
  });

  it('応答が一様に遅く1回で全部を解決できなくても、実行ごとに順が変わり、数回で全部に届く', async () => {
    const seen = new Set<string>();
    const perRun: number[] = [];
    for (let run = 1; run <= 12; run++) {
      installFetch(
        feedXml([{ title: 'Issue 806', link: 'https://javascriptweekly.com/issues/806', daysAgo: 1, html: COOPERPRESS_ISSUE }], Date.now()),
        (href) => new Promise((resolve) => setTimeout(() => resolve(redirectResponse(articleUrlFor(href))), 40))
      );
      const fetcher = new CuratedNewsletterFetcher(source('javascript_weekly', 'JavaScript Weekly'), {
        deadlineMs: 120,
        random: seeded(run),
      });
      const { articles } = await fetcher.fetch();
      perRun.push(articles.length);
      articles.forEach((a) => seen.add(a.title));
    }

    // 1回では並列の3本しか解決できない（次の問い合わせまで 200ms 空ける）
    expect(Math.max(...perRun)).toBeLessThanOrEqual(3);
    expect([...seen].sort()).toEqual(
      ['Lead Article One', 'Article Section Feature', 'Compact Feature Without Host Hint', 'Short Article One', 'Short Article Two'].sort()
    );
  });
});

describe('CuratedNewsletterFetcher: SRE Weekly', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('記事の枠の直接の URL を使い、SNS を除き、medium.com の著者の記事は残す', async () => {
    const fetchMock = installFetch(feedXml([{ title: 'SRE Weekly Issue #538', link: 'https://sreweekly.com/sre-weekly-issue-538/', daysAgo: 6, html: SRE_ISSUE }]));

    const { articles, errors } = await new CuratedNewsletterFetcher(source('sre_weekly', 'SRE Weekly'), { now: () => NOW }).fetch();

    expect(errors).toEqual([]);
    expect(articles.map((a) => [a.title, a.url]).sort()).toEqual(
      [
        ['Incident Article', 'https://incident.example/blog/building-investigations'],
        ['Medium Author Post', 'https://medium.com/@someauthor/postmortem-story-1a2b3c'],
      ].sort()
    );
    expect(articles.every((a) => a.tagNames?.[0] === 'SRE' && a.content === undefined)).toBe(true);
    // フィードの1回だけ（転送の解決はしない）
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('CuratedNewsletterFetcher: Data Engineering Weekly', () => {
  let originalFetch: typeof global.fetch;
  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('号とエッセイを分けて読み、号は最新の2つ、エッセイは本文つきの1本の記事にする', async () => {
    installFetch(
      feedXml([
        { title: 'The Self-Organizing Data Stack', link: 'https://www.dataengineeringweekly.com/p/the-self-organizing-data-stack', daysAgo: 1, html: '<p>Essay body</p>' },
        { title: 'Data Engineering Weekly #292', link: 'https://www.dataengineeringweekly.com/p/data-engineering-weekly-292', daysAgo: 3, html: DEW_ISSUE },
        { title: 'Data Engineering Weekly #291', link: 'https://www.dataengineeringweekly.com/p/data-engineering-weekly-291', daysAgo: 10, html: DEW_ISSUE.replace(/stream-store/g, 'stream-store-291').replace(/how-we-migrated-1234/g, 'how-we-migrated-291') },
        { title: 'Data Engineering Weekly #290', link: 'https://www.dataengineeringweekly.com/p/data-engineering-weekly-290', daysAgo: 17, html: DEW_ISSUE.replace(/stream-store/g, 'stream-store-290') },
      ])
    );

    const { articles, errors } = await new CuratedNewsletterFetcher(source('data_engineering_weekly', 'Data Engineering Weekly'), { now: () => NOW }).fetch();

    expect(errors).toEqual([]);
    expect(articles.map((a) => a.url).sort()).toEqual(
      [
        'https://www.dataengineeringweekly.com/p/the-self-organizing-data-stack',
        'https://medium.com/company-a/how-we-migrated-1234',
        'https://blog.example/post/stream-store',
        'https://medium.com/company-a/how-we-migrated-291',
        'https://blog.example/post/stream-store-291',
      ].sort()
    );
    const essay = articles.find((a) => a.title === 'The Self-Organizing Data Stack');
    expect(essay?.content).toBe('<p>Essay body</p>');
    expect(articles.find((a) => a.url.endsWith('how-we-migrated-1234'))?.title).toBe('Company A: How We Migrated a Data Lake');
    // 案内（Event Alert・Editor’s Note）・協賛・LinkedIn は入らない
    expect(articles.some((a) => /luma\.com|event\.example|linkedin\.com|sponsor\.example/.test(a.url))).toBe(false);
  });
});
