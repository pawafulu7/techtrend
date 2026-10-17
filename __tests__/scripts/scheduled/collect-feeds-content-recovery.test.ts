/**
 * collect-feeds.ts の、既存記事の本文を後から補ったときの扱いのテスト
 *
 * フィード本文で本文を補ったら、本文が無いときに付いた skipReason（CONTENT_FETCH_FAILED など）と
 * 古い要約を戻し、要約の待ち行列に積む。戻さないと、本文があるのに要約の対象から外れたままになる。
 * PDF / SLIDE は本文の有無と無関係の恒久理由なので戻さない。
 */

import { prisma } from '@/lib/prisma';
import {
  fillExistingContentFromFeed,
  summaryResetOnContentRecovery,
} from '@/scripts/scheduled/collect-feeds';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockUpdateMany = (
  prisma as unknown as { article: { updateMany: jest.Mock } }
).article.updateMany;

const RESET = {
  skipReason: null,
  summaryError: null,
  summary: null,
  detailedSummary: null,
  summaryVersion: 0,
};

describe('summaryResetOnContentRecovery', () => {
  it.each([null, 'CONTENT_FETCH_FAILED', 'THIN_CONTENT', 'QUALITY_FAILED'])(
    'skipReason=%s なら要約まわりを戻す',
    (skipReason) => {
      expect(summaryResetOnContentRecovery(skipReason)).toEqual(RESET);
    }
  );

  it.each(['PDF', 'SLIDE'])('skipReason=%s は恒久理由なので戻さない', (skipReason) => {
    expect(summaryResetOnContentRecovery(skipReason)).toBeNull();
  });
});

describe('fillExistingContentFromFeed', () => {
  const existing = {
    id: 'article-1',
    thumbnail: 'https://example.com/old.png',
    skipReason: 'CONTENT_FETCH_FAILED',
  };

  beforeEach(() => {
    mockUpdateMany.mockReset();
  });

  it('本文の無い記事を補ったら、skipReason と要約を戻して待ち行列に積む', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await fillExistingContentFromFeed(existing, {
      content: 'feed body',
      thumbnail: 'https://example.com/new.png',
    });

    expect(result).toEqual({ updated: true, queueForSummary: true });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'article-1',
        OR: [{ contentLength: null }, { contentLength: 0 }],
      },
      data: {
        content: 'feed body',
        thumbnail: 'https://example.com/new.png',
        contentUpdatedAt: expect.any(Date),
        ...RESET,
      },
    });
  });

  it('並行して本文が書かれていた（CAS で0件）なら、更新も積みもしない', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await fillExistingContentFromFeed(existing, {
      content: 'feed body',
    });

    expect(result).toEqual({ updated: false, queueForSummary: false });
  });

  it('PDF の記事は本文を補っても skipReason を残し、積まない', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await fillExistingContentFromFeed(
      { ...existing, skipReason: 'PDF' },
      { content: 'feed body' }
    );

    expect(result).toEqual({ updated: true, queueForSummary: false });
    const { data } = mockUpdateMany.mock.calls[0][0];
    expect(data).not.toHaveProperty('skipReason');
    expect(data).not.toHaveProperty('summary');
  });

  it('フィードのサムネイルが不正なら、既存のサムネイルを残す', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await fillExistingContentFromFeed(existing, {
      content: 'feed body',
      thumbnail: '/relative.png',
    });

    expect(mockUpdateMany.mock.calls[0][0].data.thumbnail).toBe(
      'https://example.com/old.png'
    );
  });
});
