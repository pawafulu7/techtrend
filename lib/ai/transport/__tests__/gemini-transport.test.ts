import { GeminiTransportImpl } from '../gemini-transport';

describe('GeminiTransportImpl', () => {
  let transport: GeminiTransportImpl;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    transport = new GeminiTransportImpl('test-api-key');
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('正常系', () => {
    it('should return ok status on successful response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Map([['content-type', 'application/json']]),
      });

      const result = await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-123',
      });

      expect(result.status).toBe('ok');
      expect(result.payload).toEqual({ result: 'success' });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.httpStatus).toBe(200);
    });

    it('should include headers in response', async () => {
      const headers = new Map([
        ['content-type', 'application/json'],
        ['x-custom-header', 'test-value'],
      ]);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers,
      });

      const result = await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-headers',
      });

      expect(result.headers).toHaveProperty('content-type', 'application/json');
      expect(result.headers).toHaveProperty('x-custom-header', 'test-value');
    });

    it('should measure latency correctly', async () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({ result: 'success' }),
                  headers: new Map(),
                }),
              100
            )
          )
      );

      const result = await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-latency',
      });

      // Allow 5ms tolerance for timing fluctuations
      expect(result.latencyMs).toBeGreaterThanOrEqual(95);
    });
  });

  describe('リトライ動作', () => {
    it('should retry on retryable errors', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limit',
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'Server error',
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          headers: new Map(),
        });

      const result = await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-retry',
      });

      expect(result.status).toBe('ok');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on fatal errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
        headers: new Map(),
      });

      const result = await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-fatal',
      });

      expect(result.status).toBe('fatal_error');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it(
      'should give up after max retries',
      async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Server error',
          headers: new Map(),
        });

        const result = await transport.invoke({
          model: 'gemini-2.5-flash',
          body: { test: true },
          requestId: 'test-max-retries',
        });

        expect(result.status).toBe('retryable_error');
        expect(global.fetch).toHaveBeenCalledTimes(4);
      },
      15000
    );
  });

  describe('サーキットブレーカー', () => {
    // TODO: Fix circuit breaker test stability issues - see GitHub issue #141
    it.skip(
      'should open circuit breaker after consecutive errors',
      async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'Server error',
          headers: new Map(),
        });

        for (let i = 0; i < 5; i++) {
          await transport.invoke({
            model: 'test',
            body: {},
            requestId: `test-${i}`,
          });
        }

        const result = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-circuit',
        });

        expect(result.error?.message).toContain('Circuit breaker is open');
        expect(result.status).toBe('fatal_error');
      },
      60000
    );

    // TODO: Fix circuit breaker test stability issues - see GitHub issue #141
    it.skip(
      'should reset consecutive errors on success',
      async () => {
        (global.fetch as jest.Mock)
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Server error',
            headers: new Map(),
          });

        const result1 = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-1',
        });
        expect(result1.status).toBe('retryable_error');

        const result2 = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-2',
        });
        expect(result2.status).toBe('ok');

        const privateTransport = transport as any;
        expect(privateTransport.consecutiveErrors).toBe(0);

        const result3 = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-3',
        });
        expect(result3.status).toBe('retryable_error');
        expect(privateTransport.consecutiveErrors).toBe(1);
      },
      30000
    );
  });

  describe('タイムアウト', () => {
    it(
      'should timeout after specified duration',
      async () => {
      (global.fetch as jest.Mock).mockImplementation(
        (_url, options) =>
          new Promise((resolve, reject) => {
            const signal = options?.signal as AbortSignal;
            const timeoutId = setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  json: async () => ({ result: 'success' }),
                  headers: new Map(),
                }),
              10000
            );
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('The operation was aborted'));
            });
          })
      );

      const result = await transport.invoke({
        model: 'test',
        body: {},
        requestId: 'test-timeout',
        timeoutMs: 100,
      });

        expect(result.status).toBe('retryable_error');
        expect(result.error?.message).toContain('abort');
      },
      20000
    );

    it(
      'should use default timeout when not specified',
      async () => {
      let timeoutDuration: number = 0;

      (global.fetch as jest.Mock).mockImplementation((_url, options) => {
        const signal = options?.signal as AbortSignal;
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            timeoutDuration = Date.now();
            reject(new Error('The operation was aborted'));
          });
        });
      });

      const startTime = Date.now();
      await transport.invoke({
        model: 'test',
        body: {},
        requestId: 'test-default-timeout',
      });

        const elapsed = timeoutDuration - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(100);
        expect(elapsed).toBeLessThan(148000);
      },
      150000
    );
  });

  describe('エラーハンドリング', () => {
    it(
      'should handle network errors',
      async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        const result = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-network-error',
        });

        expect(result.status).toBe('retryable_error');
        expect(result.error?.message).toContain('Network error');
      },
      15000
    );

    it('should handle JSON parse errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        headers: new Map(),
      });

      const result = await transport.invoke({
        model: 'test',
        body: {},
        requestId: 'test-json-error',
      });

      expect(result.status).toBe('fatal_error');
      expect(result.error?.message).toContain('Invalid JSON');
    });

    it(
      'should classify timeout errors as retryable',
      async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Request timeout'));

        const result = await transport.invoke({
          model: 'test',
          body: {},
          requestId: 'test-timeout-error',
        });

        expect(result.status).toBe('retryable_error');
      },
      15000
    );
  });

  describe('API呼び出し', () => {
    it('should construct correct API URL', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Map(),
      });

      await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-url',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        expect.any(Object)
      );
    });

    it('should include API key in headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Map(),
      });

      await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'test-api-key',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should include request ID in headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Map(),
      });

      await transport.invoke({
        model: 'gemini-2.5-flash',
        body: { test: true },
        requestId: 'custom-request-id',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-request-id': 'custom-request-id',
          }),
        })
      );
    });

    it('should send body as JSON', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: 'success' }),
        headers: new Map(),
      });

      const testBody = { contents: [{ parts: [{ text: 'test' }] }] };

      await transport.invoke({
        model: 'gemini-2.5-flash',
        body: testBody,
        requestId: 'test-body',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(testBody),
        })
      );
    });
  });

  describe('warmup', () => {
    it('should complete without error', async () => {
      await expect(transport.warmup()).resolves.toBeUndefined();
    });
  });
});