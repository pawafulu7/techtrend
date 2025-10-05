import {
  createDynamicSelect,
  createDateRange,
  safeGet,
  toApiError,
  isApiError,
} from '../prisma-helpers';

describe('Prisma Helpers', () => {
  describe('createDynamicSelect', () => {
    test('should create select object from field array', () => {
      const fields = ['id', 'title', 'content'] as const;
      const select = createDynamicSelect(fields);

      expect(select).toEqual({
        id: true,
        title: true,
        content: true,
      });
    });

    test('should handle empty array', () => {
      const select = createDynamicSelect([]);
      expect(select).toEqual({});
    });

    test('should handle single field', () => {
      const select = createDynamicSelect(['id'] as const);
      expect(select).toEqual({ id: true });
    });
  });

  describe('createDateRange', () => {
    test('should create range with both dates', () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');
      const range = createDateRange(from, to);

      expect(range).toEqual({
        gte: from,
        lte: to,
      });
    });

    test('should create range with from only', () => {
      const from = new Date('2025-01-01');
      const range = createDateRange(from, undefined);

      expect(range).toEqual({
        gte: from,
      });
    });

    test('should create range with to only', () => {
      const to = new Date('2025-12-31');
      const range = createDateRange(undefined, to);

      expect(range).toEqual({
        lte: to,
      });
    });

    test('should return undefined when both dates are missing', () => {
      const range = createDateRange(undefined, undefined);
      expect(range).toBeUndefined();
    });
  });

  describe('safeGet', () => {
    test('should get property from valid object', () => {
      const obj = { id: 1, name: 'Test' };
      expect(safeGet(obj, 'id')).toBe(1);
      expect(safeGet(obj, 'name')).toBe('Test');
    });

    test('should return undefined for null object', () => {
      expect(safeGet(null, 'id')).toBeUndefined();
    });

    test('should return undefined for undefined object', () => {
      expect(safeGet(undefined, 'id')).toBeUndefined();
    });

    test('should handle nested objects', () => {
      const obj = { user: { name: 'Alice' } };
      expect(safeGet(obj, 'user')).toEqual({ name: 'Alice' });
    });
  });

  describe('isApiError', () => {
    test('should reject plain Error without ApiError properties', () => {
      const error = new Error('Test error');
      expect(isApiError(error)).toBe(false);
    });

    test('should identify ApiError with required properties', () => {
      const error = Object.assign(new Error('API Error'), {
        code: 'TEST_ERROR',
        statusCode: 400,
      });
      expect(isApiError(error)).toBe(true);
    });

    test('should reject Error with only code property', () => {
      const error = Object.assign(new Error('Partial Error'), {
        code: 'TEST_ERROR',
      });
      expect(isApiError(error)).toBe(false);
    });

    test('should reject Error with only statusCode property', () => {
      const error = Object.assign(new Error('Partial Error'), {
        statusCode: 400,
      });
      expect(isApiError(error)).toBe(false);
    });

    test('should reject non-Error objects', () => {
      expect(isApiError({ message: 'Not an error' })).toBe(false);
      expect(isApiError('string')).toBe(false);
      expect(isApiError(null)).toBe(false);
      expect(isApiError(undefined)).toBe(false);
    });
  });

  describe('toApiError', () => {
    test('should convert Error to ApiError', () => {
      const error = new Error('Test error');
      const apiError = toApiError(error);

      expect(apiError.message).toBe('Test error');
      expect(apiError.code).toBe('UNKNOWN_ERROR');
      expect(apiError.statusCode).toBe(500);
    });

    test('should pass through existing ApiError', () => {
      const error = Object.assign(new Error('API Error'), {
        code: 'CUSTOM_ERROR',
        statusCode: 400,
      });

      const apiError = toApiError(error);
      expect(apiError.code).toBe('CUSTOM_ERROR');
      expect(apiError.statusCode).toBe(400);
    });

    test('should convert non-Error to ApiError', () => {
      const error = 'String error';
      const apiError = toApiError(error);

      expect(apiError.message).toBe('An error occurred');
      expect(apiError.code).toBe('UNKNOWN_ERROR');
      expect(apiError.statusCode).toBe(500);
      expect(apiError.details).toBe('String error');
    });

    test('should use custom default message', () => {
      const error = { some: 'object' };
      const apiError = toApiError(error, 'Custom error message');

      expect(apiError.message).toBe('Custom error message');
      expect(apiError.details).toEqual({ some: 'object' });
    });

    test('should handle null and undefined', () => {
      const nullError = toApiError(null);
      expect(nullError.message).toBe('An error occurred');
      expect(nullError.details).toBeNull();

      const undefinedError = toApiError(undefined);
      expect(undefinedError.message).toBe('An error occurred');
      expect(undefinedError.details).toBeUndefined();
    });
  });
});
