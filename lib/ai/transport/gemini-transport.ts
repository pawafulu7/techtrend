import {
  GeminiTransport,
  TransportRequest,
  TransportResult,
  TransportError,
} from './gemini-transport.interface';

export class GeminiTransportImpl implements GeminiTransport {
  private consecutiveErrors = 0;
  private circuitOpen = false;
  private circuitOpenUntil: number = 0;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://generativelanguage.googleapis.com',
    private readonly maxRetries: number = 3,
    private readonly circuitBreakerThreshold: number = 5
  ) {}

  async invoke(opts: TransportRequest): Promise<TransportResult> {
    if (this.circuitOpen && Date.now() < this.circuitOpenUntil) {
      console.log('[Transport] Circuit breaker is open');
      return {
        status: 'fatal_error',
        error: new Error('Circuit breaker is open'),
        latencyMs: 0,
        headers: {},
      };
    }

    console.log(`[Transport] Request start: ${opts.requestId}`);

    const result = await this.invokeWithRetry(opts);

    if (result.status === 'ok') {
      this.consecutiveErrors = 0;
      this.circuitOpen = false;
    } else {
      this.consecutiveErrors++;
      if (this.consecutiveErrors >= this.circuitBreakerThreshold) {
        this.circuitOpen = true;
        this.circuitOpenUntil = Date.now() + 60000;
        console.log('[Transport] Circuit breaker opened');
      }
    }

    console.log(
      `[Transport] Request end: ${opts.requestId}, status: ${result.status}, latency: ${result.latencyMs}ms`
    );

    return result;
  }

  private async invokeWithRetry(opts: TransportRequest): Promise<TransportResult> {
    let lastResult: TransportResult | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      lastResult = await this.invokeCore(opts);

      if (lastResult.status === 'ok') {
        return lastResult;
      }

      if (lastResult.status === 'fatal_error' || attempt === this.maxRetries) {
        break;
      }

      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.log(`[Transport] Retry attempt ${attempt + 1}, waiting ${Math.round(delay)}ms`);
      await this.sleep(delay);
    }

    return lastResult!;
  }

  private async invokeCore(opts: TransportRequest): Promise<TransportResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/v1beta/models/${opts.model}:generateContent`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
          'x-request-id': opts.requestId,
        },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[Transport] HTTP ${response.status}: ${errorText}`);

        return {
          status: this.isRetryableStatus(response.status) ? 'retryable_error' : 'fatal_error',
          httpStatus: response.status,
          error: new Error(`HTTP ${response.status}: ${errorText}`),
          latencyMs,
          headers,
        };
      }

      const payload = await response.json();

      return {
        status: 'ok',
        httpStatus: response.status,
        payload,
        latencyMs,
        headers,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const err = error as Error;

      console.error('[Transport] Request failed:', err.message);

      return {
        status: this.isRetryableError(err) ? 'retryable_error' : 'fatal_error',
        error: err,
        latencyMs,
        headers: {},
      };
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = ['timeout', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'abort'];
    return retryablePatterns.some((pattern) => error.message.toLowerCase().includes(pattern));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async warmup(): Promise<void> {
    console.log('[Transport] Warmup - no action needed');
  }
}