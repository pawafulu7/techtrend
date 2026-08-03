/**
 * GenericForeignRssFetcher の Batch 3 設定リグレッションテスト
 * （Issue #628, 海外企業・プロダクトブログ5ソース）
 *
 * FOREIGN_SOURCE_CONFIGS の実設定をそのまま使用し、feed-fixtures.test.ts で
 * 固定した rss-parser のパース結果相当を parseURL としてモックして fetch() を
 * 実行する。設定判断（urlPathFilter / categoryFilter / useNormalizedUrl）が
 * 保存内容に正しく反映されることを検証する。
 *
 * useNormalizedUrl は「新規ソースなら常に有効化」ではなく、既存レコードの
 * 保存URL形式に合わせる判断のため、末尾スラッシュの保持・除去を明示的に固定する。
 */

import {
  GenericForeignRssFetcher,
  FOREIGN_SOURCE_CONFIGS,
} from '@/lib/fetchers/generic-foreign-rss';
import { SOURCE_CATEGORIES } from '@/lib/constants/source-categories';
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

/** Batch 3 で追加する5ソースの ソース名 -> Source.id 対応 */
const BATCH3_SOURCE_IDS: Record<string, string> = {
  'Vercel Blog': 'vercel_blog',
  'TypeScript Blog': 'typescript_blog',
  'VS Code Blog': 'vscode_blog',
  'Dropbox Tech': 'dropbox_tech',
  'Fly.io Blog': 'flyio_blog',
};

const createMockSource = (name: string): Source => ({
  id: BATCH3_SOURCE_IDS[name],
  name,
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
  contentSnippet?: string;
  'content:encoded'?: string;
  category?: Array<{ $?: { term?: string } }>;
  categories?: string[];
}

const mockFeed = (items: MockItem[]) => {
  const mockParseURL = jest.fn().mockResolvedValue({ items });
  MockedParser.mockImplementation(
    () => ({ parseURL: mockParseURL }) as unknown as Parser
  );
};

const fetchSource = async (name: string) => {
  const config = FOREIGN_SOURCE_CONFIGS[name];
  expect(config).toBeDefined();
  const fetcher = new GenericForeignRssFetcher(createMockSource(name), config);
  return fetcher.fetch();
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Batch 3: 設定辞書とカテゴリ定義の整合', () => {
  it.each(Object.keys(BATCH3_SOURCE_IDS))(
    '"%s" が FOREIGN_SOURCE_CONFIGS に定義されている',
    (name) => {
      expect(FOREIGN_SOURCE_CONFIGS[name]).toBeDefined();
      expect(FOREIGN_SOURCE_CONFIGS[name].feedUrl).toMatch(/^https:\/\//);
    }
  );

  // Source.id と カテゴリ定義の一致は他のテスト（scheduler-yaml-consistency /
  // create-fetcher）では検証されない。誤ると記事は収集されてもフィルタUIの
  // 海外ソースに表示されないため、ここで固定する
  it.each(Object.entries(BATCH3_SOURCE_IDS))(
    '"%s" の id "%s" が foreign カテゴリに登録されている',
    (_name, id) => {
      expect(SOURCE_CATEGORIES.foreign.sourceIds).toContain(id);
    }
  );
});

describe('Vercel Blog: urlPathFilter による /blog/ 絞り込み', () => {
  it('changelog・kb を除外し、blog記事のみを正規化URLで保存する', async () => {
    mockFeed([
      {
        title: 'Example changelog entry',
        link: 'https://vercel.com/changelog/example-changelog-entry',
        isoDate: '2026-07-31T17:00:00.000Z',
        content: '<div type="xhtml"><p>Product update description.</p></div>',
        contentSnippet: 'Product update description.',
      },
      {
        title: 'Example blog post',
        link: 'https://vercel.com/blog/example-blog-post',
        isoDate: '2026-07-30T12:00:00.000Z',
        content: '<div type="xhtml"><p>Blog article body.</p></div>',
        contentSnippet: 'Blog article body.',
      },
      {
        title: 'Example knowledge base bulletin',
        link: 'https://vercel.com/kb/bulletin/example-bulletin',
        isoDate: '2026-07-29T09:00:00.000Z',
        content: '<div type="xhtml"><p>Bulletin body.</p></div>',
        contentSnippet: 'Bulletin body.',
      },
    ]);

    const config = FOREIGN_SOURCE_CONFIGS['Vercel Blog'];
    expect(config.urlPathFilter).toBe('/blog/');
    expect(config.useNormalizedUrl).toBe(true);
    // Atom category を持たないフィードのため categoryFilter は使えない
    expect(config.categoryFilter).toBeUndefined();

    const result = await fetchSource('Vercel Blog');

    expect(result.errors).toHaveLength(0);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(
      'https://vercel.com/blog/example-blog-post'
    );
    expect(result.articles[0].content).toContain('Blog article body');
  });
});

describe('TypeScript Blog: 既存レコードに合わせた生URL保存', () => {
  it('末尾スラッシュ付きURLが正規化されずそのまま保存される', async () => {
    const rawUrl =
      'https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/';
    mockFeed([
      {
        title: 'Announcing TypeScript 7.0',
        link: rawUrl,
        isoDate: '2026-07-08T15:58:29.000Z',
        'content:encoded':
          '<p>Today we are proud to announce the availability of TypeScript 7.</p>',
        categories: ['TypeScript'],
      },
    ]);

    const config = FOREIGN_SOURCE_CONFIGS['TypeScript Blog'];
    // 既存の Hacker News / はてなブックマーク経由レコードが末尾スラッシュ付きの
    // 生URLで保存済みのため、正規化すると重複作成される
    expect(config.useNormalizedUrl).toBeUndefined();

    const result = await fetchSource('TypeScript Blog');

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(rawUrl);
    expect(result.articles[0].url.endsWith('/')).toBe(true);
    // content:encoded が本文として採用される
    expect(result.articles[0].content).toContain('TypeScript 7');
  });
});

describe('Fly.io Blog: 既存レコードに合わせた生URL保存', () => {
  it('末尾スラッシュ付きURLが正規化されずそのまま保存される', async () => {
    const rawUrl = 'https://fly.io/blog/example-blog-post/';
    mockFeed([
      {
        title: 'Example Blog Post Title',
        link: rawUrl,
        isoDate: '2026-07-24T00:00:00.000Z',
        content: '<p>We are a public cloud platform.</p>',
        contentSnippet: 'We are a public cloud platform.',
      },
    ]);

    const config = FOREIGN_SOURCE_CONFIGS['Fly.io Blog'];
    expect(config.useNormalizedUrl).toBeUndefined();

    const result = await fetchSource('Fly.io Blog');

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(rawUrl);
    expect(result.articles[0].url.endsWith('/')).toBe(true);
  });
});

describe('VS Code Blog: categoryFilter による blog 絞り込み', () => {
  it('release カテゴリを除外し、blog記事のみ保存する', async () => {
    mockFeed([
      {
        title: 'Visual Studio Code 1.131',
        link: 'https://code.visualstudio.com/updates/v1_131',
        isoDate: '2026-07-29T17:00:00.000Z',
        content: "<p>Learn what's new in Visual Studio Code 1.131</p>",
        contentSnippet: "Learn what's new in Visual Studio Code 1.131",
        category: [{ $: { term: 'release' } }],
      },
      {
        title: 'Example engineering blog post',
        link: 'https://code.visualstudio.com/blogs/2026/07/29/example-post',
        isoDate: '2026-07-29T10:00:00.000Z',
        content: '<p>Early results from an experiment.</p>',
        contentSnippet: 'Early results from an experiment.',
        category: [{ $: { term: 'blog' } }],
      },
    ]);

    const config = FOREIGN_SOURCE_CONFIGS['VS Code Blog'];
    expect(config.categoryFilter).toEqual(['blog']);
    expect(config.useNormalizedUrl).toBe(true);

    const result = await fetchSource('VS Code Blog');

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(
      'https://code.visualstudio.com/blogs/2026/07/29/example-post'
    );
    expect(result.articles[0].title).toBe('Example engineering blog post');
  });
});

describe('Dropbox Tech: content:encoded 由来の本文と正規化URL', () => {
  it('content:encodedが本文として採用され、トラッキングパラメータは除去される', async () => {
    mockFeed([
      {
        title: 'How our universal content processing platform evolved',
        link: 'https://dropbox.tech/infrastructure/example-platform?utm_source=feed',
        isoDate: '2026-07-20T15:00:00.000Z',
        content: 'Short description text.',
        'content:encoded':
          '<p>Our products transform a lot of content behind the scenes.</p>',
        categories: ['Dash', 'architecture', 'AI'],
      },
    ]);

    const config = FOREIGN_SOURCE_CONFIGS['Dropbox Tech'];
    expect(config.useNormalizedUrl).toBe(true);

    const result = await fetchSource('Dropbox Tech');

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].url).toBe(
      'https://dropbox.tech/infrastructure/example-platform'
    );
    // description ではなく content:encoded が優先される
    expect(result.articles[0].content).toContain(
      'transform a lot of content behind the scenes'
    );
  });
});
