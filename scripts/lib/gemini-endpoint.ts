/**
 * 手動・保守スクリプト用の Gemini エンドポイント解決
 *
 * スクリプトがモデルIDを直書きすると、本番（lib/di/config.ts）が
 * 新しいモデルへ移っても取り残される。
 * 「本番と同じ条件で再生成・比較する」という用途を満たすため、
 * 必ずこのヘルパー経由でエンドポイントを組み立てること。
 */

import { defaultConfig, loadConfig, type AppConfig } from '@/lib/di/config';

function resolveGeminiConfig(): AppConfig['gemini'] {
  try {
    return loadConfig().gemini;
  } catch (error) {
    // env 検証は Gemini と無関係な変数でも失敗しうる。
    // 既定値へ丸ごと戻すと、設定済みの GEMINI_MODEL を黙って捨てて
    // 「本番と同じモデルで実行する」というこのヘルパーの目的を壊すため、
    // モデルとベースURLだけは環境変数から拾い直す。
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[gemini-endpoint] loadConfig() に失敗したため既定値で継続します: ${reason}`
    );
    const gemini: AppConfig['gemini'] = {
      ...defaultConfig.gemini,
      model: process.env.GEMINI_MODEL || defaultConfig.gemini.model,
      baseUrl: process.env.GEMINI_BASE_URL || defaultConfig.gemini.baseUrl,
    };
    console.warn(`[gemini-endpoint] 使用モデル: ${gemini.model}`);
    return gemini;
  }
}

/** 本番と同じ Gemini モデルID */
export function getGeminiModel(): string {
  return resolveGeminiConfig().model;
}

/** 本番と同じモデル・ベースURLで generateContent エンドポイントを組み立てる */
export function buildGeminiEndpoint(apiKey: string): string {
  const { baseUrl, model } = resolveGeminiConfig();
  return `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
}
