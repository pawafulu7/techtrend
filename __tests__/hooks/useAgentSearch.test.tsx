import { act, renderHook, waitFor } from '@testing-library/react';
import { useAgentSearch } from '@/lib/hooks/useAgentSearch';
import type { AgentSearchResult } from '@/lib/hooks/useAgentSearch';

// Jest の DOM 環境（jest-environment-jsdom が使う jsdom）には TextEncoder・TextDecoder が無い。
// テストの SSE の組み立てと、フックの SSE の解析（new TextDecoder()）の両方が使うので、Node の実装を入れる
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('util');
  global.TextEncoder = NodeTextEncoder;
  global.TextDecoder = NodeTextDecoder;
}

global.fetch = jest.fn();
const fetchMock = global.fetch as jest.Mock;

/** JSON の応答。フックは Content-Type で JSON か SSE かを見分ける */
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers({ 'Content-Type': 'application/json', ...headers }),
  };
}

/** SSE の応答 */
function sseResponse(body: ReadableStream<Uint8Array>) {
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
  };
}

const encoder = new TextEncoder();
function sseEvent(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

/** abort されるまで終わらない fetch。abort されたら、実際の fetch と同じく AbortError で失敗する */
function fetchUntilAborted(_url: string, init: RequestInit): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      reject(abortError);
    });
  });
}

describe('useAgentSearch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    // タイムアウトのテストが途中で失敗しても、後のテストに偽のタイマーを残さない
    jest.useRealTimers();
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, mockResult));

    const { result } = renderHook(() => useAgentSearch());

    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      await result.current.search('test query');
    });

    expect(result.current.isLoading).toBe(false);
    // 検索ツールの結果から取り出した記事（ここでは無し）が足される
    expect(result.current.result).toEqual({ ...mockResult, articles: [] });
    expect(result.current.error).toBeNull();
    expect(result.current.currentStep).toBe('complete');
  });

  test('401 error sets error state', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized' }));

    const onError = jest.fn();
    const { result } = renderHook(() => useAgentSearch({ onError }));

    await act(async () => {
      await result.current.search('test');
    });

    expect(result.current.error).toEqual({
      status: 401,
      message: 'Unauthorized',
      details: undefined,
      retryAfter: undefined,
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  test('429 error extracts retry-after header', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: 'Rate limit exceeded' }, { 'Retry-After': '120' })
    );

    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('test');
    });

    expect(result.current.error).toEqual({
      status: 429,
      message: 'Rate limit exceeded',
      details: undefined,
      retryAfter: 120,
    });
  });

  test('network error sets status 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('test');
    });

    expect(result.current.error).toEqual({
      status: 0,
      message: 'Network failure',
    });
  });

  test('timeout aborts request and sets 408 error', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementationOnce(fetchUntilAborted);

    const { result } = renderHook(() => useAgentSearch({ timeout: 5000 }));

    let searchPromise!: Promise<void>;
    act(() => {
      searchPromise = result.current.search('test');
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
      await searchPromise;
    });

    expect(result.current.error?.status).toBe(408);
    expect(result.current.error?.message).toContain('5s');
    expect(result.current.isLoading).toBe(false);
  });

  test('empty query sets 400 error without API call', async () => {
    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('');
    });

    expect(result.current.error).toEqual({
      status: 400,
      message: 'Query cannot be empty',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('aborts in-flight request when new search starts', async () => {
    fetchMock.mockImplementation(fetchUntilAborted);

    const { result, unmount } = renderHook(() => useAgentSearch());

    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.search('first query');
    });
    const firstSignal: AbortSignal = fetchMock.mock.calls[0][1].signal;
    expect(firstSignal.aborted).toBe(false);

    let secondPromise!: Promise<void>;
    act(() => {
      secondPromise = result.current.search('second query');
    });

    expect(firstSignal.aborted).toBe(true);
    const secondSignal: AbortSignal = fetchMock.mock.calls[1][1].signal;
    expect(secondSignal.aborted).toBe(false);

    // 外すと 2 つ目も abort され、どちらの検索も終わる
    unmount();
    expect(secondSignal.aborted).toBe(true);
    await act(async () => {
      await Promise.all([firstPromise, secondPromise]);
    });
  });

  test('handles SSE streaming response', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          sseEvent({
            type: 'tool-start',
            toolCallId: 'call1',
            toolName: 'semantic-article-search',
            input: { query: 'React' },
          })
        );
        controller.enqueue(
          sseEvent({ type: 'tool-complete', toolCallId: 'call1', result: { articles: [] } })
        );
        controller.enqueue(sseEvent({ type: 'text-delta', delta: 'Found ' }));
        controller.enqueue(sseEvent({ type: 'text-delta', delta: '3 articles' }));
        controller.enqueue(
          sseEvent({
            type: 'finish',
            usage: { totalTokens: 100 },
            cached: false,
            fallback: false,
          })
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(sseResponse(stream));

    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('React articles');
    });

    expect(result.current.result?.response).toBe('Found 3 articles');
    expect(result.current.result?.usage).toEqual({ totalTokens: 100 });
    expect(result.current.result?.toolCalls).toEqual([
      {
        id: 'call1',
        name: 'semantic-article-search',
        input: { query: 'React' },
        dynamic: false,
        output: { articles: [] },
      },
    ]);
    expect(result.current.currentStep).toBe('complete');
    // 途中の文字列は、終わったら消す
    expect(result.current.partialText).toBe('');
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, mockResult));

    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('test query');
    });

    expect(result.current.result).toEqual({ ...mockResult, articles: [] });
    expect(result.current.error).toBeNull();
  });

  test('SSE streaming updates partialText progressively', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    fetchMock.mockResolvedValueOnce(sseResponse(stream));

    const { result } = renderHook(() => useAgentSearch());

    let searchPromise!: Promise<void>;
    act(() => {
      searchPromise = result.current.search('test query');
    });

    // 1 つ送るごとに、途中の文字列が伸びる
    act(() => {
      controller.enqueue(sseEvent({ type: 'text-delta', delta: 'Hello' }));
    });
    await waitFor(() => {
      expect(result.current.partialText).toBe('Hello');
    });
    expect(result.current.currentStep).toBe('generating');

    act(() => {
      controller.enqueue(sseEvent({ type: 'text-delta', delta: ' World' }));
    });
    await waitFor(() => {
      expect(result.current.partialText).toBe('Hello World');
    });

    await act(async () => {
      controller.enqueue(
        sseEvent({ type: 'finish', usage: { totalTokens: 50 }, cached: false, fallback: false })
      );
      controller.close();
      await searchPromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result?.response).toBe('Hello World');
    expect(result.current.partialText).toBe('');
  });

  test('a stream that ends without finish is an error, not a complete answer', async () => {
    // サーバーは閉じる前に必ず finish か error を送る。どちらも無く終わったら途中で切れている
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sseEvent({ type: 'text-delta', delta: 'partial' }));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(sseResponse(stream));

    const { result } = renderHook(() => useAgentSearch());

    await act(async () => {
      await result.current.search('test query');
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toEqual({
      status: 0,
      message: 'Stream ended before completion',
    });
    expect(result.current.currentStep).toBe('error');
    expect(result.current.isLoading).toBe(false);
  });

  test('a timed-out request finishing late does not clear loading of a newer search', async () => {
    jest.useFakeTimers();
    // 1 つ目は abort されても、テストが失敗させるまで終わらない（タイムアウトの後始末が遅れて走る場合）
    let rejectFirst!: (error: Error) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
      )
      .mockImplementationOnce(fetchUntilAborted);

    const { result } = renderHook(() => useAgentSearch({ timeout: 5000 }));

    let firstPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.search('first query');
    });
    // 1 つ目がタイムアウトする
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // その後始末より先に、2 つ目を始める
    act(() => {
      void result.current.search('second query');
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      rejectFirst(abortError);
      await firstPromise;
    });

    // 2 つ目はまだ終わっていない
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.currentStep).toBe('searching');
  });

  test('race guard ignores chunks from aborted requests', async () => {
    // 1 つ目（古い要求）と 2 つ目（新しい要求）のストリームを、どちらもテストから送る
    let staleController!: ReadableStreamDefaultController<Uint8Array>;
    const staleStream = new ReadableStream<Uint8Array>({
      start(c) {
        staleController = c;
      },
    });
    let freshController!: ReadableStreamDefaultController<Uint8Array>;
    const freshStream = new ReadableStream<Uint8Array>({
      start(c) {
        freshController = c;
      },
    });
    fetchMock
      .mockResolvedValueOnce(sseResponse(staleStream))
      .mockResolvedValueOnce(sseResponse(freshStream));

    const { result } = renderHook(() => useAgentSearch());

    let stalePromise!: Promise<void>;
    act(() => {
      stalePromise = result.current.search('query A');
    });
    // 1 つ目の応答を受け取り、ストリームを読み始めるまで進める
    await act(async () => {
      await Promise.resolve();
    });

    // 2 つ目を始める（1 つ目を abort する）。abort しても、モックのストリームは送られた分を読ませる
    let freshPromise!: Promise<void>;
    act(() => {
      freshPromise = result.current.search('query B');
    });
    act(() => {
      freshController.enqueue(sseEvent({ type: 'text-delta', delta: 'Fresh' }));
    });
    await waitFor(() => {
      expect(result.current.partialText).toBe('Fresh');
    });
    expect(result.current.currentStep).toBe('generating');

    // 2 つ目が途中のあいだに、古い要求のチャンクが届いて読み終わる
    await act(async () => {
      staleController.enqueue(
        sseEvent({
          type: 'tool-start',
          toolCallId: 'stale-call',
          toolName: 'semantic-article-search',
          input: { query: 'A' },
        })
      );
      staleController.enqueue(sseEvent({ type: 'text-delta', delta: 'Stale' }));
      staleController.close();
      await stalePromise;
    });

    // 途中の表示（文字列・段階）は 2 つ目のまま
    expect(result.current.partialText).toBe('Fresh');
    expect(result.current.currentStep).toBe('generating');
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      freshController.enqueue(sseEvent({ type: 'text-delta', delta: ' Result' }));
      freshController.enqueue(sseEvent({ type: 'finish', usage: { totalTokens: 50 } }));
      freshController.close();
      await freshPromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.result?.response).toBe('Fresh Result');
    expect(result.current.currentStep).toBe('complete');
  });
});
