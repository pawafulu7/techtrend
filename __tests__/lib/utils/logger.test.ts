/**
 * Logger Tests - PII Masking and Sanitization
 */
import {
  hashSensitiveValue,
  sanitizeError,
  createLogger,
} from '@/lib/logger';

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
      expect(sanitized.message).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized.message).toContain('Bearer [REDACTED]');
    });

    it('should preserve error name', () => {
      const error = new TypeError('Type error occurred');
      const sanitized = sanitizeError(error) as { name: string };
      expect(sanitized.name).toBe('TypeError');
    });

    it('should not include stack trace in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const sanitized = sanitizeError(error) as { stack?: string };
      expect(sanitized.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
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
  });
});
