import { renderHook, waitFor } from '@testing-library/react';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

global.fetch = jest.fn();

describe('useAgentSearch Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successful search returns result', async () => {
    const mockResult: AgentSearchResult = {
      query: 'test',
      response: 'Answer',
      toolCalls: [],
      usage: { totalTokens: 100 },
      cached: false,
      fallback: false,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
      headers: new Headers(),
    });

    const { result } = renderHook(() => useAgentSearch());

    expect(result.current.isLoading).toBe(false);

    await result.current.search('test query');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toEqual(mockResult);
      expect(result.current.error).toBeNull();
    });
  });

  test('401 error sets error state', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
      headers: new Headers(),
    });

    const onError = jest.fn();
    const { result } = renderHook(() => useAgentSearch({ onError }));

    await result.current.search('test');

    await waitFor(() => {
      expect(result.current.error).toEqual({
        status: 401,
        message: 'Unauthorized',
        details: undefined,
        retryAfter: undefined,
      });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    });
  });

  test('429 error extracts retry-after header', async () => {
    const headers = new Headers();
    headers.set('Retry-After', '120');

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Rate limit exceeded' }),
      headers,
    });

    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('test');

    await waitFor(() => {
      expect(result.current.error).toEqual({
        status: 429,
        message: 'Rate limit exceeded',
        details: undefined,
        retryAfter: 120,
      });
    });
  });

  test('network error sets status 0', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('test');

    await waitFor(() => {
      expect(result.current.error).toEqual({
        status: 0,
        message: 'Network failure',
      });
    });
  });

  test('timeout aborts request and sets 408 error', async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 40000);
        })
    );

    const { result } = renderHook(() => useAgentSearch({ timeout: 5000 }));

    const searchPromise = result.current.search('test');

    jest.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(result.current.error?.status).toBe(408);
      expect(result.current.error?.message).toContain('5s');
    });

    jest.useRealTimers();
  });

  test('empty query sets 400 error without API call', async () => {
    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('');

    expect(result.current.error).toEqual({
      status: 400,
      message: 'Query cannot be empty',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('aborts in-flight request when new search starts', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 10000);
        })
    );

    const { result } = renderHook(() => useAgentSearch());

    result.current.search('first query');

    await new Promise((resolve) => setTimeout(resolve, 100));

    result.current.search('second query');

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    abortSpy.mockRestore();
  });

  test('handles SSE streaming response with progress updates', async () => {
    const progressUpdates: number[] = [];
    const onProgressUpdate = jest.fn((p) => progressUpdates.push(p));

    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'tool-start',
              toolCallId: 'call1',
              toolName: 'semantic-article-search',
              input: { query: 'React' },
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'tool-complete',
              toolCallId: 'call1',
              result: { articles: [] },
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'text-delta',
              delta: 'Found ',
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'text-delta',
              delta: '3 articles',
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'finish',
              text: 'Found 3 articles',
              usage: { totalTokens: 100 },
              toolCalls: [],
              cached: false,
              fallback: false,
            })}\n\n`
          )
        );

        controller.close();
      },
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockStream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useAgentSearch({ onProgressUpdate }));

    await result.current.search('React articles');

    await waitFor(() => {
      expect(result.current.result).toBeDefined();
      expect(result.current.result?.response).toBe('Found 3 articles');
    });

    expect(onProgressUpdate).toHaveBeenCalled();
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
  });

  test('maintains JSON batch mode compatibility when SSE disabled', async () => {
    const mockResult: AgentSearchResult = {
      query: 'test',
      response: 'Batch response',
      toolCalls: [],
      usage: { totalTokens: 50 },
      cached: false,
      fallback: false,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('test query');

    await waitFor(() => {
      expect(result.current.result).toEqual(mockResult);
    });

    expect(result.current.result?.response).toBe('Batch response');
    expect(result.current.error).toBeNull();
  });
});
