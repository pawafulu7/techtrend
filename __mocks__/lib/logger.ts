import crypto from 'crypto';

type MockLogger = {
  warn: jest.Mock;
  info: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  child: jest.Mock;
};

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

const mockLogger = {
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} satisfies MockLogger;

mockLogger.child.mockImplementation(() => mockLogger);

// Matches both import styles used in the codebase:
// - `import logger from '@/lib/logger'`
// - `import { logger } from '@/lib/logger'`
export const logger = mockLogger;

export const createLogger = jest.fn((_context: string) => mockLogger);

export default mockLogger;
