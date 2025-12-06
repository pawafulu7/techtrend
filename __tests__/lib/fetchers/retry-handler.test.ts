/**
 * Retry Handler Tests
 */

import {
  withRetry,
  withRetryWrapper,
  classifyError,
  isRetryable,
  calculateDelay,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  getCircuitState,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  type FailureType,
  type RetryOptions,
} from '@/lib/fetchers/retry-handler';

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('retry-handler', () => {
  beforeEach(() => {
    resetAllCircuitBreakers();
    jest.clearAllMocks();
  });

  describe('classifyError', () => {
    it('classifies network errors', () => {
      expect(classifyError(new Error('ECONNREFUSED'))).toBe('network');
      expect(classifyError(new Error('ECONNRESET'))).toBe('network');
      expect(classifyError(new Error('ENOTFOUND'))).toBe('network');
      expect(classifyError(new Error('socket hang up'))).toBe('network');
    });

    it('classifies timeout errors', () => {
      expect(classifyError(new Error('Request timeout'))).toBe('timeout');
      expect(classifyError(new Error('Operation timed out'))).toBe('timeout');
      expect(classifyError(new Error('Request aborted'))).toBe('timeout');
    });

    it('classifies rate limit errors', () => {
      expect(classifyError(new Error('429 Too Many Requests'))).toBe('rate_limit');
      expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
      expect(classifyError(new Error('Quota exceeded'))).toBe('rate_limit');
    });

    it('classifies server errors', () => {
      expect(classifyError(new Error('500 Internal Server Error'))).toBe('server_error');
      expect(classifyError(new Error('502 Bad Gateway'))).toBe('server_error');
      expect(classifyError(new Error('503 Service Unavailable'))).toBe('server_error');
    });

    it('classifies client errors', () => {
      expect(classifyError(new Error('400 Bad Request'))).toBe('client_error');
      expect(classifyError(new Error('401 Unauthorized'))).toBe('client_error');
      expect(classifyError(new Error('403 Forbidden'))).toBe('client_error');
      expect(classifyError(new Error('404 Not Found'))).toBe('client_error');
    });

    it('returns unknown for unrecognized errors', () => {
      expect(classifyError(new Error('Something went wrong'))).toBe('unknown');
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
    });
  });

  describe('isRetryable', () => {
    it('returns true for retryable failure types', () => {
      expect(isRetryable('network')).toBe(true);
      expect(isRetryable('timeout')).toBe(true);
      expect(isRetryable('rate_limit')).toBe(true);
      expect(isRetryable('server_error')).toBe(true);
      expect(isRetryable('unknown')).toBe(true);
    });

    it('returns false for non-retryable failure types', () => {
      expect(isRetryable('client_error')).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('returns value within expected range', () => {
      // With jitter, delay should be between 0 and min(baseDelay * 2^attempt, maxDelay)
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(0, 1000, 30000, 'network');
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(1000);
      }
    });

    it('respects max delay cap', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateDelay(10, 1000, 5000, 'network');
        expect(delay).toBeLessThanOrEqual(5000);
      }
    });

    it('uses longer delay for rate limiting', () => {
      // Rate limit uses 3x base delay
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(calculateDelay(0, 1000, 30000, 'rate_limit'));
      }
      const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
      // Average should be around 1500 (half of 3000 due to jitter)
      expect(avgDelay).toBeGreaterThan(500);
      expect(avgDelay).toBeLessThan(2500); // Upper bound for statistical safety
    });
  });

  describe('Circuit Breaker', () => {
    const operationId = 'test-source';

    it('starts with closed circuit', () => {
      expect(getCircuitState(operationId)).toBe('closed');
      expect(isCircuitOpen(operationId)).toBe(false);
    });

    it('opens circuit after threshold failures', () => {
      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('closed');

      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('closed');

      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('open');
      expect(isCircuitOpen(operationId)).toBe(true);
    });

    it('resets failure count on success', () => {
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      recordSuccess(operationId);

      expect(getCircuitState(operationId)).toBe('closed');

      // Should need 3 more failures to open
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('closed');

      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('open');
    });

    it('transitions to half-open after timeout and closes on success', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0); // Explicit time control for Date.now()

      // Open the circuit
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('open');
      expect(isCircuitOpen(operationId)).toBe(true);

      // Advance time past CIRCUIT_RESET_TIMEOUT_MS (60000ms)
      jest.advanceTimersByTime(60001);

      // Should transition to half-open and allow attempt
      expect(isCircuitOpen(operationId)).toBe(false);
      expect(getCircuitState(operationId)).toBe('half-open');

      // Success should close the circuit
      recordSuccess(operationId);
      expect(getCircuitState(operationId)).toBe('closed');

      jest.useRealTimers();
    });

    it('reopens circuit on failure during half-open', () => {
      jest.useFakeTimers();
      jest.setSystemTime(0); // Explicit time control for Date.now()

      // Open the circuit
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('open');

      // Advance time to transition to half-open
      jest.advanceTimersByTime(60001);
      expect(isCircuitOpen(operationId)).toBe(false);
      expect(getCircuitState(operationId)).toBe('half-open');

      // Failure during half-open should reopen circuit
      recordFailure(operationId, 'network');
      expect(getCircuitState(operationId)).toBe('open');
      expect(isCircuitOpen(operationId)).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('withRetry', () => {
    it('returns result on first success', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation, {
        operationId: 'test',
        useCircuitBreaker: false,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        operationId: 'test',
        baseDelayMs: 1,
        useCircuitBreaker: false,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('stops retrying after max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await withRetry(operation, {
        operationId: 'test',
        maxRetries: 2,
        baseDelayMs: 1,
        useCircuitBreaker: false,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('ECONNREFUSED');
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(result.failureType).toBe('network');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-retryable error', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('404 Not Found'));

      const result = await withRetry(operation, {
        operationId: 'test',
        maxRetries: 3,
        baseDelayMs: 1,
        useCircuitBreaker: false,
      });

      expect(result.success).toBe(false);
      expect(result.failureType).toBe('client_error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('respects circuit breaker when open', async () => {
      const operationId = 'circuit-test';
      const operation = jest.fn().mockResolvedValue('success');

      // Open the circuit
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');

      const result = await withRetry(operation, {
        operationId,
        useCircuitBreaker: true,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(0);
      expect(result.failureType).toBe('network'); // Explicit failure type assertion
      expect(result.error?.message).toContain('Circuit breaker open');
      expect(operation).not.toHaveBeenCalled();
    });

    it('updates circuit breaker on success', async () => {
      const operationId = 'success-test';
      const operation = jest.fn().mockResolvedValue('success');

      // Add some failures (not enough to open)
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');

      await withRetry(operation, {
        operationId,
        useCircuitBreaker: true,
      });

      // Failures should be reset
      expect(getCircuitState(operationId)).toBe('closed');
    });

    it('updates circuit breaker on failure', async () => {
      const operationId = 'failure-test';
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      // Add some failures
      recordFailure(operationId, 'network');
      recordFailure(operationId, 'network');

      await withRetry(operation, {
        operationId,
        maxRetries: 0,
        useCircuitBreaker: true,
      });

      // Should now be open (3 total failures)
      expect(getCircuitState(operationId)).toBe('open');
    });
  });

  describe('withRetryWrapper', () => {
    it('creates a wrapped function with retry logic', async () => {
      const originalFn = jest.fn().mockResolvedValue('result');
      const wrappedFn = withRetryWrapper(originalFn, {
        operationId: 'wrapper-test',
        useCircuitBreaker: false,
      });

      const result = await wrappedFn('arg1', 'arg2');

      expect(result.success).toBe(true);
      expect(result.result).toBe('result');
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('passes arguments correctly to wrapped function', async () => {
      const originalFn = jest.fn().mockImplementation((a: number, b: number) =>
        Promise.resolve(a + b)
      );
      const wrappedFn = withRetryWrapper(originalFn, { useCircuitBreaker: false });

      const result = await wrappedFn(2, 3);

      expect(result.success).toBe(true);
      expect(result.result).toBe(5);
    });
  });
});
