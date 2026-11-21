/**
 * GET・POST /api/admin/gate-allowlist と DELETE /api/admin/gate-allowlist/[id]
 *
 * 認証（withAdminAuth）・CSRF・レート制限は素通しにする（包み方は __tests__/api/auth-middleware-composition.test.ts、
 * 認証そのものは __tests__/lib/middleware/with-admin-auth.test.ts で確かめる）。
 * 入口の設定と、この要求の入口のログイン状態のアドレスはモックする。
 */
import { NextRequest } from 'next/server';
import type { SiteGateConfig } from '@/lib/auth/site-gate/config';

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

const mockGetSiteGateConfig = jest.fn<SiteGateConfig, []>();
jest.mock('@/lib/auth/site-gate/server-config', () => ({
  getSiteGateConfig: () => mockGetSiteGateConfig(),
}));

const mockGetCurrentGateEmail = jest.fn();
jest.mock('@/lib/auth/site-gate/current-account', () => ({
  getCurrentGateEmail: (...args: unknown[]) => mockGetCurrentGateEmail(...args),
}));

// eslint-disable-next-line import/first
import { prisma } from '@/lib/prisma';
// eslint-disable-next-line import/first
import { Prisma } from '@/lib/prisma-exports';
// eslint-disable-next-line import/first
import logger from '@/lib/logger';
// eslint-disable-next-line import/first
import { GET, POST } from '@/app/api/admin/gate-allowlist/route';
// eslint-disable-next-line import/first
import { DELETE } from '@/app/api/admin/gate-allowlist/[id]/route';

const prismaMock = prisma as any;
const mockLogger = logger as unknown as Record<'info' | 'warn' | 'error', jest.Mock>;

const ENABLED: SiteGateConfig = {
  kind: 'enabled',
  settings: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    secret: 'g'.repeat(40),
    fixedEmails: ['owner@gmail.com'],
    baseOrigin: 'http://localhost:3000',
    isProduction: false,
  },
};

const ID_1 = 'ckgateentry000000000000001';
const ID_2 = 'ckgateentry000000000000002';

function row(id: string, email: string, createdAt: string) {
  return { id, email, createdAt: new Date(createdAt) };
}

function uniqueViolation() {
  // Prisma 7 のドライバーアダプタの形（lib/utils/prisma-constraint.ts）
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: {
      modelName: 'GateAllowedEmail',
      driverAdapterError: {
        cause: { constraint: { index: 'GateAllowedEmail_email_key' } },
      },
    },
  });
}

function getList() {
  return (GET as Function)(new NextRequest('http://localhost/api/admin/gate-allowlist'));
}

function post(body: unknown) {
  return (POST as Function)(
    new NextRequest('http://localhost/api/admin/gate-allowlist', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    {}
  );
}

function remove(id: string) {
  return (DELETE as Function)(
    new NextRequest(`http://localhost/api/admin/gate-allowlist/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSiteGateConfig.mockReturnValue(ENABLED);
  mockGetCurrentGateEmail.mockResolvedValue('me@gmail.com');
  prismaMock.gateAllowedEmail.findMany.mockReset();
  prismaMock.gateAllowedEmail.findUnique.mockReset();
  prismaMock.gateAllowedEmail.count.mockReset();
  prismaMock.gateAllowedEmail.create.mockReset();
  prismaMock.gateAllowedEmail.delete.mockReset();
  prismaMock.gateAllowedEmail.count.mockResolvedValue(0);
});

describe('GET /api/admin/gate-allowlist', () => {
  it('returns fixed addresses first, then rows newest first, with markers', async () => {
    prismaMock.gateAllowedEmail.findMany.mockResolvedValue([
      row(ID_2, 'friend@gmail.com', '2026-11-21T02:00:00Z'),
      row(ID_1, 'me@gmail.com', '2026-11-21T01:00:00Z'),
    ]);

    const response = await getList();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual({
      gateEnabled: true,
      maxEntries: 100,
      entries: [
        { id: null, email: 'owner@gmail.com', createdAt: null, isFixed: true, isCurrentGateAccount: false },
        {
          id: ID_2,
          email: 'friend@gmail.com',
          createdAt: '2026-11-21T02:00:00.000Z',
          isFixed: false,
          isCurrentGateAccount: false,
        },
        {
          id: ID_1,
          email: 'me@gmail.com',
          createdAt: '2026-11-21T01:00:00.000Z',
          isFixed: false,
          isCurrentGateAccount: true,
        },
      ],
    });
    expect(prismaMock.gateAllowedEmail.findMany).toHaveBeenCalledWith({
      select: { id: true, email: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
  });

  it('merges a row that overlaps a fixed address into one fixed row', async () => {
    prismaMock.gateAllowedEmail.findMany.mockResolvedValue([
      row(ID_1, 'owner@gmail.com', '2026-11-20T00:00:00Z'),
    ]);

    const { entries } = await (await getList()).json();
    expect(entries).toEqual([
      {
        id: ID_1,
        email: 'owner@gmail.com',
        createdAt: '2026-11-20T00:00:00.000Z',
        isFixed: true,
        isCurrentGateAccount: false,
      },
    ]);
  });

  it('reports a disabled gate and shows only rows', async () => {
    mockGetSiteGateConfig.mockReturnValue({ kind: 'disabled' });
    mockGetCurrentGateEmail.mockResolvedValue(null);
    prismaMock.gateAllowedEmail.findMany.mockResolvedValue([]);

    expect(await (await getList()).json()).toEqual({
      gateEnabled: false,
      maxEntries: 100,
      entries: [],
    });
  });

  it('still returns the list when the gate session cannot be read', async () => {
    mockGetCurrentGateEmail.mockRejectedValue(new Error('boom'));
    prismaMock.gateAllowedEmail.findMany.mockResolvedValue([
      row(ID_1, 'me@gmail.com', '2026-11-21T01:00:00Z'),
    ]);

    const response = await getList();
    expect(response.status).toBe(200);
    const { entries } = await response.json();
    expect(entries[1].isCurrentGateAccount).toBe(false);
  });

  it('returns 500 without leaking the DB error', async () => {
    prismaMock.gateAllowedEmail.findMany.mockRejectedValue(new Error('db.internal:5432 refused'));

    const response = await getList();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('db.internal');
  });
});

describe('POST /api/admin/gate-allowlist', () => {
  it('adds the normalized address and logs it masked', async () => {
    prismaMock.gateAllowedEmail.create.mockResolvedValue(
      row(ID_1, 'friend@gmail.com', '2026-11-21T03:00:00Z')
    );

    const response = await post({ email: '  F.riend@Gmail.com ' });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      entry: {
        id: ID_1,
        email: 'friend@gmail.com',
        createdAt: '2026-11-21T03:00:00.000Z',
        isFixed: false,
        isCurrentGateAccount: false,
      },
    });
    expect(prismaMock.gateAllowedEmail.create).toHaveBeenCalledWith({
      data: { email: 'friend@gmail.com', createdById: 'admin-1' },
      select: { id: true, email: true, createdAt: true },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { adminId: 'admin-1', entryId: ID_1, email: 'f***@gmail.com' },
      expect.any(String)
    );
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('friend@gmail.com');
  });

  it.each([
    ['non Gmail', 'friend@example.com'],
    ['plus address', 'friend+x@gmail.com'],
    ['control character', 'fri\u0000end@gmail.com'],
    ['empty', ''],
  ])('rejects %s with NOT_GMAIL', async (_label, email) => {
    const response = await post({ email });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'NOT_GMAIL' });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
  });

  it.each([
    ['too long', { email: `${'a'.repeat(245)}@gmail.com` }],
    ['extra keys (strict)', { email: 'friend@gmail.com', role: 'admin' }],
    ['non string', { email: 123 }],
    ['invalid JSON', '{'],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
  });

  it('rejects a fixed address with ALREADY_FIXED', async () => {
    const response = await post({ email: 'o.wner@gmail.com' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ALREADY_FIXED' });
  });

  it('does not count rows that overlap a fixed address', async () => {
    prismaMock.gateAllowedEmail.create.mockResolvedValue(
      row(ID_1, 'friend@gmail.com', '2026-11-21T03:00:00Z')
    );
    await post({ email: 'friend@gmail.com' });
    expect(prismaMock.gateAllowedEmail.count).toHaveBeenCalledWith({
      where: { email: { notIn: ['owner@gmail.com'] } },
    });
  });

  it('rejects when the list is full', async () => {
    prismaMock.gateAllowedEmail.count.mockResolvedValue(100);
    const response = await post({ email: 'friend@gmail.com' });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'LIST_FULL' });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
  });

  it('turns a unique violation (double submit) into ALREADY_LISTED', async () => {
    prismaMock.gateAllowedEmail.create.mockRejectedValue(uniqueViolation());
    const response = await post({ email: 'friend@gmail.com' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ALREADY_LISTED' });
  });

  it('returns 500 for other DB errors', async () => {
    prismaMock.gateAllowedEmail.create.mockRejectedValue(new Error('db down'));
    const response = await post({ email: 'friend@gmail.com' });
    expect(response.status).toBe(500);
  });
});

describe('DELETE /api/admin/gate-allowlist/[id]', () => {
  it('removes the row and logs who removed what', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_2, email: 'friend@gmail.com' });
    prismaMock.gateAllowedEmail.delete.mockResolvedValue({});

    const response = await remove(ID_2);
    expect(response.status).toBe(200);
    expect(prismaMock.gateAllowedEmail.delete).toHaveBeenCalledWith({ where: { id: ID_2 } });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { adminId: 'admin-1', entryId: ID_2, email: 'f***@gmail.com' },
      expect.any(String)
    );
  });

  it('refuses to remove the account the admin is using', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_1, email: 'me@gmail.com' });

    const response = await remove(ID_1);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'CANNOT_REMOVE_CURRENT_ACCOUNT' });
    expect(prismaMock.gateAllowedEmail.delete).not.toHaveBeenCalled();
  });

  it('refuses to remove when the gate session cannot be checked', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_2, email: 'friend@gmail.com' });
    mockGetCurrentGateEmail.mockRejectedValue(new Error('boom'));

    const response = await remove(ID_2);
    expect(response.status).toBe(503);
    expect(prismaMock.gateAllowedEmail.delete).not.toHaveBeenCalled();
  });

  it('refuses to remove when the gate is enabled but the current account is unknown', async () => {
    // proxy を通ったあとに入口のログイン状態が切れたなど。自分のアカウントを消さないよう断る
    mockGetCurrentGateEmail.mockResolvedValue(null);
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_1, email: 'me@gmail.com' });

    expect((await remove(ID_1)).status).toBe(503);
    expect(prismaMock.gateAllowedEmail.delete).not.toHaveBeenCalled();
  });

  it('allows removal when the gate is disabled (no current account)', async () => {
    mockGetSiteGateConfig.mockReturnValue({ kind: 'disabled' });
    mockGetCurrentGateEmail.mockResolvedValue(null);
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_1, email: 'me@gmail.com' });
    prismaMock.gateAllowedEmail.delete.mockResolvedValue({});

    expect((await remove(ID_1)).status).toBe(200);
  });

  it.each(['', 'a'.repeat(129)])('is 404 for an empty or too long id without reading the DB (%#)', async (id) => {
    const response = await remove(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'ENTRY_NOT_FOUND' });
    expect(prismaMock.gateAllowedEmail.findUnique).not.toHaveBeenCalled();
  });

  it('removes a row whose id is not a cuid (inserted by hand)', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: 'manual-1', email: 'friend@gmail.com' });
    prismaMock.gateAllowedEmail.delete.mockResolvedValue({});

    expect((await remove('manual-1')).status).toBe(200);
    expect(prismaMock.gateAllowedEmail.delete).toHaveBeenCalledWith({ where: { id: 'manual-1' } });
  });

  it('is 404 when the row does not exist', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(null);
    const response = await remove(ID_2);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'ENTRY_NOT_FOUND' });
  });

  it('is 404 when the row was removed after it was read (P2025)', async () => {
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue({ id: ID_2, email: 'friend@gmail.com' });
    prismaMock.gateAllowedEmail.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.0.0',
      })
    );
    const response = await remove(ID_2);
    expect(response.status).toBe(404);
  });
});
