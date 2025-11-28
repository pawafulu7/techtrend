/**
 * Zenn API Enricher Unit Tests
 */

import { ZennApiEnricher } from '@/lib/enrichers/zenn-api';
import { ZennService } from '@/lib/services/zenn-service';

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock ZennService
jest.mock('@/lib/services/zenn-service');

describe('ZennApiEnricher', () => {
  let enricher: ZennApiEnricher;

  beforeEach(() => {
    enricher = new ZennApiEnricher();
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for Zenn article URLs', () => {
      (ZennService.isZennArticleUrl as jest.Mock).mockReturnValue(true);

      expect(enricher.canHandle('https://zenn.dev/user/articles/slug')).toBe(true);
      expect(ZennService.isZennArticleUrl).toHaveBeenCalledWith('https://zenn.dev/user/articles/slug');
    });

    it('should return false for non-Zenn URLs', () => {
      (ZennService.isZennArticleUrl as jest.Mock).mockReturnValue(false);

      expect(enricher.canHandle('https://example.com/article')).toBe(false);
      expect(ZennService.isZennArticleUrl).toHaveBeenCalledWith('https://example.com/article');
    });
  });

  describe('enrich', () => {
    const mockZennResponse = {
      article: {
        id: 431306,
        title: 'Test Article',
        slug: 'test-slug',
        body_html: '<h1>Test Title</h1><p>This is test content with sufficient length for validation. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>',
        body_letters_count: 1000,
        published_at: '2025-11-26T11:56:47.780+09:00',
        body_updated_at: '2025-11-26T11:49:31.614+09:00',
        topics: ['Tech'],
        liked_count: 10,
        bookmarked_count: 5,
        article_type: 'tech',
        user: {
          username: 'testuser',
          avatar_small_url: 'https://example.com/avatar.png',
        },
      },
    };

    it('should enrich article successfully', async () => {
      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockResolvedValue(mockZennResponse);

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Test Title');
      expect(result?.content).toContain('This is test content');
      expect(ZennService.extractSlugFromUrl).toHaveBeenCalledWith('https://zenn.dev/user/articles/test-slug');
      expect(ZennService.fetchWithRetry).toHaveBeenCalledWith('test-slug');
    });

    it('should return null if slug extraction fails', async () => {
      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue(null);

      const result = await enricher.enrich('https://zenn.dev/invalid');

      expect(result).toBeNull();
      expect(ZennService.fetchWithRetry).not.toHaveBeenCalled();
    });

    it('should return null if content is too short', async () => {
      const shortContentResponse = {
        ...mockZennResponse,
        article: {
          ...mockZennResponse.article,
          body_html: '<p>Short</p>',
        },
      };

      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockResolvedValue(shortContentResponse);

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).toBeNull();
    });

    it('should return null on API fetch error', async () => {
      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).toBeNull();
    });

    it('should normalize whitespace in plain text', async () => {
      const htmlWithWhitespace = {
        ...mockZennResponse,
        article: {
          ...mockZennResponse.article,
          body_html: '<p>Line1\n\n\n\nLine2</p><p>Line3    Line4</p><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>',
        },
      };

      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockResolvedValue(htmlWithWhitespace);

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).not.toBeNull();
      expect(result?.content).not.toContain('\n\n\n');
      expect(result?.content).not.toContain('    ');
    });

    it('should extract thumbnail from OG image', async () => {
      const htmlWithOgImage = {
        ...mockZennResponse,
        article: {
          ...mockZennResponse.article,
          body_html: '<meta property="og:image" content="https://example.com/image.png"><p>Test content with sufficient length for validation purposes. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>',
        },
      };

      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockResolvedValue(htmlWithOgImage);

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).not.toBeNull();
      expect(result?.thumbnail).toBe('https://example.com/image.png');
    });

    it('should handle HTML with scripts and styles removed', async () => {
      const htmlWithScripts = {
        ...mockZennResponse,
        article: {
          ...mockZennResponse.article,
          body_html: '<script>alert("test")</script><style>.test{}</style><p>Clean content with sufficient length for validation. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>',
        },
      };

      (ZennService.extractSlugFromUrl as jest.Mock).mockReturnValue('test-slug');
      (ZennService.fetchWithRetry as jest.Mock).mockResolvedValue(htmlWithScripts);

      const result = await enricher.enrich('https://zenn.dev/user/articles/test-slug');

      expect(result).not.toBeNull();
      expect(result?.content).not.toContain('alert');
      expect(result?.content).not.toContain('.test');
      expect(result?.content).toContain('Clean content');
    });
  });
});
