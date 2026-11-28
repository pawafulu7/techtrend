import { SkipReason } from '@/lib/prisma-exports';
import {
  parseArgs,
  TRANSIENT_FAILURE_MARKERS,
  transientSummaryFailureWhere,
} from '../retry-transient-summary-failures';

/** DB の条件（summaryError に印のどれかを含む）と同じ判定 */
const matchesMarker = (summaryError: string) =>
  TRANSIENT_FAILURE_MARKERS.some((marker) => summaryError.includes(marker));

describe('TRANSIENT_FAILURE_MARKERS', () => {
  // 本番で QUALITY_FAILED になっていた summaryError の形（数値などは実物のまま、長い本文は省略）
  it.each([
    'Invalid `prisma.article.update()` invocation:\n\n\nTransaction API error: Transaction already closed',
    'Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction',
    'Failed to generate quality summary after 3 attempts: Fatal error during summarization: Circuit breaker is open',
    'Failed to generate quality summary after 3 attempts: Retryable error during summarization: HTTP 503: {   "error": {     "code": 503,     "message": "This model is currently experiencing high demand."',
    // 作り直しがまた別の一時的な失敗になったときの形（次に流したときも拾う）
    'Failed to generate quality summary after 3 attempts: Retryable error during summarization: HTTP 429: {   "error": {     "code": 429,     "message": "Resource has been exhausted (e.g. check quota)."',
    'Failed to generate quality summary after 3 attempts: Fatal error during summarization: HTTP 400: {   "error": {     "code": 400,     "message": "API key expired. Please renew the API key."',
    'Failed to generate quality summary after 3 attempts: Fatal error during summarization: HTTP 404: {   "error": {     "code": 404,     "message": "This model models/gemini-2.5-flash-lite is no longer available."',
  ])('一時的な障害の失敗を拾う: %s', (summaryError) => {
    expect(matchesMarker(summaryError)).toBe(true);
  });

  it.each([
    'Failed to generate quality summary after 3 attempts: No candidates in response',
    'Failed to generate quality summary after 3 attempts: Response parsing failed: Failed to extract headline from response',
    'Failed to generate quality summary after 3 attempts: Quality too low: 35 < 40. Issues: 一覧要約が長すぎる: 206文字（最大100文字）',
  ])('本文や要約の出来が原因の失敗は拾わない: %s', (summaryError) => {
    expect(matchesMarker(summaryError)).toBe(false);
  });
});

describe('transientSummaryFailureWhere', () => {
  it('要約が無く、諦めたか途中で止まった記事のうち、障害の印があり、本文の取得の失敗ではないものに絞る', () => {
    expect(transientSummaryFailureWhere()).toEqual({
      AND: [
        { OR: [{ summary: null }, { summary: '' }] },
        { OR: [{ skipReason: SkipReason.QUALITY_FAILED }, { skipReason: null }] },
        {
          OR: [
            { summaryError: { contains: 'Transaction API error' } },
            { summaryError: { contains: 'Circuit breaker is open' } },
            { summaryError: { contains: 'Retryable error during summarization' } },
            { summaryError: { contains: 'API key expired' } },
            { summaryError: { contains: 'is no longer available' } },
          ],
        },
        { NOT: { summaryError: { startsWith: '本文の取得に失敗: ' } } },
      ],
    });
  });
});

describe('parseArgs', () => {
  it('ドライランと件数を読む', () => {
    expect(parseArgs(['--dry-run', '--limit=50'])).toEqual({ dryRun: true, limit: 50 });
  });

  it.each([['--limit=1.5'], ['--limit=10oops'], ['--limit=0'], ['--limit='], ['--dryrun']])(
    '読めない引数 %s は失敗にする',
    (arg) => {
      expect(() => parseArgs([arg])).toThrow();
    }
  );
});
