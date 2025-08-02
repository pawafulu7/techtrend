/**
 * アプリケーション全体で使用するエラークラス
 */

/**
 * アプリケーションエラーの基底クラス
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Errorクラスを継承する際の対応
    Object.setPrototypeOf(this, AppError.prototype);
    
    // スタックトレースからコンストラクタを除外
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly details?: Record<string, any>;

  constructor(message: string, field?: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
    this.details = details;
    
    // Errorクラスを継承する際の対応
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * 認証エラー
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * 認可エラー
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * リソースが見つからないエラー
 */
export class NotFoundError extends AppError {
  public readonly resource: string;

  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.resource = resource;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 重複エラー
 */
export class DuplicateError extends AppError {
  public readonly resource: string;
  public readonly field: string;

  constructor(resource: string, field: string, value?: string) {
    const message = value
      ? `${resource} with ${field} '${value}' already exists`
      : `${resource} already exists`;
    super(message, 'DUPLICATE_ERROR', 409);
    this.resource = resource;
    this.field = field;
    Object.setPrototypeOf(this, DuplicateError.prototype);
  }
}

/**
 * レート制限エラー
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * 外部APIエラー
 */
export class ExternalAPIError extends AppError {
  public readonly service: string;
  public readonly originalError?: any;

  constructor(service: string, message: string, originalError?: any) {
    super(`${service} API error: ${message}`, 'EXTERNAL_API_ERROR', 502);
    this.service = service;
    this.originalError = originalError;
    Object.setPrototypeOf(this, ExternalAPIError.prototype);
  }
}

/**
 * データベースエラー
 */
export class DatabaseError extends AppError {
  public readonly operation?: string;

  constructor(message: string, operation?: string) {
    super(message, 'DATABASE_ERROR', 500);
    this.operation = operation;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * ビジネスロジックエラー
 */
export class BusinessLogicError extends AppError {
  constructor(message: string, code: string = 'BUSINESS_LOGIC_ERROR') {
    super(message, code, 400);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

/**
 * エラーハンドリングユーティリティ
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: any): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

/**
 * エラーレスポンスの形式
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
    details?: any;
  };
}

/**
 * エラーをレスポンス形式に変換
 */
export function formatErrorResponse(error: Error | AppError): ErrorResponse {
  if (isAppError(error)) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        field: (error as ValidationError).field,
        details: (error as ValidationError).details,
      },
    };
  }

  // 通常のエラーの場合
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
    },
  };
}