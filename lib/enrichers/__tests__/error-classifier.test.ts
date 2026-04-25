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
});
