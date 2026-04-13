import { Source } from '@/lib/prisma-exports';
import {
  DevelopersIOFetcher,
  DEVELOPERSIO_TAGS,
  isDevelopersIOTag,
  getTagFromSourceName,
  DevelopersIOTag,
} from '../../lib/fetchers/developersio';

// Mock rss-parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Amazon Bedrock Claude 3.5 Sonnetを使ってみた',
          link: 'https://dev.classmethod.jp/articles/amazon-bedrock-claude-35-sonnet/',
          pubDate: new Date().toISOString(),
          isoDate: new Date().toISOString(),
          content: 'Amazon Bedrockで Claude 3.5 Sonnetを使う方法について解説します。',
          contentEncoded: '<p>Amazon Bedrockで Claude 3.5 Sonnetを使う方法について解説します。</p>',
          categories: ['AWS', 'Amazon Bedrock', 'Claude'],
          'dc:creator': 'classmethod-author',
        },
        {
          title: 'MCPサーバーの構築方法',
          link: 'https://dev.classmethod.jp/articles/mcp-server-setup/',
          pubDate: new Date().toISOString(),
          isoDate: new Date().toISOString(),
          content: 'MCP（Model Context Protocol）サーバーの構築手順を解説します。',
          categories: ['MCP', 'AI'],
        },
        {
          title: 'Old Article',
          link: 'https://dev.classmethod.jp/articles/old-article/',
          pubDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
          isoDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
          content: 'This is an old article.',
        },
      ],
    }),
  }));
});

describe('DevelopersIOFetcher', () => {
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'developersio_ai',
      name: 'DevelopersIO AI',
      type: 'rss',
      url: 'https://dev.classmethod.jp/tags/generative-ai/feed/',
      enabled: true,
      groupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jest.clearAllMocks();
  });

  describe('constructor and getRssUrl', () => {
    it.each<[DevelopersIOTag, string]>([
      ['aws', 'https://dev.classmethod.jp/tags/aws/feed/'],
      ['generative-ai', 'https://dev.classmethod.jp/tags/generative-ai/feed/'],
      ['claude', 'https://dev.classmethod.jp/tags/claude/feed/'],
      ['mcp', 'https://dev.classmethod.jp/tags/mcp/feed/'],
      ['security', 'https://dev.classmethod.jp/tags/security/feed/'],
    ])('should generate correct RSS URL for tag "%s"', (tag, expectedUrl) => {
      const source = { ...mockSource, id: `developersio_${tag}`, name: `DevelopersIO ${tag}` };
      const fetcher = new DevelopersIOFetcher(source, tag);

      // Access protected method via any type cast
      const rssUrl = (fetcher as any).getRssUrl();
      expect(rssUrl).toBe(expectedUrl);
    });
  });

  describe('getCompanyName', () => {
    it('should return "DevelopersIO"', () => {
      const fetcher = new DevelopersIOFetcher(mockSource, 'aws');

      // Access protected method via any type cast
      const companyName = (fetcher as any).getCompanyName();
      expect(companyName).toBe('DevelopersIO');
    });
  });

  describe('getNormalizedCompanyName', () => {
    it.each<[DevelopersIOTag, string]>([
      ['aws', 'DevelopersIO (aws)'],
      ['generative-ai', 'DevelopersIO (generative-ai)'],
      ['claude', 'DevelopersIO (claude)'],
      ['mcp', 'DevelopersIO (mcp)'],
      ['security', 'DevelopersIO (security)'],
    ])('should return normalized name with tag for "%s"', (tag, expectedName) => {
      const source = { ...mockSource, id: `developersio_${tag}` };
      const fetcher = new DevelopersIOFetcher(source, tag);

      // Access protected method via any type cast
      const normalizedName = (fetcher as any).getNormalizedCompanyName();
      expect(normalizedName).toBe(expectedName);
    });
  });

  describe('fetch', () => {
    it('should fetch articles successfully', async () => {
      const fetcher = new DevelopersIOFetcher(mockSource, 'generative-ai');
      const result = await fetcher.fetch();

      expect(result.articles).toBeDefined();
      expect(result.errors).toBeDefined();
      // Should filter out articles older than 30 days
      expect(result.articles.length).toBe(2);
    }, 15000);

    it('should set correct sourceId from constructor', async () => {
      const fetcher = new DevelopersIOFetcher(mockSource, 'generative-ai');
      const result = await fetcher.fetch();

      expect(result.articles.length).toBeGreaterThan(0);
      result.articles.forEach((article) => {
        expect(article.sourceId).toBe('developersio_ai');
      });
    }, 15000);

    it('should filter out articles older than 30 days', async () => {
      const fetcher = new DevelopersIOFetcher(mockSource, 'generative-ai');
      const result = await fetcher.fetch();

      const oldArticle = result.articles.find((a) => a.title === 'Old Article');
      expect(oldArticle).toBeUndefined();
    }, 15000);

    it('should extract tags from RSS categories', async () => {
      const fetcher = new DevelopersIOFetcher(mockSource, 'generative-ai');
      const result = await fetcher.fetch();

      const article = result.articles.find((a) =>
        a.title.includes('Amazon Bedrock')
      );
      expect(article).toBeDefined();
      expect(article?.tagNames).toBeDefined();
      expect(article?.tagNames).toContain('AWS');
      expect(article?.tagNames).toContain('Amazon Bedrock');
      expect(article?.tagNames).toContain('Claude');
    }, 15000);

    it('should handle errors gracefully', async () => {
      const Parser = require('rss-parser');
      Parser.mockImplementationOnce(() => ({
        parseURL: jest.fn().mockRejectedValue(new Error('Network error')),
      }));

      const errorFetcher = new DevelopersIOFetcher(mockSource, 'generative-ai');
      const result = await errorFetcher.fetch();

      expect(result.articles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });
  });
});

describe('isDevelopersIOTag', () => {
  it.each(DEVELOPERSIO_TAGS)('should return true for valid tag "%s"', (tag) => {
    expect(isDevelopersIOTag(tag)).toBe(true);
  });

  it.each(['invalid', 'unknown', '', 'AWS', 'CLAUDE'])('should return false for invalid tag "%s"', (tag) => {
    expect(isDevelopersIOTag(tag)).toBe(false);
  });
});

describe('getTagFromSourceName', () => {
  it.each<[string, DevelopersIOTag]>([
    ['DevelopersIO AWS', 'aws'],
    ['DevelopersIO AI', 'generative-ai'],
    ['DevelopersIO Claude', 'claude'],
    ['DevelopersIO MCP', 'mcp'],
    ['DevelopersIO Security', 'security'],
  ])('should return correct tag for source name "%s"', (sourceName, expectedTag) => {
    expect(getTagFromSourceName(sourceName)).toBe(expectedTag);
  });

  it.each(['Unknown Source', 'DevelopersIO Unknown', ''])('should return undefined for invalid source name "%s"', (sourceName) => {
    expect(getTagFromSourceName(sourceName)).toBeUndefined();
  });
});

describe('DEVELOPERSIO_TAGS', () => {
  it('should contain all expected tags', () => {
    expect(DEVELOPERSIO_TAGS).toEqual(['aws', 'generative-ai', 'claude', 'mcp', 'security']);
  });

  it('should have 5 tags', () => {
    expect(DEVELOPERSIO_TAGS.length).toBe(5);
  });
});
