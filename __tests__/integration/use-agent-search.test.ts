import { renderHook, waitFor } from '@testing-library/react';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import type { AgentSearchResult, ChatMessage } from '@/lib/hooks/useAgentSearch';

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

  test('handles SSE streaming response', async () => {
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

    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('React articles');

    await waitFor(() => {
      expect(result.current.result).toBeDefined();
      expect(result.current.result?.response).toBe('Found 3 articles');
      expect(result.current.partialText).toBe('Found 3 articles');
    });
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

  test('SSE streaming updates partialText progressively', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Chunk 1
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Hello"}\n\n'));
        await new Promise(resolve => queueMicrotask(resolve));

        // Chunk 2
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":" World"}\n\n'));
        await new Promise(resolve => queueMicrotask(resolve));

        // Final chunk
        controller.enqueue(encoder.encode('data: {"type":"done","result":{"query":"test","response":"Hello World","toolCalls":[],"usage":{"totalTokens":50},"cached":false,"fallback":false}}\n\n'));
        controller.close();
      }
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: stream,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    });

    const { result } = renderHook(() => useAgentSearch());

    await result.current.search('test query');

    // Wait for first chunk
    await waitFor(() => {
      expect(result.current.partialText).toBe('Hello');
    }, { timeout: 1000 });

    // Wait for second chunk
    await waitFor(() => {
      expect(result.current.partialText).toBe('Hello World');
    }, { timeout: 1000 });

    // Wait for final result
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result?.response).toBe('Hello World');
      expect(result.current.partialText).toBe('');
    }, { timeout: 1000 });
  });

  test('race guard ignores chunks from aborted requests', async () => {
    const encoder = new TextEncoder();
    let controller1!: ReadableStreamDefaultController<Uint8Array>;
    let controller2!: ReadableStreamDefaultController<Uint8Array>;

    // Request 1 (slow)
    const stream1 = new ReadableStream({
      start(controller) {
        controller1 = controller;
      }
    });

    // Request 2 (fast)
    const stream2 = new ReadableStream({
      async start(controller) {
        controller2 = controller;
        // Emit chunk immediately
        controller.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Fresh"}\n\n'));
        await new Promise(resolve => queueMicrotask(resolve));
        controller.enqueue(encoder.encode('data: {"type":"done","result":{"query":"test","response":"Fresh Result","toolCalls":[],"usage":{"totalTokens":50},"cached":false,"fallback":false}}\n\n'));
        controller.close();
      }
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        body: stream1,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        body: stream2,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      });

    const { result } = renderHook(() => useAgentSearch());

    // Start request 1
    const promise1 = result.current.search('query A');

    // Wait briefly
    await new Promise(resolve => queueMicrotask(resolve));

    // Start request 2 (aborts request 1)
    const promise2 = result.current.search('query B');

    // Emit stale chunk from request 1 (should be ignored)
    controller1.enqueue(encoder.encode('data: {"type":"text-delta","textDelta":"Stale"}\n\n'));

    // Wait for request 2 to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result?.response).toBe('Fresh Result');
    }, { timeout: 2000 });

    // Assert stale chunk was ignored
    expect(result.current.partialText).not.toContain('Stale');
    expect(result.current.result?.response).not.toContain('Stale');
  });

  describe('Multi-turn conversation support', () => {
    test('search accepts ChatMessage array for multi-turn', async () => {
      const mockResult: AgentSearchResult = {
        query: 'Follow up question',
        response: 'Based on our previous discussion...',
        toolCalls: [],
        usage: { totalTokens: 150 },
        cached: false,
        fallback: false,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

      const { result } = renderHook(() => useAgentSearch());

      const messages: ChatMessage[] = [
        { role: 'user', content: 'What is React?' },
        { role: 'assistant', content: 'React is a JavaScript library for building UIs.' },
        { role: 'user', content: 'Follow up question' },
      ];

      await result.current.search(messages);

      await waitFor(() => {
        expect(result.current.result).toEqual(mockResult);
      });

      // Verify fetch was called with messages array
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/rag/agent-search',
        expect.objectContaining({
          body: JSON.stringify({ messages }),
        })
      );
    });

    test('search sends query parameter for single-turn (backward compat)', async () => {
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
        headers: new Headers({ 'Content-Type': 'application/json' }),
      });

      const { result } = renderHook(() => useAgentSearch());

      await result.current.search('test');

      await waitFor(() => {
        expect(result.current.result).toEqual(mockResult);
      });

      // Verify fetch was called with query string
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/rag/agent-search',
        expect.objectContaining({
          body: JSON.stringify({ query: 'test' }),
        })
      );
    });

    test('multi-turn with last message empty triggers error', async () => {
      const { result } = renderHook(() => useAgentSearch());

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: '' }, // Empty last message
      ];

      await result.current.search(messages);

      expect(result.current.error).toEqual({
        status: 400,
        message: 'Query cannot be empty',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
