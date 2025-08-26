import { GoogleDevBlogFetcher } from '../../lib/fetchers/google-dev-blog';
import { Source } from '@prisma/client';

// モックの設定
jest.mock('../../lib/enrichers', () => ({
  ContentEnricherFactory: jest.fn().mockImplementation(() => ({
    getEnricher: jest.fn().mockImplementation((url) => {
      if (url.includes('google')) {
        return {
          enrich: jest.fn().mockImplementation(async (url) => {
            // エンリッチメント成功のシミュレーション
            return {
              content: 'This is enriched content with much more details. '.repeat(100), // 5000文字
              thumbnail: 'https://example.com/image.jpg'
            };
          })
        };
      }
      return null;
    })
  }))
}));

jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          title: 'Test Article about Gemini AI',
          link: 'https://developers.googleblog.com/test-article',
          pubDate: new Date().toISOString(),
          content: 'Short RSS content',
          contentSnippet: 'Short RSS content',
          categories: ['AI', 'Machine Learning']
        },
        {
          title: 'Non-tech Article',
          link: 'https://developers.googleblog.com/non-tech',
          pubDate: new Date().toISOString(),
          content: 'This article is not about technology',
          categories: ['Other']
        },
        {
          title: 'Old Article about Chrome',
          link: 'https://developers.googleblog.com/old-article',
          pubDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), // 40日前
          content: 'Old content about Chrome',
          categories: ['Chrome']
        }
      ]
    })
  }));
});

describe('GoogleDevBlogFetcher', () => {
  let fetcher: GoogleDevBlogFetcher;
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'test-id',
      name: 'Google Developers Blog',
      url: 'https://developers.googleblog.com/feeds/posts/default',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fetcher = new GoogleDevBlogFetcher(mockSource);
  });

  describe('fetch', () => {
    it('should fetch and enrich articles successfully', async () => {
      const result = await fetcher.fetch();

      expect(result.articles).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.articles.length).toBe(1); // 技術記事かつ30日以内は1件のみ
      
      const article = result.articles[0];
      expect(article.title).toBe('Test Article about Gemini AI');
      expect(article.content).toContain('This is enriched content');
      expect(article.content.length).toBeGreaterThan(1000); // エンリッチメント後
      expect(article.thumbnail).toBe('https://example.com/image.jpg');
    });

    it('should filter out non-tech articles', async () => {
      const result = await fetcher.fetch();
      
      // 非技術記事はフィルタリングされる
      const nonTechArticle = result.articles.find(a => 
        a.title === 'Non-tech Article'
      );
      expect(nonTechArticle).toBeUndefined();
    });

    it('should filter out articles older than 30 days', async () => {
      const result = await fetcher.fetch();
      
      // 30日より古い記事はフィルタリングされる
      const oldArticle = result.articles.find(a => 
        a.title === 'Old Article about Chrome'
      );
      expect(oldArticle).toBeUndefined();
    });
  });

  describe('parseItem (private method test via fetch)', () => {
    it('should handle enrichment failure gracefully', async () => {
      // エンリッチメント失敗をシミュレート
      const ContentEnricherFactory = require('../../lib/enrichers').ContentEnricherFactory;
      ContentEnricherFactory.mockImplementation(() => ({
        getEnricher: jest.fn().mockImplementation(() => ({
          enrich: jest.fn().mockRejectedValue(new Error('Enrichment failed'))
        }))
      }));

      const result = await fetcher.fetch();
      
      // エラーが発生してもフォールバックで元のコンテンツを使用
      expect(result.articles.length).toBe(1);
      expect(result.articles[0].content).toBe('Short RSS content');
      expect(result.errors.length).toBe(0); // エラーは内部で処理される
    });

    it('should skip enrichment for content longer than 2000 chars', async () => {
      // 長いコンテンツを持つ記事をシミュレート
      const Parser = require('rss-parser');
      Parser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          items: [
            {
              title: 'Long Content Article about AI',
              link: 'https://developers.googleblog.com/long-article',
              pubDate: new Date().toISOString(),
              content: 'x'.repeat(2500), // 2500文字
              categories: ['AI']
            }
          ]
        })
      }));

      const newFetcher = new GoogleDevBlogFetcher(mockSource);
      const result = await newFetcher.fetch();

      // 2000文字以上の場合はエンリッチメントがスキップされる
      expect(result.articles[0].content.length).toBe(2500);
      expect(result.articles[0].content).toBe('x'.repeat(2500));
    });

    it('should include gemini keyword in tech filtering', async () => {
      const Parser = require('rss-parser');
      Parser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          items: [
            {
              title: 'Article about Gemini',
              link: 'https://developers.googleblog.com/gemini-article',
              pubDate: new Date().toISOString(),
              content: 'Content about Gemini model',
              categories: []
            }
          ]
        })
      }));

      const newFetcher = new GoogleDevBlogFetcher(mockSource);
      const result = await newFetcher.fetch();

      // 'gemini'キーワードが追加されているか確認
      expect(result.articles.length).toBe(1);
      expect(result.articles[0].title).toBe('Article about Gemini');
    });
  });

  describe('error handling', () => {
    it('should handle RSS parsing errors', async () => {
      const Parser = require('rss-parser');
      Parser.mockImplementation(() => ({
        parseURL: jest.fn().mockRejectedValue(new Error('RSS parse error'))
      }));

      const newFetcher = new GoogleDevBlogFetcher(mockSource);
      const result = await newFetcher.fetch();

      expect(result.articles.length).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toContain('Failed to fetch Google Dev Blog');
    });
  });
});