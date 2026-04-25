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
 */

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
  const errorMessage = error instanceof Error ? error.message : String(error);

  const statusMatch = /HTTP\s+(\d{3})/i.exec(errorMessage);
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
