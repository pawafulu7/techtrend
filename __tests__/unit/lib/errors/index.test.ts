import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DuplicateError,
  RateLimitError,
  ExternalAPIError,
  DatabaseError,
  BusinessLogicError,
  isAppError,
  isOperationalError,
  formatErrorResponse,
} from '@/lib/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('基本的なエラーを作成できる', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 500);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('デフォルト値が設定される', () => {
      const error = new AppError('Test error', 'TEST_ERROR');

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('スタックトレースが含まれる', () => {
      const error = new AppError('Test error', 'TEST_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test error');
    });
  });

  describe('ValidationError', () => {
    it('フィールド情報付きのバリデーションエラーを作成できる', () => {
      const error = new ValidationError('Invalid email', 'email', {
        format: 'email',
      });

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid email');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('email');
      expect(error.details).toEqual({ format: 'email' });
    });

    it('フィールド情報なしでも作成できる', () => {
      const error = new ValidationError('Validation failed');

      expect(error.field).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe('AuthenticationError', () => {
    it('認証エラーを作成できる', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('カスタムメッセージを設定できる', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
    });
  });

  describe('AuthorizationError', () => {
    it('認可エラーを作成できる', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Access denied');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('NotFoundError', () => {
    it('IDなしのNotFoundエラーを作成できる', () => {
      const error = new NotFoundError('Article');

      expect(error.message).toBe('Article not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.resource).toBe('Article');
    });

    it('ID付きのNotFoundエラーを作成できる', () => {
      const error = new NotFoundError('Article', '123');

      expect(error.message).toBe("Article with id '123' not found");
    });
  });

  describe('DuplicateError', () => {
    it('値なしの重複エラーを作成できる', () => {
      const error = new DuplicateError('User', 'email');

      expect(error.message).toBe('User already exists');
      expect(error.code).toBe('DUPLICATE_ERROR');
      expect(error.statusCode).toBe(409);
      expect(error.resource).toBe('User');
      expect(error.field).toBe('email');
    });

    it('値付きの重複エラーを作成できる', () => {
      const error = new DuplicateError('User', 'email', 'test@example.com');

      expect(error.message).toBe(
        "User with email 'test@example.com' already exists"
      );
    });
  });

  describe('RateLimitError', () => {
    it('レート制限エラーを作成できる', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.statusCode).toBe(429);
    });

    it('retryAfter情報を含むエラーを作成できる', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('ExternalAPIError', () => {
    it('外部APIエラーを作成できる', () => {
      const originalError = new Error('Connection timeout');
      const error = new ExternalAPIError(
        'GitHub',
        'Failed to fetch data',
        originalError
      );

      expect(error.message).toBe('GitHub API error: Failed to fetch data');
      expect(error.code).toBe('EXTERNAL_API_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.service).toBe('GitHub');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('DatabaseError', () => {
    it('データベースエラーを作成できる', () => {
      const error = new DatabaseError('Connection failed', 'connect');

      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.operation).toBe('connect');
    });
  });

  describe('BusinessLogicError', () => {
    it('ビジネスロジックエラーを作成できる', () => {
      const error = new BusinessLogicError('Insufficient balance');

      expect(error.message).toBe('Insufficient balance');
      expect(error.code).toBe('BUSINESS_LOGIC_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('カスタムコードを設定できる', () => {
      const error = new BusinessLogicError(
        'Insufficient balance',
        'INSUFFICIENT_FUNDS'
      );

      expect(error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('Utility Functions', () => {
    describe('isAppError', () => {
      it('AppErrorインスタンスを判定できる', () => {
        expect(isAppError(new AppError('test', 'TEST'))).toBe(true);
        expect(isAppError(new ValidationError('test'))).toBe(true);
        expect(isAppError(new Error('test'))).toBe(false);
        expect(isAppError('not an error')).toBe(false);
        expect(isAppError(null)).toBe(false);
      });
    });

    describe('isOperationalError', () => {
      it('運用エラーを判定できる', () => {
        expect(isOperationalError(new AppError('test', 'TEST'))).toBe(true);
        expect(
          isOperationalError(new AppError('test', 'TEST', 500, false))
        ).toBe(false);
        expect(isOperationalError(new Error('test'))).toBe(false);
      });
    });

    describe('formatErrorResponse', () => {
      it('AppErrorをレスポンス形式に変換できる', () => {
        const error = new ValidationError('Invalid email', 'email', {
          format: 'email',
        });
        const response = formatErrorResponse(error);

        expect(response).toEqual({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email',
            field: 'email',
            details: { format: 'email' },
          },
        });
      });

      it('通常のErrorをレスポンス形式に変換できる（開発環境）', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const error = new Error('Something went wrong');
        const response = formatErrorResponse(error);

        expect(response).toEqual({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong',
          },
        });

        process.env.NODE_ENV = originalEnv;
      });

      it('通常のErrorをレスポンス形式に変換できる（本番環境）', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const error = new Error('Something went wrong');
        const response = formatErrorResponse(error);

        expect(response).toEqual({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
          },
        });

        process.env.NODE_ENV = originalEnv;
      });

      // issue #687: 5xx の AppError の文言（DB・上流 API のエラー文）を本番では返さない
      describe('本番環境の 5xx の AppError', () => {
        const originalEnv = process.env.NODE_ENV;

        beforeEach(() => {
          process.env.NODE_ENV = 'production';
        });

        afterEach(() => {
          process.env.NODE_ENV = originalEnv;
        });

        it('DatabaseError の文言を固定文言に置き換え、code は残す', () => {
          const error = new DatabaseError(
            'Failed to fetch articles: 符号化方式"UTF8"に対する不正なバイト列です: 0x00',
            'select'
          );

          expect(formatErrorResponse(error)).toEqual({
            success: false,
            error: {
              code: 'DATABASE_ERROR',
              message: 'An unexpected error occurred',
            },
          });
        });

        it('上流のエラー文を含む ExternalAPIError（502）の文言も返さない', () => {
          const error = new ExternalAPIError(
            'Gemini',
            'upstream said: quota for key xyz'
          );

          const response = formatErrorResponse(error);

          expect(response.error.code).toBe('EXTERNAL_API_ERROR');
          expect(response.error.message).toBe('An unexpected error occurred');
        });

        it('5xx では field と details も返さない', () => {
          const error = new AppError('internal', 'SOME_ERROR', 500);
          Object.assign(error, {
            field: 'query',
            details: { sql: 'SELECT 1' },
          });

          const response = formatErrorResponse(error);

          expect(response.error).toEqual({
            code: 'SOME_ERROR',
            message: 'An unexpected error occurred',
          });
        });

        it('4xx の AppError の文言・field・details はそのまま返す', () => {
          const error = new ValidationError('Invalid email', 'email', {
            reason: 'format',
          });

          expect(formatErrorResponse(error)).toEqual({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid email',
              field: 'email',
              details: { reason: 'format' },
            },
          });
        });
      });

      it('本番以外では 5xx の AppError の文言を返す（開発時の調査用）', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        try {
          const error = new DatabaseError('Connection failed', 'connect');

          expect(formatErrorResponse(error).error.message).toBe(
            'Connection failed'
          );
        } finally {
          process.env.NODE_ENV = originalEnv;
        }
      });
    });
  });
});
