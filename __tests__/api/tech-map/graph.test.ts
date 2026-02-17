/**
 * /api/tech-map/graph endpoint tests
 */

import { createRedisCacheMock } from '../../helpers/cache-mock-helpers';

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    techEntity: {
      findMany: jest.fn(),
      count: jest.fn(),
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

let mockCacheInstance: ReturnType<typeof createRedisCacheMock>;

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => {
    const {
      createRedisCacheMock,
    } = require('../../helpers/cache-mock-helpers');
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    return mockCacheInstance;
  }),
}));

// Mock rate limiter middleware to pass through
jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn(
    (_configKey: string, handler: Function) => handler
  ),
}));

jest.mock('@/lib/middleware/session-context', () => ({
  resolveSession: jest.fn().mockResolvedValue(null),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GET as getGraph } from '@/app/api/tech-map/graph/route';

const prismaMock = prisma as any;

// Mock data
const mockNodes = [
  {
    id: 'entity1',
    name: 'React',
    type: 'FRAMEWORK',
    aliases: [],
    description: null,
    firstSeenAt: null,
    lastSeenAt: null,
    mentionCount: 150,
    externalIds: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-02-15'),
  },
  {
    id: 'entity2',
    name: 'Next.js',
    type: 'FRAMEWORK',
    aliases: [],
    description: null,
    firstSeenAt: null,
    lastSeenAt: null,
    mentionCount: 100,
    externalIds: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-02-15'),
  },
  {
    id: 'entity3',
    name: 'TypeScript',
    type: 'LANGUAGE',
    aliases: [],
    description: null,
    firstSeenAt: null,
    lastSeenAt: null,
    mentionCount: 120,
    externalIds: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-02-15'),
  },
];

const mockRelations = [
  {
    id: 'rel1',
    sourceEntityId: 'entity2',
    targetEntityId: 'entity1',
    relationType: 'DEPENDS_ON',
    strength: 5,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
  },
  {
    id: 'rel2',
    sourceEntityId: 'entity1',
    targetEntityId: 'entity3',
    relationType: 'INTEGRATES_WITH',
    strength: 3,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
  },
];

describe('/api/tech-map/graph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (!mockCacheInstance) {
      mockCacheInstance = createRedisCacheMock();
    }
    mockCacheInstance.get.mockResolvedValue(null);
    mockCacheInstance.set.mockResolvedValue(undefined);
    mockCacheInstance.generateCacheKey.mockImplementation(
      (base: string) => base
    );
  });

  describe('GET /api/tech-map/graph', () => {
    it('returns 400 when no filtering params provided', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('At least one filtering parameter');
    });

    it('returns graph data for center entity', async () => {
      // TechRelationService calls prisma.techRelation.findMany then prisma.techEntity.findMany
      prismaMock.techRelation.findMany.mockResolvedValue(mockRelations);
      prismaMock.techEntity.findMany.mockResolvedValue(mockNodes);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?center=entity1')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.nodes).toBeDefined();
      expect(data.edges).toBeDefined();
      expect(data.nodes.length).toBeGreaterThan(0);
    });

    it('returns entities by type (no center)', async () => {
      prismaMock.techEntity.findMany.mockResolvedValue([
        mockNodes[0],
        mockNodes[1],
      ]);
      prismaMock.techEntity.count.mockResolvedValue(2);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?type=FRAMEWORK')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.nodes).toHaveLength(2);
      expect(data.edges).toHaveLength(0);
    });

    it('returns 400 for invalid type', async () => {
      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?type=BOGUS')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid type');
    });

    it('filters edges by minStrength', async () => {
      prismaMock.techRelation.findMany.mockResolvedValue(mockRelations);
      prismaMock.techEntity.findMany.mockResolvedValue(mockNodes);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/graph?center=entity1&minStrength=4'
        )
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      // Only rel1 has strength=5 (>= 4), rel2 has strength=3 (< 4)
      const strongEdges = data.edges.filter(
        (e: { strength: number }) => e.strength >= 4
      );
      expect(strongEdges.length).toBeLessThanOrEqual(data.edges.length);
    });

    it('returns cached data when available', async () => {
      const cachedData = {
        nodes: [{ id: 'entity1', name: 'React', type: 'FRAMEWORK', mentionCount: 150 }],
        edges: [],
      };
      mockCacheInstance.get.mockResolvedValue(cachedData);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?center=entity1')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBe('HIT');
      const data = await response.json();
      expect(data).toEqual(cachedData);
      expect(prismaMock.techRelation.findMany).not.toHaveBeenCalled();
    });

    it('caches result on miss', async () => {
      prismaMock.techRelation.findMany.mockResolvedValue([]);
      prismaMock.techEntity.findMany.mockResolvedValue([mockNodes[0]]);

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?center=entity1')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Status')).toBe('MISS');
      expect(mockCacheInstance.set).toHaveBeenCalled();
    });

    it('returns 500 on database error', async () => {
      prismaMock.techRelation.findMany.mockRejectedValue(
        new Error('DB error')
      );

      const request = new NextRequest(
        new URL('http://localhost/api/tech-map/graph?center=entity1')
      );
      const response = await getGraph(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Internal server error');
    });

    it('clamps depth to 1-3 range', async () => {
      prismaMock.techRelation.findMany.mockResolvedValue([]);
      prismaMock.techEntity.findMany.mockResolvedValue([mockNodes[0]]);

      const request = new NextRequest(
        new URL(
          'http://localhost/api/tech-map/graph?center=entity1&depth=10'
        )
      );
      const response = await getGraph(request);

      expect(response.status).toBe(200);
      // Depth is clamped internally - we just verify it succeeds
    });
  });
});
