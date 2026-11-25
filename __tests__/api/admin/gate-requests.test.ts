/**
 * GET /api/admin/gate-requests、POST /api/admin/gate-requests/[id]/approve、DELETE /api/admin/gate-requests/[id]
 *
 * 認証（withAdminAuth）・CSRF・レート制限は素通しにする（包み方は __tests__/api/auth-middleware-composition.test.ts、
 * 認証そのものは __tests__/lib/middleware/with-admin-auth.test.ts で確かめる）。
 * 本物の DB での許可（ロック・件数・削除）は __tests__/lib/auth/site-gate/allowlist-store.db.test.ts、
 * 通知メールの中身と失敗の扱いは __tests__/lib/auth/site-gate/approval-email.test.ts
 */
import { NextRequest } from 'next/server';
import type { SiteGateConfig } from '@/lib/auth/site-gate/config';
import type { GateApprovalNotification } from '@/lib/auth/site-gate/admin-types';

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

const mockSendGateApprovalEmail = jest.fn<Promise<GateApprovalNotification>, [string, string]>();
jest.mock('@/lib/auth/site-gate/approval-email', () => ({
  sendGateApprovalEmail: (email: string, siteOrigin: string) =>
    mockSendGateApprovalEmail(email, siteOrigin),
}));

// eslint-disable-next-line import/first
import { prisma } from '@/lib/prisma';
// eslint-disable-next-line import/first
import logger from '@/lib/logger';
// eslint-disable-next-line import/first
import { GET } from '@/app/api/admin/gate-requests/route';
// eslint-disable-next-line import/first
import { DELETE } from '@/app/api/admin/gate-requests/[id]/route';
// eslint-disable-next-line import/first
import { POST as APPROVE } from '@/app/api/admin/gate-requests/[id]/approve/route';

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

const ID_1 = 'ckgaterequest0000000000001';

function getList() {
  return (GET as Function)(new NextRequest('http://localhost/api/admin/gate-requests'));
}

function approve(id: string) {
  return (APPROVE as Function)(
    new NextRequest(`http://localhost/api/admin/gate-requests/${id}/approve`, { method: 'POST' }),
    { params: Promise.resolve({ id }) }
  );
}

function reject(id: string) {
  return (DELETE as Function)(
    new NextRequest(`http://localhost/api/admin/gate-requests/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSiteGateConfig.mockReturnValue(ENABLED);
  mockSendGateApprovalEmail.mockResolvedValue('sent');
  for (const method of ['findMany', 'findUnique', 'deleteMany']) {
    prismaMock.gateAccessRequest[method].mockReset();
  }
  for (const method of ['findUnique', 'count', 'create']) {
    prismaMock.gateAllowedEmail[method].mockReset();
  }
  prismaMock.$executeRaw.mockReset();
  prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(null);
  prismaMock.gateAllowedEmail.count.mockResolvedValue(0);
  prismaMock.gateAllowedEmail.create.mockResolvedValue({ id: 'allowed-1' });
  prismaMock.gateAccessRequest.deleteMany.mockResolvedValue({ count: 1 });
});

describe('GET /api/admin/gate-requests', () => {
  it('returns pending requests newest first, without caching', async () => {
    prismaMock.gateAccessRequest.findMany.mockResolvedValue([
      { id: 'r2', email: 'second@gmail.com', note: null, createdAt: new Date('2026-11-25T02:00:00Z') },
      { id: 'r1', email: 'first@gmail.com', note: '<b>鈴木</b>です', createdAt: new Date('2026-11-24T02:00:00Z') },
    ]);
    const response = await getList();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      requests: [
        { id: 'r2', email: 'second@gmail.com', note: null, createdAt: '2026-11-25T02:00:00.000Z' },
        // 備考は生の文字列のまま返す（画面が React のテキストとして出す）
        { id: 'r1', email: 'first@gmail.com', note: '<b>鈴木</b>です', createdAt: '2026-11-24T02:00:00.000Z' },
      ],
    });
    expect(prismaMock.gateAccessRequest.findMany).toHaveBeenCalledWith({
      select: { id: true, email: true, note: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  });

  it('returns 500 without leaking the DB error', async () => {
    prismaMock.gateAccessRequest.findMany.mockRejectedValue(new Error('db down at 10.0.0.1'));
    const response = await getList();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.1');
  });
});

describe('POST /api/admin/gate-requests/[id]/approve', () => {
  it('adds the address to the allowlist, removes the request and logs who approved', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    const response = await approve(ID_1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'approved',
      email: 'friend@gmail.com',
      notification: 'sent',
    });
    expect(prismaMock.gateAllowedEmail.create).toHaveBeenCalledWith({
      data: { email: 'friend@gmail.com', createdById: 'admin-1' },
      select: { id: true },
    });
    expect(prismaMock.gateAccessRequest.deleteMany).toHaveBeenCalledWith({
      where: { email: 'friend@gmail.com' },
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      { adminId: 'admin-1', requestId: ID_1, email: 'f***@gmail.com', status: 'approved' },
      expect.any(String)
    );
  });

  it('notifies the approved address once, after the allowlist change is committed', async () => {
    const steps: string[] = [];
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (client: typeof prismaMock) => Promise<unknown>) => {
        const result = await fn(prismaMock);
        steps.push('committed');
        return result;
      }
    );
    mockSendGateApprovalEmail.mockImplementation(async () => {
      steps.push('email');
      return 'sent';
    });
    await approve(ID_1);
    expect(steps).toEqual(['committed', 'email']);
    expect(mockSendGateApprovalEmail).toHaveBeenCalledTimes(1);
    // 宛先は許可したアドレス、リンク先は入口の設定の origin
    expect(mockSendGateApprovalEmail).toHaveBeenCalledWith(
      'friend@gmail.com',
      'http://localhost:3000'
    );
  });

  it('still succeeds when the notice could not be sent, and says so', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    mockSendGateApprovalEmail.mockResolvedValue('failed');
    const response = await approve(ID_1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'approved',
      email: 'friend@gmail.com',
      notification: 'failed',
    });
    expect(prismaMock.gateAllowedEmail.create).toHaveBeenCalledTimes(1);
  });

  it('still succeeds when sending the notice throws (the approval is already committed)', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    mockSendGateApprovalEmail.mockRejectedValue(new Error('unexpected at 10.0.0.1'));
    const response = await approve(ID_1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'approved',
      email: 'friend@gmail.com',
      notification: 'failed',
    });
  });

  it('runs the lock, the checks, the add and the removal in one transaction', async () => {
    const steps: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
        steps.push(`lock:${strings.join('?')}`);
        return 1;
      }),
      gateAccessRequest: {
        findUnique: jest.fn(async () => {
          steps.push('request');
          return { email: 'friend@gmail.com' };
        }),
        deleteMany: jest.fn(async () => {
          steps.push('remove-request');
          return { count: 1 };
        }),
      },
      gateAllowedEmail: {
        findUnique: jest.fn(async () => {
          steps.push('listed?');
          return null;
        }),
        count: jest.fn(async () => {
          steps.push('count');
          return 0;
        }),
        create: jest.fn(async () => {
          steps.push('add');
          return { id: 'allowed-1' };
        }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    );
    const response = await approve(ID_1);
    expect(response.status).toBe(200);
    expect(steps).toEqual([
      'lock:SELECT pg_advisory_xact_lock(?)',
      'request',
      'listed?',
      'count',
      'add',
      'remove-request',
    ]);
    expect(prismaMock.$transaction.mock.calls[0][1]).toMatchObject({
      isolationLevel: 'ReadCommitted',
    });
    expect(tx.gateAllowedEmail.count).toHaveBeenCalledWith({
      where: { email: { notIn: ['owner@gmail.com'] } },
    });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
  });

  it.each([
    ['is fixed by the environment', 'owner@gmail.com', null],
    ['is already listed', 'friend@gmail.com', { id: 'allowed-0' }],
  ])('only removes the request when the address %s', async (_label, email, listed) => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email });
    prismaMock.gateAllowedEmail.findUnique.mockResolvedValue(listed);
    const response = await approve(ID_1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'already_allowed',
      email,
      notification: 'none',
    });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.deleteMany).toHaveBeenCalledWith({ where: { email } });
    // 本人はすでに入れる。申請は他人がアドレスを入力して置いたものでありうるので、メールは送らない
    expect(mockSendGateApprovalEmail).not.toHaveBeenCalled();
  });

  it('keeps the request when the allowlist is full', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    prismaMock.gateAllowedEmail.count.mockResolvedValue(100);
    const response = await approve(ID_1);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'LIST_FULL' });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
    expect(prismaMock.gateAccessRequest.deleteMany).not.toHaveBeenCalled();
    expect(mockSendGateApprovalEmail).not.toHaveBeenCalled();
  });

  it('is 404 when the request was already handled', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
    const response = await approve(ID_1);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'REQUEST_NOT_FOUND' });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
    // 2 回押しても、2 回目は申請が無いのでメールは出ない
    expect(mockSendGateApprovalEmail).not.toHaveBeenCalled();
  });

  it.each(['a'.repeat(129)])('is 404 for an id that cannot exist (%p)', async (id) => {
    const response = await approve(id);
    expect(response.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('works when the gate is disabled (no fixed addresses)', async () => {
    mockGetSiteGateConfig.mockReturnValue({ kind: 'disabled' });
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'owner@gmail.com' });
    const response = await approve(ID_1);
    // 入口が無効なら誰でも入れるので、メールは送らない
    expect(await response.json()).toEqual({
      status: 'approved',
      email: 'owner@gmail.com',
      notification: 'none',
    });
    expect(prismaMock.gateAllowedEmail.count).toHaveBeenCalledWith({ where: undefined });
    expect(mockSendGateApprovalEmail).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking the DB error', async () => {
    prismaMock.gateAccessRequest.findUnique.mockRejectedValue(new Error('db down at 10.0.0.1'));
    const response = await approve(ID_1);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.1');
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('10.0.0.1');
    expect(mockSendGateApprovalEmail).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/gate-requests/[id]', () => {
  it('removes the request without touching the allowlist and logs who rejected', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue({ email: 'friend@gmail.com' });
    const response = await reject(ID_1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(prismaMock.gateAccessRequest.deleteMany).toHaveBeenCalledWith({ where: { id: ID_1 } });
    expect(prismaMock.gateAllowedEmail.create).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      { adminId: 'admin-1', requestId: ID_1, email: 'f***@gmail.com' },
      expect.any(String)
    );
  });

  it('is 404 when the request does not exist', async () => {
    prismaMock.gateAccessRequest.findUnique.mockResolvedValue(null);
    const response = await reject(ID_1);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'REQUEST_NOT_FOUND' });
    expect(prismaMock.gateAccessRequest.deleteMany).not.toHaveBeenCalled();
  });

  it('reads and removes the request in one transaction under the same lock as approving', async () => {
    // ロックが無いと、許可が申請を読んだ直後の却下が成功し、却下したのに許可される
    const steps: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
        steps.push(`lock:${strings.join('?')}`);
        return 1;
      }),
      gateAccessRequest: {
        findUnique: jest.fn(async () => {
          steps.push('request');
          return { email: 'friend@gmail.com' };
        }),
        deleteMany: jest.fn(async () => {
          steps.push('remove-request');
          return { count: 1 };
        }),
      },
    };
    prismaMock.$transaction.mockImplementationOnce(
      async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
    );
    const response = await reject(ID_1);
    expect(response.status).toBe(200);
    expect(steps).toEqual(['lock:SELECT pg_advisory_xact_lock(?)', 'request', 'remove-request']);
    expect(typeof tx.$executeRaw.mock.calls[0][1]).toBe('bigint');
    expect(prismaMock.gateAccessRequest.deleteMany).not.toHaveBeenCalled();
  });

  it('is 404 for an id that cannot exist', async () => {
    const response = await reject('a'.repeat(129));
    expect(response.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 500 without leaking the DB error', async () => {
    prismaMock.gateAccessRequest.findUnique.mockRejectedValue(new Error('db down at 10.0.0.1'));
    const response = await reject(ID_1);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.1');
  });
});
