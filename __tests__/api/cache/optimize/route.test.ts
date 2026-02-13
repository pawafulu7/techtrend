import { GET, POST } from '@/app/api/cache/optimize/route';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    __esModule: true,
    default: mockLogger,
  };
});

jest.mock('@/lib/cache/memory-optimizer', () => ({
  memoryOptimizer: {
    getStatus: jest.fn().mockResolvedValue({ memoryUsage: 100 }),
    optimizeManual: jest.fn().mockResolvedValue(undefined),
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(),
  },
}));

jest.mock('@/lib/cache/cache-warmer', () => ({
  cacheWarmer: {
    getStatus: jest.fn().mockReturnValue({ isRunning: false }),
    warmManual: jest.fn().mockResolvedValue(undefined),
    startPeriodicWarming: jest.fn(),
    stopPeriodicWarming: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

function createRequest(method: string, body?: Record<string, unknown>) {
  const url = 'http://localhost:3000/api/cache/optimize';
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

describe('/api/cache/optimize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('GET should return 401 without authentication', async () => {
      mockAuth.mockResolvedValue(null as any);
      const request = createRequest('GET');
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('POST should return 401 without authentication', async () => {
      mockAuth.mockResolvedValue(null as any);
      const request = createRequest('POST', { action: 'optimize' });
      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('GET should succeed with ADMIN session', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      } as any);
      const request = createRequest('GET');
      const response = await GET(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('optimizer');
      expect(data).toHaveProperty('warmer');
    });

    it('GET should succeed with CRON_SECRET', async () => {
      const originalEnv = process.env.CRON_SECRET;
      process.env.CRON_SECRET = 'test-cron-secret';
      try {
        mockAuth.mockResolvedValue(null as any);

        const request = new NextRequest('http://localhost:3000/api/cache/optimize', {
          method: 'GET',
          headers: { Authorization: 'Bearer test-cron-secret' },
        });
        const response = await GET(request);
        expect(response.status).toBe(200);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.CRON_SECRET;
        } else {
          process.env.CRON_SECRET = originalEnv;
        }
      }
    });

    it('POST should succeed with ADMIN session and valid action', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      } as any);
      const request = createRequest('POST', { action: 'optimize' });
      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });

  describe('POST actions', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
      } as any);
    });

    it('should return 400 for invalid action', async () => {
      const request = createRequest('POST', { action: 'invalid' });
      const response = await POST(request);
      expect(response.status).toBe(400);
    });
  });
});
