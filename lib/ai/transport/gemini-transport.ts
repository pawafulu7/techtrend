import { logger } from '@/lib/logger';
import {
  GeminiServiceTier,
  GeminiTransport,
  TransportRequest,
  TransportResult,
} from './gemini-transport.interface';

type CircuitBreakerState = {
  consecutiveErrors: number;
  circuitOpen: boolean;
  circuitOpenUntil: number;
};

function createCircuitBreakerState(): CircuitBreakerState {
  return { consecutiveErrors: 0, circuitOpen: false, circuitOpenUntil: 0 };
}

export class GeminiTransportImpl implements GeminiTransport {
  // tier別にcircuit breaker状態を分離管理する。
  // Flex tierのbest-effort起因の一時失敗が、無関係なStandard呼び出し(Translator等)や
  // Flex失敗後のStandardフォールバック自体まで巻き込んでcircuitを開かないようにするため
  private readonly circuitBreakers = new Map<
    GeminiServiceTier,
    CircuitBreakerState
  >([
    ['standard', createCircuitBreakerState()],
    ['flex', createCircuitBreakerState()],
  ]);

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = 'https://generativelanguage.googleapis.com',
    private readonly maxRetries: number = 3,
    private readonly circuitBreakerThreshold: number = 5,
    // Flex tier用の短縮タイムアウト。公式目安の1-15分を律儀に待たず、
    // 早期にStandardへフォールバックするための値（GHAスケジューラのバッチ時間予算を守るため）
    private readonly flexTimeoutMs: number = 180000
  ) {}

  async invoke(opts: TransportRequest): Promise<TransportResult> {
    if (opts.serviceTier === 'flex') {
      return this.invokeWithFallback(opts);
    }
    return this.invokeTier('standard', opts);
  }

  /**
   * Flex tierを試行し、非'ok'で終わった場合はStandard tierへ1回フォールバックする。
   * リクエストボディへの`service_tier`注入もここで行う（Adapter層はserviceTierを渡すのみ）。
   */
  private async invokeWithFallback(
    opts: TransportRequest
  ): Promise<TransportResult> {
    const flexOpts: TransportRequest = {
      ...opts,
      body: { ...opts.body, service_tier: 'flex' },
      timeoutMs: this.flexTimeoutMs,
    };

    const flexResult = await this.invokeTier('flex', flexOpts);
    if (flexResult.status === 'ok') {
      return {
        ...flexResult,
        serviceTierUsed: 'flex',
        fellBackToStandard: false,
      };
    }

    logger.warn(
      { requestId: opts.requestId, flexStatus: flexResult.status },
      'Flex tier failed, falling back to standard tier'
    );

    const standardResult = await this.invokeTier('standard', opts);
    return {
      ...standardResult,
      serviceTierUsed: 'standard',
      fellBackToStandard: true,
    };
  }

  /** 指定tierのcircuit breakerチェック・呼び出し・状態更新を行う（従来のinvoke()相当） */
  private async invokeTier(
    tier: GeminiServiceTier,
    opts: TransportRequest
  ): Promise<TransportResult> {
    const breaker = this.circuitBreakers.get(tier)!;

    if (breaker.circuitOpen && Date.now() < breaker.circuitOpenUntil) {
      logger.warn({ tier }, 'Circuit breaker is open');
      return {
        status: 'fatal_error',
        error: new Error(`Circuit breaker is open (tier: ${tier})`),
        latencyMs: 0,
        headers: {},
      };
    }

    logger.debug(
      { requestId: opts.requestId, tier },
      'Transport request start'
    );

    const result = await this.invokeWithRetry(opts);

    if (result.status === 'ok') {
      breaker.consecutiveErrors = 0;
      breaker.circuitOpen = false;
    } else {
      breaker.consecutiveErrors++;
      if (breaker.consecutiveErrors >= this.circuitBreakerThreshold) {
        breaker.circuitOpen = true;
        breaker.circuitOpenUntil = Date.now() + 60000;
        logger.warn({ tier }, 'Circuit breaker opened');
      }
    }

    logger.debug(
      {
        requestId: opts.requestId,
        tier,
        status: result.status,
        latencyMs: result.latencyMs,
      },
      'Transport request end'
    );

    return result;
  }

  private async invokeWithRetry(
    opts: TransportRequest
  ): Promise<TransportResult> {
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

      logger.debug(
        { attempt: attempt + 1, delayMs: Math.round(delay) },
        'Transport retry attempt'
      );
      await this.sleep(delay);
    }

    return lastResult!;
  }

  private async invokeCore(opts: TransportRequest): Promise<TransportResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/v1beta/models/${opts.model}:generateContent`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        opts.timeoutMs ?? 30000
      );

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
        logger.error(
          { httpStatus: response.status, errorText },
          'Transport HTTP error'
        );

        return {
          status: this.isRetryableStatus(response.status)
            ? 'retryable_error'
            : 'fatal_error',
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

      logger.error({ err, latencyMs }, 'Transport request failed');

      return {
        status: this.isRetryableError(err) ? 'retryable_error' : 'fatal_error',
        error: err,
        latencyMs,
        headers: {},
      };
    }
  }

  private isRetryableStatus(status: number): boolean {
    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'abort',
      'network',
    ];
    return retryablePatterns.some((pattern) =>
      error.message.toLowerCase().includes(pattern)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async warmup(): Promise<void> {
    logger.debug('Transport warmup - no action needed');
  }
}
