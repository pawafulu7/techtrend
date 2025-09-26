import { loadConfig, defaultConfig, AppConfig } from '../config';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('defaultConfig', () => {
    it('should have correct default values', () => {
      expect(defaultConfig.gemini.model).toBe('gemini-2.5-flash');
      expect(defaultConfig.gemini.temperature).toBe(0.3);
      expect(defaultConfig.gemini.maxOutputTokens).toBe(2500);
      expect(defaultConfig.gemini.topP).toBe(0.8);
      expect(defaultConfig.gemini.topK).toBe(40);
      expect(defaultConfig.gemini.maxRetries).toBe(3);
      expect(defaultConfig.gemini.circuitBreakerThreshold).toBe(5);
      expect(defaultConfig.quality.threshold).toBe(70);
      expect(defaultConfig.quality.maxRetries).toBe(3);
      expect(defaultConfig.logging.level).toBe('info');
    });

    it('should read GEMINI_API_KEY from environment', () => {
      process.env.GEMINI_API_KEY = 'test-api-key';
      const config = loadConfig();
      expect(config.gemini.apiKey).toBe('test-api-key');
    });

    it('should read QUALITY_MIN_SCORE from environment', () => {
      process.env.QUALITY_MIN_SCORE = '80';
      const config = loadConfig();
      expect(config.quality.threshold).toBe(80);
    });

    it('should read MAX_REGENERATION_ATTEMPTS from environment', () => {
      process.env.MAX_REGENERATION_ATTEMPTS = '5';
      const config = loadConfig();
      expect(config.quality.maxRetries).toBe(5);
    });

    it('should read LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      const config = loadConfig();
      expect(config.logging.level).toBe('debug');
    });
  });

  describe('loadConfig', () => {
    it('should return default config when no overrides provided', () => {
      const config = loadConfig();
      expect(config).toEqual(defaultConfig);
    });

    it('should merge gemini config overrides', () => {
      const overrides: Partial<AppConfig> = {
        gemini: {
          model: 'gemini-2.5-pro',
          temperature: 0.5,
        } as any,
      };

      const config = loadConfig(overrides);

      expect(config.gemini.model).toBe('gemini-2.5-pro');
      expect(config.gemini.temperature).toBe(0.5);
      expect(config.gemini.maxOutputTokens).toBe(defaultConfig.gemini.maxOutputTokens);
    });

    it('should merge quality config overrides', () => {
      const overrides: Partial<AppConfig> = {
        quality: {
          threshold: 90,
          maxRetries: 5,
        },
      };

      const config = loadConfig(overrides);

      expect(config.quality.threshold).toBe(90);
      expect(config.quality.maxRetries).toBe(5);
    });

    it('should merge logging config overrides', () => {
      const overrides: Partial<AppConfig> = {
        logging: {
          level: 'error',
        },
      };

      const config = loadConfig(overrides);

      expect(config.logging.level).toBe('error');
    });

    it('should merge multiple config sections', () => {
      const overrides: Partial<AppConfig> = {
        gemini: {
          model: 'gemini-2.5-pro',
        } as any,
        quality: {
          threshold: 85,
        } as any,
        logging: {
          level: 'warn',
        },
      };

      const config = loadConfig(overrides);

      expect(config.gemini.model).toBe('gemini-2.5-pro');
      expect(config.quality.threshold).toBe(85);
      expect(config.logging.level).toBe('warn');
    });

    it('should handle empty overrides object', () => {
      const config = loadConfig({});
      expect(config).toEqual(defaultConfig);
    });

    it('should handle partial gemini config overrides', () => {
      const overrides: Partial<AppConfig> = {
        gemini: {
          temperature: 0.7,
        } as any,
      };

      const config = loadConfig(overrides);

      expect(config.gemini.temperature).toBe(0.7);
      expect(config.gemini.model).toBe(defaultConfig.gemini.model);
      expect(config.gemini.topP).toBe(defaultConfig.gemini.topP);
    });
  });
});