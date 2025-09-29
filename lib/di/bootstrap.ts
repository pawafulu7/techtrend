import { GeminiTransportImpl } from '../ai/transport/gemini-transport';
import { PromptBuilder } from '../ai/adapter/prompt-builder';
import { GeminiSummaryAdapter } from '../ai/adapter/gemini-summary-adapter';
import { SummaryQualityChecker } from '../ai/service/quality-checker';
import { SummaryPostProcessor } from '../ai/service/post-processor';
import { UnifiedSummaryServiceImpl } from '../ai/service/unified-summary-service';
import { AppConfig, loadConfig } from './config';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type AppDependencies = {
  transport: GeminiTransportImpl;
  adapter: GeminiSummaryAdapter;
  service: UnifiedSummaryServiceImpl;
  config: AppConfig;
};

let appDependencies: AppDependencies | null = null;

export function buildAppDependencies(configOverrides?: DeepPartial<AppConfig>): AppDependencies {
  const config = loadConfig(configOverrides);

  const transport = new GeminiTransportImpl(
    config.gemini.apiKey,
    config.gemini.baseUrl,
    config.gemini.maxRetries,
    config.gemini.circuitBreakerThreshold
  );

  const promptBuilder = new PromptBuilder();
  const adapter = new GeminiSummaryAdapter(transport, promptBuilder, config.gemini.model);

  const qualityChecker = new SummaryQualityChecker();
  const postProcessor = new SummaryPostProcessor();
  const service = new UnifiedSummaryServiceImpl(adapter, qualityChecker, postProcessor, {
    qualityThreshold: config.quality.threshold,
    maxRetries: config.quality.maxRetries,
  });

  return { transport, adapter, service, config };
}

export function getAppDependencies(): AppDependencies {
  if (!appDependencies) {
    appDependencies = buildAppDependencies();
  }
  return appDependencies;
}

export function resetAppDependencies(): void {
  appDependencies = null;
}

export function buildTestDependencies(mocks: {
  transport?: GeminiTransportImpl;
  adapter?: GeminiSummaryAdapter;
  service?: UnifiedSummaryServiceImpl;
  config?: DeepPartial<AppConfig>;
}): AppDependencies {
  const config = loadConfig(mocks.config);

  const transport =
    mocks.transport ||
    new GeminiTransportImpl('test-key', config.gemini.baseUrl, 1, 1);

  const promptBuilder = new PromptBuilder();
  const adapter =
    mocks.adapter ||
    new GeminiSummaryAdapter(
      transport,
      promptBuilder,
      config.gemini.model
    );

  const qualityChecker = new SummaryQualityChecker();
  const postProcessor = new SummaryPostProcessor();
  const service =
    mocks.service ||
    new UnifiedSummaryServiceImpl(adapter, qualityChecker, postProcessor, {
      qualityThreshold: config.quality.threshold,
      maxRetries: config.quality.maxRetries,
    });

  return { transport, adapter, service, config };
}