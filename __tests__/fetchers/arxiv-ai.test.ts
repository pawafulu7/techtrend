import { Source } from '@prisma/client';

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
    },
  },
}));

// Mock p-limit
jest.mock('p-limit', () => {
  return jest.fn(() => {
    return <T>(fn: () => Promise<T>) => fn();
  });
});

// Mock rss-parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn(),
  }));
});

// Mock ArxivAIEnricher
jest.mock('@/lib/enrichers/arxiv-ai', () => ({
  ArxivAIEnricher: jest.fn().mockImplementation(() => ({
    enrich: jest.fn().mockResolvedValue(null),
  })),
}));

// Import after mocks are set up
import { ArxivAIFetcher } from '@/lib/fetchers/ai/arxiv-ai';
import { prisma } from '@/lib/prisma';

const mockedPrisma = jest.mocked(prisma, true);

describe('ArxivAIFetcher', () => {
  let fetcher: ArxivAIFetcher;
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'arxiv_ai_test',
      name: 'arXiv AI',
      type: 'rss',
      url: 'https://rss.arxiv.org/rss/cs.AI',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    fetcher = new ArxivAIFetcher(mockSource);

    // Reset prisma mock - default to empty (no existing articles)
    mockedPrisma.article.findMany.mockReset();
    mockedPrisma.article.findMany.mockResolvedValue([]);
  });

  describe('detectCategory', () => {
    it('should detect AI category from cs.AI', () => {
      const item = { categories: ['cs.AI', 'cs.LG'] };
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('AI');
    });

    it('should detect Machine Learning category from cs.LG', () => {
      const item = { categories: ['cs.LG'] };
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('Machine Learning');
    });

    it('should detect NLP category from cs.CL', () => {
      const item = { categories: ['cs.CL'] };
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('NLP');
    });

    it('should default to AI for unknown categories', () => {
      const item = { categories: ['cs.CV'] };
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('AI');
    });

    it('should handle string categories', () => {
      const item = { category: 'cs.AI cs.LG' };
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('AI');
    });

    it('should handle empty categories', () => {
      const item = {};
      const category = (fetcher as any).detectCategory(item);
      expect(category).toBe('AI');
    });
  });

  describe('cleanArxivTitle', () => {
    it('should remove arXiv ID from title', () => {
      const title = 'Test Paper. (arXiv:2312.12345v1)';
      const cleaned = (fetcher as any).cleanArxivTitle(title);
      expect(cleaned).toBe('Test Paper');
    });

    it('should remove category tags', () => {
      const title = '[cs.AI] Test Paper';
      const cleaned = (fetcher as any).cleanArxivTitle(title);
      expect(cleaned).toBe('Test Paper');
    });

    it('should normalize whitespace', () => {
      const title = '  Test   Paper  ';
      const cleaned = (fetcher as any).cleanArxivTitle(title);
      expect(cleaned).toBe('Test Paper');
    });
  });

  describe('extractArxivId', () => {
    it('should extract ID from abs URL', () => {
      const url = 'https://arxiv.org/abs/2312.12345';
      const id = (fetcher as any).extractArxivId(url);
      expect(id).toBe('2312.12345');
    });

    it('should return undefined for non-arxiv URL', () => {
      const url = 'https://example.com/paper';
      const id = (fetcher as any).extractArxivId(url);
      expect(id).toBeUndefined();
    });
  });

  describe('detectKeywords', () => {
    it('should detect Transformer keyword', () => {
      const keywords = (fetcher as any).detectKeywords(
        'A Novel Transformer Architecture',
        'We propose a self-attention mechanism'
      );
      expect(keywords).toContain('Transformer');
    });

    it('should detect LLM keyword', () => {
      const keywords = (fetcher as any).detectKeywords(
        'Large Language Models for Code',
        'LLM performance evaluation'
      );
      expect(keywords).toContain('LLM');
    });

    it('should detect multiple keywords', () => {
      const keywords = (fetcher as any).detectKeywords(
        'Fine-tuning BERT for Sentiment Analysis',
        'We fine-tune BERT on benchmark datasets'
      );
      expect(keywords).toContain('BERT');
      expect(keywords).toContain('Fine-tuning');
      expect(keywords).toContain('Benchmark');
    });

    it('should return empty array for unrelated content', () => {
      const keywords = (fetcher as any).detectKeywords(
        'Cooking Recipes',
        'How to make pasta'
      );
      expect(keywords).toHaveLength(0);
    });
  });

  describe('extractAbstract', () => {
    it('should extract and clean abstract from description', () => {
      const item = {
        description: '<p>This is an <b>abstract</b> with HTML.</p>',
      };
      const abstract = (fetcher as any).extractAbstract(item);
      expect(abstract).toBe('This is an abstract with HTML.');
    });

    it('should truncate long abstracts', () => {
      const longText = 'A'.repeat(600);
      const item = { description: longText };
      const abstract = (fetcher as any).extractAbstract(item);
      expect(abstract).toHaveLength(500);
      expect(abstract).toMatch(/\.\.\.$/);
    });

    it('should handle empty content', () => {
      const item = {};
      const abstract = (fetcher as any).extractAbstract(item);
      expect(abstract).toBe('');
    });
  });

  describe('enrichArticle', () => {
    it('should add metadata to article', () => {
      const article = {
        title: 'Test Paper',
        url: 'https://arxiv.org/abs/2312.12345',
        content: 'Paper content',
        publishedAt: new Date(),
        sourceId: mockSource.id,
      };

      const enriched = (fetcher as any).enrichArticle(
        article,
        'AI',
        '2312.12345',
        'Test abstract'
      );

      expect(enriched.metadata).toBeDefined();
      expect(enriched.metadata.source).toBe('arXiv');
      expect(enriched.metadata.category).toBe('AI');
      expect(enriched.metadata.arxivId).toBe('2312.12345');
      expect(enriched.metadata.type).toBe('research_paper');
      expect(enriched.metadata.tags).toContain('arXiv');
    });

    it('should include category-specific tags', () => {
      const article = {
        title: 'NLP Paper',
        url: 'https://arxiv.org/abs/2312.12345',
        content: 'Paper content',
        publishedAt: new Date(),
        sourceId: mockSource.id,
      };

      const enriched = (fetcher as any).enrichArticle(article, 'NLP');
      expect(enriched.metadata.tags).toContain('Natural Language Processing');
      expect(enriched.metadata.tags).toContain('NLP Research');
    });
  });

  describe('generateEnrichedContent', () => {
    it('should generate enriched content with metadata', () => {
      const item = {
        title: 'Test Paper',
        author: 'John Doe',
        categories: ['cs.AI', 'cs.LG'],
      };

      const content = (fetcher as any).generateEnrichedContent(
        item,
        'AI',
        '2312.12345',
        'Test abstract'
      );

      expect(content).toContain('Title: Test Paper');
      expect(content).toContain('Category: AI');
      expect(content).toContain('Source: arXiv');
      expect(content).toContain('arXiv ID: 2312.12345');
      expect(content).toContain('Authors: John Doe');
      expect(content).toContain('Abstract:');
      expect(content).toContain('Test abstract');
    });

    it('should handle missing optional fields', () => {
      const item = { title: 'Test Paper' };
      const content = (fetcher as any).generateEnrichedContent(item, 'AI');

      expect(content).toContain('Title: Test Paper');
      expect(content).not.toContain('Authors:');
      expect(content).not.toContain('arXiv ID:');
    });
  });

  describe('RSS_URL configuration', () => {
    it('should use combined RSS feed URL', () => {
      const rssUrl = (fetcher as any).RSS_URL;
      expect(rssUrl).toBe('https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL');
    });
  });

  describe('ENRICHMENT_CONCURRENCY configuration', () => {
    it('should default to 5 concurrent enrichments', () => {
      const concurrency = (fetcher as any).ENRICHMENT_CONCURRENCY;
      expect(concurrency).toBe(5);
    });
  });

  describe('MAX_ARTICLES_PER_FETCH configuration', () => {
    it('should default to 200 articles per fetch', () => {
      const maxArticles = (fetcher as any).MAX_ARTICLES_PER_FETCH;
      expect(maxArticles).toBe(200);
    });
  });

  describe('MAX_ABSTRACT_LENGTH configuration', () => {
    it('should default to 500 characters', () => {
      const maxLength = (fetcher as any).MAX_ABSTRACT_LENGTH;
      expect(maxLength).toBe(500);
    });
  });

  describe('fetch() integration', () => {
    it('should return empty articles when feed has no items', async () => {
      const mockParseURL = jest.fn().mockResolvedValue({ items: [] });
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process valid RSS items', async () => {
      const mockItems = [
        {
          title: 'Test Paper on Transformers. (arXiv:2312.12345v1)',
          link: 'https://arxiv.org/abs/2312.12345',
          pubDate: new Date().toISOString(),
          description: 'This is a test abstract about transformers.',
          categories: ['cs.AI', 'cs.LG'],
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Test Paper on Transformers');
      expect(result.articles[0].url).toBe('https://arxiv.org/abs/2312.12345');
      expect(result.errors).toHaveLength(0);
    });

    it('should skip items without title or link', async () => {
      const mockItems = [
        { title: 'Valid Paper', link: 'https://arxiv.org/abs/2312.11111' },
        { title: 'No Link Paper' }, // Missing link
        { link: 'https://arxiv.org/abs/2312.22222' }, // Missing title
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      // Only the first item has both title and link
      expect(result.articles).toHaveLength(1);
    });

    it('should deduplicate articles by arXiv ID', async () => {
      const mockItems = [
        {
          title: 'Paper v1',
          link: 'https://arxiv.org/abs/2312.12345',
          pubDate: new Date().toISOString(),
        },
        {
          title: 'Paper v2 (same ID)',
          link: 'https://arxiv.org/abs/2312.12345',
          pubDate: new Date().toISOString(),
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Paper v1');
    });

    it('should skip articles older than 30 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      const mockItems = [
        {
          title: 'Old Paper',
          link: 'https://arxiv.org/abs/2312.11111',
          pubDate: oldDate.toISOString(),
        },
        {
          title: 'Recent Paper',
          link: 'https://arxiv.org/abs/2312.22222',
          pubDate: new Date().toISOString(),
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].title).toBe('Recent Paper');
    });

    it('should handle RSS parsing errors gracefully', async () => {
      const mockParseURL = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));
      (fetcher as any).parser.parseURL = mockParseURL;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Network error');
    });

    it('should use enriched content when enricher succeeds', async () => {
      const mockItems = [
        {
          title: 'Enriched Paper. (arXiv:2312.99999v1)',
          link: 'https://arxiv.org/abs/2312.99999',
          pubDate: new Date().toISOString(),
          description: 'Original abstract from RSS.',
          categories: ['cs.AI'],
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      // Mock enricher to return full content
      const mockEnrich = jest.fn().mockResolvedValue({
        content: '<p>Full HTML content from arXiv page with detailed paper text.</p>',
        thumbnail: 'https://arxiv.org/images/paper-thumbnail.png',
      });
      (fetcher as any).enricher.enrich = mockEnrich;

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].content).toContain('Full HTML content');
      expect(result.articles[0].thumbnail).toBe(
        'https://arxiv.org/images/paper-thumbnail.png'
      );
      expect(mockEnrich).toHaveBeenCalledWith('https://arxiv.org/abs/2312.99999');
    });

    it('should skip articles with existing URLs in database', async () => {
      const mockItems = [
        {
          title: 'Existing Paper',
          link: 'https://arxiv.org/abs/2312.11111',
          pubDate: new Date().toISOString(),
          categories: ['cs.AI'],
        },
        {
          title: 'New Paper',
          link: 'https://arxiv.org/abs/2312.22222',
          pubDate: new Date().toISOString(),
          categories: ['cs.LG'],
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      // Mock existing article in database
      mockedPrisma.article.findMany.mockResolvedValue([
        { url: 'https://arxiv.org/abs/2312.11111' },
      ]);

      const result = await fetcher.fetch();

      // Only the new paper should be processed
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0].url).toBe('https://arxiv.org/abs/2312.22222');
      expect(result.articles[0].title).toBe('New Paper');
    });

    it('should skip all articles when all URLs exist in database', async () => {
      const mockItems = [
        {
          title: 'Existing Paper 1',
          link: 'https://arxiv.org/abs/2312.11111',
          pubDate: new Date().toISOString(),
          categories: ['cs.AI'],
        },
        {
          title: 'Existing Paper 2',
          link: 'https://arxiv.org/abs/2312.22222',
          pubDate: new Date().toISOString(),
          categories: ['cs.LG'],
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      // All articles exist in database
      mockedPrisma.article.findMany.mockResolvedValue([
        { url: 'https://arxiv.org/abs/2312.11111' },
        { url: 'https://arxiv.org/abs/2312.22222' },
      ]);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should process all articles when database is empty', async () => {
      const mockItems = [
        {
          title: 'New Paper 1',
          link: 'https://arxiv.org/abs/2312.33333',
          pubDate: new Date().toISOString(),
          categories: ['cs.AI'],
        },
        {
          title: 'New Paper 2',
          link: 'https://arxiv.org/abs/2312.44444',
          pubDate: new Date().toISOString(),
          categories: ['cs.LG'],
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;

      // No existing articles in database
      mockedPrisma.article.findMany.mockResolvedValue([]);

      const result = await fetcher.fetch();

      expect(result.articles).toHaveLength(2);
    });

    it('should query database with correct URL filter', async () => {
      const mockItems = [
        {
          title: 'Paper 1',
          link: 'https://arxiv.org/abs/2312.55555',
          pubDate: new Date().toISOString(),
        },
        {
          title: 'Paper 2',
          link: 'https://arxiv.org/abs/2312.66666',
          pubDate: new Date().toISOString(),
        },
      ];
      const mockParseURL = jest.fn().mockResolvedValue({ items: mockItems });
      (fetcher as any).parser.parseURL = mockParseURL;
      mockedPrisma.article.findMany.mockResolvedValue([]);

      await fetcher.fetch();

      // Verify prisma was called with correct parameters
      expect(mockedPrisma.article.findMany).toHaveBeenCalledWith({
        where: {
          url: {
            in: [
              'https://arxiv.org/abs/2312.55555',
              'https://arxiv.org/abs/2312.66666',
            ],
          },
        },
        select: { url: true },
      });
    });
  });
});
