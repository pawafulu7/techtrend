/**
 * FetchResult.errors 伝播の単体テスト（Issue #636: 収集失敗・0件の可視化）
 *
 * フェッチャー内部のフィード取得・パースエラーは例外を投げず、
 * FetchResult（{ articles, errors }）の errors 配列に積むだけの設計になっている。
 * collect-feeds.ts の processSource はこれを ProcessSourceResult.fetchErrorCount
 * として観測可能にするが、その前提となる「両フェッチャー系統
 * （generic-foreign-rss / base-corporate-fetcher）が実際に errors を返すこと」を
 * ここで固定する。
 *
 * batch2-sources.test.ts の rss-parser モックパターンを踏襲する。
 */

import {
  GenericForeignRssFetcher,
  FOREIGN_SOURCE_CONFIGS,
} from '@/lib/fetchers/generic-foreign-rss';
import { FreeeFetcher } from '@/lib/fetchers/corporate-blogs/freee-fetcher';
import { Source } from '@/lib/prisma-exports';
import Parser from 'rss-parser';
import { normalizeUrl } from '@/lib/utils/url/url-normalizer';
import { getContentFromItem } from '@/lib/types/rss';

jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  }));
});
const MockedParser = jest.mocked(Parser);

jest.mock('@/lib/logger', () => {
  const noop = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
  // generic-foreign-rss.ts は named import、base-corporate-fetcher.ts は default import
  return { __esModule: true, logger: noop, default: noop };
});

jest.mock('@/lib/utils/duplicate-detection', () => ({
  isDuplicate: jest.fn().mockReturnValue(false),
}));

jest.mock('@/lib/utils/url/url-normalizer', () => ({
  normalizeUrl: jest.fn((url: string) => url),
}));

jest.mock('@/lib/types/rss', () => {
  const actual = jest.requireActual('@/lib/types/rss');
  return {
    ...actual,
    getContentFromItem: jest.fn(actual.getContentFromItem),
  };
});

const mockedNormalizeUrl = jest.mocked(normalizeUrl);
const mockedGetContentFromItem = jest.mocked(getContentFromItem);

const createMockSource = (overrides?: Partial<Source>): Source => ({
  id: 'test-source',
  name: 'Test Source',
  url: 'https://example.com',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('GenericForeignRssFetcher: errors伝播', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNormalizeUrl.mockImplementation((url: string) => url);
  });

  it('フィード取得自体が失敗した場合、例外を投げずerrorsに積んで返す', async () => {
    const mockParseURL = jest.fn().mockRejectedValue(new Error('network timeout'));
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );

    const config = FOREIGN_SOURCE_CONFIGS['CNCF Blog'];
    expect(config).toBeDefined();
    const fetcher = new GenericForeignRssFetcher(
      createMockSource({ id: 'cncf', name: 'CNCF Blog' }),
      config
    );

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBeInstanceOf(Error);
    expect(result.errors[0].message).toContain('CNCF Blog');
    expect(result.errors[0].message).toContain('network timeout');
  });

  it('個別itemの処理中エラーはerrorsに積まれ、他のitemの処理は継続する', async () => {
    const mockParseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Broken item',
          link: 'https://example.com/broken',
          isoDate: '2026-08-02T10:00:00.000Z',
          content: 'broken item content',
        },
        {
          title: 'Healthy item',
          link: 'https://example.com/healthy',
          isoDate: '2026-08-02T11:00:00.000Z',
          content: 'healthy item content body',
        },
      ],
    });
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );

    // normalizeUrl は articles ループ内で item ごとに呼ばれる。'broken' を含む
    // itemUrl のときだけ例外を投げ、当該item単体の処理失敗を再現する
    mockedNormalizeUrl.mockImplementation((url: string) => {
      if (url.includes('broken')) {
        throw new Error('normalize failure');
      }
      return url;
    });

    const config = FOREIGN_SOURCE_CONFIGS['Meta Engineering'];
    expect(config).toBeDefined();
    const fetcher = new GenericForeignRssFetcher(
      createMockSource({ id: 'meta', name: 'Meta Engineering' }),
      config
    );

    const result = await fetcher.fetch();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Broken item');
    expect(result.errors[0].message).toContain('normalize failure');
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('Healthy item');
  });
});

describe('BaseCorporateFetcher (via FreeeFetcher): errors伝播', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetContentFromItem.mockImplementation(
      jest.requireActual('@/lib/types/rss').getContentFromItem
    );
  });

  it('フィード取得自体が失敗した場合、リトライを使い切っても例外を投げずerrorsに積んで返す', async () => {
    jest.useFakeTimers();
    try {
      const mockParseURL = jest.fn().mockRejectedValue(new Error('DNS resolution failed'));
      MockedParser.mockImplementation(
        () => ({ parseURL: mockParseURL }) as unknown as Parser
      );

      const fetcher = new FreeeFetcher(createMockSource({ id: 'freee', name: 'freee' }));
      const resultPromise = fetcher.fetch();
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(Error);
      expect(result.errors[0].message).toContain('freee');
      expect(result.errors[0].message).toContain('DNS resolution failed');
      // maxRetries(3) 分のリトライ + 初回実行で計4回呼ばれる
      expect(mockParseURL).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('個別itemの処理中エラーはerrorsに積まれる', async () => {
    mockedGetContentFromItem.mockImplementation(() => {
      throw new Error('unexpected item shape');
    });

    const mockParseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'テスト記事',
          link: 'https://developers.freee.co.jp/entry/test',
          isoDate: new Date().toISOString(),
        },
      ],
    });
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );

    const fetcher = new FreeeFetcher(createMockSource({ id: 'freee', name: 'freee' }));
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBeInstanceOf(Error);
    expect(result.errors[0].message).toContain('freee');
    expect(result.errors[0].message).toContain('unexpected item shape');
  });
});
