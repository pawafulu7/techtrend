import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

// ログレベル定義
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// ロガー設定インターフェース
export interface LoggerConfig {
  level: LogLevel;
  isDevelopment: boolean;
  timestamp: boolean;
}

// 環境変数からログレベルを取得
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LogLevel) {
    return LogLevel[envLevel as keyof typeof LogLevel] as unknown as LogLevel;
  }
  return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
}

// ロガー設定
const config: LoggerConfig = {
  level: getLogLevelFromEnv(),
  isDevelopment: process.env.NODE_ENV !== 'production',
  timestamp: true
};

// ログ出力の判定
function shouldLog(level: LogLevel): boolean {
  return level >= config.level;
}

// タイムスタンプの取得
function getTimestamp(): string {
  return config.timestamp ? `[${format(new Date(), 'HH:mm:ss', { locale: ja })}] ` : '';
}

export const logger = {
  info: (msg: string) => {
    if (shouldLog(LogLevel.INFO)) {
      const timestamp = getTimestamp();
      console.error(`${timestamp}ℹ️  ${msg}`);
    }
  },
  
  success: (msg: string) => {
    if (shouldLog(LogLevel.INFO)) {
      const timestamp = getTimestamp();
      console.error(`${timestamp}✅ ${msg}`);
    }
  },
  
  error: (msg: string, error?: unknown) => {
    if (shouldLog(LogLevel.ERROR)) {
      const timestamp = getTimestamp();
      console.error(`${timestamp}❌ ${msg}`);
      if (error instanceof Error) {
        console.error(`${timestamp}   ${error.message}`);
        if (config.isDevelopment && error.stack) {
          console.error(`${timestamp}   Stack: ${error.stack}`);
        }
      }
    }
  },
  
  warn: (msg: string) => {
    if (shouldLog(LogLevel.WARN)) {
      const timestamp = getTimestamp();
      console.warn(`${timestamp}⚠️  ${msg}`);
    }
  },
  
  debug: (msg: string) => {
    if (shouldLog(LogLevel.DEBUG)) {
      const timestamp = getTimestamp();
      console.error(`${timestamp}🐛 ${msg}`);
    }
  },

  // 設定の確認用メソッド
  getConfig: (): Readonly<LoggerConfig> => {
    return { ...config };
  },

  // ログレベルの動的変更（テスト用）
  setLevel: (level: LogLevel) => {
    config.level = level;
  }
};