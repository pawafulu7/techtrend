import { NextRequest } from 'next/server';
import { prisma } from '@/lib/database';
import { invalidateUserAuthCache } from '@/lib/auth/user-auth-cache';

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));
jest.mock('@/lib/auth/user-auth-cache');

jest.mock('@/lib/database', () => ({
  prisma: {
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    userDeletionLog: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/middleware/csrf-protection', () => ({
  withCSRFProtection: jest.fn((handler: any) => handler),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: any) => handler),
}));

jest.mock('@/lib/middleware/with-admin-auth', () => ({
  withAdminAuth: jest.fn((handler: any) => {
    return (request: any, context: any) => {
      return handler(request, {
        ...context,
        session: {
          user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
        },
      });
    };
  }),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockInvalidateCache = invalidateUserAuthCache as jest.MockedFunction<
  typeof invalidateUserAuthCache
>;

describe('GET /api/admin/users', () => {
  let GET: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/users/route');
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns user list with correct fields', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        name: 'User One',
        email: 'one@test.com',
        role: 'user',
        image: null,
        createdAt: new Date('2026-03-01'),
        deletedAt: null,
      },
      {
        id: 'user-2',
        name: 'User Two',
        email: 'two@test.com',
        role: 'admin',
        image: 'https://example.com/img.png',
        createdAt: new Date('2026-02-01'),
        deletedAt: null,
      },
    ];

    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

    const request = new NextRequest('http://localhost/api/admin/users');
    const response = await GET(request, {});
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.users).toHaveLength(2);
    expect(data.users[0]).toHaveProperty('id');
    expect(data.users[0]).toHaveProperty('name');
    expect(data.users[0]).toHaveProperty('email');
    expect(data.users[0]).toHaveProperty('role');
    expect(data.users[0]).toHaveProperty('createdAt');
    expect(data.users[0]).toHaveProperty('deletedAt');
  });

  it('queries with orderBy createdAt desc', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/admin/users');
    await GET(request, {});

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});

describe('PATCH /api/admin/users/[id]', () => {
  let PATCH: any;

  beforeAll(async () => {
    const mod = await import('@/app/api/admin/users/[id]/route');
    PATCH = mod.PATCH;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateCache.mockResolvedValue(undefined);
  });

  function createRequest(body: object) {
    return new NextRequest('http://localhost/api/admin/users/user-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function createContext(userId: string = 'user-1') {
    return { params: Promise.resolve({ id: userId }) };
  }

  describe('changeRole', () => {
    it('successfully changes role from user to admin', async () => {
      const targetUser = {
        id: 'user-1',
        email: 'user@test.com',
        role: 'user',
        deletedAt: null,
      };
      const updatedUser = {
        id: 'user-1',
        name: 'User',
        email: 'user@test.com',
        role: 'admin',
        createdAt: new Date(),
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const request = createRequest({ action: 'changeRole', role: 'admin' });
      const response = await PATCH(request, createContext());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.role).toBe('admin');
      expect(mockInvalidateCache).toHaveBeenCalledWith('user-1');
    });

    it('successfully changes role from admin to user with FOR UPDATE check', async () => {
      const targetUser = {
        id: 'user-2',
        email: 'admin2@test.com',
        role: 'admin',
        deletedAt: null,
      };
      const updatedUser = {
        id: 'user-2',
        name: 'Admin Two',
        email: 'admin2@test.com',
        role: 'user',
        createdAt: new Date(),
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
          user: {
            update: jest.fn().mockResolvedValue(updatedUser),
          },
        };
        return fn(tx);
      });

      const request = createRequest({ action: 'changeRole', role: 'user' });
      const response = await PATCH(request, createContext('user-2'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.role).toBe('user');
      expect(mockInvalidateCache).toHaveBeenCalledWith('user-2');
    });

    it('rejects self-demotion', async () => {
      const targetUser = {
        id: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);

      const request = createRequest({ action: 'changeRole', role: 'user' });
      const response = await PATCH(request, createContext('admin-1'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot change your own role');
    });

    it('rejects invalid role value', async () => {
      const request = createRequest({
        action: 'changeRole',
        role: 'superadmin',
      });
      const response = await PATCH(request, createContext());
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });

    it('returns 404 when user not found', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const request = createRequest({ action: 'changeRole', role: 'admin' });
      const response = await PATCH(request, createContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });

    it('prevents demotion of last admin', async () => {
      const targetUser = {
        id: 'user-2',
        email: 'admin2@test.com',
        role: 'admin',
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
          user: { update: jest.fn() },
        };
        return fn(tx);
      });

      const request = createRequest({ action: 'changeRole', role: 'user' });
      const response = await PATCH(request, createContext('user-2'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot demote the last admin');
    });
  });

  describe('deactivate', () => {
    it('successfully deactivates a user', async () => {
      const targetUser = {
        id: 'user-1',
        email: 'user@test.com',
        role: 'user',
        deletedAt: null,
      };
      const updatedUser = {
        id: 'user-1',
        name: 'User',
        email: 'user@test.com',
        role: 'user',
        createdAt: new Date(),
        deletedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue(updatedUser) },
          userDeletionLog: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const request = createRequest({ action: 'deactivate' });
      const response = await PATCH(request, createContext());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.deletedAt).not.toBeNull();
      expect(mockInvalidateCache).toHaveBeenCalledWith('user-1');
    });

    it('creates UserDeletionLog with deletedBy=admin and adminUserId', async () => {
      const targetUser = {
        id: 'user-1',
        email: 'user@test.com',
        role: 'user',
        deletedAt: null,
      };
      const updatedUser = {
        id: 'user-1',
        name: 'User',
        email: 'user@test.com',
        role: 'user',
        createdAt: new Date(),
        deletedAt: new Date(),
      };

      let capturedDeletionLog: any;
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue(updatedUser) },
          userDeletionLog: {
            create: jest.fn().mockImplementation((args) => {
              capturedDeletionLog = args;
              return {};
            }),
          },
        };
        return fn(tx);
      });

      const request = createRequest({
        action: 'deactivate',
        reason: 'Violated ToS',
      });
      const response = await PATCH(request, createContext());
      expect(response.status).toBe(200);

      expect(capturedDeletionLog.data).toEqual(
        expect.objectContaining({
          userId: 'user-1',
          email: 'user@test.com',
          reason: 'Violated ToS',
          deletedBy: 'admin',
          adminUserId: 'admin-1',
        })
      );
    });

    it('rejects self-deactivation', async () => {
      const targetUser = {
        id: 'admin-1',
        email: 'admin@test.com',
        role: 'admin',
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);

      const request = createRequest({ action: 'deactivate' });
      const response = await PATCH(request, createContext('admin-1'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot deactivate your own account');
    });

    it('prevents deactivation of last admin', async () => {
      const targetUser = {
        id: 'user-2',
        email: 'admin2@test.com',
        role: 'admin',
        deletedAt: null,
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-2' }]),
          user: { update: jest.fn() },
          userDeletionLog: { create: jest.fn() },
        };
        return fn(tx);
      });

      const request = createRequest({ action: 'deactivate' });
      const response = await PATCH(request, createContext('user-2'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Cannot deactivate the last admin');
    });

    it('allows deactivation of admin when multiple admins exist', async () => {
      const targetUser = {
        id: 'user-2',
        email: 'admin2@test.com',
        role: 'admin',
        deletedAt: null,
      };
      const updatedUser = {
        id: 'user-2',
        name: 'Admin Two',
        email: 'admin2@test.com',
        role: 'admin',
        createdAt: new Date(),
        deletedAt: new Date(),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'user-2' }]),
          user: { update: jest.fn().mockResolvedValue(updatedUser) },
          userDeletionLog: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const request = createRequest({ action: 'deactivate' });
      const response = await PATCH(request, createContext('user-2'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.deletedAt).not.toBeNull();
    });

    it('rejects already deactivated user', async () => {
      const targetUser = {
        id: 'user-1',
        email: 'user@test.com',
        role: 'user',
        deletedAt: new Date('2026-01-01'),
      };

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(targetUser);

      const request = createRequest({ action: 'deactivate' });
      const response = await PATCH(request, createContext());
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('User is already deactivated');
    });
  });
});
