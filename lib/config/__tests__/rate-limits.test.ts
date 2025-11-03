import {
  RATE_LIMIT_POLICIES,
  getRateLimitConfig,
  validateRateLimitConfigs,
  RateLimitConfigSchema,
} from '../rate-limits';

describe('Rate Limit Configuration', () => {
  describe('RATE_LIMIT_POLICIES', () => {
    it('should have auth policies', () => {
      expect(RATE_LIMIT_POLICIES['auth:register']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['auth:login']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['auth:verify']).toBeDefined();
    });

    it('should have AI policies', () => {
      expect(RATE_LIMIT_POLICIES['ai:summary']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['ai:tags']).toBeDefined();
    });

    it('should have RAG policies', () => {
      expect(RATE_LIMIT_POLICIES['rag:search']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['rag:agent']).toBeDefined();
    });

    it('should have write operation policies', () => {
      expect(RATE_LIMIT_POLICIES['write:favorite']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['write:profile']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['write:password']).toBeDefined();
    });

    it('should have read operation policies', () => {
      expect(RATE_LIMIT_POLICIES['read:articles']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['read:search']).toBeDefined();
    });

    it('should have public endpoint policies', () => {
      expect(RATE_LIMIT_POLICIES['public:stats']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['public:health']).toBeDefined();
    });

    it('should have default policy', () => {
      expect(RATE_LIMIT_POLICIES['default']).toBeDefined();
      expect(RATE_LIMIT_POLICIES['default'].points).toBe(100);
      expect(RATE_LIMIT_POLICIES['default'].duration).toBe(60);
    });

    it('should have appropriate limits for auth endpoints', () => {
      expect(RATE_LIMIT_POLICIES['auth:register'].points).toBe(5);
      expect(RATE_LIMIT_POLICIES['auth:login'].points).toBe(5);
      expect(RATE_LIMIT_POLICIES['auth:verify'].points).toBe(10);
    });

    it('should use IP strategy for auth endpoints', () => {
      expect(RATE_LIMIT_POLICIES['auth:register'].keyStrategy).toBe('ip');
      expect(RATE_LIMIT_POLICIES['auth:login'].keyStrategy).toBe('ip');
    });

    it('should use user strategy for AI endpoints', () => {
      expect(RATE_LIMIT_POLICIES['ai:summary'].keyStrategy).toBe('user');
      expect(RATE_LIMIT_POLICIES['ai:tags'].keyStrategy).toBe('user');
    });
  });

  describe('validateRateLimitConfigs', () => {
    it('should validate all predefined policies without throwing', () => {
      expect(() => validateRateLimitConfigs()).not.toThrow();
    });

    it('should validate each policy individually', () => {
      Object.entries(RATE_LIMIT_POLICIES).forEach(([key, config]) => {
        expect(() => RateLimitConfigSchema.parse(config)).not.toThrow();
      });
    });
  });

  describe('getRateLimitConfig', () => {
    const originalEnv = process.env.RATE_LIMIT_OVERRIDES;

    afterEach(() => {
      process.env.RATE_LIMIT_OVERRIDES = originalEnv;
    });

    it('should get config by key', () => {
      const config = getRateLimitConfig('auth:login');
      expect(config.points).toBe(5);
      expect(config.duration).toBe(60);
      expect(config.keyStrategy).toBe('ip');
    });

    it('should fallback to default for unknown keys', () => {
      const config = getRateLimitConfig('unknown:key');
      expect(config.points).toBe(100);
      expect(config.duration).toBe(60);
      expect(config.keyStrategy).toBe('ip');
    });

    it('should apply environment overrides', () => {
      process.env.RATE_LIMIT_OVERRIDES = JSON.stringify({
        'auth:login': { points: 10 },
      });

      const config = getRateLimitConfig('auth:login');
      expect(config.points).toBe(10);
      expect(config.duration).toBe(60); // Original value preserved
    });

    it('should validate environment overrides with Zod', () => {
      process.env.RATE_LIMIT_OVERRIDES = JSON.stringify({
        'auth:login': { points: 'invalid' }, // Invalid type
      });

      const config = getRateLimitConfig('auth:login');
      // Should fallback to original config on validation error
      expect(config.points).toBe(5);
    });

    it('should handle malformed JSON in overrides', () => {
      process.env.RATE_LIMIT_OVERRIDES = 'invalid json';

      const config = getRateLimitConfig('auth:login');
      // Should fallback to original config
      expect(config.points).toBe(5);
    });

    it('should merge overrides with base config', () => {
      process.env.RATE_LIMIT_OVERRIDES = JSON.stringify({
        'auth:login': { points: 20, duration: 120 },
      });

      const config = getRateLimitConfig('auth:login');
      expect(config.points).toBe(20);
      expect(config.duration).toBe(120);
      expect(config.keyStrategy).toBe('ip'); // Original value preserved
    });

    it('should apply blockDuration override', () => {
      process.env.RATE_LIMIT_OVERRIDES = JSON.stringify({
        'auth:login': { blockDuration: 300 },
      });

      const config = getRateLimitConfig('auth:login');
      expect(config.blockDuration).toBe(300);
    });

    it('should default blockDuration to 0', () => {
      const config = getRateLimitConfig('auth:login');
      expect(config.blockDuration).toBe(0);
    });
  });

  describe('Policy Coverage', () => {
    it('should have telemetry events for high-value policies', () => {
      expect(RATE_LIMIT_POLICIES['auth:register'].telemetryEvent).toBeDefined();
      expect(RATE_LIMIT_POLICIES['auth:login'].telemetryEvent).toBeDefined();
      expect(RATE_LIMIT_POLICIES['ai:summary'].telemetryEvent).toBeDefined();
      expect(RATE_LIMIT_POLICIES['rag:agent'].telemetryEvent).toBeDefined();
    });

    it('should have notes for all policies', () => {
      Object.entries(RATE_LIMIT_POLICIES).forEach(([key, config]) => {
        expect(config.notes).toBeDefined();
        expect(config.notes).toBeTruthy();
      });
    });

    it('should have positive points and duration', () => {
      Object.entries(RATE_LIMIT_POLICIES).forEach(([key, config]) => {
        expect(config.points).toBeGreaterThan(0);
        expect(config.duration).toBeGreaterThan(0);
      });
    });

    it('should have valid key strategies', () => {
      const validStrategies = ['user', 'session', 'ip', 'anonymous'];
      Object.entries(RATE_LIMIT_POLICIES).forEach(([key, config]) => {
        expect(validStrategies).toContain(config.keyStrategy);
      });
    });
  });
});
