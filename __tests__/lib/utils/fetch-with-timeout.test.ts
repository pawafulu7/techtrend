import {
  fetchWithTimeout,
  FetchTimeoutError,
  getTimeoutForSource,
  SOURCE_TIMEOUT_MAP,
} from '@/lib/utils/fetch-with-timeout';

describe('fetchWithTimeout', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch = jest.fn();
    (global as typeof globalThis & { fetch: jest.Mock }).fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('returns the fetch response when completed before the timeout', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    mockFetch.mockResolvedValueOnce(mockResponse);

    const response = await fetchWithTimeout('https://example.com/data');

    expect(response).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts when the timeout elapses and throws FetchTimeoutError', async () => {
    mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });

    const promise = fetchWithTimeout('https://example.com/slow', { timeoutMs: 1000 });

    jest.advanceTimersByTime(1000);
    await expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it('propagates non-timeout errors from fetch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetchWithTimeout('https://example.com/fail')).rejects.toThrow('network down');
  });

  it('clears the timeout after a successful fetch', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'));

    await fetchWithTimeout('https://example.com/cleanup');

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the timeout when fetch rejects with a non-timeout error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));

    await expect(fetchWithTimeout('https://example.com/error')).rejects.toThrow('boom');

    expect(jest.getTimerCount()).toBe(0);
  });

  it('uses a custom timeout when provided', async () => {
    mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = fetchWithTimeout('https://example.com/custom-timeout', { timeoutMs: 5000 });
    jest.advanceTimersByTime(5000);

    await expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    setTimeoutSpy.mockRestore();
  });

  it('applies mapped timeout for slow sources', () => {
    expect(getTimeoutForSource('Hugging Face Papers')).toBe(SOURCE_TIMEOUT_MAP['Hugging Face Papers']);
    expect(getTimeoutForSource('arXiv AI')).toBe(SOURCE_TIMEOUT_MAP['arXiv AI']);
    expect(getTimeoutForSource('Unknown Source')).toBe(30_000);
  });
});
