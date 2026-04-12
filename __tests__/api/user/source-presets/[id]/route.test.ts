/**
 * /api/user/source-presets/[id] エンドポイントのテスト
 *
 * PUT /api/user/source-presets/[id] - プリセット更新
 * DELETE /api/user/source-presets/[id] - プリセット削除
 */

jest.mock('@/lib/auth/get-session');
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_policy: string, handler: Function) => handler,
}));
jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/get-session';
import { Prisma } from '@prisma/client';

const { prismaMock, resetPrismaMock } = require('../../../../../test/utils/prisma-mock');

const authMock = getSession as jest.MockedFunction<typeof getSession>;
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

const mockPreset = {
  id: 'preset-1',
  userId: 'test-user-id',
  name: 'My AI Sources',
  sourceIds: ['source-1', 'source-2'],
  sortOrder: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const createPutRequest = (id: string, body: object) =>
  new NextRequest(`http://localhost/api/user/source-presets/${id}`, {
    method: 'PUT',
    headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const createDeleteRequest = (id: string) =>
  new NextRequest(`http://localhost/api/user/source-presets/${id}`, {
    method: 'DELETE',
    headers: { Origin: 'http://localhost' },
  });

const createRouteContext = (id: string) => ({
  params: Promise.resolve({ id }),
});

describe('/api/user/source-presets/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetPrismaMock();
    resetMockSession();
  });

  describe('PUT /api/user/source-presets/[id]', () => {
    const getPutHandler = async () => {
      const { PUT } = await import('@/app/api/user/source-presets/[id]/route');
      return PUT;
    };

    it('sourceIdsのみ更新する（名前変更なし）', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(mockPreset);
      prismaMock.source.findMany.mockResolvedValue([
        { id: 'source-3' },
        { id: 'source-4' },
      ]);
      prismaMock.userSourcePreset.update.mockResolvedValue({
        ...mockPreset,
        sourceIds: ['source-3', 'source-4'],
      });

      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', {
        sourceIds: ['source-3', 'source-4'],
      });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.preset.sourceIds).toEqual(['source-3', 'source-4']);
    });

    it('名前を更新する', async () => {
      let callCount = 0;
      prismaMock.userSourcePreset.findFirst.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(mockPreset);
        return Promise.resolve(null); // no duplicate
      });
      prismaMock.userSourcePreset.update.mockResolvedValue({
        ...mockPreset,
        name: 'Updated Name',
      });

      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', {
        name: 'Updated Name',
      });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.preset.name).toBe('Updated Name');
    });

    it('他ユーザーのプリセット更新で404を返す（IDOR対策）', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null); // not found for this user

      const PUT = await getPutHandler();
      const request = createPutRequest('other-preset', {
        name: 'Hacked',
      });
      const response = await PUT(request, createRouteContext('other-preset') as any);
      expect(response.status).toBe(404);
    });

    it('名前重複で409を返す', async () => {
      prismaMock.userSourcePreset.findFirst
        .mockResolvedValueOnce(mockPreset) // existing preset
        .mockResolvedValueOnce({ ...mockPreset, id: 'preset-2', name: 'Taken' }); // duplicate

      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', { name: 'Taken' });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(409);
    });

    it('P2002競合で409を返す', async () => {
      prismaMock.userSourcePreset.findFirst
        .mockResolvedValueOnce(mockPreset)
        .mockResolvedValueOnce(null); // no duplicate found in app check
      prismaMock.userSourcePreset.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        })
      );

      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', { name: 'Race Condition' });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(409);
    });

    it('無効なsourceIdsで400を返す', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(mockPreset);
      prismaMock.source.findMany.mockResolvedValue([]); // no valid sources

      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', {
        sourceIds: ['invalid-source'],
      });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(400);
    });

    it('認証なしで401を返す', async () => {
      setUnauthenticated();
      const PUT = await getPutHandler();
      const request = createPutRequest('preset-1', { name: 'Test' });
      const response = await PUT(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/user/source-presets/[id]', () => {
    const getDeleteHandler = async () => {
      const { DELETE } = await import('@/app/api/user/source-presets/[id]/route');
      return DELETE;
    };

    it('正常にプリセットを削除する', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(mockPreset);
      prismaMock.userSourcePreset.delete.mockResolvedValue(mockPreset);

      const DELETE = await getDeleteHandler();
      const request = createDeleteRequest('preset-1');
      const response = await DELETE(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('他ユーザーのプリセット削除で404を返す（IDOR対策）', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null);

      const DELETE = await getDeleteHandler();
      const request = createDeleteRequest('other-preset');
      const response = await DELETE(request, createRouteContext('other-preset') as any);
      expect(response.status).toBe(404);
    });

    it('存在しないプリセット削除で404を返す', async () => {
      prismaMock.userSourcePreset.findFirst.mockResolvedValue(null);

      const DELETE = await getDeleteHandler();
      const request = createDeleteRequest('nonexistent');
      const response = await DELETE(request, createRouteContext('nonexistent') as any);
      expect(response.status).toBe(404);
    });

    it('認証なしで401を返す', async () => {
      setUnauthenticated();
      const DELETE = await getDeleteHandler();
      const request = createDeleteRequest('preset-1');
      const response = await DELETE(request, createRouteContext('preset-1') as any);
      expect(response.status).toBe(401);
    });
  });
});
