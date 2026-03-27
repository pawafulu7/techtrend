import pino from 'pino';
import crypto from 'crypto';

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
 * Sanitize error objects to remove sensitive information
 * Handles API keys that may appear in error messages (not covered by redact)
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    let sanitizedMessage = error.message;
    let sanitizedStack = error.stack;

    // Remove OpenAI API keys (pattern: sk-...)
    sanitizedMessage = sanitizedMessage.replace(
      /sk-[a-zA-Z0-9]{20,}/g,
      '[REDACTED:API_KEY]'
    );
    if (sanitizedStack) {
      sanitizedStack = sanitizedStack.replace(
        /sk-[a-zA-Z0-9]{20,}/g,
        '[REDACTED:API_KEY]'
      );
    }

    // Remove Gemini API keys (pattern: AIza...)
    sanitizedMessage = sanitizedMessage.replace(
      /AIza[a-zA-Z0-9_\-]{35}/g,
      '[REDACTED:GEMINI_KEY]'
    );
    if (sanitizedStack) {
      sanitizedStack = sanitizedStack.replace(
        /AIza[a-zA-Z0-9_\-]{35}/g,
        '[REDACTED:GEMINI_KEY]'
      );
    }

    // Remove Bearer tokens (including JWT with dots and padding)
    sanitizedMessage = sanitizedMessage.replace(
      /Bearer\s+[a-zA-Z0-9_.\-=]+/gi,
      'Bearer [REDACTED]'
    );
    if (sanitizedStack) {
      sanitizedStack = sanitizedStack.replace(
        /Bearer\s+[a-zA-Z0-9_.\-=]+/gi,
        'Bearer [REDACTED]'
      );
    }

    return {
      name: error.name,
      message: sanitizedMessage,
      // Include stack trace only in development
      ...(process.env.NODE_ENV === 'development' &&
        sanitizedStack && {
          stack: sanitizedStack,
        }),
    };
  }

  return error;
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

  serializers: {
    // Custom error serializer with sanitization (handles API keys in messages)
    err: (err) => {
      return sanitizeError(err);
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
