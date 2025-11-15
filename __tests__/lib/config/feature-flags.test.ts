import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

describe('feature-flags', () => {
  describe('FEATURE_FLAGS', () => {
    it('should have USE_DATABASE_PROVIDER flag', () => {
      expect(FEATURE_FLAGS).toHaveProperty('USE_DATABASE_PROVIDER');
      expect(typeof FEATURE_FLAGS.USE_DATABASE_PROVIDER).toBe('boolean');
    });

    it('should evaluate USE_DATABASE_PROVIDER from environment', () => {
      // Current environment should have the flag
      expect(FEATURE_FLAGS.USE_DATABASE_PROVIDER).toBeDefined();
    });
  });
});
