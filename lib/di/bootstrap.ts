import { GeminiTransportImpl } from '../ai/transport/gemini-transport';
import { PromptBuilder } from '../ai/adapter/prompt-builder';
import { GeminiSummaryAdapter } from '../ai/adapter/gemini-summary-adapter';
import { SummaryQualityChecker } from '../ai/service/quality-checker';
import { SummaryPostProcessor } from '../ai/service/post-processor';
import { UnifiedSummaryServiceImpl } from '../ai/service/unified-summary-service';
import { GeminiTitleTranslator } from '../ai/translator/gemini-title-translator';
import { EmbeddingScheduler } from '../services/embedding-scheduler';
import { AppConfig, loadConfig } from './config';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type AppDependencies = {
  transport: GeminiTransportImpl;
  adapter: GeminiSummaryAdapter;
  translator: GeminiTitleTranslator;
  service: UnifiedSummaryServiceImpl;
  config: AppConfig;
};

let appDependencies: AppDependencies | null = null;

/**
 * アプリケーションで使用する依存コンポーネント群を構築する。
 *
 * @param configOverrides - 読み込む設定に適用する部分的な上書き（DeepPartial<AppConfig>）
 * @returns `transport`, `adapter`, `translator`, `service`, および確定した `config` を含む依存関係オブジェクト
 */
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

  const translator = new GeminiTitleTranslator(transport, {
    enabled: config.translation.enabled,
    model: config.gemini.model,
    temperature: config.gemini.temperature,
    topP: config.gemini.topP,
    topK: config.gemini.topK,
    maxOutputTokens: 256,
  });

  const qualityChecker = new SummaryQualityChecker();
  const postProcessor = new SummaryPostProcessor();
  const embeddingScheduler = new EmbeddingScheduler();
  const service = new UnifiedSummaryServiceImpl(
    adapter,
    qualityChecker,
    postProcessor,
    translator,
    embeddingScheduler,
    {
      qualityThreshold: config.quality.threshold,
      maxRetries: config.quality.maxRetries,
      translationEnabled: config.translation.enabled,
    }
  );

  return { transport, adapter, translator, service, config };
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

/**
 * テスト用途で使用するアプリケーション依存オブジェクト群を構築して返す。
 *
 * @param mocks - 任意で差し替え可能な依存関係や設定を含むオブジェクト。
 *   - `transport`：代替の GeminiTransportImpl（未指定時はテスト用のデフォルトを生成）。
 *   - `adapter`：代替の GeminiSummaryAdapter（未指定時はデフォルトを生成）。
 *   - `service`：代替の UnifiedSummaryServiceImpl（未指定時はデフォルトを生成）。
 *   - `config`：AppConfig の部分的なオーバーライド。
 * @returns 生成された依存関係オブジェクト `{ transport, adapter, translator, service, config }`。各プロパティはテスト実行に使用できるインスタンスを含む。
 */
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

  const translator = new GeminiTitleTranslator(transport, {
    enabled: config.translation.enabled,
    model: config.gemini.model,
    temperature: config.gemini.temperature,
    topP: config.gemini.topP,
    topK: config.gemini.topK,
    maxOutputTokens: 256,
  });

  const qualityChecker = new SummaryQualityChecker();
  const postProcessor = new SummaryPostProcessor();
  const embeddingScheduler = new EmbeddingScheduler();
  const service =
    mocks.service ||
    new UnifiedSummaryServiceImpl(
      adapter,
      qualityChecker,
      postProcessor,
      translator,
      embeddingScheduler,
      {
        qualityThreshold: config.quality.threshold,
        maxRetries: config.quality.maxRetries,
        translationEnabled: config.translation.enabled,
      }
    );

  return { transport, adapter, translator, service, config };
}