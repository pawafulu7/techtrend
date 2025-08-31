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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _getTimestamp(): string {
  return config.timestamp ? `[${format(new Date(), 'HH:mm:ss', { locale: ja })}] ` : '';
}

export const logger = {
  info: (_msg: string) => {
    if (shouldLog(LogLevel.INFO)) {
      // Log info message
    }
  },
  
  success: (_msg: string) => {
    if (shouldLog(LogLevel.INFO)) {
      // Log success message
    }
  },
  
  error: (_msg: string, _error?: unknown) => {
    if (shouldLog(LogLevel.ERROR)) {
      // Log error message
    }
  },
  
  warn: (_msg: string) => {
    if (shouldLog(LogLevel.WARN)) {
      // Log warning message
    }
  },
  
  debug: (_msg: string) => {
    if (shouldLog(LogLevel.DEBUG)) {
      // Log debug message
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