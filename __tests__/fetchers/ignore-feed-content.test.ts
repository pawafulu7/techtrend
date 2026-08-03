/**
 * GenericForeignRssFetcher ignoreFeedContent / isEnrichmentSkipped のテスト
 * （Issue #628 Batch 2）
 *
 * ignoreFeedContent: description がコメントリンク等のノイズのみのソース
 * （例: Lobsters）向けに、フィード本文を採用せず空文字で保存するオプション。
 * isEnrichmentSkipped: enricher による本文上書きを行わないソース
 * （例: Techmeme）を判定する共通ヘルパー。
 */

import {
  GenericForeignRssFetcher,
  ForeignSourceConfig,
  FOREIGN_SOURCE_CONFIGS,
  isEnrichmentSkipped,
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

const createMockSource = (): Source => ({
  id: 'lobsters',
  name: 'Lobsters',
  url: 'https://lobste.rs',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createConfig = (
  overrides?: Partial<ForeignSourceConfig>
): ForeignSourceConfig => ({
  feedUrl: 'https://lobste.rs/rss',
  tagPrefix: 'lobsters',
  ...overrides,
});

const mockFeedWithDescription = () => {
  const mockParseURL = jest.fn().mockResolvedValue({
    items: [
      {
        title: 'テスト記事タイトル',
        link: 'https://example.com/article',
        isoDate: '2026-07-31T10:16:00Z',
        description: 'Comments',
      },
    ],
  });
  MockedParser.mockImplementation(
    () => ({ parseURL: mockParseURL }) as unknown as Parser
  );
};

describe('GenericForeignRssFetcher ignoreFeedContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeedWithDescription();
  });

  it('有効時はフィードのdescriptionを採用せず、contentが空文字になる', async () => {
    const fetcher = new GenericForeignRssFetcher(
      createMockSource(),
      createConfig({ ignoreFeedContent: true })
    );

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].content).toBe('');
  });

  it('未設定時は従来どおりdescriptionをcontentとして採用する', async () => {
    const fetcher = new GenericForeignRssFetcher(
      createMockSource(),
      createConfig()
    );

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].content).toBe('Comments');
  });
});

describe('isEnrichmentSkipped', () => {
  const TEST_SOURCE_NAME = '__test_skip_enrichment_source__';

  afterEach(() => {
    // テスト用に追加した一時エントリを必ず削除し、既存21ソースへの影響をゼロにする
    delete FOREIGN_SOURCE_CONFIGS[TEST_SOURCE_NAME];
  });

  it('skipEnrichment: true が設定されたソース名でtrueを返す', () => {
    FOREIGN_SOURCE_CONFIGS[TEST_SOURCE_NAME] = {
      feedUrl: 'https://example.com/feed',
      skipEnrichment: true,
    };

    expect(isEnrichmentSkipped(TEST_SOURCE_NAME)).toBe(true);
  });

  it('未設定ソース名ではfalseを返す（従来動作）', () => {
    expect(isEnrichmentSkipped('Meta Engineering')).toBe(false);
  });

  it('FOREIGN_SOURCE_CONFIGSに存在しないソース名ではfalseを返す', () => {
    expect(isEnrichmentSkipped('Nonexistent Source XYZ')).toBe(false);
  });
});
