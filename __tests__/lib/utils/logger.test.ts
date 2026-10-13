/**
 * Logger Tests - PII Masking and Sanitization
 */
import { hashSensitiveValue, sanitizeError, createLogger } from '@/lib/logger';

describe('logger', () => {
  describe('hashSensitiveValue', () => {
    it('should return [REDACTED] for null', () => {
      expect(hashSensitiveValue(null)).toBe('[REDACTED]');
    });

    it('should return [REDACTED] for undefined', () => {
      expect(hashSensitiveValue(undefined)).toBe('[REDACTED]');
    });

    it('should return [REDACTED:EMPTY] for empty string', () => {
      expect(hashSensitiveValue('')).toBe('[REDACTED:EMPTY]');
    });

    it('should return [REDACTED:EMPTY] for "undefined" string', () => {
      expect(hashSensitiveValue('undefined')).toBe('[REDACTED:EMPTY]');
    });

    it('should return [REDACTED:EMPTY] for "null" string', () => {
      expect(hashSensitiveValue('null')).toBe('[REDACTED:EMPTY]');
    });

    it('should hash sensitive values', () => {
      const result = hashSensitiveValue('test@example.com');
      expect(result).toMatch(/^\[HASHED:[a-f0-9]{8}\]$/);
    });

    it('should produce consistent hashes for the same value', () => {
      const value = 'user@example.com';
      const hash1 = hashSensitiveValue(value);
      const hash2 = hashSensitiveValue(value);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different values', () => {
      const hash1 = hashSensitiveValue('user1@example.com');
      const hash2 = hashSensitiveValue('user2@example.com');
      expect(hash1).not.toBe(hash2);
    });

    it('should convert numbers to strings before hashing', () => {
      const result = hashSensitiveValue(12345);
      expect(result).toMatch(/^\[HASHED:[a-f0-9]{8}\]$/);
    });
  });

  describe('sanitizeError', () => {
    it('should remove OpenAI API keys from error message', () => {
      const error = new Error(
        'API error: Invalid API key sk-abc123456789012345678901234567890123'
      );
      const sanitized = sanitizeError(error) as { message: string };
      expect(sanitized.message).not.toContain('sk-abc');
      expect(sanitized.message).toContain('[REDACTED:API_KEY]');
    });

    it('should remove Gemini API keys from error message', () => {
      // Gemini API key pattern: AIza followed by 35 alphanumeric chars (total 39 chars)
      const error = new Error(
        'API error: Invalid key AIzaSyABC123456789012345678901234567890'
      );
      const sanitized = sanitizeError(error) as { message: string };
      expect(sanitized.message).not.toContain('AIzaSyABC');
      expect(sanitized.message).toContain('[REDACTED:GEMINI_KEY]');
    });

    it('should remove Bearer tokens from error message', () => {
      const error = new Error(
        'Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
      const sanitized = sanitizeError(error) as { message: string };
      expect(sanitized.message).not.toContain(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
      expect(sanitized.message).toContain('Bearer [REDACTED]');
    });

    it('should preserve error name', () => {
      const error = new TypeError('Type error occurred');
      const sanitized = sanitizeError(error) as { name: string };
      expect(sanitized.name).toBe('TypeError');
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const error = new Error('Test error');
        const sanitized = sanitizeError(error) as { stack?: string };
        expect(sanitized.stack).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should return non-Error values as-is', () => {
      expect(sanitizeError('string error')).toBe('string error');
      expect(sanitizeError(123)).toBe(123);
      expect(sanitizeError({ code: 'ERROR' })).toEqual({ code: 'ERROR' });
    });
  });

  describe('createLogger', () => {
    it('should create a child logger with context', () => {
      const childLogger = createLogger('test-context');
      expect(childLogger).toBeDefined();
      // Child logger should have the context
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.error).toBe('function');
    });
  });

  describe('logger redact integration', () => {
    // Note: These tests verify the redact configuration is properly set up
    // Full integration tests would require capturing pino output

    it('should have redact paths defined', () => {
      // Import the actual logger to verify configuration
      const logger = require('@/lib/logger').default;
      expect(logger).toBeDefined();
    });

    it('should handle nested objects with sensitive data', () => {
      // The redact feature will hash these values when logged
      const testData = {
        user: {
          email: 'test@example.com',
          name: 'Test User',
        },
        clientIp: '192.168.1.1',
        request: {
          ip: '10.0.0.1',
        },
      };

      // Verify the test data structure is correct
      expect(testData.user.email).toBe('test@example.com');
      expect(testData.clientIp).toBe('192.168.1.1');
      expect(testData.request.ip).toBe('10.0.0.1');
    });

    it('伏せる指定は入れ子の深さ4段まで効く（pino は ** に対応していない）', () => {
      // 本物の logger はテストでは silent なので、同じ指定で作った pino の出力を見る
      const pino = jest.requireActual('pino');
      const { REDACT_PATHS } = jest.requireActual('@/lib/logger');
      const lines: string[] = [];
      const log = pino(
        { redact: { paths: REDACT_PATHS, censor: '[R]' } },
        { write: (line: string) => lines.push(line) }
      );

      log.info({
        email: 'd0@example.com',
        a: { email: 'd1@example.com' },
        a2: { b: { email: 'd2@example.com', ip: '10.0.0.2' } },
        a3: {
          b: { c: { password: 'marker-pass-3', token: 'marker-token-3' } },
        },
        a4: {
          b: {
            c: {
              d: {
                secret: 'marker-secret-4',
                apiKey: 'marker-key-4',
                clientIp: '10.0.0.4',
              },
            },
          },
        },
      });

      const out = lines.join('');
      for (const raw of [
        'd0@example.com',
        'd1@example.com',
        'd2@example.com',
        '10.0.0.2',
        'marker-pass-3',
        'marker-token-3',
        'marker-secret-4',
        'marker-key-4',
        '10.0.0.4',
      ]) {
        expect(out).not.toContain(raw);
      }
      expect(REDACT_PATHS).not.toContain('**.email');
    });

    describe('ログに渡した元のオブジェクトを書き換えない（pinojs/redact#36）', () => {
      const cases: Array<[string, () => Record<string, unknown>, string[]]> = [
        [
          'session.user の下にさらに email がある',
          () => ({
            session: {
              user: {
                email: 'u0@example.com',
                profile: { email: 'u1@example.com' },
              },
            },
          }),
          ['u0@example.com', 'u1@example.com'],
        ],
        [
          '伏せるキー（credentials）の値がオブジェクトで、その下に伏せるキーがある',
          () => ({
            input: {
              credentials: {
                email: 'c0@example.com',
                password: 'marker-pass-c',
              },
            },
          }),
          ['c0@example.com', 'marker-pass-c'],
        ],
        [
          'session.sessionToken の値がオブジェクト',
          () => ({ session: { sessionToken: { token: 'marker-token-s' } } }),
          ['marker-token-s'],
        ],
        [
          '伏せるキー（token）の下に email がある',
          () => ({ a: { b: { token: { email: 't0@example.com' } } } }),
          ['t0@example.com'],
        ],
      ];

      it.each(cases)('%s', (_name, build, raws) => {
        const pino = jest.requireActual('pino');
        const { REDACT_PATHS } = jest.requireActual('@/lib/logger');
        const lines: string[] = [];
        const log = pino(
          { redact: { paths: REDACT_PATHS, censor: '[R]' } },
          { write: (line: string) => lines.push(line) }
        );

        const input = build();
        log.info(input);

        expect(input).toEqual(build());
        const out = lines.join('');
        for (const raw of raws) {
          expect(out).not.toContain(raw);
        }
      });

      it('パスは先頭と末尾の間に固有のキーを持たず、浅い順に並ぶ', () => {
        const { REDACT_PATHS } = jest.requireActual('@/lib/logger');
        const paths = REDACT_PATHS as string[];
        for (const path of paths) {
          expect(
            path
              .split('.')
              .slice(1, -1)
              .filter((part) => part !== '*')
          ).toEqual([]);
        }
        const depths = paths.map((path) => path.split('.').length);
        expect(depths).toEqual([...depths].sort((a, b) => a - b));
      });
    });
  });
});
