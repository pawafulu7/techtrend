import { Logger } from 'pino';

export interface LogContext {
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export type ContextLogger = Logger;

export interface LoggerConfig {
  level?: string;
  prettify?: boolean;
  context?: string;
}