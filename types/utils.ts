// ユーティリティ型定義

// 部分的に必須にする型
export type PartialRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// 部分的にオプショナルにする型
export type PartialOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Nullableな型
export type Nullable<T> = T | null;

// Promiseから型を抽出
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// 配列から型を抽出
export type UnwrapArray<T> = T extends Array<infer U> ? U : T;

// オブジェクトのキーを文字列リテラル型として取得
export type StringKeys<T> = Extract<keyof T, string>;

// 深いPartial型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 深いReadonly型
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// 日付範囲
export interface DateRange {
  start: Date;
  end: Date;
}

// 数値範囲
export interface NumberRange {
  min: number;
  max: number;
}

// ソート設定
export interface SortConfig<T = string> {
  field: T;
  order: 'asc' | 'desc';
}

// ページネーション設定
export interface PaginationConfig {
  page: number;
  limit: number;
  total?: number;
  totalPages?: number;
}

// エラー詳細
export interface ErrorDetail {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

// 成功/失敗の結果型
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// 非同期関数の結果型
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// タイムスタンプ付きデータ
export interface Timestamped<T> {
  data: T;
  timestamp: Date;
  ttl?: number;
}

// キャッシュエントリ
export interface CacheEntry<T> {
  key: string;
  value: T;
  expires: Date;
}

// イベントハンドラー型
export type EventHandler<T = void> = (event: T) => void;
export type AsyncEventHandler<T = void> = (event: T) => Promise<void>;

// バリデーション結果
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}