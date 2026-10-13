import pino from 'pino';
import crypto from 'crypto';
import { trace, isSpanContextValid } from '@opentelemetry/api';
import {
  sanitizeError as sanitizeErrorImpl,
  sanitizeErrorMessage as sanitizeErrorMessageImpl,
  summarizeError,
} from '@/lib/utils/sanitize-error';

// 後方互換のため既存 import path (`@/lib/logger`) からも公開する
export { sanitizeErrorImpl as sanitizeError };
export { sanitizeErrorMessageImpl as sanitizeErrorMessage };

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

/**
 * LOG_ERROR_DETAILS=false のときに、例外の message を出さない serializer。定期実行のログは公開リポジトリの
 * GitHub Actions に残り、DB に繋がらないときの message には接続先が入るため（lib/config/env.ts を参照）。
 * 例外は種類とコードだけにし、文字列で渡された message（errorMessage など）は中身を出さない。
 * env を import すると循環するので process.env を読む
 */
// lib/config/env.ts の booleanEnum と同じく、前後の空白と大文字小文字を無視する
function omitsErrorDetails(logErrorDetails: string | undefined): boolean {
  return logErrorDetails?.trim().toLowerCase() === 'false';
}

export function createErrorSerializers(
  logErrorDetails: string | undefined = process.env.LOG_ERROR_DETAILS
): Record<string, (value: unknown) => unknown> {
  if (!omitsErrorDetails(logErrorDetails)) {
    return { err: (err: unknown) => sanitizeErrorImpl(err) };
  }
  const omitMessage = (value: unknown) =>
    typeof value === 'string' ? '[omitted]' : summarizeError(value);
  return {
    err: (err: unknown) => summarizeError(err),
    error: omitMessage,
    errorMessage: omitMessage,
  };
}

/**
 * LOG_ERROR_DETAILS=false のときに、本文（msg）の無い呼び出しへ例外の要約を本文として補う hook。
 * pino は本文が無いと、logger.error(error) や logger.error({ err }) の例外の message を msg に写す
 * （serializer より前に行うので、serializer だけでは message が残る）
 */
export function createErrorLogHooks(
  logErrorDetails: string | undefined = process.env.LOG_ERROR_DETAILS
): pino.LoggerOptions['hooks'] {
  if (!omitsErrorDetails(logErrorDetails)) return undefined;
  return {
    logMethod(args, method) {
      const [first, second] = args as unknown[];
      if (typeof second !== 'string') {
        if (first instanceof Error) {
          return method.apply(this, [first, summarizeError(first)]);
        }
        if (
          first !== null &&
          typeof first === 'object' &&
          (first as Record<string, unknown>).err !== undefined &&
          (first as Record<string, unknown>).msg === undefined
        ) {
          return method.apply(this, [
            first,
            summarizeError((first as Record<string, unknown>).err),
          ]);
        }
      }
      return method.apply(this, args);
    },
  };
}

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
 * key を、トップレベルから maxDepth 段下までのどこにあっても伏せる redact の指定にする。
 * pino（fast-redact）は `**`（任意の深さ）に対応しておらず、`**.email` は何にも当たらない。
 * `*` は1段ぶんにしか当たらないので、深さごとに並べる（例: `email`、`*.email`、`*.*.email`…）
 */
function atAnyDepth(key: string, maxDepth = 4): string[] {
  return Array.from({ length: maxDepth + 1 }, (_, depth) =>
    [...Array<string>(depth).fill('*'), key].join('.')
  );
}

/** redact のパスの段数（`a.*.b` なら3） */
function pathDepth(path: string): number {
  return path.split('.').length;
}

/**
 * Paths to redact in log output
 * Uses Pino's redact feature for structured data
 *
 * @pinojs/redact は、ログに渡したオブジェクトを複製するとき、キーごとに固有のパスと `*` の
 * どちらか一方しか辿らない（pinojs/redact#36）。辿らなかった側の入れ子は元のオブジェクトと
 * 共有されたまま伏せられ、呼び出し元のオブジェクトが書き換わる。これを避けるため、
 * - 先頭と末尾の間に固有のキーを置かない（`session.user.email` のような指定は `*.*.email` で足りる）
 * - 浅いパスから順に伏せる。値がオブジェクトの `credentials` などが先に複製側で伏せ字に置き換わり、
 *   深いパス（`*.*.password` など）が共有された入れ子に届かなくなる。パスは並び順に処理される
 */
export const REDACT_PATHS = [
  // Email addresses
  ...atAnyDepth('email'),
  // 問い合わせの返信先（lib/inquiries）
  'contactEmail',
  '*.contactEmail',

  // IP addresses
  ...atAnyDepth('clientIp'),
  ...atAnyDepth('ip'),
  'x-forwarded-for',
  'x-real-ip',

  // Authentication
  ...atAnyDepth('password'),
  ...atAnyDepth('token'),
  ...atAnyDepth('secret'),
  ...atAnyDepth('apiKey'),
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
].sort((a, b) => pathDepth(a) - pathDepth(b));

const errorLogHooks = createErrorLogHooks();

const logger = pino({
  // hooks: undefined を渡すと pino の既定の hooks が消えるので、要るときだけ付ける
  ...(errorLogHooks ? { hooks: errorLogHooks } : {}),
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
    ...createErrorSerializers(),
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
