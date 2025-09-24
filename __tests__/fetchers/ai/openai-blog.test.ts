import { OpenAIBlogFetcher } from '../../../lib/fetchers/ai/openai-blog';
import { Source } from '@prisma/client';

// モックの設定
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          title: 'ChatGPT New Features Announced',
          link: 'https://openai.com/blog/chatgpt-new-features',
          pubDate: new Date().toISOString(),
          content: 'New features for ChatGPT including...',
          contentSnippet: 'Short description',
          categories: ['AI', 'ChatGPT']
        },
        {
          title: 'GPT-4 Technical Report',
          link: 'https://openai.com/blog/gpt-4-technical',
          pubDate: new Date().toISOString(),
          content: 'Technical details about GPT-4...',
        },
        {
          title: 'Old Announcement',
          link: 'https://openai.com/blog/old-post',
          pubDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), // 35日前
          content: 'Old content',
        }
      ]
    })
  }));
});

describe('OpenAIBlogFetcher', () => {
  let fetcher: OpenAIBlogFetcher;
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'test-openai-id',
      name: 'OpenAI Blog',
      url: 'https://openai.com/blog/rss.xml',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fetcher = new OpenAIBlogFetcher(mockSource);
  });

  describe('fetch', () => {
    it('should fetch articles successfully', async () => {
      const result = await fetcher.fetch();

      expect(result.articles).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.articles.length).toBe(2); // 30日以内の記事は2件

      const article = result.articles[0];
      expect(article.title).toBe('ChatGPT New Features Announced');
      expect(article.url).toBe('https://openai.com/blog/chatgpt-new-features');
      expect(article.sourceId).toBe('test-openai-id');
      expect(article.summary).toBeUndefined(); // 要約は生成しない
    });

    it('should filter out articles older than 30 days', async () => {
      const result = await fetcher.fetch();

      // 30日より古い記事はフィルタリングされる
      const oldArticle = result.articles.find(a =>
        a.title === 'Old Announcement'
      );
      expect(oldArticle).toBeUndefined();
    });

    it('should add appropriate tags to articles', async () => {
      const result = await fetcher.fetch();

      const article = result.articles[0];
      expect(article.tagNames).toBeDefined();
      expect(article.tagNames).toContain('OpenAI');
      expect(article.tagNames).toContain('AI');
      expect(article.tagNames).toContain('LLM');
      expect(article.tagNames).toContain('ChatGPT');
    });

    it('should handle errors gracefully', async () => {
      // 新しいフェッチャーインスタンスを作成してエラーをシミュレート
      const Parser = require('rss-parser');
      Parser.mockImplementationOnce(() => ({
        parseURL: jest.fn().mockRejectedValue(new Error('Network error'))
      }));

      // 新しいインスタンスを作成（モックが適用される）
      const errorFetcher = new OpenAIBlogFetcher(mockSource);
      const result = await errorFetcher.fetch();

      expect(result.articles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });
  });
});