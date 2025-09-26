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
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    temperature: 0.3,
    maxOutputTokens: 2500,
    topP: 0.8,
    topK: 40,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
  },
  quality: {
    threshold: parseInt(process.env.QUALITY_MIN_SCORE || '70'),
    maxRetries: parseInt(process.env.MAX_REGENERATION_ATTEMPTS || '3'),
  },
  logging: {
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  },
};

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    ...defaultConfig,
    ...overrides,
    gemini: {
      ...defaultConfig.gemini,
      ...overrides?.gemini,
    },
    quality: {
      ...defaultConfig.quality,
      ...overrides?.quality,
    },
    logging: {
      ...defaultConfig.logging,
      ...overrides?.logging,
    },
  };
}