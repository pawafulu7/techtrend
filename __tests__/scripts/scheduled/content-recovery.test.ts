/**
 * 毎時の収集で、本文の無い既存記事に後から本文が入ったときの扱い（scripts/scheduled/utils/content-recovery.ts）
 *
 * 本文を補ったら、要約の無い記事は本文が無いときに付いた skipReason を戻して要約の待ち行列に積む。
 * 要約がある記事・本文が要約に足りない記事・PDF / SLIDE は戻さない。
 */
import { SkipReason } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import {
  SUMMARY_RESET,
  fillExistingContentFromFeed,
  isValidThumbnailUrl,
  summaryResetOnContentRecovery,
} from '@/scripts/scheduled/utils/content-recovery';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockUpdateMany = (
  prisma as unknown as { article: { updateMany: jest.Mock } }
).article.updateMany;

const LONG_CONTENT = 'feed body '.repeat(20); // 200 字（要約に足りる）

describe('summaryResetOnContentRecovery', () => {
  it.each([
    null,
    SkipReason.CONTENT_FETCH_FAILED,
    SkipReason.THIN_CONTENT,
    SkipReason.QUALITY_FAILED,
  ])('skipReason=%s なら、要約の作成日時も含めて要約まわりを戻す', (skipReason) => {
    expect(summaryResetOnContentRecovery(skipReason)).toEqual({
      skipReason: null,
      summaryError: null,
      summary: null,
      detailedSummary: null,
      summaryVersion: 0,
      summaryComputedAt: null,
    });
  });

  it.each([SkipReason.PDF, SkipReason.SLIDE])(
    'skipReason=%s は恒久理由なので戻さない',
    (skipReason) => {
      expect(summaryResetOnContentRecovery(skipReason)).toBeNull();
    }
  );
});

describe('fillExistingContentFromFeed', () => {
  const existing = { id: 'article-1', thumbnail: 'https://example.com/old.png' };

  beforeEach(() => {
    mockUpdateMany.mockReset();
  });

  it('本文を補い、要約の無い記事なら印を戻して待ち行列に積む', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const queue: string[] = [];

    const filled = await fillExistingContentFromFeed(
      existing,
      { content: LONG_CONTENT, thumbnail: 'https://example.com/new.png' },
      queue
    );

    expect(filled).toBe(true);
    expect(queue).toEqual(['article-1']);
    const [[fill], [reset]] = mockUpdateMany.mock.calls;
    expect(fill).toEqual({
      where: { id: 'article-1', OR: [{ contentLength: null }, { contentLength: 0 }] },
      data: {
        content: LONG_CONTENT,
        thumbnail: 'https://example.com/new.png',
        contentUpdatedAt: expect.any(Date),
      },
    });
    // 要約が無く、PDF / SLIDE でない記事だけを DB の条件で戻す
    expect(reset).toEqual({
      where: {
        id: 'article-1',
        OR: [{ summary: null }, { summary: '' }],
        AND: [
          {
            OR: [
              { skipReason: null },
              { skipReason: { notIn: [SkipReason.PDF, SkipReason.SLIDE] } },
            ],
          },
        ],
      },
      data: SUMMARY_RESET,
    });
  });

  it('並行して本文が書かれていた（CAS で0件）なら、戻しも積みもしない', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const queue: string[] = [];

    const filled = await fillExistingContentFromFeed(
      existing,
      { content: LONG_CONTENT },
      queue
    );

    expect(filled).toBe(false);
    expect(queue).toEqual([]);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('要約がある・PDF などで戻せなかった（0件）記事は積まない', async () => {
    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const queue: string[] = [];

    const filled = await fillExistingContentFromFeed(
      existing,
      { content: LONG_CONTENT },
      queue
    );

    expect(filled).toBe(true);
    expect(queue).toEqual([]);
  });

  it('本文が要約に足りなければ、本文だけを書き、要約まわりは触らない', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const queue: string[] = [];

    const filled = await fillExistingContentFromFeed(
      existing,
      { content: 'short' },
      queue
    );

    expect(filled).toBe(true);
    expect(queue).toEqual([]);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('フィードのサムネイルが不正なら、既存のサムネイルを残す', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await fillExistingContentFromFeed(
      existing,
      { content: 'short', thumbnail: '/relative.png' },
      []
    );

    expect(mockUpdateMany.mock.calls[0][0].data.thumbnail).toBe(
      'https://example.com/old.png'
    );
  });
});

describe('isValidThumbnailUrl', () => {
  it.each([
    ['https://example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['/relative.png', false],
    ['javascript:alert(1)', false],
    [undefined, false],
    [null, false],
  ])('%s は %s', (url, expected) => {
    expect(isValidThumbnailUrl(url)).toBe(expected);
  });
});
