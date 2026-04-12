/**
 * /api/digest エンドポイントのテスト
 */

// モックの設定（import前に定義）
jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_policy: string, handler: Function) => handler,
}));
jest.mock('@/lib/services/digest-service', () => ({
  digestService: {
    getDigest: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import { digestService } from '@/lib/services/digest-service';

const authMock = getSession as jest.MockedFunction<typeof getSession>;
const digestServiceMock = digestService as jest.Mocked<typeof digestService>;

const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () =>
  authMock.mockResolvedValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
    session: { id: 's1', userId: 'test-user-id', token: 'tok', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

// モック後に動的インポート
const getHandler = async () => {
  const { GET } = await import('@/app/api/digest/route');
  return GET;
};

// モックレスポンスデータ
const mockDigestResponse = {
  period: 'daily' as const,
  sections: [
    {
      type: 'personalized' as const,
      title: 'あなたへのおすすめ',
      articles: [
        {
          articleId: 'article-1',
          title: 'Test Article',
          url: 'https://example.com',
          summary: 'Test summary',
          thumbnailUrl: null,
          publishedAt: new Date('2026-02-28'),
          qualityScore: 85,
          sourceId: 'source-1',
          recommendationReason: 'あなたの興味: フロントエンド',
        },
      ],
    },
    { type: 'mustRead' as const, title: '必読記事', articles: [] },
    { type: 'missed' as const, title: '見逃した注目記事', articles: [] },
  ],
  generatedAt: new Date().toISOString(),
  hasPreferences: true,
  selectedCategories: [],
  categories: [],
};

describe('/api/digest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockSession();
    digestServiceMock.getDigest.mockResolvedValue(mockDigestResponse);
  });

  describe('GET', () => {
    it('未認証の場合401を返す', async () => {
      setUnauthenticated();

      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/digest');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
      expect(digestServiceMock.getDigest).not.toHaveBeenCalled();
    });

    it('デフォルトのperiod(daily)で正常なレスポンスを返す', async () => {
      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/digest');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.period).toBe('daily');
      expect(data.sections).toHaveLength(3);
      expect(data.sections[0].type).toBe('personalized');
      expect(data.sections[0].title).toBe('あなたへのおすすめ');
      expect(data.sections[1].type).toBe('mustRead');
      expect(data.sections[2].type).toBe('missed');
      expect(data.hasPreferences).toBe(true);
      expect(data.generatedAt).toBeDefined();

      expect(digestServiceMock.getDigest).toHaveBeenCalledWith(
        'test-user-id',
        'daily'
      );
    });

    it('period=weeklyで正常なレスポンスを返す', async () => {
      const weeklyResponse = { ...mockDigestResponse, period: 'weekly' as const };
      digestServiceMock.getDigest.mockResolvedValue(weeklyResponse);

      const GET = await getHandler();
      const request = new NextRequest(
        'http://localhost/api/digest?period=weekly'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.period).toBe('weekly');
      expect(digestServiceMock.getDigest).toHaveBeenCalledWith(
        'test-user-id',
        'weekly'
      );
    });

    it('不正なperiodの場合400を返す', async () => {
      const GET = await getHandler();
      const request = new NextRequest(
        'http://localhost/api/digest?period=monthly'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(digestServiceMock.getDigest).not.toHaveBeenCalled();
    });

    it('サービスエラー時に500を返す', async () => {
      digestServiceMock.getDigest.mockRejectedValue(
        new Error('Database connection failed')
      );

      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/digest');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });
});
