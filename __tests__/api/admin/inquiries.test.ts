/**
 * GET /api/admin/inquiries と PATCH /api/admin/inquiries/[id]
 *
 * 認証（withAdminAuth）・CSRF・レート制限は素通しにする。包み方は
 * __tests__/api/inquiries-middleware-composition.test.ts、認証そのものは
 * __tests__/lib/middleware/with-admin-auth.test.ts で確かめる。
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: log, logger: log };
});

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: (handler: Function) => handler,
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: (_key: string, handler: Function) => handler,
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth:
    (handler: Function) =>
    (request: unknown, context: object = {}) =>
      handler(request, {
        ...context,
        session: { user: { id: 'admin-1', email: 'admin@example.com' } },
      }),
}));

jest.mock('@/lib/prisma');

import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import logger from '@/lib/logger';
import { GET } from '@/app/api/admin/inquiries/route';
import { PATCH } from '@/app/api/admin/inquiries/[id]/route';

const prismaMock = prisma as any;
const mockLogger = logger as unknown as Record<'info' | 'error', jest.Mock>;

const ID = 'ckinquiry00000000000000001';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    category: 'BUG_REPORT',
    status: 'OPEN',
    message: '本文-secret',
    contactEmail: 'reply@example.com',
    createdAt: new Date('2026-10-12T01:00:00.000Z'),
    updatedAt: new Date('2026-10-12T01:00:00.000Z'),
    user: null,
    ...overrides,
  };
}

function getList(query = '') {
  return (GET as Function)(
    new NextRequest(`http://localhost/api/admin/inquiries${query}`)
  );
}

function patch(id: string, body: unknown) {
  return (PATCH as Function)(
    new NextRequest(`http://localhost/api/admin/inquiries/${id}`, {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction = jest.fn(async (fn: Function) => fn(prismaMock));
  prismaMock.inquiry.findMany.mockReset();
  prismaMock.inquiry.groupBy.mockReset();
  prismaMock.inquiry.update.mockReset();
  prismaMock.inquiry.findMany.mockResolvedValue([row()]);
  prismaMock.inquiry.groupBy.mockResolvedValue([
    { status: 'OPEN', _count: { _all: 3 } },
    { status: 'RESOLVED', _count: { _all: 12 } },
  ]);
});

describe('GET /api/admin/inquiries', () => {
  it('一覧・件数・ページを返す（行の無い状況は 0 で埋める）', async () => {
    const response = await getList();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([
      {
        id: ID,
        category: 'BUG_REPORT',
        status: 'OPEN',
        message: '本文-secret',
        contactEmail: 'reply@example.com',
        createdAt: '2026-10-12T01:00:00.000Z',
        updatedAt: '2026-10-12T01:00:00.000Z',
        user: null,
      },
    ]);
    expect(json.counts).toEqual({ OPEN: 3, IN_PROGRESS: 0, RESOLVED: 12, all: 15 });
    expect(json.pagination).toEqual({ page: 1, limit: 20, total: 15, totalPages: 1 });
  });

  it('既定は全件を新しい順（同時刻は id 順）で 20 件', async () => {
    await getList();

    expect(prismaMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      })
    );
  });

  it('一覧と件数を同じトランザクション（RepeatableRead）で取る', async () => {
    await getList();

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('状況で絞ると total はその状況の件数になる', async () => {
    const response = await getList('?status=RESOLVED&page=2&perPage=5');
    const json = await response.json();

    expect(prismaMock.inquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'RESOLVED' }, skip: 5, take: 5 })
    );
    expect(json.pagination).toEqual({ page: 2, limit: 5, total: 12, totalPages: 3 });
  });

  it('0 件でも totalPages は 1', async () => {
    prismaMock.inquiry.findMany.mockResolvedValue([]);
    prismaMock.inquiry.groupBy.mockResolvedValue([]);

    const json = await (await getList('?status=OPEN')).json();

    expect(json.counts).toEqual({ OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, all: 0 });
    expect(json.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('退会済みの送信者は deletedAt を ISO 文字列で返す', async () => {
    prismaMock.inquiry.findMany.mockResolvedValue([
      row({
        user: {
          id: 'u1',
          name: 'User',
          email: 'u1@example.com',
          deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        },
      }),
    ]);

    const json = await (await getList()).json();

    expect(json.data[0].user).toEqual({
      id: 'u1',
      name: 'User',
      email: 'u1@example.com',
      deletedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('キャッシュさせない', async () => {
    const response = await getList();

    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate'
    );
  });

  it.each([
    ['?status=SPAM', 'status'],
    ['?page=0', 'page'],
    ['?page=10001', 'page'],
    ['?perPage=51', 'perPage'],
    ['?page=abc', 'page'],
  ])('不正なクエリ %s は 400', async (query, field) => {
    const response = await getList(query);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatchObject({ code: 'VALIDATION_ERROR', field });
    expect(prismaMock.inquiry.findMany).not.toHaveBeenCalled();
  });

  it('DB の失敗は 500 で、ログに値を渡さない', async () => {
    prismaMock.inquiry.findMany.mockRejectedValue(new Error('db down 本文-secret'));

    const response = await getList();

    expect(response.status).toBe(500);
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('本文-secret');
  });
});

describe('PATCH /api/admin/inquiries/[id]', () => {
  it('対応状況を更新し、更新後の問い合わせを返す', async () => {
    prismaMock.inquiry.update.mockResolvedValue(row({ status: 'RESOLVED' }));

    const response = await patch(ID, { status: 'RESOLVED' });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.inquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { status: 'RESOLVED' } })
    );
    expect(json.data).toMatchObject({ id: ID, status: 'RESOLVED' });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { adminId: 'admin-1', inquiryId: ID, status: 'RESOLVED' },
      expect.any(String)
    );
  });

  it('不正な状況は 400', async () => {
    const response = await patch(ID, { status: 'DONE' });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ field: 'status' });
    expect(prismaMock.inquiry.update).not.toHaveBeenCalled();
  });

  it('余分な項目は 400', async () => {
    const response = await patch(ID, { status: 'OPEN', message: 'x' });

    expect(response.status).toBe(400);
    expect(prismaMock.inquiry.update).not.toHaveBeenCalled();
  });

  it('JSON として読めなければ 400', async () => {
    const response = await patch(ID, '{"status":');

    expect(response.status).toBe(400);
  });

  it('id の形が不正なら 400', async () => {
    const response = await patch('../users', { status: 'OPEN' });

    expect(response.status).toBe(400);
    expect(prismaMock.inquiry.update).not.toHaveBeenCalled();
  });

  it('存在しない id は 404', async () => {
    prismaMock.inquiry.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('not found', {
        code: 'P2025',
        clientVersion: 'test',
      })
    );

    const response = await patch(ID, { status: 'OPEN' });

    expect(response.status).toBe(404);
  });
});
