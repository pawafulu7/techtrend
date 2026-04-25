/**
 * Enrichment エラーの構造化分類ヘルパー
 *
 * 例外の name / message から errorCode を分類する。
 * collect-feeds.ts の post-save enrichment outer catch と
 * BaseContentEnricher.logEnrichmentError の両方から共通利用される。
 *
 * 分類優先順位: HTTP_<status> > TIMEOUT > ABORTED > EXCEPTION
 * HTTP を最優先することで "HTTP 504: Gateway Timeout" 等の
 * HTTP ステータス情報を TIMEOUT に吸わせない（観測性確保）。
 *
 * セキュリティ: errorMessage は pino の `err` serializer (sanitizeError) を
 * 経由しないため、API キー等を露出させないよう sanitizeErrorMessage で
 * トークン除去を行う。
 */

import { sanitizeErrorMessage } from '@/lib/logger';

export type EnrichmentErrorCode =
  | `HTTP_${number}`
  | 'TIMEOUT'
  | 'ABORTED'
  | 'EXCEPTION';

export interface ClassifiedEnrichmentError {
  errorCode: EnrichmentErrorCode;
  status?: number;
  errorName: string;
  errorMessage: string;
}

export function classifyEnrichmentError(
  error: unknown
): ClassifiedEnrichmentError {
  const errorName = error instanceof Error ? error.name : '';
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errorMessage = sanitizeErrorMessage(rawMessage);

  // statusMatch は HTTP ステータス検出のため raw 値を使用
  // (sanitizer は HTTP <status> パターンを置換しない)
  const statusMatch = /HTTP\s+(\d{3})/i.exec(rawMessage);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  const isTimeout =
    errorName === 'TimeoutError' ||
    (!statusMatch && /\btimeout\b/i.test(errorMessage));
  const isAborted = errorName === 'AbortError';

  let errorCode: EnrichmentErrorCode;
  if (statusMatch) {
    errorCode = `HTTP_${statusMatch[1]}` as EnrichmentErrorCode;
  } else if (isTimeout) {
    errorCode = 'TIMEOUT';
  } else if (isAborted) {
    errorCode = 'ABORTED';
  } else {
    errorCode = 'EXCEPTION';
  }

  return {
    errorCode,
    status,
    errorName,
    errorMessage,
  };
}
