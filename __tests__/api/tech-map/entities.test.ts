/**
 * /api/tech-map/entities endpoint tests
 * /api/tech-map/entities/[id] endpoint tests
 * /api/tech-map/entities/[id]/metrics endpoint tests
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    techEntity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    externalMetric: {
      findMany: jest.fn(),
    },
    techRelation: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/logger', () => {
  const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    __esModule: true,
    default: loggerMock,
    logger: loggerMock,
  };
});

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    generateCacheKey: jest.fn((base: string) => base),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock rate limiter middleware to pass through
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn(
    (_configKey: string, handler: Function) => handler
  ),
}));

// Mock session resolver
jest.mock('@/lib/middleware/session-context', () => ({
  resolveSession: jest.fn().mockResolvedValue(null),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Import route handlers - with rate limit mocked, these are the raw handlers
import { GET as getEntities } from '@/app/api/tech-map/entities/route';
import { GET as getEntityById } from '@/app/api/tech-map/entities/[id]/route';
import { GET as getEntityMetrics } from '@/app/api/tech-map/entities/[id]/metrics/route';

const prismaMock = prisma as any;

// Mock entity data
const mockEntities = [
  {
    id: 'entity1',
    name: 'React',
    type: 'FRAMEWORK',
    aliases: ['ReactJS'],
    description: 'A JavaScript library for building user interfaces',
    firstSeenAt: new Date('2025-01-01'),
    lastSeenAt: new Date('2026-02-15'),
    mentionCount: 150,
    externalIds: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-02-15'),
  },
  {
    id: 'entity2',
    name: 'TypeScript',
    type: 'LANGUAGE',
    aliases: ['TS'],
    description: 'A typed superset of JavaScript',
    firstSeenAt: new Date('2025-01-01'),
    lastSeenAt: new Date('2026-02-14'),
    mentionCount: 120,
    externalIds: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-02-14'),
  },
];

const mockMetrics = [
  {
    id: 'metric1',
    entityId: 'entity1',
    source: 'GITHUB_STARS',
    value: 230000,
    measuredAt: new Date('2026-02-15'),
    createdAt: new Date('2026-02-15'),
  },
  {
    id: 'metric2',
    entityId: 'entity1',
    source: 'NPM_DOWNLOADS',
    value: 50000000,
    measuredAt: new Date('2026-02-15'),
    createdAt: new Date('2026-02-15'),
  },
];

describe('/api/tech-map/entities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/tech-map/entities', () => {
    it('returns entities with default params', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue(mockEntities);
      prismaMock.techEntity.count.mockResolvedValue(2);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entities).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    it('filters by type', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue([mockEntities[0]]);
      prismaMock.techEntity.count.mockResolvedValue(1);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?type=FRAMEWORK')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entities).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('returns 400 for invalid type', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?type=INVALID')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid type');
    });

    it('returns 400 for invalid sort', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?sort=invalid')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid sort');
    });

    it('respects pagination params', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue([mockEntities[1]]);
      prismaMock.techEntity.count.mockResolvedValue(2);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?limit=1&offset=1')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entities).toHaveLength(1);
    });

    it('supports search query', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue([mockEntities[0]]);
      prismaMock.techEntity.count.mockResolvedValue(1);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?search=react')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entities).toHaveLength(1);
    });

    it('clamps limit to 1-100 range', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue([]);
      prismaMock.techEntity.count.mockResolvedValue(0);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities?limit=999')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(200);
      // The service is called with clamped limit
      expect(prismaMock.techEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it('returns 500 on database error', async () => {
      prismaMock.techEntity.findMany.mockRejectedValue(
        new Error('DB connection failed')
      );

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities')
      );
      const response = await getEntities(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('GET /api/tech-map/entities/[id]', () => {
    it('returns entity by id', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(mockEntities[0]);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities/entity1')
      );
      const response = await getEntityById(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entity.id).toBe('entity1');
      expect(data.entity.name).toBe('React');
    });

    it('returns 404 for non-existent entity', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities/nonexistent')
      );
      const response = await getEntityById(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Entity not found');
    });

    it('includes relations when requested', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(mockEntities[0]);
      prismaMock.techRelation.findMany.mockResolvedValue([]);
      prismaMock.techEntity.findMany.mockResolvedValue([mockEntities[0]]);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1?include=relations'
        )
      );
      const response = await getEntityById(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entity).toBeDefined();
      expect(data.relations).toBeDefined();
    });

    it('includes metrics when requested', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(mockEntities[0]);
      prismaMock.externalMetric.findMany.mockResolvedValue(mockMetrics);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1?include=metrics'
        )
      );
      const response = await getEntityById(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entity).toBeDefined();
      expect(data.recentMetrics).toHaveLength(2);
    });

    it('includes both relations and metrics', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(mockEntities[0]);
      prismaMock.techRelation.findMany.mockResolvedValue([]);
      prismaMock.techEntity.findMany.mockResolvedValue([mockEntities[0]]);
      prismaMock.externalMetric.findMany.mockResolvedValue(mockMetrics);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1?include=relations,metrics'
        )
      );
      const response = await getEntityById(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.entity).toBeDefined();
      expect(data.relations).toBeDefined();
      expect(data.recentMetrics).toBeDefined();
    });
  });

  describe('GET /api/tech-map/entities/[id]/metrics', () => {
    it('returns metrics for entity', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue({ id: 'entity1' });
      prismaMock.externalMetric.findMany.mockResolvedValue(mockMetrics);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities/entity1/metrics')
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.metrics).toHaveLength(2);
    });

    it('filters by source', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue({ id: 'entity1' });
      prismaMock.externalMetric.findMany.mockResolvedValue([mockMetrics[0]]);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1/metrics?source=GITHUB_STARS'
        )
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.metrics).toHaveLength(1);
    });

    it('returns 400 for invalid source', async () => {
      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1/metrics?source=INVALID'
        )
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid source');
    });

    it('returns 400 for invalid date format', async () => {
      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1/metrics?from=not-a-date'
        )
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid from date');
    });

    it('returns 404 for non-existent entity', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue(null);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/entities/nonexistent/metrics')
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'nonexistent' }),
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Entity not found');
    });

    it('filters by date range', async () => {
      prismaMock.techEntity.findUnique.mockResolvedValue({ id: 'entity1' });
      prismaMock.externalMetric.findMany.mockResolvedValue([mockMetrics[0]]);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/entities/entity1/metrics?from=2025-01-01&to=2026-02-17'
        )
      );
      const response = await getEntityMetrics(request, {
        params: Promise.resolve({ id: 'entity1' }),
      });

      expect(response.status).toBe(200);
      expect(prismaMock.externalMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity1',
            measuredAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });
});
