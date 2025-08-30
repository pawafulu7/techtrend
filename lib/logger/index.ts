import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';

// Detect serverless (e.g., Vercel) where filesystem is read-only (except /tmp)
const isServerless = !!process.env.VERCEL;

// Build transports dynamically to avoid file I/O on serverless platforms
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    silent: process.env.NODE_ENV === 'test'
  })
];

if (process.env.NODE_ENV === 'production' && !isServerless) {
  // Local/server targets: write rotating files to ./logs
  const dir = path.resolve(process.cwd(), 'logs');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore directory creation errors; console transport remains
  }
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d'
    })
  );
}

// Create winston logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'techtrend' },
  transports
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
