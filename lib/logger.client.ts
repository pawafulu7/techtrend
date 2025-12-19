/**
 * Browser-safe logger for client components
 *
 * This is a lightweight wrapper around console that provides
 * the same interface as the server-side pino logger.
 *
 * IMPORTANT: Do NOT import the main logger.ts in client components
 * as it includes Node.js dependencies (pino, crypto) that require
 * polyfills with eval() which violates CSP.
 */

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogFn {
  (obj: object, msg?: string): void;
  (msg: string): void;
}

interface Logger {
  trace: LogFn;
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child: (bindings: object) => Logger;
}

const isProduction = process.env.NODE_ENV === 'production';

// In production, only log warn and above to reduce noise
const minLevel: LogLevel = isProduction ? 'warn' : 'debug';

const levelOrder: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[minLevel];
}

function formatMessage(
  level: LogLevel,
  context: string | undefined,
  args: [object | string, string?]
): [string, ...unknown[]] {
  const timestamp = new Date().toISOString();
  const prefix = context ? `[${context}]` : '';
  const levelStr = level.toUpperCase().padEnd(5);

  if (typeof args[0] === 'string') {
    return [`${timestamp} ${levelStr} ${prefix} ${args[0]}`];
  }

  const [obj, msg] = args;
  if (msg) {
    return [`${timestamp} ${levelStr} ${prefix} ${msg}`, obj];
  }
  return [`${timestamp} ${levelStr} ${prefix}`, obj];
}

function createLogFn(
  level: LogLevel,
  consoleFn: (...args: unknown[]) => void,
  context?: string
): LogFn {
  return (...args: [object | string, string?]) => {
    if (!shouldLog(level)) return;

    const formatted = formatMessage(level, context, args);
    consoleFn(...formatted);
  };
}

function createLogger(context?: string): Logger {
  return {
    trace: createLogFn('trace', console.debug, context),
    debug: createLogFn('debug', console.debug, context),
    info: createLogFn('info', console.info, context),
    warn: createLogFn('warn', console.warn, context),
    error: createLogFn('error', console.error, context),
    fatal: createLogFn('fatal', console.error, context),
    child: (bindings: object) => {
      const childContext = bindings && 'context' in bindings
        ? String(bindings.context)
        : context;
      return createLogger(childContext);
    },
  };
}

const logger = createLogger();

export { logger, createLogger };
export default logger;
