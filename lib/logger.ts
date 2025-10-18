import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Sanitize error objects to remove sensitive information
 * Prevents API keys and tokens from appearing in logs
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    let sanitizedMessage = error.message;
    let sanitizedStack = error.stack;

    // Remove OpenAI API keys (pattern: sk-...)
    sanitizedMessage = sanitizedMessage.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***REDACTED***');
    if (sanitizedStack) {
      sanitizedStack = sanitizedStack.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***REDACTED***');
    }

    // Remove Bearer tokens
    sanitizedMessage = sanitizedMessage.replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer ***REDACTED***');
    if (sanitizedStack) {
      sanitizedStack = sanitizedStack.replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer ***REDACTED***');
    }

    // Remove other common secret patterns
    sanitizedMessage = sanitizedMessage.replace(/password["\s:=]+[^\s"]+/gi, 'password=***REDACTED***');
    sanitizedMessage = sanitizedMessage.replace(/token["\s:=]+[^\s"]+/gi, 'token=***REDACTED***');

    return {
      name: error.name,
      message: sanitizedMessage,
      // Include stack trace only in development
      ...(process.env.NODE_ENV === 'development' && sanitizedStack && {
        stack: sanitizedStack
      })
    };
  }

  return error;
}

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  // transportは使用しない（Next.js互換性のため）
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  serializers: {
    // Custom error serializer with sanitization
    error: (err) => {
      return sanitizeError(err);
    },
    request: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
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