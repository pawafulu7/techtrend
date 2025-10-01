type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type AppConfig = {
  gemini: {
    apiKey: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxOutputTokens: number;
    topP: number;
    topK: number;
    maxRetries: number;
    circuitBreakerThreshold: number;
  };
  quality: {
    threshold: number;
    maxRetries: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
};

export const defaultConfig: AppConfig = {
  gemini: {
    apiKey: '',
    model: 'gemini-2.0-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com',
    temperature: 0.3,
    maxOutputTokens: 2500,
    topP: 0.8,
    topK: 40,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
  },
  quality: {
    threshold: 70,
    maxRetries: 3,
  },
  logging: {
    level: 'info',
  },
};

export function loadConfig(overrides?: DeepPartial<AppConfig>): AppConfig {
  const envConfig: Partial<AppConfig> = {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || defaultConfig.gemini.apiKey,
      model: process.env.GEMINI_MODEL || defaultConfig.gemini.model,
    } as any,
    quality: {
      threshold: parseInt(process.env.QUALITY_MIN_SCORE || String(defaultConfig.quality.threshold)),
      maxRetries: parseInt(process.env.MAX_REGENERATION_ATTEMPTS || String(defaultConfig.quality.maxRetries)),
    },
    logging: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || defaultConfig.logging.level,
    },
  };

  return {
    ...defaultConfig,
    ...envConfig,
    ...overrides,
    gemini: {
      ...defaultConfig.gemini,
      ...envConfig.gemini,
      ...overrides?.gemini,
    },
    quality: {
      ...defaultConfig.quality,
      ...envConfig.quality,
      ...overrides?.quality,
    },
    logging: {
      ...defaultConfig.logging,
      ...envConfig.logging,
      ...overrides?.logging,
    },
  };
}