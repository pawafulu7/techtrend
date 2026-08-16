/**
 * Gemini のモデル・エンドポイント解決
 *
 * モデルIDの解決経路をここに一本化する。
 * 以前は GeminiClient が lib/constants の GEMINI_API.MODEL（固定値）を、
 * loadConfig() が env.GEMINI_MODEL を使っており、GEMINI_MODEL を設定すると
 * 経路によって別のモデルが使われていた。
 *
 * lib 側・scripts 側の双方がこのモジュールを参照すること
 * （scripts/lib を lib から import してはならない）。
 */

import { defaultConfig, loadConfig, type AppConfig } from '@/lib/di/config';

function resolveGeminiConfig(): AppConfig['gemini'] {
  try {
    return loadConfig().gemini;
  } catch (error) {
    // env 検証は Gemini と無関係な変数でも失敗しうるため、
    // 素の tsx 実行などでスクリプトごと落とさないよう既定値で継続する。
    //
    // ここで process.env を直接読んで GEMINI_MODEL を拾い直すことはしない
    // （lib 配下では env 経由が必須。env 自体が検証に失敗している状態で
    //   生の環境変数を信用するのは一貫性を欠く）。
    // 代わりに、実際に使うモデルを警告として明示し、黙って別モデルを
    // 使うことがないようにする。
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[gemini-config] loadConfig() に失敗しました: ${reason}\n` +
        `[gemini-config] 環境変数による上書きは適用されません。` +
        `既定モデル ${defaultConfig.gemini.model} で継続します。`
    );
    return defaultConfig.gemini;
  }
}

/** 設定から解決した Gemini モデルID */
export function getGeminiModel(): string {
  return resolveGeminiConfig().model;
}

/** 設定から解決した generateContent エンドポイント */
export function buildGeminiEndpoint(apiKey: string): string {
  const { baseUrl, model } = resolveGeminiConfig();
  return `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
}
