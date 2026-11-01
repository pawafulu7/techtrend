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
import { GEMINI_API } from '@/lib/constants';

// GeminiClient はコンストラクタ既定引数でこの関数を呼ぶため、
// 記事収集などで多数インスタンス化されると解決処理と警告が繰り返される。
// 解決結果は 1 プロセス 1 回に固定する。
let cached: AppConfig['gemini'] | null = null;

function resolveGeminiConfig(): AppConfig['gemini'] {
  if (cached) {
    return cached;
  }
  try {
    cached = loadConfig().gemini;
    return cached;
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
    cached = defaultConfig.gemini;
    return cached;
  }
}

/** テスト用: キャッシュを破棄する */
export function resetGeminiConfigCache(): void {
  cached = null;
}

/** 設定から解決した Gemini モデルID */
export function getGeminiModel(): string {
  return resolveGeminiConfig().model;
}

/**
 * トレンドレポート用のモデルID。
 * 要約とは別のモデル（GEMINI_API.TREND_MODEL）を使い、GEMINI_MODEL では上書きしない
 */
export function getGeminiTrendModel(): string {
  return GEMINI_API.TREND_MODEL;
}

/**
 * 設定から解決した API の base URL（GEMINI_BASE_URL、未設定なら公式のエンドポイント）。
 * 末尾のスラッシュは loadConfig で除いてある
 */
export function getGeminiBaseUrl(): string {
  return resolveGeminiConfig().baseUrl;
}

/**
 * @google/generative-ai の getGenerativeModel に渡すリクエストオプション。
 * SDK は既定で公式のエンドポイントを使うので、base URL を明示して揃える
 */
export function getGeminiRequestOptions(): { baseUrl: string } {
  return { baseUrl: getGeminiBaseUrl() };
}

/**
 * generateContent の URL（API キーなし。キーは x-goog-api-key ヘッダで渡す経路用）。
 * model を省略すると設定のモデルを使う
 */
export function buildGeminiModelUrl(model: string = getGeminiModel()): string {
  return `${getGeminiBaseUrl()}/v1beta/models/${model}:generateContent`;
}

/** 設定から解決した generateContent エンドポイント（API キーをクエリに含める） */
export function buildGeminiEndpoint(apiKey: string): string {
  return `${buildGeminiModelUrl()}?key=${apiKey}`;
}
