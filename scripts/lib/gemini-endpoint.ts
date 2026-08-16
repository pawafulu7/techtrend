/**
 * 手動・保守スクリプト用の Gemini エンドポイント解決
 *
 * 実体は lib/config/gemini.ts に置き、lib 側（GeminiClient 等）と
 * 同じ解決経路を共有する。スクリプトがモデルIDを直書きすると、
 * 本番が新しいモデルへ移っても取り残されるため、
 * 必ずこのヘルパー経由でエンドポイントを組み立てること。
 */

export { getGeminiModel, buildGeminiEndpoint } from '@/lib/config/gemini';
