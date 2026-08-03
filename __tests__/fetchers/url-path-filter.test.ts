/**
 * GenericForeignRssFetcher の urlPathFilter オプション単体テスト
 * （Issue #628 Batch 3）
 *
 * urlPathFilter は「1つのフィードに記事と別種のエントリが混在し、category で
 * 判別できないソース」向けの絞り込みオプション（Vercel の /blog/ と /changelog/）。
 *
 * 本テストで固定する契約:
 * - フィルタは slice(0, 30) の**前**に全 item へ適用される
 * - 相対 link は feedUrl 基準で解決される（rss-parser は Atom の href を
 *   相対のまま返すため）
 * - http / https 以外のスキームは除外される
 * - 判定は解決後 pathname の前方一致（セグメント境界は設定値どおり）
 * - 未設定時は従来どおり全 item が対象
 */

import {
  GenericForeignRssFetcher,
  ForeignSourceConfig,
} from '@/lib/fetchers/generic-foreign-rss';
import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';

jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  }));
});
const MockedParser = jest.mocked(Parser);

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/utils/duplicate-detection', () => ({
  isDuplicate: jest.fn().mockReturnValue(false),
}));

const FEED_URL = 'https://example.com/atom';

const BASE_CONFIG: ForeignSourceConfig = {
  feedUrl: FEED_URL,
  tagPrefix: 'example',
};

const createMockSource = (): Source => ({
  id: 'url_path_filter_test',
  name: 'URL Path Filter Test',
  url: 'https://example.com',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

interface MockItem {
  title: string;
  link?: string;
  isoDate?: string;
  content?: string;
}

const mockFeed = (items: MockItem[]) => {
  const mockParseURL = jest.fn().mockResolvedValue({ items });
  MockedParser.mockImplementation(
    () => ({ parseURL: mockParseURL }) as unknown as Parser
  );
};

const fetchWith = async (config: ForeignSourceConfig) => {
  const fetcher = new GenericForeignRssFetcher(createMockSource(), config);
  return fetcher.fetch();
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('urlPathFilter: slice(0, 30) との適用順序', () => {
  it('フィルタが slice の前に適用され、対象パスの記事を30件取得できる', async () => {
    // フィード先頭を対象外パス（/changelog/）40件が占め、その後に
    // 対象パス（/blog/）35件が続く。Vercel の実フィード構造を模す
    const items: MockItem[] = [
      ...Array.from({ length: 40 }, (_, i) => ({
        title: `Changelog entry ${i}`,
        link: `https://example.com/changelog/entry-${i}`,
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'changelog body',
      })),
      ...Array.from({ length: 35 }, (_, i) => ({
        title: `Blog post ${i}`,
        link: `https://example.com/blog/post-${i}`,
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'blog body',
      })),
    ];
    mockFeed(items);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    // slice を先に適用していたら 0 件になる（先頭30件は全て changelog のため）
    expect(result.articles).toHaveLength(30);
    expect(
      result.articles.every((a) => a.url.includes('/blog/post-'))
    ).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('フィルタ後の件数が30件未満ならその件数だけ取得される', async () => {
    mockFeed([
      {
        title: 'Blog post',
        link: 'https://example.com/blog/only-one',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'blog body',
      },
      {
        title: 'Changelog entry',
        link: 'https://example.com/changelog/entry',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'changelog body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe('https://example.com/blog/only-one');
  });

  it('フィルタ後が0件でもエラーにならず空配列を返す', async () => {
    mockFeed([
      {
        title: 'Changelog entry',
        link: 'https://example.com/changelog/entry',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'changelog body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('urlPathFilter: URL解決とスキーム制限', () => {
  it('相対linkはfeedUrl基準で解決され、対象パスなら取得される', async () => {
    // rss-parser は Atom の <link href="/blog/post"> を相対のまま返す
    mockFeed([
      {
        title: 'Relative link post',
        link: '/blog/relative-post',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'blog body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(1);
    // 保存URLは既存挙動どおり item.link をそのまま使う（解決結果で上書きしない）
    expect(result.articles[0].url).toBe('/blog/relative-post');
  });

  it('相対linkが対象外パスなら除外される', async () => {
    mockFeed([
      {
        title: 'Relative changelog',
        link: '/changelog/relative-entry',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'changelog body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
  });

  it('http/https以外のスキームはパスが一致しても除外される', async () => {
    mockFeed([
      {
        title: 'Data URL entry',
        link: 'data:text/html,/blog/fake',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
      {
        title: 'FTP entry',
        link: 'ftp://example.com/blog/file',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
      {
        title: 'Valid https entry',
        link: 'https://example.com/blog/valid',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe('https://example.com/blog/valid');
  });

  it('別ホストでも対象パスなら取得される（ホスト制限はしない）', async () => {
    mockFeed([
      {
        title: 'Cross host post',
        link: 'https://other.example.org/blog/cross-host',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(1);
  });

  it('linkが無いitemは除外される', async () => {
    mockFeed([
      {
        title: 'No link entry',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
  });
});

describe('urlPathFilter: pathname前方一致のセグメント境界', () => {
  it('クエリ・フラグメント付きURLでもpathnameだけで判定される', async () => {
    mockFeed([
      {
        title: 'Post with query',
        link: 'https://example.com/blog/post?utm_source=feed#section',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(1);
  });

  it('パス途中に対象文字列があっても前方一致しなければ除外される', async () => {
    // 文字列 includes 判定なら誤って通ってしまうケース
    mockFeed([
      {
        title: 'Changelog about blog',
        link: 'https://example.com/changelog/blog-redesign',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
  });

  it('末尾スラッシュ付き設定は別セグメント（/blogger）に一致しない', async () => {
    mockFeed([
      {
        title: 'Blogger post',
        link: 'https://example.com/blogger/post',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
  });

  it('末尾スラッシュ付き設定はインデックスページ（/blog）自体を除外する', async () => {
    mockFeed([
      {
        title: 'Blog index',
        link: 'https://example.com/blog',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith({ ...BASE_CONFIG, urlPathFilter: '/blog/' });

    expect(result.articles).toHaveLength(0);
  });
});

describe('urlPathFilter: 未設定時の従来挙動', () => {
  it('未設定なら全itemが対象になり、slice(0,30)のみ適用される', async () => {
    const items: MockItem[] = Array.from({ length: 35 }, (_, i) => ({
      title: `Entry ${i}`,
      link: `https://example.com/changelog/entry-${i}`,
      isoDate: '2026-08-01T00:00:00.000Z',
      content: 'body',
    }));
    mockFeed(items);

    const result = await fetchWith(BASE_CONFIG);

    expect(result.articles).toHaveLength(30);
    expect(result.articles[0].url).toBe('https://example.com/changelog/entry-0');
  });

  it('未設定なら相対linkのitemも従来どおり取得される', async () => {
    mockFeed([
      {
        title: 'Relative entry',
        link: '/changelog/relative',
        isoDate: '2026-08-01T00:00:00.000Z',
        content: 'body',
      },
    ]);

    const result = await fetchWith(BASE_CONFIG);

    expect(result.articles).toHaveLength(1);
  });
});
