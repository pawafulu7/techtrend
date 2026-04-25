import { classifyEnrichmentError } from '../error-classifier';

describe('classifyEnrichmentError', () => {
  describe('HTTP status 分類（最優先）', () => {
    it('should classify HTTP 504 from message', () => {
      const result = classifyEnrichmentError(
        new Error('HTTP 504: Gateway Timeout')
      );
      expect(result.errorCode).toBe('HTTP_504');
      expect(result.status).toBe(504);
      expect(result.errorMessage).toBe('HTTP 504: Gateway Timeout');
    });

    it('should classify HTTP 404 from message', () => {
      const result = classifyEnrichmentError(new Error('HTTP 404: Not Found'));
      expect(result.errorCode).toBe('HTTP_404');
      expect(result.status).toBe(404);
    });

    it('should prioritize HTTP over TIMEOUT keyword', () => {
      // "HTTP 504: Gateway Timeout" は HTTP_504 として分類される
      // （TIMEOUT に吸わせない）
      const result = classifyEnrichmentError(
        new Error('HTTP 504: Gateway Timeout')
      );
      expect(result.errorCode).toBe('HTTP_504');
    });
  });

  describe('TIMEOUT 分類', () => {
    it('should classify TimeoutError by name', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      const result = classifyEnrichmentError(error);
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.status).toBeUndefined();
      expect(result.errorName).toBe('TimeoutError');
    });

    it('should classify by timeout keyword in message', () => {
      const result = classifyEnrichmentError(
        new Error('connection timeout occurred')
      );
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should classify undici HeadersTimeoutError as TIMEOUT', () => {
      const error = new Error('Headers timeout');
      error.name = 'HeadersTimeoutError';
      const result = classifyEnrichmentError(error);
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.errorName).toBe('HeadersTimeoutError');
    });

    it('should classify undici BodyTimeoutError as TIMEOUT', () => {
      const error = new Error('Body timeout');
      error.name = 'BodyTimeoutError';
      const result = classifyEnrichmentError(error);
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should classify undici ConnectTimeoutError as TIMEOUT', () => {
      const error = new Error('Connect timeout');
      error.name = 'ConnectTimeoutError';
      const result = classifyEnrichmentError(error);
      expect(result.errorCode).toBe('TIMEOUT');
    });

    it('should NOT classify substring "timeoutid" (no word boundary) as TIMEOUT', () => {
      // \btimeout\b は word boundary を要求するため "timeoutid" は match しない
      const result = classifyEnrichmentError(
        new Error('set timeoutid was cleared')
      );
      expect(result.errorCode).toBe('EXCEPTION');
    });
  });

  describe('ABORTED 分類', () => {
    it('should classify AbortError by name', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      const result = classifyEnrichmentError(error);
      expect(result.errorCode).toBe('ABORTED');
      expect(result.errorName).toBe('AbortError');
    });
  });

  describe('EXCEPTION 分類（フォールバック）', () => {
    it('should classify generic Error as EXCEPTION', () => {
      const result = classifyEnrichmentError(new Error('Something went wrong'));
      expect(result.errorCode).toBe('EXCEPTION');
      expect(result.status).toBeUndefined();
    });

    it('should handle non-Error string value', () => {
      const result = classifyEnrichmentError('plain string error');
      expect(result.errorCode).toBe('EXCEPTION');
      expect(result.errorName).toBe('');
      expect(result.errorMessage).toBe('plain string error');
    });

    it('should handle undefined', () => {
      const result = classifyEnrichmentError(undefined);
      expect(result.errorCode).toBe('EXCEPTION');
      expect(result.errorName).toBe('');
      expect(result.errorMessage).toBe('undefined');
    });

    it('should handle null', () => {
      const result = classifyEnrichmentError(null);
      expect(result.errorCode).toBe('EXCEPTION');
      expect(result.errorMessage).toBe('null');
    });
  });

  describe('errorName / errorMessage の保持', () => {
    it('should preserve original error name and message', () => {
      const error = new TypeError('Invalid type');
      const result = classifyEnrichmentError(error);
      expect(result.errorName).toBe('TypeError');
      expect(result.errorMessage).toBe('Invalid type');
      expect(result.errorCode).toBe('EXCEPTION');
    });
  });

  describe('機密情報のサニタイズ', () => {
    it('should redact OpenAI API key in errorMessage', () => {
      const result = classifyEnrichmentError(
        new Error('API key sk-abcdefghij1234567890ABCDEFGHIJ is invalid')
      );
      expect(result.errorMessage).not.toContain('sk-abcdef');
      expect(result.errorMessage).toContain('[REDACTED:API_KEY]');
    });

    it('should redact hyphenated OpenAI project key (sk-proj-)', () => {
      const result = classifyEnrichmentError(
        new Error('Auth failed for sk-proj-abcdefghij1234567890ABCDEFGHIJ')
      );
      expect(result.errorMessage).not.toContain('sk-proj-abc');
      expect(result.errorMessage).toContain('[REDACTED:API_KEY]');
    });

    it('should redact hyphenated OpenAI service-account key (sk-svcacct-)', () => {
      const result = classifyEnrichmentError(
        new Error('Auth failed for sk-svcacct-abcdefghij1234567890ABCDEFGHIJ')
      );
      expect(result.errorMessage).not.toContain('sk-svcacct-abc');
      expect(result.errorMessage).toContain('[REDACTED:API_KEY]');
    });

    it('should redact Gemini API key in errorMessage', () => {
      const result = classifyEnrichmentError(
        new Error('Auth failed for AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef')
      );
      expect(result.errorMessage).not.toContain('AIzaSyA');
      expect(result.errorMessage).toContain('[REDACTED:GEMINI_KEY]');
    });

    it('should redact Bearer token in errorMessage', () => {
      const result = classifyEnrichmentError(
        new Error('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig')
      );
      expect(result.errorMessage).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(result.errorMessage).toContain('Bearer [REDACTED]');
    });

    it('should preserve HTTP_<status> classification on sanitized message', () => {
      const result = classifyEnrichmentError(
        new Error(
          'HTTP 401: Unauthorized for sk-abcdefghij1234567890ABCDEFGHIJ'
        )
      );
      expect(result.errorCode).toBe('HTTP_401');
      expect(result.status).toBe(401);
      expect(result.errorMessage).toContain('[REDACTED:API_KEY]');
    });
  });
});
