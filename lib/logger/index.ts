import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevel = process.env.LOG_LEVEL || 'info';

// Create winston logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'techtrend' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      silent: process.env.NODE_ENV === 'test'
    }),
    // File transport for production
    ...(process.env.NODE_ENV === 'production' ? [
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '14d'
      }),
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '7d'
      })
    ] : [])
  ]
});

// Compatibility layer with existing console.* calls
export const log = {
  error: (message: string, ...args: unknown[]) => {
    if (args.length > 0 && args[0] instanceof Error) {
      logger.error(message, { error: args[0].message, stack: args[0].stack });
    } else {
      logger.error(message, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]) => logger.warn(message, ...args),
  info: (message: string, ...args: unknown[]) => logger.info(message, ...args),
  debug: (message: string, ...args: unknown[]) => logger.debug(message, ...args),
};

// Export winston logger for advanced usage
export default logger;