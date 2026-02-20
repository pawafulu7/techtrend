/**
 * /api/tech-map/health endpoint tests
 * /api/tech-map/entities/[id]/health endpoint tests
 *
 * Note: @/lib/prisma and @/lib/cache/redis-cache are auto-mocked via
 * moduleNameMapper in jest.config.node.js. We override TechHealthService
 * with jest.mock() to have fine-grained control over mock return values.
 */

// ---------- Mock factories (jest.mock calls are hoisted) ----------

jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/cache/redis-cache', () => {
  const _get = jest.fn().mockResolvedValue(null);
  const _set = jest.fn().mockResolvedValue(undefined);
  const _genKey = jest.fn((...args: unknown[]) => {
    // Return unique keys based on all arguments to prevent cross-test cache collisions
    return `mock-cache-key:${JSON.stringify(args)}`;
  });
  return {
    __esModule: true,
    RedisCache: jest.fn().mockImplementation(() => ({
      generateCacheKey: _genKey,
      get: _get,
      set: _set,
    })),
    _testMockGet: _get,
    _testMockSet: _set,
  };
});

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_configKey: string, handler: Function) => handler),
}));

jest.mock('@/lib/services/tech-health-service', () => {
  const _getLatestHealth = jest.fn();
  const _getHealthHistory = jest.fn();
  const _getEntity = jest.fn();
  return {
    __esModule: true,
    TechHealthService: jest.fn(() => ({
      getLatestHealth: _getLatestHealth,
      getHealthHistory: _getHealthHistory,
      getEntity: _getEntity,
    })),
    _testMockGetLatestHealth: _getLatestHealth,
    _testMockGetHealthHistory: _getHealthHistory,
    _testMockGetEntity: _getEntity,
  };
});

// ---------- Imports ----------

import { NextRequest } from 'next/server';

// Import route handlers AFTER mocks
const { GET: getHealthList } = require('@/app/api/tech-map/health/route');
const entityHealthModule = require('@/app/api/tech-map/entities/[id]/health/route');
const getEntityHealth = entityHealthModule.GET;

// Get mock references via requireMock
const {
  _testMockGetLatestHealth: mockGetLatestHealth,
  _testMockGetHealthHistory: mockGetHealthHistory,
  _testMockGetEntity: mockGetEntity,
} = jest.requireMock('@/lib/services/tech-health-service');
const { _testMockGet: mockCacheGet, _testMockSet: mockCacheSet } =
  jest.requireMock('@/lib/cache/redis-cache');

// ---------- Test data ----------

const mockHealthData = [
  {
    entityId: 'entity-1',
    entityName: 'React',
    entityType: 'FRAMEWORK',
    axes: {
      communityActivity: { value: 55, available: true },
      developmentVelocity: { value: 45, available: true },
      articleAttention: { value: 60, available: true },
      adoptionBreadth: { value: 40, available: true },
    },
    overallHealth: 50.5,
    calculatedAt: '2026-02-20T00:00:00.000Z',
  },
];

const mockHistoryData = [
  {
    calculatedAt: '2026-02-01T00:00:00.000Z',
    communityActivity: 50,
    developmentVelocity: 40,
    articleAttention: 55,
    adoptionBreadth: 35,
    overallHealth: 45,
  },
  {
    calculatedAt: '2026-02-10T00:00:00.000Z',
    communityActivity: 55,
    developmentVelocity: 45,
    articleAttention: 60,
    adoptionBreadth: 40,
    overallHealth: 50,
  },
];

// ---------- Health List Tests ----------

describe('GET /api/tech-map/health', () => {
  beforeEach(() => {
    mockGetLatestHealth.mockReset();
    mockCacheGet.mockReset().mockResolvedValue(null);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
  });

  it('returns health list with default params', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: mockHealthData, total: 1 });
    const request = new NextRequest(new URL('http://localhost/api/tech-map/health'));
    const response = await getHealthList(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.offset).toBe(0);
  });

  it('passes sort and order params to service', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?sort=communityActivity&order=asc')
    );
    await getHealthList(request);
    expect(mockGetLatestHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 'communityActivity',
        order: 'asc',
      })
    );
  });

  it('passes search param to service', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?search=React')
    );
    await getHealthList(request);
    expect(mockGetLatestHealth).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'React' })
    );
  });

  it('passes score range params to service', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?minScore=20&maxScore=80')
    );
    await getHealthList(request);
    expect(mockGetLatestHealth).toHaveBeenCalledWith(
      expect.objectContaining({ minScore: 20, maxScore: 80 })
    );
  });

  it('handles pagination params', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?limit=10&offset=5')
    );
    await getHealthList(request);
    expect(mockGetLatestHealth).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5 })
    );
  });

  it('clamps limit to 1-50 range', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: [], total: 0 });
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?limit=999')
    );
    const response = await getHealthList(request);
    const data = await response.json();
    expect(data.limit).toBe(50);
  });

  it('returns 400 for invalid sort field', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?sort=invalid')
    );
    const response = await getHealthList(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid sort');
  });

  it('returns 400 for invalid order', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/health?order=invalid')
    );
    const response = await getHealthList(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid order');
  });

  it('returns cached response when available', async () => {
    const cachedData = { data: mockHealthData, total: 1, limit: 20, offset: 0 };
    mockCacheGet.mockResolvedValue(cachedData);
    const request = new NextRequest(new URL('http://localhost/api/tech-map/health'));
    const response = await getHealthList(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(mockGetLatestHealth).not.toHaveBeenCalled();
  });

  it('includes nested axes in response', async () => {
    mockGetLatestHealth.mockResolvedValue({ data: mockHealthData, total: 1 });
    const request = new NextRequest(new URL('http://localhost/api/tech-map/health'));
    const response = await getHealthList(request);
    const data = await response.json();
    const item = data.data[0];
    expect(item.axes).toBeDefined();
    expect(item.axes.communityActivity).toEqual({ value: 55, available: true });
    expect(item.axes.developmentVelocity).toEqual({ value: 45, available: true });
    expect(item.axes.articleAttention).toEqual({ value: 60, available: true });
    expect(item.axes.adoptionBreadth).toEqual({ value: 40, available: true });
    expect(item.overallHealth).toBe(50.5);
  });
});

// ---------- Entity Health Tests ----------
// Uses unique entity IDs per test to prevent cache key collisions
// caused by fire-and-forget cache.set() from previous tests.

describe('GET /api/tech-map/entities/[id]/health', () => {
  beforeEach(() => {
    mockGetEntity.mockReset();
    mockGetHealthHistory.mockReset();
    mockCacheGet.mockReset().mockResolvedValue(null);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
  });

  it('returns health history for valid entity', async () => {
    mockGetEntity.mockResolvedValue({ id: 'e-history', name: 'React', type: 'FRAMEWORK' });
    mockGetHealthHistory.mockResolvedValue(mockHistoryData);

    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-history/health')
    );
    const response = await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-history' }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entity.id).toBe('e-history');
    expect(data.entity.name).toBe('React');
    expect(data.history).toHaveLength(2);
  });

  it('returns 404 for non-existent entity', async () => {
    mockGetEntity.mockResolvedValue(null);

    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-404/health')
    );
    const response = await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-404' }),
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('not found');
  });

  it('clamps days upper bound to 365', async () => {
    mockGetEntity.mockResolvedValue({ id: 'e-upper', name: 'React', type: 'FRAMEWORK' });
    mockGetHealthHistory.mockResolvedValue([]);

    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-upper/health?days=999')
    );
    await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-upper' }),
    });
    expect(mockGetHealthHistory).toHaveBeenCalledWith('e-upper', 365);
  });

  it('clamps days lower bound to 7', async () => {
    mockGetEntity.mockResolvedValue({ id: 'e-lower', name: 'React', type: 'FRAMEWORK' });
    mockGetHealthHistory.mockResolvedValue([]);

    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-lower/health?days=1')
    );
    await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-lower' }),
    });
    expect(mockGetHealthHistory).toHaveBeenCalledWith('e-lower', 7);
  });

  it('defaults days to 30', async () => {
    mockGetEntity.mockResolvedValue({ id: 'e-default', name: 'React', type: 'FRAMEWORK' });
    mockGetHealthHistory.mockResolvedValue([]);

    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-default/health')
    );
    const response = await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-default' }),
    });
    expect(response.status).toBe(200);
    expect(mockGetHealthHistory).toHaveBeenCalledWith('e-default', 30);
  });

  it('returns 500 when service throws', async () => {
    mockGetEntity.mockRejectedValue(new Error('DB failure'));
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/e-err/health')
    );
    const response = await getEntityHealth(request, {
      params: Promise.resolve({ id: 'e-err' }),
    });
    expect(response.status).toBe(500);
  });

  it('returns 400 for overly long entity ID', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/tech-map/entities/x/health')
    );
    // Test with overly long ID (>50 chars)
    const longId = 'a'.repeat(51);
    const response = await getEntityHealth(request, {
      params: Promise.resolve({ id: longId }),
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Entity ID is required');
  });

  // Cache behavior for entity health endpoint follows the same pattern as
  // the health list tests above: RedisCache mock with generateCacheKey + get/set.
  // Entity-specific cache key generation uses unique entity IDs per test
  // to prevent cross-test collisions from fire-and-forget cache.set().
});
