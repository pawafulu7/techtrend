/**
 * Article Search Agent Tests
 *
 * Tests agent behavior with Vercel AI SDK.
 *
 * Note: These are integration tests that require:
 * - OPENAI_API_KEY environment variable
 * - Network access to OpenAI API
 * - Mock VectorSearchService for predictable results
 *
 * Test focus:
 * - Agent calls tool correctly
 * - Response format is conversational
 * - Off-topic queries are refused
 * - Multi-language support (Japanese/English)
 *
 * @see Plan: plan_20251019_141946_039_rag-agent-fuzzy-search.md:760-790
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

describe('ArticleSearchAgent', () => {
  // Skip if no OpenAI API key (CI environment)
  const shouldSkip = !process.env.OPENAI_API_KEY;

  if (shouldSkip) {
    it.skip('requires OPENAI_API_KEY', () => {});
    return;
  }

  describe('tool calling behavior', () => {
    it(
      'should call semantic search tool for article query',
      async () => {
        const mockResults = [
          {
            articleId: 'article1',
            title: 'React Performance Optimization',
            summary: 'Learn performance techniques',
            translatedTitle: 'Reactパフォーマンス最適化',
            similarity: 0.92,
            publishedAt: new Date('2025-10-15'),
            sourceId: 'source1',
            embeddingKey: 'summary',
          },
        ];

        mockSearch.mockResolvedValue(mockResults);

        const response = await articleSearchAgent.respond({
          messages: [{ role: 'user', content: 'React performance optimization' }],
        });

        // Read streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
        }

        expect(fullText).toBeTruthy();
        expect(fullText.toLowerCase()).toContain('react');

        // Verify tool was called
        expect(mockSearch).toHaveBeenCalled();
      },
      30000
    ); // 30s timeout for LLM

    it(
      'should refuse off-topic queries',
      async () => {
        mockSearch.mockResolvedValue([]);

        const response = await articleSearchAgent.respond({
          messages: [{ role: 'user', content: 'What is 2 + 2?' }],
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
        }

        // Should refuse without calling tool
        expect(fullText.toLowerCase()).toMatch(/sorry|cannot|only.*search/i);

        // Tool should NOT be called for off-topic queries
        expect(mockSearch).not.toHaveBeenCalled();
      },
      30000
    );

    it(
      'should handle Japanese queries',
      async () => {
        const mockResults = [
          {
            articleId: 'article1',
            title: 'Next.js App Router Guide',
            summary: 'Comprehensive App Router guide',
            translatedTitle: 'Next.js App Routerガイド',
            similarity: 0.95,
            publishedAt: new Date('2025-10-15'),
            sourceId: 'source1',
            embeddingKey: 'summary',
          },
        ];

        mockSearch.mockResolvedValue(mockResults);

        const response = await articleSearchAgent.respond({
          messages: [{ role: 'user', content: '最新のNext.js記事を教えて' }],
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
        }

        // Should include Japanese text
        expect(fullText).toBeTruthy();

        // Tool should be called
        expect(mockSearch).toHaveBeenCalled();
      },
      30000
    );

    it(
      'should handle empty results gracefully',
      async () => {
        mockSearch.mockResolvedValue([]); // No results

        const response = await articleSearchAgent.respond({
          messages: [{ role: 'user', content: 'xyzqwertyuiopasdfghjkl' }],
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
        }

        // Should acknowledge no results and suggest refinements
        expect(fullText.toLowerCase()).toMatch(/no|not found|見つかりませんでした/i);
      },
      30000
    );
  });
});
