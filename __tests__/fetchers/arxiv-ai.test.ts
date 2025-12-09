import { ArxivAIFetcher } from '@/lib/fetchers/ai/arxiv-ai';
import { Source } from '@prisma/client';

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
});
