/**
 * Gemini の公式 SDK（@google/genai）を使う経路の共通処理
 *
 * トレンドレポートと changelog の翻訳だけが SDK を使う（要約などの主経路は
 * lib/ai/transport の GeminiTransportImpl が fetch で呼ぶ）。
 * SDK は依存が大きいので、読み込むのはこれらの経路で生成するときだけにする。
 * gemini-config.ts からは import せず、トレンドレポートは要約を作るときに動的 import する
 * （trend-report-generator.ts の loadGeminiModel）。
 */

import {
  FinishReason,
  GoogleGenAI,
  type GenerateContentResponse,
} from '@google/genai';
import { getGeminiBaseUrl } from './gemini-config';

/**
 * SDK のクライアントを作る。
 * - vertexai: false で Gemini API に固定する。未指定だと SDK は環境変数
 *   GOOGLE_GENAI_USE_VERTEXAI・GOOGLE_GENAI_USE_ENTERPRISE を読み、Vertex AI のパスへ切り替える
 * - SDK は既定で公式のエンドポイント（または環境変数 GOOGLE_GEMINI_BASE_URL）を使うので、
 *   base URL を共有設定（GEMINI_BASE_URL）に揃える
 * - httpOptions.retryOptions は渡さない。SDK は渡したときだけ再試行するので、
 *   再試行の有無と回数は呼び出し側だけが決める
 */
export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { baseUrl: getGeminiBaseUrl() },
  });
}

export type GeminiTextRequest = {
  model: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  /** 'application/json' を渡すと JSON で返させる */
  responseMimeType?: string;
  timeoutMs: number;
};

/**
 * 1 つのプロンプトを 1 回のリクエストで送り、本文を返す。
 *
 * automaticContinuation を切る。SDK は既定で、応答が CONTINUATION で終わると
 * 継続トークンを付けて送り直し、リクエストの回数とタイムアウトが積み重なる。
 * 旧 SDK と同じく 1 回だけ送り、再試行や修復は呼び出し側が決める
 */
export async function generateGeminiText(
  client: GoogleGenAI,
  request: GeminiTextRequest
): Promise<string> {
  const response = await client.models.generateContent({
    model: request.model,
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    config: {
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      responseMimeType: request.responseMimeType,
      automaticContinuation: false,
      httpOptions: { timeout: request.timeoutMs },
    },
  });
  return getGeminiResponseText(response);
}

// 旧 SDK（@google/generative-ai）の response.text() が例外にしていた終了理由
const BLOCKED_FINISH_REASONS: ReadonlySet<FinishReason> = new Set([
  FinishReason.RECITATION,
  FinishReason.SAFETY,
  FinishReason.LANGUAGE,
]);

/**
 * 応答の本文を返す。安全フィルタなどで止まった応答は例外にする。
 *
 * SDK の response.text は、止まった応答でも undefined を返すだけで例外にしない。
 * 空の本文として後段へ流すと、検証の失敗として修復のための再生成を重ねてしまうため、
 * 旧 SDK の text() と同じ条件で止める
 */
export function getGeminiResponseText(
  response: GenerateContentResponse
): string {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    if (response.promptFeedback) {
      throw new Error(
        `Gemini blocked the prompt: ${response.promptFeedback.blockReason ?? 'unknown'}`
      );
    }
    return '';
  }
  if (
    candidate.finishReason &&
    BLOCKED_FINISH_REASONS.has(candidate.finishReason)
  ) {
    throw new Error(`Gemini stopped the response: ${candidate.finishReason}`);
  }
  return response.text ?? '';
}
