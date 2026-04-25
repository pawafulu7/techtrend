import pino from 'pino';
import crypto from 'crypto';
import { trace, isSpanContextValid } from '@opentelemetry/api';
import {
  sanitizeError as sanitizeErrorImpl,
  sanitizeErrorMessage as sanitizeErrorMessageImpl,
} from '@/lib/utils/sanitize-error';

// 後方互換のため既存 import path (`@/lib/logger`) からも公開する
export { sanitizeErrorImpl as sanitizeError };
export { sanitizeErrorMessageImpl as sanitizeErrorMessage };

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

/**
 * Hash sensitive values for privacy while maintaining debuggability
 * Uses SHA-256 with first 8 characters for log correlation
 */
export function hashSensitiveValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '[REDACTED]';
  }

  const str = String(value);

  // Empty or invalid values
  if (str === '' || str === 'undefined' || str === 'null') {
    return '[REDACTED:EMPTY]';
  }

  // Hash for debuggability (same value = same hash prefix)
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return `[HASHED:${hash.slice(0, 8)}]`;
}

/**
 * Paths to redact in log output
 * Uses Pino's redact feature for structured data
 */
const REDACT_PATHS = [
  // Email addresses
  'email',
  '*.email',
  '**.email',
  'user.email',
  'session.user.email',

  // IP addresses
  'clientIp',
  '*.clientIp',
  '**.clientIp',
  'request.ip',
  'req.ip',
  '*.ip',
  '**.ip',
  'x-forwarded-for',
  'x-real-ip',

  // Authentication
  'password',
  '*.password',
  '**.password',
  'token',
  '*.token',
  '**.token',
  'secret',
  '*.secret',
  '**.secret',
  'apiKey',
  '*.apiKey',
  '**.apiKey',
  'authorization',
  '*.authorization',

  // Auth.js related
  'credentials',
  '*.credentials',
  'session.sessionToken',
  'sessionToken',

  // Other PII
  'phoneNumber',
  '*.phoneNumber',
  'address',
  '*.address',
];

const logger = pino({
  level: isTest
    ? 'silent'
    : process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

  // Pino's redact feature for structured data masking
  redact: {
    paths: REDACT_PATHS,
    censor: hashSensitiveValue,
  },

  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },

  // Automatically inject traceId/spanId from active OTEL span into every log record.
  // Uses isSpanContextValid() to avoid emitting the all-zero NoopSpan context
  // (32 '0' traceId) when OTEL SDK is not initialized (batch scripts, tests).
  // NOTE: pino's default mixinMergeStrategy is Object.assign(mergedObject, mixin),
  // so if a log call explicitly passes `traceId`/`spanId`, the mixin value wins.
  mixin: () => {
    const ctx = trace.getActiveSpan()?.spanContext();
    return ctx && isSpanContextValid(ctx)
      ? { traceId: ctx.traceId, spanId: ctx.spanId }
      : {};
  },

  serializers: {
    // Custom error serializer with sanitization (handles API keys in messages)
    err: (err) => {
      return sanitizeErrorImpl(err);
    },
    request: (req) => ({
      method: req.method,
      url: req.url,
      // Note: headers are handled by redact, so we don't include them here
    }),
    response: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// 特定コンテキスト用のロガー作成
export const createLogger = (context: string) => {
  return logger.child({ context });
};

// Named export for named imports
export { logger };

export default logger;
