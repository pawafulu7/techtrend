/**
 * SREFetcher のフィードの取得（lib/fetchers/sre.ts）
 *
 * フィードは fetcher の時間の上限を渡して fetchFeedXml で取る。一度も記事を取れていなかった
 * フィード（Google Cloud SRE・Datadog）と、専用のソースが同じフィードを読む CNCF は読まない。
 */
import { SREFetcher } from '@/lib/fetchers/sre';
import { fetchFeedXml } from '@/lib/fetchers/fetch-feed';
import type { Source } from '@/lib/prisma-exports';

jest.mock('rss-parser', () =>
  jest.fn().mockImplementation(() => ({
    parseString: jest.fn().mockResolvedValue({ items: [] }),
  }))
);

jest.mock('@/lib/fetchers/fetch-feed', () => ({
  fetchFeedXml: jest.fn().mockResolvedValue('<rss></rss>'),
}));

const source = {
  id: 'cmdq43k070000tekrnqlawd1y',
  name: 'SRE',
  url: 'https://sreweekly.com/feed/',
  type: 'RSS',
  enabled: true,
} as unknown as Source;

describe('SREFetcher', () => {
  it('各フィードを、時間の上限を渡して fetchFeedXml で取る', async () => {
    const { errors } = await new SREFetcher(source).fetch();

    expect(errors).toEqual([]);
    const calls = jest.mocked(fetchFeedXml).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, options] of calls) {
      expect(options?.timeoutMs).toBeGreaterThan(0);
    }
    const urls = calls.map(([url]) => url);
    expect(urls).not.toContain('https://cloud.google.com/blog/products/devops-sre/rss');
    expect(urls).not.toContain('https://www.datadoghq.com/blog/rss/');
    expect(urls).not.toContain('https://www.cncf.io/feed/');
  });
});
