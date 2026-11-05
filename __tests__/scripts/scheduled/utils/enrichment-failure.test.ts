/**
 * 毎時の収集で、記事ページから本文を取れなかった理由を決めて残す処理
 * （scripts/scheduled/utils/enrichment-failure.ts）
 */
import { prisma } from '@/lib/prisma';
import type { IContentEnricher } from '@/lib/enrichers';
import { recordFetchOutcome } from '@/lib/utils/url/fetch-trace';
import {
  describeEnrichmentFailure,
  enrichWithTrace,
  formatEnrichmentFailure,
  reportEnrichmentFailure,
  shouldReportPostSaveFailure,
} from '@/scripts/scheduled/utils/enrichment-failure';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockUpdateMany = (prisma as unknown as { article: { updateMany: jest.Mock } })
  .article.updateMany;

function fakeEnricher(enrich: IContentEnricher['enrich']): IContentEnricher {
  return { canHandle: () => true, enrich };
}

describe('enrichWithTrace', () => {
  it('enricher の中の最後の取得の結果を一緒に返す', async () => {
    const enricher = fakeEnricher(async () => {
      recordFetchOutcome({ kind: 'response', status: 403, challenge: true });
      return null;
    });

    const attempt = await enrichWithTrace(enricher, 'https://example.com/a', 1000, 'timeout');

    expect(attempt).toEqual({
      data: null,
      lastFetch: { kind: 'response', status: 403, challenge: true },
    });
  });

  it('enricher の例外は投げずに返す', async () => {
    const error = new Error('HTTP 503: Service Unavailable');
    const enricher = fakeEnricher(async () => {
      throw error;
    });

    const attempt = await enrichWithTrace(enricher, 'https://example.com/a', 1000, 'timeout');

    expect(attempt).toEqual({ data: null, error, lastFetch: undefined });
  });

  it('時間の上限を過ぎたら時間切れのエラーを返す', async () => {
    const enricher = fakeEnricher(() => new Promise(() => undefined));

    const attempt = await enrichWithTrace(
      enricher,
      'https://example.com/a',
      10,
      'Post-save enrichment timeout after 10ms'
    );

    expect(describeEnrichmentFailure(attempt)).toMatchObject({ errorCode: 'TIMEOUT' });
  });
});

describe('describeEnrichmentFailure', () => {
  it.each([
    [
      'エラーの応答',
      { data: null, lastFetch: { kind: 'response', status: 404, challenge: false } },
      { errorCode: 'HTTP_404', status: 404 },
    ],
    [
      'ボット対策の確認ページ',
      { data: null, lastFetch: { kind: 'response', status: 403, challenge: true } },
      { errorCode: 'HTTP_403', status: 403, detail: 'challenge' },
    ],
    [
      '200 だが本文を抜き出せない（JavaScript で描くページなど）',
      { data: { content: null, thumbnail: 'https://example.com/a.png' }, lastFetch: { kind: 'response', status: 200, challenge: false } },
      { errorCode: 'NO_CONTENT', status: 200 },
    ],
    [
      '200 の確認ページ（ボット対策の印を残す）',
      { data: null, lastFetch: { kind: 'response', status: 200, challenge: true } },
      { errorCode: 'NO_CONTENT', status: 200, detail: 'challenge' },
    ],
    [
      '本文が大きすぎる',
      { data: null, lastFetch: { kind: 'error', code: 'TOO_LARGE' } },
      { errorCode: 'TOO_LARGE' },
    ],
    [
      '名前解決の失敗',
      { data: null, lastFetch: { kind: 'error', code: 'NETWORK', cause: 'ENOTFOUND' } },
      { errorCode: 'NETWORK', detail: 'ENOTFOUND' },
    ],
    ['取得をしない enricher が何も返さない', { data: null }, { errorCode: 'NO_DATA' }],
  ] as const)('%s', (_name, attempt, expected) => {
    expect(describeEnrichmentFailure(attempt)).toEqual(expected);
  });

  it('enricher が本文を返したが短くて採らなかったら THIN と文字数', () => {
    expect(
      describeEnrichmentFailure(
        { data: { content: 'short', thumbnail: null }, lastFetch: { kind: 'response', status: 200, challenge: false } },
        5
      )
    ).toEqual({ errorCode: 'THIN', detail: '5文字' });
  });

  it('例外の HTTP ステータスを読み、例外の名前も残す', () => {
    expect(
      describeEnrichmentFailure({ data: null, error: new Error('HTTP 503: Service Unavailable') })
    ).toEqual({ errorCode: 'HTTP_503', status: 503, errorName: 'Error' });
  });

  it('undefined で reject されても例外として扱う', () => {
    expect(describeEnrichmentFailure({ data: null, error: undefined })).toEqual({
      errorCode: 'EXCEPTION',
    });
  });

  it('分類できない例外は、取得の結果の方を使う', () => {
    expect(
      describeEnrichmentFailure({
        data: null,
        error: new TypeError('fetch failed'),
        lastFetch: { kind: 'error', code: 'NETWORK', cause: 'UND_ERR_HEADERS_OVERFLOW' },
      })
    ).toEqual({ errorCode: 'NETWORK', detail: 'UND_ERR_HEADERS_OVERFLOW' });
  });
});

describe('shouldReportPostSaveFailure', () => {
  const VALID_FEED = 'feed body '.repeat(40);

  it.each([
    ['本文を採った', { contentAccepted: true, enrichedContent: 'x'.repeat(600), feedContent: null }, false],
    ['本文が返らない（取得の失敗）', { contentAccepted: false, enrichedContent: null, feedContent: VALID_FEED }, true],
    ['短い本文が返り、フィードの本文も要約に足りない', { contentAccepted: false, enrichedContent: 'short', feedContent: '' }, true],
    ['短い本文が返ったが、フィードの本文で要約できる', { contentAccepted: false, enrichedContent: 'short', feedContent: VALID_FEED }, false],
  ] as const)('%s', (_name, params, expected) => {
    expect(shouldReportPostSaveFailure(params)).toBe(expected);
  });
});

describe('formatEnrichmentFailure', () => {
  it('理由・補足・enricher を1行にする', () => {
    expect(
      formatEnrichmentFailure(
        { errorCode: 'HTTP_403', status: 403, detail: 'challenge' },
        'GenericContentEnricher'
      )
    ).toBe('本文の取得に失敗: HTTP_403 (challenge) [GenericContentEnricher]');
    expect(formatEnrichmentFailure({ errorCode: 'NO_DATA' }, 'FreeeContentEnricher')).toBe(
      '本文の取得に失敗: NO_DATA [FreeeContentEnricher]'
    );
  });
});

describe('reportEnrichmentFailure', () => {
  const READ_AT = new Date('2026-11-06T00:00:00.000Z');
  const base = {
    failure: { errorCode: 'HTTP_403', status: 403, detail: 'challenge' },
    enricherName: 'GenericContentEnricher',
    sourceId: 'hacker_news',
    sourceName: 'Hacker News',
    phase: 'post-save' as const,
  };

  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('本文の無い記事の summaryError に理由を書く（要約が無く、本文が読んだときのままの記事だけ）', async () => {
    await reportEnrichmentFailure({
      ...base,
      article: { id: 'a1', url: 'https://example.com/a', contentLength: null, contentUpdatedAt: READ_AT },
      remainingContent: null,
    });

    const summaryError = '本文の取得に失敗: HTTP_403 (challenge) [GenericContentEnricher]';
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'a1',
        AND: [
          { OR: [{ summary: null }, { summary: '' }] },
          // 読んだときの本文の状態のまま（同じ長さの差し替えも拾う。summary-reset.ts の contentStateWhere）
          { contentLength: null, contentUpdatedAt: READ_AT },
          // 同じ理由なら書き直さない（自己修復は毎時同じ記事を取り直す）
          { OR: [{ summaryError: null }, { summaryError: { not: summaryError } }] },
        ],
      },
      data: { summaryError },
    });
  });

  it('要約に足りない短い本文の記事は、その長さのままのときだけ書く', async () => {
    await reportEnrichmentFailure({
      ...base,
      article: { id: 'a2', url: 'https://example.com/b', contentLength: 5, contentUpdatedAt: READ_AT },
      remainingContent: 'short',
    });

    expect(mockUpdateMany.mock.calls[0][0].where.AND[1]).toEqual({
      contentLength: 5,
      contentUpdatedAt: READ_AT,
    });
  });

  it('残る本文で要約できる記事には書かない（要約の一時的な失敗の数え方が狂うため）', async () => {
    await reportEnrichmentFailure({
      ...base,
      article: { id: 'a3', url: 'https://example.com/c', contentLength: 400, contentUpdatedAt: READ_AT },
      remainingContent: 'feed body '.repeat(40),
    });

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('YouTube の動画は取得の失敗として扱わない（ログも DB も）', async () => {
    await reportEnrichmentFailure({
      ...base,
      article: { id: 'a4', url: 'https://youtu.be/dQw4w9WgXcQ', contentLength: null, contentUpdatedAt: READ_AT },
      remainingContent: null,
    });

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('DB に書けなくても投げない（収集を止めない）', async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      reportEnrichmentFailure({
        ...base,
        article: { id: 'a5', url: 'https://example.com/e', contentLength: 0, contentUpdatedAt: READ_AT },
        remainingContent: '',
      })
    ).resolves.toBeUndefined();
  });
});
