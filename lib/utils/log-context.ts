import { AsyncLocalStorage } from 'async_hooks';
import { LogContext } from '../logger.types';

// AsyncLocalStorageを使用してリクエストスコープのコンテキストを管理
export const logContextStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return logContextStorage.getStore() || {};
}

export function setLogContext(context: LogContext): void {
  const currentContext = getLogContext();
  logContextStorage.enterWith({ ...currentContext, ...context });
}

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return logContextStorage.run(context, fn);
}