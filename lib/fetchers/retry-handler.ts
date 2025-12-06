/**
 * Retry Handler with Exponential Backoff and Circuit Breaker
 *
 * Job-level retry handler for collect-feeds pipeline.
 * Separate from BaseFetcher.retry() which handles individual HTTP requests.
 *
 * Features:
 * - Exponential backoff with full jitter
 * - Circuit breaker pattern (per-source)
 * - Failure classification (retryable vs non-retryable)
 * - Structured logging with attempt metadata
 */

import logger from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

/** Failure classification for retry decisions */
export type FailureType =
  | 'network' // Transient network errors - retryable
  | 'rate_limit' // 429/quota exceeded - retryable with longer delay
  | 'server_error' // 5xx errors - retryable
  | 'client_error' // 4xx errors (except 429) - non-retryable
  | 'timeout' // Request timeout - retryable
  | 'unknown'; // Unknown errors - retryable with caution

/** Circuit breaker states */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Options for retry handler */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Identifier for logging and circuit breaker (default: 'unknown') */
  operationId?: string;
  /** Whether to use circuit breaker (default: true) */
  useCircuitBreaker?: boolean;
}

/** Result of retry operation */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  failureType?: FailureType;
}

/** Circuit breaker entry */
interface CircuitEntry {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Threshold for opening circuit (consecutive failures) */
const CIRCUIT_FAILURE_THRESHOLD = 3;

/** Time to wait before half-open attempt (ms) */
const CIRCUIT_RESET_TIMEOUT_MS = 60000; // 1 minute

/** Success threshold to close half-open circuit (reserved for future use) */
const _CIRCUIT_SUCCESS_THRESHOLD = 1;

// ============================================================================
// Circuit Breaker State (in-memory, per-process)
// ============================================================================

const circuitBreakers = new Map<string, CircuitEntry>();

/**
 * Get or create circuit breaker entry
 */
function getCircuitEntry(operationId: string): CircuitEntry {
  let entry = circuitBreakers.get(operationId);
  if (!entry) {
    entry = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
    };
    circuitBreakers.set(operationId, entry);
  }
  return entry;
}

/**
 * Check if circuit allows operation
 */
export function isCircuitOpen(operationId: string): boolean {
  const entry = getCircuitEntry(operationId);

  if (entry.state === 'closed') {
    return false;
  }

  if (entry.state === 'open') {
    // Check if enough time has passed to try half-open
    const timeSinceFailure = Date.now() - entry.lastFailureTime;
    if (timeSinceFailure >= CIRCUIT_RESET_TIMEOUT_MS) {
      entry.state = 'half-open';
      logger.info(
        { operationId, timeSinceFailure },
        'Circuit breaker transitioning to half-open'
      );
      return false;
    }
    return true;
  }

  // half-open: allow one attempt
  return false;
}

/**
 * Record operation success
 */
export function recordSuccess(operationId: string): void {
  const entry = getCircuitEntry(operationId);
  entry.lastSuccessTime = Date.now();

  if (entry.state === 'half-open') {
    entry.state = 'closed';
    entry.failures = 0;
    logger.info({ operationId }, 'Circuit breaker closed after successful recovery');
  } else if (entry.state === 'closed') {
    // Reset failure count on success
    entry.failures = 0;
  }
}

/**
 * Record operation failure
 */
export function recordFailure(operationId: string, failureType: FailureType): void {
  const entry = getCircuitEntry(operationId);
  entry.failures++;
  entry.lastFailureTime = Date.now();

  if (entry.state === 'half-open') {
    // Failed during recovery attempt - reopen circuit
    entry.state = 'open';
    logger.warn(
      { operationId, failureType, failures: entry.failures },
      'Circuit breaker reopened after half-open failure'
    );
  } else if (
    entry.state === 'closed' &&
    entry.failures >= CIRCUIT_FAILURE_THRESHOLD
  ) {
    entry.state = 'open';
    logger.warn(
      { operationId, failureType, failures: entry.failures },
      'Circuit breaker opened due to consecutive failures'
    );
  }
}

/**
 * Get current circuit state for monitoring
 */
export function getCircuitState(operationId: string): CircuitState {
  return getCircuitEntry(operationId).state;
}

/**
 * Get all circuit breaker states for monitoring
 */
export function getAllCircuitStates(): Record<string, CircuitEntry> {
  const states: Record<string, CircuitEntry> = {};
  circuitBreakers.forEach((entry, id) => {
    states[id] = { ...entry };
  });
  return states;
}

/**
 * Reset circuit breaker (for testing)
 */
export function resetCircuitBreaker(operationId: string): void {
  circuitBreakers.delete(operationId);
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear();
}

// ============================================================================
// Failure Classification
// ============================================================================

/**
 * Classify error for retry decision
 */
export function classifyError(error: unknown): FailureType {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors
  if (
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('socket hang up') ||
    name.includes('fetcherror')
  ) {
    return 'network';
  }

  // Timeout
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted') ||
    name.includes('aborterror')
  ) {
    return 'timeout';
  }

  // Rate limiting (429)
  if (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests')
  ) {
    return 'rate_limit';
  }

  // Server errors (5xx)
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('internal server error') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable')
  ) {
    return 'server_error';
  }

  // Client errors (4xx except 429)
  if (
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404') ||
    message.includes('bad request') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found')
  ) {
    return 'client_error';
  }

  return 'unknown';
}

/**
 * Check if failure type is retryable
 */
export function isRetryable(failureType: FailureType): boolean {
  return failureType !== 'client_error';
}

// ============================================================================
// Delay Calculation
// ============================================================================

/**
 * Calculate delay with exponential backoff and full jitter
 *
 * Formula: random(0, min(maxDelay, baseDelay * 2^attempt))
 * This provides better distribution than standard exponential backoff
 */
export function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  failureType: FailureType
): number {
  // Use longer base delay for rate limiting
  const effectiveBase = failureType === 'rate_limit' ? baseDelayMs * 3 : baseDelayMs;

  // Exponential calculation
  const exponentialDelay = effectiveBase * Math.pow(2, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Full jitter: random value between 0 and cappedDelay
  const jitter = Math.random() * cappedDelay;

  return Math.floor(jitter);
}

// ============================================================================
// Main Retry Handler
// ============================================================================

/**
 * Execute operation with retry and circuit breaker
 *
 * @param operation - Async function to execute
 * @param options - Retry options
 * @returns RetryResult with success/failure info
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    operationId = 'unknown',
    useCircuitBreaker = true,
  } = options;

  // Check circuit breaker
  if (useCircuitBreaker && isCircuitOpen(operationId)) {
    logger.warn(
      { operationId },
      'Circuit breaker is open, skipping operation'
    );
    return {
      success: false,
      error: new Error(`Circuit breaker open for ${operationId}`),
      attempts: 0,
      failureType: 'network',
    };
  }

  let lastError: Error | undefined;
  let failureType: FailureType = 'unknown';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();

      // Success - record and return
      if (useCircuitBreaker) {
        recordSuccess(operationId);
      }

      if (attempt > 0) {
        logger.info(
          { operationId, attempt, totalAttempts: attempt + 1 },
          'Operation succeeded after retry'
        );
      }

      return {
        success: true,
        result,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      failureType = classifyError(error);

      logger.warn(
        {
          operationId,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          failureType,
          error: lastError.message,
        },
        'Operation failed'
      );

      // Check if retryable
      if (!isRetryable(failureType)) {
        logger.warn(
          { operationId, failureType },
          'Non-retryable error, stopping retries'
        );
        if (useCircuitBreaker) {
          recordFailure(operationId, failureType);
        }
        break;
      }

      // More retries available?
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs, failureType);
        logger.debug(
          { operationId, attempt, delay, failureType },
          'Waiting before retry'
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Final failure
        if (useCircuitBreaker) {
          recordFailure(operationId, failureType);
        }
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries + 1,
    failureType,
  };
}

/**
 * Wrap an async function with retry logic
 *
 * Creates a new function that automatically retries on failure
 */
export function withRetryWrapper<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options: RetryOptions = {}
): (...args: Args) => Promise<RetryResult<T>> {
  return async (...args: Args): Promise<RetryResult<T>> => {
    return withRetry(() => fn(...args), options);
  };
}
