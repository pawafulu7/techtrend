import { SkipReason } from '@/lib/prisma-exports';
import { SummaryManager } from '@/lib/summary/summary-manager';
import { getPrismaClient } from '@/lib/cli/utils/database';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import {
  main,
  parseArgs,
  TRANSIENT_FAILURE_MARKERS,
  transientSummaryFailureWhere,
} from '../retry-transient-summary-failures';

jest.mock('@/lib/summary/summary-manager');
jest.mock('@/lib/cli/utils/database');
jest.mock('@/lib/cache/cache-invalidator', () => ({
  cacheInvalidator: { onBulkImport: jest.fn() },
}));

// CI にキーは無いので、キーだけ差し替え、ほかの値は本物の env を読む（manage-summaries.test.ts と同じ）
let mockGeminiApiKey: string | undefined = 'test-gemini-key';
jest.mock('@/lib/config/env', () => {
  const actual = jest.requireActual('@/lib/config/env');
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) =>
        prop === 'GEMINI_API_KEY' ? mockGeminiApiKey : Reflect.get(target, prop),
    }),
  };
});

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

describe('main', () => {
  const ids = Array.from({ length: 21 }, (_, i) => `article-${i}`);
  let mockPrisma: {
    article: { findMany: jest.Mock; updateManyAndReturn: jest.Mock };
    $disconnect: jest.Mock;
  };
  let mockGenerateSummaries: jest.Mock;
  let logSpy: jest.SpyInstance;
  let originalExitCode: typeof process.exitCode;

  /** 結果の行（`名前=値`）を名前ごとにまとめる */
  const resultLines = () =>
    Object.fromEntries(
      logSpy.mock.calls
        .map(([line]) => String(line))
        .filter((line) => /^[a-z_]+=/.test(line))
        .map((line) => line.split('='))
    );

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    mockGeminiApiKey = 'test-gemini-key';
    mockPrisma = {
      article: {
        findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
        // 渡した ID をすべて対象に戻せたとする
        updateManyAndReturn: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.map((id) => ({ id }))
        ),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    mockGenerateSummaries = jest.fn();
    (SummaryManager as unknown as jest.Mock).mockImplementation(() => ({
      generateSummaries: mockGenerateSummaries,
    }));
    (cacheInvalidator.onBulkImport as jest.Mock).mockReset().mockResolvedValue(undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    jest.restoreAllMocks();
  });

  it('2つ目のまとまりで例外が出ても、一覧のキャッシュを1回消し、結果の行を出して切断する', async () => {
    mockGenerateSummaries
      .mockResolvedValueOnce({ generated: 20, errors: 0, skipped: 0 })
      .mockRejectedValueOnce(new Error('connection lost'));

    await expect(main([])).rejects.toThrow('connection lost');

    expect(mockGenerateSummaries).toHaveBeenCalledTimes(2);
    expect(cacheInvalidator.onBulkImport).toHaveBeenCalledTimes(1);
    expect(resultLines()).toEqual({
      dry_run: 'false',
      targets: '21',
      reset: '21',
      generated: '20',
      errors: '0',
      skipped: '0',
      aborted: 'true',
    });
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('作れた件数が0でも、対象に戻した記事があれば一覧のキャッシュを消す（保存の後の処理の時間切れは失敗に数えられる）', async () => {
    mockPrisma.article.findMany.mockResolvedValue(ids.slice(0, 20).map((id) => ({ id })));
    mockGenerateSummaries.mockResolvedValue({ generated: 0, errors: 20, skipped: 0 });

    await main([]);

    expect(cacheInvalidator.onBulkImport).toHaveBeenCalledTimes(1);
    expect(resultLines()).toMatchObject({ generated: '0', errors: '20', aborted: 'false' });
    expect(process.exitCode).toBe(1);
  });

  it('最後まで進めば aborted=false を出す', async () => {
    mockGenerateSummaries.mockResolvedValue({ generated: 1, errors: 0, skipped: 0 });

    await main([]);

    expect(resultLines()).toMatchObject({ targets: '21', reset: '21', aborted: 'false' });
    expect(process.exitCode).toBeUndefined();
  });

  it('API キーが無ければ数える前に止まり、aborted=true を出す（キャッシュは消さない）', async () => {
    mockGeminiApiKey = undefined;

    await main([]);

    expect(mockPrisma.article.findMany).not.toHaveBeenCalled();
    expect(cacheInvalidator.onBulkImport).not.toHaveBeenCalled();
    expect(resultLines()).toMatchObject({ targets: '0', aborted: 'true' });
    expect(process.exitCode).toBe(1);
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
