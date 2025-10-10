import { HackerNewsFetcher } from '@/lib/fetchers/hacker-news';
import { Source } from '@prisma/client';

describe('HackerNewsFetcher', () => {
  let fetcher: HackerNewsFetcher;

  beforeEach(() => {
    // モックSourceオブジェクトを使用（データベース接続不要）
    const mockSource: Source = {
      id: 'hacker_news_test',
      name: 'Hacker News',
      type: 'rss',
      url: 'https://news.ycombinator.com/rss',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    fetcher = new HackerNewsFetcher(mockSource);
  });

  describe('generateHackerNewsTags', () => {
    it('should not include source-based tags', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Test Article about JavaScript',
        'https://example.com'
      );

      // ソースベースタグが含まれていないこ とを確認
      expect(tags).not.toContain('Hacker News');
      expect(tags).not.toContain('Tech News');
    });

    it('should not include overly generic tags', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Test Article about React',
        'https://example.com'
      );

      // 一般的すぎるタグが含まれていないことを確認
      expect(tags).not.toContain('Technology');
      expect(tags).not.toContain('Programming');
    });

    it('should include content-based tags', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Building a React App with JavaScript and TypeScript',
        'https://github.com/example/repo'
      );

      // コンテンツベースのタグが含まれていることを確認
      expect(tags).toContain('JavaScript');
      expect(tags).toContain('TypeScript');
      expect(tags).toContain('React');
      expect(tags).toContain('GitHub');
      expect(tags).toContain('Open Source');
    });

    it('should include URL-based tags for GitHub', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Test Article',
        'https://github.com/facebook/react'
      );

      // URLベースのタグが含まれていることを確認
      expect(tags).toContain('GitHub');
      expect(tags).toContain('Open Source');
    });

    it('should include URL-based tags for arXiv', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Test Article',
        'https://arxiv.org/abs/2301.00001'
      );

      // URLベースのタグが含まれていることを確認
      expect(tags).toContain('Research');
      expect(tags).toContain('Academic');
    });

    it('should include title-based technology tags', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'New AI model beats benchmarks with Machine Learning',
        'https://example.com'
      );

      // タイトルベースのタグが含まれていることを確認
      expect(tags).toContain('AI');
      expect(tags).toContain('Machine Learning');
    });

    it('should handle articles with no matching tags', () => {
      const tags = (fetcher as any).generateHackerNewsTags(
        'Some random article',
        'https://example.com'
      );

      // 空の配列ではないことを確認（最低限のタグはない）
      expect(Array.isArray(tags)).toBe(true);
      // ソースベースタグは含まれていないことを確認
      expect(tags).not.toContain('Hacker News');
      expect(tags).not.toContain('Tech News');
      expect(tags).not.toContain('Technology');
      expect(tags).not.toContain('Programming');
    });
  });
});
