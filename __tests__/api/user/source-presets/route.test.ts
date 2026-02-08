/**
 * /api/user/source-presets エンドポイントのテスト
 *
 * GET /api/user/source-presets - プリセット一覧取得
 * POST /api/user/source-presets - プリセット作成
 */

jest.mock('@/lib/auth/auth');
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_policy: string, handler: Function) => handler,
}));
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { Prisma } from '@prisma/client';

const { prismaMock, resetPrismaMock } = require('../../../../test/utils/prisma-mock');

const authMock = auth as jest.MockedFunction<typeof auth>;
const setUnauthenticated = () => authMock.mockResolvedValue(null);
const resetMockSession = () =>
  authMock.mockResolvedValue({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

const mockPreset = {
  id: 'preset-1',
  userId: 'test-user-id',
  name: 'My AI Sources',
  sourceIds: ['source-1', 'source-2'],
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const createPostRequest = (body: object) =>
  new NextRequest('http://localhost/api/user/source-presets', {
    method: 'POST',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('/api/user/source-presets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
    resetMockSession();
  });

  describe('GET /api/user/source-presets', () => {
    const getHandler = async () => {
      const { GET } = await import('@/app/api/user/source-presets/route');
      return GET;
    };

    it('認証なしで401を返す', async () => {
      setUnauthenticated();
      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/user/source-presets');
      const response = await GET(request, {} as any);
      expect(response.status).toBe(401);
    });

    it('プリセット一覧を返す', async () => {
      prismaMock.userSourcePreset.findMany.mockResolvedValue([mockPreset]);
      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/user/source-presets');
      const response = await GET(request, {} as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.presets).toHaveLength(1);
      expect(data.presets[0].name).toBe('My AI Sources');
    });

    it('空のプリセット一覧を返す', async () => {
      prismaMock.userSourcePreset.findMany.mockResolvedValue([]);
      const GET = await getHandler();
      const request = new NextRequest('http://localhost/api/user/source-presets');
      const response = await GET(request, {} as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.presets).toHaveLength(0);
    });
  });

  describe('POST /api/user/source-presets', () => {
    const getPostHandler = async () => {
      const { POST } = await import('@/app/api/user/source-presets/route');
      return POST;
    };

    it('正常にプリセットを作成して201を返す', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(0);
      prismaMock.source.findMany.mockResolvedValue([
        { id: 'source-1' },
        { id: 'source-2' },
      ]);
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null);
      prismaMock.userSourcePreset.create.mockResolvedValue(mockPreset);

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'My AI Sources',
        sourceIds: ['source-1', 'source-2'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.preset.name).toBe('My AI Sources');
    });

    it('名前が空の場合400を返す', async () => {
      const POST = await getPostHandler();
      const request = createPostRequest({ name: '', sourceIds: ['source-1'] });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(400);
    });

    it('名前がスペースのみの場合400を返す', async () => {
      const POST = await getPostHandler();
      const request = createPostRequest({ name: '   ', sourceIds: ['source-1'] });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(400);
    });

    it('sourceIdsが空の場合400を返す', async () => {
      const POST = await getPostHandler();
      const request = createPostRequest({ name: 'Test', sourceIds: [] });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(400);
    });

    it('上限超過（10件超）で400を返す', async () => {
      prismaMock.source.findMany.mockResolvedValue([{ id: 'source-1' }]);
      prismaMock.userSourcePreset.count.mockResolvedValue(10);

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'New Preset',
        sourceIds: ['source-1'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Maximum');
    });

    it('名前重複で409を返す', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(1);
      prismaMock.source.findMany.mockResolvedValue([{ id: 'source-1' }]);
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(mockPreset);

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'My AI Sources',
        sourceIds: ['source-1'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(409);
    });

    it('無効なsourceIdsで400を返す', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(0);
      prismaMock.source.findMany.mockResolvedValue([]); // no valid sources

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'Test Preset',
        sourceIds: ['invalid-source'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('No valid sources');
    });

    it('P2002競合で409を返す', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(0);
      prismaMock.source.findMany.mockResolvedValue([{ id: 'source-1' }]);
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null);
      prismaMock.userSourcePreset.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'Concurrent Preset',
        sourceIds: ['source-1'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(409);
    });

    it('trim後のname重複を検出する', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(1);
      prismaMock.source.findMany.mockResolvedValue([{ id: 'source-1' }]);
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(mockPreset);

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: '  My AI Sources  ',
        sourceIds: ['source-1'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(409);
    });

    it('sourceIdsの重複を除去する', async () => {
      prismaMock.userSourcePreset.count.mockResolvedValue(0);
      prismaMock.source.findMany.mockResolvedValue([{ id: 'source-1' }]);
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null);
      prismaMock.userSourcePreset.create.mockResolvedValue({
        ...mockPreset,
        sourceIds: ['source-1'],
      });

      const POST = await getPostHandler();
      const request = createPostRequest({
        name: 'Dedup Test',
        sourceIds: ['source-1', 'source-1', 'source-1'],
      });
      const response = await POST(request, {} as any);
      expect(response.status).toBe(201);
      // source.findMany should be called with deduplicated IDs
      expect(prismaMock.source.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['source-1'] },
          }),
        })
      );
    });
  });
});
