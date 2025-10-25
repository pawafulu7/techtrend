import { extractArticlesFromToolCalls } from '../article-link-extractor';
import { RAG_TOOL_NAMES } from '@/lib/rag/constants';

describe('extractArticlesFromToolCalls', () => {
  it('正常系: 記事リンクを抽出しsimilarity降順でソート', () => {
    const toolCalls = [
      {
        name: RAG_TOOL_NAMES.SEMANTIC_SEARCH,
        output: {
          articles: [
            { articleId: '1', title: 'Article 1', similarity: 0.85, publishedAt: '2025-10-20T00:00:00Z' },
            { articleId: '2', title: 'Article 2', similarity: 0.92, publishedAt: '2025-10-21T00:00:00Z' },
            { articleId: '3', title: 'Article 3', similarity: 0.78, publishedAt: '2025-10-19T00:00:00Z' },
          ],
        },
      },
    ];

    const result = extractArticlesFromToolCalls(toolCalls);

    expect(result).toHaveLength(3);
    expect(result[0].articleId).toBe('2'); // 最高similarity
    expect(result[0].similarity).toBe(0.92);
    expect(result[2].articleId).toBe('3'); // 最低similarity
  });

  it('異常系: toolCallsが空配列の場合', () => {
    const result = extractArticlesFromToolCalls([]);
    expect(result).toEqual([]);
  });

  it('異常系: Semantic Search Toolが存在しない場合', () => {
    const toolCalls = [
      { name: 'other-tool', output: {} },
    ];
    const result = extractArticlesFromToolCalls(toolCalls);
    expect(result).toEqual([]);
  });

  it('異常系: outputにarticlesが存在しない場合', () => {
    const toolCalls = [
      { name: RAG_TOOL_NAMES.SEMANTIC_SEARCH, output: {} },
    ];
    const result = extractArticlesFromToolCalls(toolCalls);
    expect(result).toEqual([]);
  });

  it('異常系: articlesが不正な構造の場合（console.warnログ出力）', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const toolCalls = [
      {
        name: RAG_TOOL_NAMES.SEMANTIC_SEARCH,
        output: {
          articles: [
            { articleId: 1, title: 'Invalid', similarity: 'not a number' }, // 不正
          ],
        },
      },
    ];

    const result = extractArticlesFromToolCalls(toolCalls);

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ArticleLinkExtractor] Invalid tool output structure'),
      expect.any(Object)
    );

    consoleWarnSpy.mockRestore();
  });

  it('異常系: 複数のSemantic Search Tool呼び出し（flatMapで結合）', () => {
    const toolCalls = [
      {
        name: RAG_TOOL_NAMES.SEMANTIC_SEARCH,
        output: {
          articles: [
            { articleId: '1', title: 'Article 1', similarity: 0.85, publishedAt: '2025-10-20T00:00:00Z' },
          ],
        },
      },
      {
        name: RAG_TOOL_NAMES.SEMANTIC_SEARCH,
        output: {
          articles: [
            { articleId: '2', title: 'Article 2', similarity: 0.92, publishedAt: '2025-10-21T00:00:00Z' },
          ],
        },
      },
    ];

    const result = extractArticlesFromToolCalls(toolCalls);

    expect(result).toHaveLength(2);
    expect(result[0].articleId).toBe('2'); // similarity降順
  });
});
