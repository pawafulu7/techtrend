/**
 * RAG Agent Integration Tests
 *
 * Tests end-to-end agent execution flow with mocked VectorSearchService.
 *
 * Test scenarios:
 * - Agent successfully calls tool and formats response
 * - Empty results handling
 * - Off-topic query refusal
 * - Multi-language support
 *
 * Note: Requires OPENAI_API_KEY for real agent execution.
 *
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:1357-1413
 */

import { articleSearchAgent } from '@/lib/rag/agents/article-search-agent';
import { VectorSearchService } from '@/lib/rag/vector-search-service';

// Mock VectorSearchService
jest.mock('@/lib/rag/vector-search-service');

const mockSearch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (VectorSearchService as jest.Mock).mockImplementation(() => ({
    search: mockSearch,
  }));
});

describe('RAG Agent Integration', () => {
  // Skip if no OpenAI API key
  const shouldSkip = !process.env.OPENAI_API_KEY;

  if (shouldSkip) {
    it.skip('requires OPENAI_API_KEY to run agent tests', () => {});
    return;
  }

  it(
    'should execute end-to-end search flow with tool calling',
    async () => {
      const mockResults = [
        {
          articleId: 'article1',
          title: 'TypeScript Best Practices 2025',
          summary: 'Comprehensive guide to TypeScript best practices',
          translatedTitle: 'TypeScriptベストプラクティス2025',
          similarity: 0.95,
          publishedAt: new Date('2025-10-15T10:00:00Z'),
          sourceId: 'source1',
          embeddingKey: 'summary',
        },
        {
          articleId: 'article2',
          title: 'Type Safety in TypeScript',
          summary: 'Deep dive into TypeScript type system',
          translatedTitle: 'TypeScriptの型安全性',
          similarity: 0.88,
          publishedAt: new Date('2025-10-14T09:00:00Z'),
          sourceId: 'source2',
          embeddingKey: 'summary',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await articleSearchAgent.generate({
        messages: [{ role: 'user', content: 'TypeScript best practices' }],
      });

      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toContain('typescript');

      // Verify tool was called
      expect(result.toolCalls).toBeTruthy();
      expect(result.toolCalls!.length).toBeGreaterThan(0);

      const toolCall = result.toolCalls![0];
      expect(toolCall.toolName).toBe('semanticSearch');
      expect(toolCall.args).toMatchObject({
        query: expect.any(String),
      });

      // Verify search service was called
      expect(mockSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeddingKey: 'summary',
        })
      );
    },
    30000
  );

  it(
    'should handle empty results gracefully',
    async () => {
      mockSearch.mockResolvedValue([]); // No results

      const result = await articleSearchAgent.generate({
        messages: [{ role: 'user', content: 'xyzqwertyuiopasdfghjkl' }],
      });

      expect(result.text).toBeTruthy();

      // Should acknowledge no results
      const lowerText = result.text.toLowerCase();
      expect(lowerText).toMatch(/no|not found|見つかりませんでした|見つかりません/);
    },
    30000
  );

  it(
    'should refuse off-topic queries without calling tool',
    async () => {
      const offTopicQueries = [
        'What is 2 + 2?',
        'Write a Python function for me',
        'Explain quantum physics',
        'How do I center a div in CSS?',
      ];

      for (const query of offTopicQueries) {
        const result = await articleSearchAgent.generate({
          messages: [{ role: 'user', content: query }],
        });

        expect(result.text).toBeTruthy();

        // Should refuse politely
        const lowerText = result.text.toLowerCase();
        expect(lowerText).toMatch(/sorry|cannot|only.*search|申し訳/i);

        // Tool should NOT be called
        expect(result.toolCalls?.length || 0).toBe(0);
        expect(mockSearch).not.toHaveBeenCalled();

        // Reset mock for next iteration
        mockSearch.mockClear();
      }
    },
    120000
  ); // 120s for 4 queries

  it(
    'should support Japanese queries',
    async () => {
      const mockResults = [
        {
          articleId: 'article1',
          title: 'Next.js 15 New Features',
          summary: 'Overview of Next.js 15 features',
          translatedTitle: 'Next.js 15の新機能',
          similarity: 0.93,
          publishedAt: new Date('2025-10-15'),
          sourceId: 'source1',
          embeddingKey: 'summary',
        },
      ];

      mockSearch.mockResolvedValue(mockResults);

      const result = await articleSearchAgent.generate({
        messages: [{ role: 'user', content: '最新のNext.js記事を3件教えて' }],
      });

      expect(result.text).toBeTruthy();

      // Should call tool
      expect(result.toolCalls).toBeTruthy();
      expect(result.toolCalls!.length).toBeGreaterThan(0);

      // Verify search was called
      expect(mockSearch).toHaveBeenCalled();
    },
    30000
  );

  it(
    'should include token usage information',
    async () => {
      mockSearch.mockResolvedValue([]);

      const result = await articleSearchAgent.generate({
        messages: [{ role: 'user', content: 'React hooks' }],
      });

      expect(result.usage).toBeDefined();
      expect(result.usage.promptTokens).toBeGreaterThan(0);
      expect(result.usage.completionTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(
        result.usage.promptTokens + result.usage.completionTokens
      );
    },
    30000
  );
});
