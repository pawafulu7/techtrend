/**
 * GenericForeignRssFetcher の Lobsters / Techmeme 設定リグレッションテスト
 * （Issue #628 Batch 2）
 *
 * FOREIGN_SOURCE_CONFIGS['Lobsters'] / ['Techmeme'] を実設定のまま使用し、
 * feed-fixtures.test.ts で固定した rss-parser のパース結果（description の
 * content/contentSnippet 変換、アンカー付きlink）相当の parseURL 結果を
 * モックして fetch() を実行する。
 *
 * - Lobsters (ignoreFeedContent: true): content が空文字になり、
 *   url は正規化されない生URL（www・末尾スラッシュ保持）のまま保存される
 * - Techmeme (useNormalizedUrl: true): url がフラグメント・www除去済みの
 *   正規化URLで保存され、アイテムごとに一意になる
 */

import {
  GenericForeignRssFetcher,
  FOREIGN_SOURCE_CONFIGS,
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

const createMockSource = (overrides?: Partial<Source>): Source => ({
  id: 'lobsters',
  name: 'Lobsters',
  url: 'https://lobste.rs',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('GenericForeignRssFetcher: Lobsters設定 (ignoreFeedContent)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const mockParseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Some article title',
          // Lobsters の link は外部記事の生URL（www・末尾スラッシュ付き）
          link: 'https://www.example.com/blog/Some-Article/',
          isoDate: '2026-08-02T10:00:00.000Z',
          // rss-parser の description -> content/contentSnippet 変換結果
          // （feed-fixtures.test.ts で固定した事実と同じ形状）
          content:
            '<p><a href="https://lobste.rs/s/abc123/some_article_title">Comments</a></p>',
          contentSnippet: 'Comments',
        },
      ],
    });
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );
  });

  it('contentが空文字になり、urlは生URLのまま（www・末尾スラッシュ保持）保存される', async () => {
    const config = FOREIGN_SOURCE_CONFIGS['Lobsters'];
    expect(config).toBeDefined();
    expect(config.ignoreFeedContent).toBe(true);
    expect(config.useNormalizedUrl).toBeUndefined();

    const fetcher = new GenericForeignRssFetcher(createMockSource(), config);
    const result = await fetcher.fetch();

    expect(result.errors).toHaveLength(0);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].content).toBe('');
    expect(result.articles[0].url).toBe(
      'https://www.example.com/blog/Some-Article/'
    );
  });
});

describe('GenericForeignRssFetcher: Techmeme設定 (useNormalizedUrl)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('urlがフラグメント・www除去済みの正規化URLで保存される', async () => {
    const mockParseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Some Headline About AI',
          // Techmeme の link は自サイトのリバーページ・パーマリンク（#アンカー付き）
          link: 'https://www.techmeme.com/260802/p6#a260802p6',
          isoDate: '2026-08-02T09:00:00.000Z',
          content:
            '<img src="https://example.com/thumb.jpg" border="0" /> <a href="https://example.com/story-page">Company announces new AI product with expanded capabilities</a>',
          contentSnippet:
            'Company announces new AI product with expanded capabilities',
        },
      ],
    });
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );

    const config = FOREIGN_SOURCE_CONFIGS['Techmeme'];
    expect(config).toBeDefined();
    expect(config.useNormalizedUrl).toBe(true);
    expect(config.skipEnrichment).toBe(true);

    const fetcher = new GenericForeignRssFetcher(
      createMockSource({ id: 'techmeme', name: 'Techmeme', url: 'https://www.techmeme.com' }),
      config
    );
    const result = await fetcher.fetch();

    expect(result.errors).toHaveLength(0);
    expect(result.articles).toHaveLength(1);
    // normalizeUrl はフラグメント除去に加えて www. も除去する
    expect(result.articles[0].url).toBe('https://techmeme.com/260802/p6');
  });

  it('アイテムごとに正規化URLが一意になる（別アンカー付きlinkは別URLとして保存される）', async () => {
    const mockParseURL = jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Headline One',
          link: 'https://www.techmeme.com/260802/p6#a260802p6',
          isoDate: '2026-08-02T09:00:00.000Z',
          content: 'Headline One body text is long enough to pass sanitize.',
          contentSnippet: 'Headline One body text is long enough to pass sanitize.',
        },
        {
          title: 'Headline Two',
          link: 'https://www.techmeme.com/260802/p7#a260802p7',
          isoDate: '2026-08-02T09:30:00.000Z',
          content: 'Headline Two body text is long enough to pass sanitize.',
          contentSnippet: 'Headline Two body text is long enough to pass sanitize.',
        },
      ],
    });
    MockedParser.mockImplementation(
      () => ({ parseURL: mockParseURL }) as unknown as Parser
    );

    const config = FOREIGN_SOURCE_CONFIGS['Techmeme'];
    const fetcher = new GenericForeignRssFetcher(
      createMockSource({ id: 'techmeme', name: 'Techmeme', url: 'https://www.techmeme.com' }),
      config
    );
    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(2);
    const urls = result.articles.map((a) => a.url);
    expect(new Set(urls).size).toBe(2);
    expect(urls).toEqual([
      'https://techmeme.com/260802/p6',
      'https://techmeme.com/260802/p7',
    ]);
  });
});
