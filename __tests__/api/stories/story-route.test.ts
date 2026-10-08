/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

const mockLoadUserDataMaps = jest.fn();
jest.mock('@/app/api/articles/list/response-builder', () => ({
  loadUserDataMaps: (...args: unknown[]) => mockLoadUserDataMaps(...args),
}));
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: unknown, fn: unknown) => fn,
}));

import { GET } from '@/app/api/stories/[id]/route';

const call = (id: string, session: unknown = null) =>
  (GET as (req: NextRequest, ctx: unknown) => Promise<Response>)(
    new NextRequest(`http://localhost:3000/api/stories/${id}`),
    { params: Promise.resolve({ id }), session }
  );

const rows = [
  {
    id: 'a1',
    title: 'Sonnet 5.5 launches',
    translatedTitle: 'Sonnet 5.5 登場',
    publishedAt: new Date('2026-09-28T18:00:00Z'),
    source: { id: 's1', name: 'The New Stack' },
  },
  {
    id: 'a2',
    title: 'Sonnet 5.5を発表',
    translatedTitle: null,
    publishedAt: new Date('2026-09-28T22:00:00Z'),
    source: { id: 's2', name: 'ITmedia AI+' },
  },
];

describe('GET /api/stories/[id]', () => {
  beforeEach(() => {
    prismaMock.article.findMany.mockReset();
    prismaMock.article.count.mockReset();
    prismaMock.article.count.mockResolvedValue(2);
    mockLoadUserDataMaps.mockReset();
  });

  it('同じストーリーの記事を、非表示と無効なソースを除いて公開順に返す', async () => {
    prismaMock.article.findMany.mockResolvedValue(rows);

    const response = await call('a2');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.data.storyId).toBe('a2');
    expect(body.data.total).toBe(2);
    expect(body.data.items.map((a: { id: string }) => a.id)).toEqual([
      'a1',
      'a2',
    ]);
    expect(body.data.items[0].publishedAt).toBe('2026-09-28T18:00:00.000Z');
    expect(body.meta.userDataIncluded).toBe(false);
    expect(mockLoadUserDataMaps).not.toHaveBeenCalled();

    const args = prismaMock.article.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ storyId: 'a2', isHidden: false });
    expect(args.where.AND).toEqual([{ source: { is: { enabled: true } } }]);
    expect(args.orderBy).toEqual([{ publishedAt: 'asc' }, { id: 'asc' }]);
    expect(args.take).toBe(100);
    expect(prismaMock.article.count.mock.calls[0][0].where).toEqual(args.where);
  });

  it('ログイン中はお気に入りと既読の状態を付ける', async () => {
    prismaMock.article.findMany.mockResolvedValue(rows);
    mockLoadUserDataMaps.mockResolvedValue({
      favoritesMap: new Map([['a1', true]]),
      readStatusMap: new Map([['a2', true]]),
    });

    const response = await call('a2', { user: { id: 'u1' } });
    const body = await response.json();

    expect(mockLoadUserDataMaps).toHaveBeenCalledWith(
      ['a1', 'a2'],
      'u1',
      false
    );
    expect(body.meta.userDataIncluded).toBe(true);
    expect(body.data.items).toEqual([
      expect.objectContaining({ id: 'a1', isFavorited: true, isRead: false }),
      expect.objectContaining({ id: 'a2', isFavorited: false, isRead: true }),
    ]);
  });

  it('お気に入りを切り替えた直後（tt_fav_bust）は L1 キャッシュを飛ばす', async () => {
    prismaMock.article.findMany.mockResolvedValue(rows);
    mockLoadUserDataMaps.mockResolvedValue({
      favoritesMap: new Map(),
      readStatusMap: new Map(),
    });
    const request = new NextRequest('http://localhost:3000/api/stories/a2', {
      headers: { cookie: 'tt_fav_bust=1' },
    });

    await (GET as (req: NextRequest, ctx: unknown) => Promise<Response>)(
      request,
      { params: Promise.resolve({ id: 'a2' }), session: { user: { id: 'u1' } } }
    );

    expect(mockLoadUserDataMaps).toHaveBeenCalledWith(['a1', 'a2'], 'u1', true);
  });

  it.each(['bad-id', 'a'.repeat(51), 'id%27%20OR%201%3D1'])(
    '不正な ID（%s）は DB を引かずに 400 を返す',
    async (id) => {
      const response = await call(id);

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
      expect(prismaMock.article.findMany).not.toHaveBeenCalled();
    }
  );

  it('DB のエラーは 500 にし、エラーの文言を応答に出さない', async () => {
    prismaMock.article.findMany.mockRejectedValue(
      new Error('connection refused at 10.0.0.1')
    );

    const response = await call('a2');

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.1');
  });
});
