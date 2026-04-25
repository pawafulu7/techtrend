/**
 * Error / message サニタイズユーティリティ
 *
 * pino の `err` シリアライザを経由しない構造化ログフィールド
 * (例: errorMessage) でも API キー・Bearer token を除去できるよう、
 * logger 非依存のピュア関数として独立モジュール化する。
 */

/**
 * Remove sensitive tokens (API keys, Bearer tokens) from a free-form string.
 */
export function sanitizeErrorMessage(message: string): string {
  return (
    message
      // OpenAI API keys: legacy (sk-XXXX) と hyphenated (sk-proj-, sk-svcacct- 等)
      // 例: sk-proj-abcdefghij1234567890ABCDEFGHIJ
      .replace(
        /sk-(?:[a-zA-Z0-9]+-){0,3}[a-zA-Z0-9]{20,}/g,
        '[REDACTED:API_KEY]'
      )
      // Gemini API keys (pattern: AIza...)
      .replace(/AIza[a-zA-Z0-9_\-]{35}/g, '[REDACTED:GEMINI_KEY]')
      // Bearer tokens (including JWT with dots and padding)
      .replace(/Bearer\s+[a-zA-Z0-9_.\-=]+/gi, 'Bearer [REDACTED]')
  );
}

/**
 * Sanitize error objects to remove sensitive information.
 * Handles API keys that may appear in error messages (not covered by redact).
 */
export function sanitizeError(error: unknown): unknown {
  if (error instanceof Error) {
    const sanitizedMessage = sanitizeErrorMessage(error.message);
    const sanitizedStack = error.stack
      ? sanitizeErrorMessage(error.stack)
      : undefined;

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
