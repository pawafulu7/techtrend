/**
 * TechHealthService Tests
 */

// Mock logger
const mockLoggerError = jest.fn();
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock implementations
const mockEntityFindMany = jest.fn();
const mockMentionCount = jest.fn();
const mockMentionFindMany = jest.fn();
const mockExternalMetricFindMany = jest.fn();
const mockSourceGroupCount = jest.fn();
const mockHealthSnapshotUpsert = jest.fn();
const mockHealthSnapshotFindMany = jest.fn();
const mockHealthSnapshotCount = jest.fn();
const mockHealthSnapshotGroupBy = jest.fn();
const mockEntityFindUnique = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => ({
      techEntity: {
        findMany: mockEntityFindMany,
        findUnique: mockEntityFindUnique,
      },
      articleTechMention: {
        count: mockMentionCount,
        findMany: mockMentionFindMany,
      },
      externalMetric: {
        findMany: mockExternalMetricFindMany,
      },
      sourceGroup: {
        count: mockSourceGroupCount,
      },
      techHealthSnapshot: {
        upsert: mockHealthSnapshotUpsert,
        findMany: mockHealthSnapshotFindMany,
        count: mockHealthSnapshotCount,
        groupBy: mockHealthSnapshotGroupBy,
      },
    })),
    MetricSource: {
      GITHUB_STARS: 'GITHUB_STARS',
      NPM_DOWNLOADS: 'NPM_DOWNLOADS',
      SO_QUESTIONS: 'SO_QUESTIONS',
    },
    Prisma: {
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'PrismaClientInitializationError';
        }
      },
      PrismaClientRustPanicError: class PrismaClientRustPanicError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'PrismaClientRustPanicError';
        }
      },
    },
  };
});

import { PrismaClient } from '@prisma/client';
import { TechHealthService } from '@/lib/services/tech-health-service';

describe('TechHealthService', () => {
  let service: TechHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prisma = new PrismaClient();
    service = new TechHealthService(prisma);
  });

  describe('computeHealth', () => {
    // Helper to set up all 4 data sources as available
    function setupAllDataSources() {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      // articleAttention: recent=20, previous=10
      mockMentionCount.mockResolvedValueOnce(20).mockResolvedValueOnce(10);

      // adoptionBreadth: 3 source groups total, entity in 2
      mockSourceGroupCount.mockResolvedValue(3);
      mockMentionFindMany.mockResolvedValue([
        { article: { source: { groupId: 'g1' } } },
        { article: { source: { groupId: 'g2' } } },
        { article: { source: { groupId: 'g1' } } }, // duplicate
      ]);

      // communityActivity + developmentVelocity via externalMetric
      // First call: communityActivity (GITHUB_STARS + SO_QUESTIONS)
      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'GITHUB_STARS', value: 5000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 4000, measuredAt: fortyFiveDaysAgo },
        { source: 'SO_QUESTIONS', value: 500, measuredAt: fifteenDaysAgo },
        { source: 'SO_QUESTIONS', value: 400, measuredAt: fortyFiveDaysAgo },
      ]);
      // Second call: developmentVelocity (NPM_DOWNLOADS)
      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'NPM_DOWNLOADS', value: 100000, measuredAt: fifteenDaysAgo },
        { source: 'NPM_DOWNLOADS', value: 80000, measuredAt: fortyFiveDaysAgo },
      ]);
    }

    it('should return correct structure with all 4 data sources available', async () => {
      setupAllDataSources();

      const result = await service.computeHealth('entity-1');

      expect(result).toHaveProperty('axes');
      expect(result).toHaveProperty('overallHealth');
      expect(result.axes.articleAttention).toHaveProperty('value');
      expect(result.axes.articleAttention).toHaveProperty('available');
      expect(result.axes.articleAttention.available).toBe(true);
      expect(result.axes.adoptionBreadth.available).toBe(true);
      expect(result.axes.communityActivity.available).toBe(true);
      expect(result.axes.developmentVelocity.available).toBe(true);
      expect(result.overallHealth).toBeGreaterThan(0);
    });

    it('should handle some ExternalMetric missing with weight redistribution', async () => {
      // articleAttention: available
      mockMentionCount.mockResolvedValueOnce(15).mockResolvedValueOnce(10);

      // adoptionBreadth: available
      mockSourceGroupCount.mockResolvedValue(5);
      mockMentionFindMany.mockResolvedValue([
        { article: { source: { groupId: 'g1' } } },
      ]);

      // communityActivity: no external metrics -> unavailable
      mockExternalMetricFindMany.mockResolvedValueOnce([]);
      // developmentVelocity: no external metrics -> unavailable
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.communityActivity.available).toBe(false);
      expect(result.axes.communityActivity.value).toBe(0);
      expect(result.axes.developmentVelocity.available).toBe(false);
      expect(result.axes.developmentVelocity.value).toBe(0);

      // articleAttention and adoptionBreadth still available
      expect(result.axes.articleAttention.available).toBe(true);
      expect(result.axes.adoptionBreadth.available).toBe(true);

      // overallHealth should still be > 0 (redistributed weights)
      expect(result.overallHealth).toBeGreaterThan(0);
    });

    it('should distinguish true zero vs missing data', async () => {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      // articleAttention: 0 recent and 0 previous -> unavailable
      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      // adoptionBreadth: has source groups but no mentions -> unavailable
      mockSourceGroupCount.mockResolvedValue(5);
      mockMentionFindMany.mockResolvedValue([]);

      // communityActivity: has data with zero growth -> available with non-50 value
      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'GITHUB_STARS', value: 1000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 1000, measuredAt: fortyFiveDaysAgo },
      ]);
      // developmentVelocity: no data -> unavailable
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      // True zero growth: available but sigmoid(0) = 50
      expect(result.axes.communityActivity.available).toBe(true);
      expect(result.axes.communityActivity.value).toBe(50);

      // Missing data: unavailable
      expect(result.axes.articleAttention.available).toBe(false);
      expect(result.axes.developmentVelocity.available).toBe(false);
    });

    it('should return overallHealth = 0 when all axes are unavailable', async () => {
      // No article mentions
      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      // No source groups
      mockSourceGroupCount.mockResolvedValue(0);
      // No external metrics
      mockExternalMetricFindMany.mockResolvedValueOnce([]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.articleAttention.available).toBe(false);
      expect(result.axes.adoptionBreadth.available).toBe(false);
      expect(result.axes.communityActivity.available).toBe(false);
      expect(result.axes.developmentVelocity.available).toBe(false);
      expect(result.overallHealth).toBe(0);
    });

    it('should handle communityActivity with GitHub only', async () => {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockSourceGroupCount.mockResolvedValue(0);

      // Only GitHub stars, no SO_QUESTIONS
      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'GITHUB_STARS', value: 5000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 4000, measuredAt: fortyFiveDaysAgo },
      ]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.communityActivity.available).toBe(true);
      expect(result.axes.communityActivity.value).toBeGreaterThan(50);
    });

    it('should handle communityActivity with SO only', async () => {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockSourceGroupCount.mockResolvedValue(0);

      // Only SO_QUESTIONS, no GITHUB_STARS
      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'SO_QUESTIONS', value: 300, measuredAt: fifteenDaysAgo },
        { source: 'SO_QUESTIONS', value: 200, measuredAt: fortyFiveDaysAgo },
      ]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.communityActivity.available).toBe(true);
      expect(result.axes.communityActivity.value).toBeGreaterThan(50);
    });

    it('should handle communityActivity with both GitHub and SO', async () => {
      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockSourceGroupCount.mockResolvedValue(0);

      mockExternalMetricFindMany.mockResolvedValueOnce([
        { source: 'GITHUB_STARS', value: 5000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 4000, measuredAt: fortyFiveDaysAgo },
        { source: 'SO_QUESTIONS', value: 300, measuredAt: fifteenDaysAgo },
        { source: 'SO_QUESTIONS', value: 200, measuredAt: fortyFiveDaysAgo },
      ]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.communityActivity.available).toBe(true);
      // Average of two growth rates, then sigmoid
      expect(result.axes.communityActivity.value).toBeGreaterThan(50);
    });

    it('should handle communityActivity with neither GitHub nor SO', async () => {
      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockSourceGroupCount.mockResolvedValue(0);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.communityActivity.available).toBe(false);
      expect(result.axes.communityActivity.value).toBe(0);
    });

    it('should handle adoptionBreadth with totalSourceGroups = 0', async () => {
      mockMentionCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockSourceGroupCount.mockResolvedValue(0);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);
      mockExternalMetricFindMany.mockResolvedValueOnce([]);

      const result = await service.computeHealth('entity-1');

      expect(result.axes.adoptionBreadth.available).toBe(false);
      expect(result.axes.adoptionBreadth.value).toBe(0);
    });
  });

  describe('calculateAllHealth', () => {
    it('should process entities in batches with mixed success/failure', async () => {
      mockEntityFindMany.mockResolvedValue([
        { id: 'entity-1' },
        { id: 'entity-2' },
        { id: 'entity-3' },
      ]);

      // Spy on calculateHealth to control per-entity behavior
      const calculateHealthSpy = jest.spyOn(service, 'calculateHealth');
      const mockResult = {
        axes: {
          articleAttention: { value: 50, available: true },
          adoptionBreadth: { value: 30, available: true },
          communityActivity: { value: 40, available: true },
          developmentVelocity: { value: 35, available: true },
        },
        overallHealth: 40,
      };

      calculateHealthSpy
        .mockResolvedValueOnce(mockResult) // entity-1: success
        .mockRejectedValueOnce(new Error('DB error')) // entity-2: failure
        .mockResolvedValueOnce(mockResult); // entity-3: success

      const result = await service.calculateAllHealth();

      expect(result.calculated).toBe(2);
      expect(result.errors).toBe(1);
      expect(mockLoggerError).toHaveBeenCalled();

      calculateHealthSpy.mockRestore();
    });

    it('should filter entities with mentionCount > 0', async () => {
      mockEntityFindMany.mockResolvedValue([]);

      const result = await service.calculateAllHealth();

      expect(result).toEqual({ calculated: 0, errors: 0 });
      expect(mockEntityFindMany).toHaveBeenCalledWith({
        where: { mentionCount: { gt: 0 } },
        select: { id: true },
      });
    });
  });

  describe('saveSnapshot', () => {
    it('should upsert with UTC date normalization', async () => {
      mockHealthSnapshotUpsert.mockResolvedValue({});

      const result = {
        axes: {
          articleAttention: { value: 60, available: true },
          adoptionBreadth: { value: 40, available: true },
          communityActivity: { value: 55, available: true },
          developmentVelocity: { value: 45, available: true },
        },
        overallHealth: 50.5,
      };

      const calculatedAt = new Date(Date.UTC(2026, 1, 20)); // 2026-02-20 UTC midnight

      await service.saveSnapshot('entity-1', result, calculatedAt);

      expect(mockHealthSnapshotUpsert).toHaveBeenCalledWith({
        where: {
          entityId_calculatedAt: {
            entityId: 'entity-1',
            calculatedAt: calculatedAt,
          },
        },
        create: {
          entityId: 'entity-1',
          communityActivity: 55,
          developmentVelocity: 45,
          articleAttention: 60,
          adoptionBreadth: 40,
          overallHealth: 50.5,
          calculatedAt: calculatedAt,
        },
        update: {
          communityActivity: 55,
          developmentVelocity: 45,
          articleAttention: 60,
          adoptionBreadth: 40,
          overallHealth: 50.5,
        },
      });
    });
  });

  describe('getLatestHealth', () => {
    const mockDate = new Date('2026-02-20');

    it('should return data with filtering, sorting, and pagination', async () => {
      mockHealthSnapshotGroupBy.mockResolvedValue([
        { entityId: 'entity-1', _max: { calculatedAt: mockDate } },
      ]);

      const mockRecords = [
        {
          communityActivity: 55,
          developmentVelocity: 45,
          articleAttention: 60,
          adoptionBreadth: 40,
          overallHealth: 50.5,
          calculatedAt: mockDate,
          entity: { id: 'entity-1', name: 'React', type: 'FRAMEWORK' },
        },
      ];

      mockHealthSnapshotFindMany.mockResolvedValue(mockRecords);
      mockHealthSnapshotCount.mockResolvedValue(1);

      const result = await service.getLatestHealth({
        sort: 'overallHealth',
        order: 'desc',
        limit: 10,
        offset: 0,
        minScore: 30,
        maxScore: 80,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0]).toEqual({
        entityId: 'entity-1',
        entityName: 'React',
        entityType: 'FRAMEWORK',
        axes: {
          communityActivity: 55,
          developmentVelocity: 45,
          articleAttention: 60,
          adoptionBreadth: 40,
        },
        overallHealth: 50.5,
        calculatedAt: mockDate.toISOString(),
      });
    });

    it('should handle search parameter', async () => {
      mockHealthSnapshotGroupBy.mockResolvedValue([
        { entityId: 'entity-1', _max: { calculatedAt: mockDate } },
      ]);
      mockHealthSnapshotFindMany.mockResolvedValue([]);
      mockHealthSnapshotCount.mockResolvedValue(0);

      await service.getLatestHealth({ search: 'React' });

      expect(mockHealthSnapshotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity: {
              name: { contains: 'React', mode: 'insensitive' },
            },
          }),
        })
      );
    });

    it('should sort by different axes', async () => {
      mockHealthSnapshotGroupBy.mockResolvedValue([
        { entityId: 'entity-1', _max: { calculatedAt: mockDate } },
      ]);
      mockHealthSnapshotFindMany.mockResolvedValue([]);
      mockHealthSnapshotCount.mockResolvedValue(0);

      await service.getLatestHealth({
        sort: 'communityActivity',
        order: 'asc',
      });

      expect(mockHealthSnapshotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { communityActivity: 'asc' },
        })
      );
    });

    it('should return empty result when no snapshots exist', async () => {
      mockHealthSnapshotGroupBy.mockResolvedValue([]);

      const result = await service.getLatestHealth();

      expect(result).toEqual({ data: [], total: 0 });
    });

    it('should cap limit at 50', async () => {
      mockHealthSnapshotGroupBy.mockResolvedValue([
        { entityId: 'entity-1', _max: { calculatedAt: mockDate } },
      ]);
      mockHealthSnapshotFindMany.mockResolvedValue([]);
      mockHealthSnapshotCount.mockResolvedValue(0);

      await service.getLatestHealth({ limit: 200 });

      expect(mockHealthSnapshotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('getHealthHistory', () => {
    it('should return history within date range', async () => {
      const mockHistory = [
        {
          communityActivity: 50,
          developmentVelocity: 40,
          articleAttention: 55,
          adoptionBreadth: 35,
          overallHealth: 45,
          calculatedAt: new Date('2026-02-01'),
        },
        {
          communityActivity: 55,
          developmentVelocity: 45,
          articleAttention: 60,
          adoptionBreadth: 40,
          overallHealth: 50,
          calculatedAt: new Date('2026-02-10'),
        },
      ];

      mockHealthSnapshotFindMany.mockResolvedValue(mockHistory);

      const result = await service.getHealthHistory('entity-1', 30);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        calculatedAt: new Date('2026-02-01').toISOString(),
        communityActivity: 50,
        developmentVelocity: 40,
        articleAttention: 55,
        adoptionBreadth: 35,
        overallHealth: 45,
      });
      expect(mockHealthSnapshotFindMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          calculatedAt: { gte: expect.any(Date) },
        },
        orderBy: { calculatedAt: 'asc' },
      });
    });

    it('should return empty array when no history exists', async () => {
      mockHealthSnapshotFindMany.mockResolvedValue([]);

      const result = await service.getHealthHistory('entity-1');

      expect(result).toEqual([]);
    });
  });

  describe('getEntity', () => {
    it('should return entity when found', async () => {
      const mockEntity = { id: 'entity-1', name: 'React', type: 'FRAMEWORK' };
      mockEntityFindUnique.mockResolvedValue(mockEntity);

      const result = await service.getEntity('entity-1');

      expect(result).toEqual(mockEntity);
      expect(mockEntityFindUnique).toHaveBeenCalledWith({
        where: { id: 'entity-1' },
        select: { id: true, name: true, type: true },
      });
    });

    it('should return null when entity not found', async () => {
      mockEntityFindUnique.mockResolvedValue(null);

      const result = await service.getEntity('nonexistent');

      expect(result).toBeNull();
    });
  });
});
