/**
 * 投票 API が定期採点と同じ記事スコアを保存することを検証する（issue #655）
 */

const mockCalculateArticleQualityScore = jest.fn();

// CSRF・レート制限は別のテストで検証しているので、ここでは handler をそのまま通す
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: unknown) => handler,
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: string, handler: unknown) => handler,
}));

jest.mock('@/lib/utils/quality-score', () => ({
  calculateArticleQualityScore: (...args: unknown[]) =>
    mockCalculateArticleQualityScore(...args),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/articles/[id]/vote/route';

// @/lib/prisma は jest.config の moduleNameMapper で共有の prismaMock に置き換わる
const mockPrisma = prisma as unknown as {
  article: { update: jest.Mock; findUnique: jest.Mock };
};

describe('POST /api/articles/[id]/vote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('投票後の記事スコアを calculateArticleQualityScore で保存する', async () => {
    const articleWithDetails = { id: 'art1', tags: [], source: { name: 'S' } };
    mockPrisma.article.update.mockResolvedValue({ id: 'art1', userVotes: 3 });
    mockPrisma.article.findUnique.mockResolvedValue(articleWithDetails);
    mockCalculateArticleQualityScore.mockReturnValue(77);

    const res = await (POST as unknown as (
      req: NextRequest,
      ctx: { params: Promise<{ id: string }> }
    ) => Promise<Response>)(
      new NextRequest('http://localhost/api/articles/art1/vote', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'art1' }) }
    );

    expect(res.status).toBe(200);
    expect(mockCalculateArticleQualityScore).toHaveBeenCalledWith(
      articleWithDetails
    );
    expect(mockPrisma.article.update).toHaveBeenLastCalledWith({
      where: { id: 'art1' },
      data: { qualityScore: 77, qualityScoreComputedAt: expect.any(Date) },
    });
  });
});
