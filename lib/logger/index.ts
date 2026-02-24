import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Internal pino logger instance
const pinoLogger = pino({
  level: isTest ? 'silent' : logLevel,

  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },

  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }),
});

/**
 * Wraps a pino log method to accept winston-style arguments:
 *   winston: logger.error('msg', error)  or  logger.warn('msg', { key: val })
 *   pino:    logger.error({ err: error }, 'msg')  or  logger.warn({ key: val }, 'msg')
 */
function winstonStyleLog(
  pinoMethod: (obj: Record<string, unknown>, msg: string) => void,
  pinoMethodStr: (msg: string) => void
) {
  return (message: string, ...args: unknown[]) => {
    if (args.length > 0 && args[0] instanceof Error) {
      pinoMethod({ err: args[0] }, message);
    } else if (
      args.length > 0 &&
      typeof args[0] === 'object' &&
      args[0] !== null
    ) {
      pinoMethod(args[0] as Record<string, unknown>, message);
    } else {
      pinoMethodStr(message);
    }
  };
}

/**
 * Winston-compatible logger interface backed by pino.
 * Accepts both winston-style (msg, obj) and plain (msg) calls.
 */
export const logger = {
  error: winstonStyleLog(
    pinoLogger.error.bind(pinoLogger),
    pinoLogger.error.bind(pinoLogger)
  ),
  warn: winstonStyleLog(
    pinoLogger.warn.bind(pinoLogger),
    pinoLogger.warn.bind(pinoLogger)
  ),
  info: winstonStyleLog(
    pinoLogger.info.bind(pinoLogger),
    pinoLogger.info.bind(pinoLogger)
  ),
  debug: winstonStyleLog(
    pinoLogger.debug.bind(pinoLogger),
    pinoLogger.debug.bind(pinoLogger)
  ),
};

// Compatibility layer with existing console.* calls (same as logger)
export const log = logger;

// Export logger for advanced usage
export default logger;
