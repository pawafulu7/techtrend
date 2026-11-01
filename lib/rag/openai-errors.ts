import OpenAI from 'openai';

/**
 * OpenAI のクレジット残高が無い（429・type: insufficient_quota）か。
 * 一時的なレート制限と同じ 429 だが、待っても直らないので再試行しない
 */
export function isInsufficientQuotaError(error: unknown): boolean {
  return error instanceof OpenAI.APIError && error.type === 'insufficient_quota';
}
