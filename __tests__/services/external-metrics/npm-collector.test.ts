import { NpmCollector } from '@/lib/services/external-metrics/npm-collector';
import { TechEntity, TechEntityType, MetricSource } from '@prisma/client';

// Mock global fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();
global.fetch = mockFetch;

afterAll(() => {
  global.fetch = originalFetch;
});

function createEntity(overrides: Partial<TechEntity> = {}): TechEntity {
  return {
    id: 'test-entity-1',
    name: 'React',
    type: TechEntityType.FRAMEWORK,
    aliases: [],
    description: null,
    firstSeenAt: null,
    lastSeenAt: null,
    mentionCount: 10,
    externalIds: { npm: 'react' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('NpmCollector', () => {
  let collector: NpmCollector;

  beforeEach(() => {
    collector = new NpmCollector();
    mockFetch.mockReset();
  });

  describe('source', () => {
    it('should be NPM_DOWNLOADS', () => {
      expect(collector.source).toBe(MetricSource.NPM_DOWNLOADS);
    });
  });

  describe('canCollect', () => {
    it('should return true when entity has npm externalId', () => {
      const entity = createEntity({ externalIds: { npm: 'react' } });
      expect(collector.canCollect(entity)).toBe(true);
    });

    it('should return false when entity has no externalIds', () => {
      const entity = createEntity({ externalIds: null });
      expect(collector.canCollect(entity)).toBe(false);
    });

    it('should return false when entity has externalIds without npm key', () => {
      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      expect(collector.canCollect(entity)).toBe(false);
    });
  });

  describe('collect', () => {
    it('should return download count on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          downloads: 18500000,
          start: '2026-02-10',
          end: '2026-02-16',
          package: 'react',
        }),
      });

      const entity = createEntity();
      const result = await collector.collect(entity);

      expect(result).not.toBeNull();
      expect(result!.value).toBe(18500000);
      expect(result!.measuredAt).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.npmjs.org/downloads/point/last-week/react',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'TechTrend-MetricsCollector',
          }),
        })
      );
    });

    it('should handle scoped packages correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ downloads: 500000 }),
      });

      const entity = createEntity({ externalIds: { npm: '@angular/core' } });
      await collector.collect(entity);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.npmjs.org/downloads/point/last-week/%40angular%2Fcore',
        expect.any(Object)
      );
    });

    it('should return null when entity has no npm externalId', async () => {
      const entity = createEntity({ externalIds: null });
      const result = await collector.collect(entity);
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null on API error (non-200)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const entity = createEntity();
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const entity = createEntity();
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });

    it('should return null when response has no downloads field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'package not found' }),
      });

      const entity = createEntity();
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });
  });
});
