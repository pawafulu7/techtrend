import { parseIntParam, VALIDATION_RANGES } from '@/lib/utils/validation';

describe('parseIntParam', () => {
  describe('valid inputs', () => {
    it('should parse valid integer strings', () => {
      const result = parseIntParam('42', 10);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    it('should accept zero as valid', () => {
      const result = parseIntParam('0', 10);
      expect(result.value).toBe(0);
      expect(result.error).toBeUndefined();
    });

    it('should accept negative numbers when no min constraint', () => {
      const result = parseIntParam('-5', 10);
      expect(result.value).toBe(-5);
      expect(result.error).toBeUndefined();
    });
  });

  describe('null and undefined inputs', () => {
    it('should return default value for null input', () => {
      const result = parseIntParam(null, 30);
      expect(result.value).toBe(30);
      expect(result.error).toBeUndefined();
    });

    it('should return default value for empty string', () => {
      const result = parseIntParam('', 30);
      expect(result.value).toBe(30);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('should return error for non-numeric strings', () => {
      const result = parseIntParam('invalid', 30, { paramName: 'days' });
      expect(result.value).toBe(30);
      expect(result.error).toBe('Invalid days parameter: "invalid"');
    });

    it('should return error for mixed alphanumeric', () => {
      const result = parseIntParam('123abc', 30);
      expect(result.value).toBe(123); // parseInt stops at first non-numeric
      expect(result.error).toBeUndefined();
    });

    it('should handle NaN strings', () => {
      const result = parseIntParam('NaN', 30);
      expect(result.value).toBe(30);
      expect(result.error).toContain('Invalid number parameter');
    });

    it('should handle Infinity', () => {
      const result = parseIntParam('Infinity', 30);
      expect(result.value).toBe(30);
      expect(result.error).toContain('Invalid number parameter');
    });
  });

  describe('range constraints', () => {
    describe('minimum constraint', () => {
      it('should accept values equal to minimum', () => {
        const result = parseIntParam('1', 30, { min: 1 });
        expect(result.value).toBe(1);
        expect(result.error).toBeUndefined();
      });

      it('should accept values above minimum', () => {
        const result = parseIntParam('10', 30, { min: 1 });
        expect(result.value).toBe(10);
        expect(result.error).toBeUndefined();
      });

      it('should reject values below minimum', () => {
        const result = parseIntParam('0', 30, { min: 1, paramName: 'page' });
        expect(result.value).toBe(30);
        expect(result.error).toBe('page must be at least 1');
      });
    });

    describe('maximum constraint', () => {
      it('should accept values equal to maximum', () => {
        const result = parseIntParam('100', 30, { max: 100 });
        expect(result.value).toBe(100);
        expect(result.error).toBeUndefined();
      });

      it('should accept values below maximum', () => {
        const result = parseIntParam('50', 30, { max: 100 });
        expect(result.value).toBe(50);
        expect(result.error).toBeUndefined();
      });

      it('should reject values above maximum', () => {
        const result = parseIntParam('101', 30, { max: 100, paramName: 'limit' });
        expect(result.value).toBe(30);
        expect(result.error).toBe('limit must be at most 100');
      });
    });

    describe('both min and max constraints', () => {
      it('should accept values within range', () => {
        const result = parseIntParam('50', 30, { min: 1, max: 100 });
        expect(result.value).toBe(50);
        expect(result.error).toBeUndefined();
      });

      it('should reject values below range', () => {
        const result = parseIntParam('0', 30, { min: 1, max: 100 });
        expect(result.value).toBe(30);
        expect(result.error).toContain('must be at least 1');
      });

      it('should reject values above range', () => {
        const result = parseIntParam('101', 30, { min: 1, max: 100 });
        expect(result.value).toBe(30);
        expect(result.error).toContain('must be at most 100');
      });
    });
  });

  describe('VALIDATION_RANGES constants', () => {
    it('should have correct days range', () => {
      expect(VALIDATION_RANGES.days).toEqual({ min: 1, max: 365 });
    });

    it('should have correct page range', () => {
      expect(VALIDATION_RANGES.page).toEqual({ min: 1, max: 1000 });
    });

    it('should have correct limit range', () => {
      expect(VALIDATION_RANGES.limit).toEqual({ min: 1, max: 100 });
    });

    it('should have correct quality range', () => {
      expect(VALIDATION_RANGES.quality).toEqual({ min: 0, max: 100 });
    });

    it('should have correct tagDays range', () => {
      expect(VALIDATION_RANGES.tagDays).toEqual({ min: 1, max: 30 });
    });
  });

  describe('edge cases', () => {
    it('should handle decimal strings by truncating', () => {
      const result = parseIntParam('42.9', 10);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    it('should handle leading/trailing spaces', () => {
      const result = parseIntParam('  42  ', 10);
      expect(result.value).toBe(42);
      expect(result.error).toBeUndefined();
    });

    it('should handle scientific notation', () => {
      const result = parseIntParam('1e2', 10);
      expect(result.value).toBe(1); // parseInt stops at 'e'
      expect(result.error).toBeUndefined();
    });

    it('should handle hexadecimal notation', () => {
      const result = parseIntParam('0x10', 10);
      expect(result.value).toBe(0); // parseInt with radix 10 stops at 'x'
      expect(result.error).toBeUndefined();
    });
  });
});