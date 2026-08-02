/**
 * GenericForeignRssFetcher useNormalizedUrl のテスト（Issue #628）
 *
 * フィードが付与するトラッキングパラメータ（?utm_source=feed 等）をそのまま
 * 保存すると、他ソース経由で収集済みの同一記事（正規URL）と URL 完全一致せず
 * 重複レコードが生成される。useNormalizedUrl 有効時は正規化URLで保存する。
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

const TRACKED_URL = 'https://gihyo.jp/article/2026/07/terminal-browser?utm_source=feed';
const CANONICAL_URL = 'https://gihyo.jp/article/2026/07/terminal-browser';

const createMockSource = (): Source => ({
  id: 'gihyo_jp',
  name: 'gihyo.jp',
  url: 'https://gihyo.jp',
  type: 'RSS',
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createConfig = (
  overrides?: Partial<ForeignSourceConfig>
): ForeignSourceConfig => ({
  feedUrl: 'https://gihyo.jp/feed/rss2',
  tagPrefix: 'gihyo',
  ...overrides,
});

const mockFeedWithTrackedUrl = () => {
  const mockParseURL = jest.fn().mockResolvedValue({
    items: [
      {
        title: 'ターミナル内で動くブラウザーが登場',
        link: TRACKED_URL,
        isoDate: '2026-07-31T10:16:00Z',
        description: 'テスト用の本文です。',
      },
    ],
  });
  MockedParser.mockImplementation(
    () => ({ parseURL: mockParseURL }) as unknown as Parser
  );
};

describe('GenericForeignRssFetcher useNormalizedUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeedWithTrackedUrl();
  });

  it('有効時はトラッキングパラメータを除去したURLで保存する', async () => {
    const fetcher = new GenericForeignRssFetcher(
      createMockSource(),
      createConfig({ useNormalizedUrl: true })
    );

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(CANONICAL_URL);
  });

  it('未設定時は従来どおり元URLを保存する（既存ソースの挙動を変えない）', async () => {
    const fetcher = new GenericForeignRssFetcher(
      createMockSource(),
      createConfig()
    );

    const result = await fetcher.fetch();

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(TRACKED_URL);
  });
});
