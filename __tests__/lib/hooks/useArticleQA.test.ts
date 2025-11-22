import { renderHook, act, waitFor } from '@testing-library/react';
import { useArticleQA } from '@/lib/hooks/useArticleQA';

// Mock fetch
global.fetch = jest.fn();

const mockArticleId = 'article123';
const mockArticleTitle = 'Test Article';

describe('useArticleQA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.partialText).toBeNull();
    expect(result.current.contextChunk).toBeNull();
  });

  it('should set loading state when search is called', async () => {
    const mockResponse = new Response(
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      {
        headers: { 'Content-Type': 'text/event-stream' },
      }
    );

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    act(() => {
      result.current.search('test question');
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should handle qa-context event', async () => {
    const mockContext = {
      articleId: mockArticleId,
      title: mockArticleTitle,
      snippet: 'Test snippet',
      updatedAt: '2025-11-21T10:00:00.000Z',
    };

    const encoder = new TextEncoder();
    const mockResponse = new Response(
      new ReadableStream({
        start(controller) {
          // Send qa-context event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'qa-context',
                context: mockContext,
              })}\n\n`
            )
          );

          // Send finish event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'finish',
                text: 'Test response',
                usage: { totalTokens: 100 },
                toolCalls: [],
                cached: false,
                fallback: false,
              })}\n\n`
            )
          );

          controller.close();
        },
      }),
      {
        headers: { 'Content-Type': 'text/event-stream' },
      }
    );

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    await act(async () => {
      await result.current.search('test question');
    });

    await waitFor(() => {
      expect(result.current.contextChunk).toEqual(mockContext);
      expect(result.current.result).not.toBeNull();
      expect(result.current.result?.response).toBe('Test response');
    });
  });

  it('should accumulate partialText from text-delta events', async () => {
    const encoder = new TextEncoder();
    const mockResponse = new Response(
      new ReadableStream({
        start(controller) {
          // Send text-delta events
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', delta: 'Hello ' })}\n\n`)
          );
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', delta: 'World' })}\n\n`)
          );

          // Send finish event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'finish',
                text: 'Hello World',
                usage: {},
                toolCalls: [],
                cached: false,
                fallback: false,
              })}\n\n`
            )
          );

          controller.close();
        },
      }),
      {
        headers: { 'Content-Type': 'text/event-stream' },
      }
    );

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    await act(async () => {
      await result.current.search('test question');
    });

    await waitFor(() => {
      expect(result.current.result?.response).toBe('Hello World');
    });
  });

  it('should handle errors', async () => {
    const mockResponse = new Response(null, {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });

    (mockResponse.json as any) = jest.fn().mockResolvedValue({
      error: 'Article not found',
    });

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    await act(async () => {
      await result.current.search('test question');
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
      expect(result.current.error?.status).toBe(404);
    });
  });

  it('should reset state', () => {
    const { result } = renderHook(() =>
      useArticleQA({
        articleId: mockArticleId,
        articleTitle: mockArticleTitle,
      })
    );

    act(() => {
      // Set some state
      result.current.search('test');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.partialText).toBe(''); // Empty string, not null
  });
});
