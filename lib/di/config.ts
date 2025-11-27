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
  translation: {
    enabled: boolean;
    rateLimit: number;
  };
  regression: {
    enabled: boolean;
    temperature: number;
    topP: number;
    topK: number;
  };
};

export const defaultConfig: AppConfig = {
  gemini: {
    apiKey: '',
    model: 'gemini-2.5-flash-lite',
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
  translation: {
    enabled: true,
    rateLimit: 30,
  },
  regression: {
    enabled: false,
    temperature: 0,
    topP: 0,
    topK: 1,
  },
};

export function loadConfig(overrides?: DeepPartial<AppConfig>): AppConfig {
  const parseNumber = (envVar: string | undefined, defaultValue: number): number => {
    if (envVar === undefined) return defaultValue;
    const parsed = parseFloat(envVar);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  };

  const parseIntSafe = (envVar: string | undefined, defaultValue: number): number => {
    if (envVar === undefined) return defaultValue;
    const parsed = parseInt(envVar, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  };

  const regressionEnabled = process.env.REGRESSION_MODE === 'true';
  const regressionTemperature = parseNumber(
    process.env.REGRESSION_TEMPERATURE,
    defaultConfig.regression.temperature,
  );
  const regressionTopP = parseNumber(process.env.REGRESSION_TOP_P, defaultConfig.regression.topP);
  const regressionTopK = parseIntSafe(process.env.REGRESSION_TOP_K, defaultConfig.regression.topK);

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
    translation: {
      enabled: process.env.ENABLE_TITLE_TRANSLATION !== 'false',
      rateLimit: parseInt(process.env.TRANSLATION_RATE_LIMIT || String(defaultConfig.translation.rateLimit)),
    },
    regression: {
      enabled: regressionEnabled,
      temperature: regressionEnabled ? regressionTemperature : defaultConfig.regression.temperature,
      topP: regressionEnabled ? regressionTopP : defaultConfig.regression.topP,
      topK: regressionEnabled ? regressionTopK : defaultConfig.regression.topK,
    },
  };

  const mergedConfig: AppConfig = {
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
    translation: {
      ...defaultConfig.translation,
      ...envConfig.translation,
      ...overrides?.translation,
    },
    regression: {
      ...defaultConfig.regression,
      ...envConfig.regression,
      ...overrides?.regression,
    },
  };

  return mergedConfig;
}
