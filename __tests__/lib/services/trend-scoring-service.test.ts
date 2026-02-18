/**
 * TrendScoringService Tests
 */

// Mock implementations
const mockFindUniqueOrThrow = jest.fn();
const mockMentionCount = jest.fn();
const mockExternalMetricFindMany = jest.fn();
const mockFindMany = jest.fn();
const mockUpsert = jest.fn();
const mockTrendScoreFindFirst = jest.fn();
const mockTrendScoreFindMany = jest.fn();
const mockTrendScoreCount = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => ({
      techEntity: {
        findUniqueOrThrow: mockFindUniqueOrThrow,
        findMany: mockFindMany,
      },
      articleTechMention: {
        count: mockMentionCount,
      },
      externalMetric: {
        findMany: mockExternalMetricFindMany,
      },
      techTrendScore: {
        upsert: mockUpsert,
        findFirst: mockTrendScoreFindFirst,
        findMany: mockTrendScoreFindMany,
        count: mockTrendScoreCount,
      },
    })),
    TechMaturityStage: {
      EMERGING: 'EMERGING',
      RISING: 'RISING',
      ESTABLISHED: 'ESTABLISHED',
      DECLINING: 'DECLINING',
    },
  };
});

import { PrismaClient } from '@prisma/client';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';

describe('TrendScoringService', () => {
  let service: TrendScoringService;
  let prisma: PrismaClient;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new TrendScoringService(prisma);
  });

  describe('calculateScore', () => {
    const baseEntity = {
      id: 'entity-1',
      name: 'React',
      type: 'FRAMEWORK',
      mentionCount: 100,
      firstSeenAt: new Date('2020-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return correct TrendScoreResult structure', async () => {
      mockFindUniqueOrThrow.mockResolvedValue(baseEntity);
      mockMentionCount.mockResolvedValue(10);
      mockExternalMetricFindMany.mockResolvedValue([]);

      const result = await service.calculateScore('entity-1');

      expect(result).toHaveProperty('entityId', 'entity-1');
      expect(result).toHaveProperty('entityName', 'React');
      expect(result).toHaveProperty('entityType', 'FRAMEWORK');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('calculatedAt');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should handle entity with all metrics available', async () => {
      mockFindUniqueOrThrow.mockResolvedValue(baseEntity);
      // Recent mentions: 20, Previous mentions: 10
      mockMentionCount.mockResolvedValueOnce(20).mockResolvedValueOnce(10);

      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      mockExternalMetricFindMany.mockResolvedValue([
        { source: 'GITHUB_STARS', value: 5000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 4000, measuredAt: fortyFiveDaysAgo },
        { source: 'NPM_DOWNLOADS', value: 100000, measuredAt: fifteenDaysAgo },
        { source: 'NPM_DOWNLOADS', value: 80000, measuredAt: fortyFiveDaysAgo },
        { source: 'SO_QUESTIONS', value: 500, measuredAt: fifteenDaysAgo },
        { source: 'SO_QUESTIONS', value: 400, measuredAt: fortyFiveDaysAgo },
      ]);

      const result = await service.calculateScore('entity-1');

      expect(result.components.articleMentionGrowth).toBe(100);
      expect(result.components.githubStarsGrowth).toBe(25);
      expect(result.components.npmDownloadsGrowth).toBe(25);
      expect(result.components.soQuestionsGrowth).toBe(25);
      expect(result.score).toBeGreaterThan(50);
    });

    it('should handle entity with missing external metrics (weight redistribution)', async () => {
      mockFindUniqueOrThrow.mockResolvedValue(baseEntity);
      mockMentionCount.mockResolvedValueOnce(15).mockResolvedValueOnce(10);
      // No external metrics at all
      mockExternalMetricFindMany.mockResolvedValue([]);

      const result = await service.calculateScore('entity-1');

      // Only articleMentionGrowth should be non-zero
      expect(result.components.githubStarsGrowth).toBe(0);
      expect(result.components.npmDownloadsGrowth).toBe(0);
      expect(result.components.soQuestionsGrowth).toBe(0);
      // articleMentionGrowth = (15-10)/10*100 = 50%
      expect(result.components.articleMentionGrowth).toBe(50);
      // Score should still be valid (weight redistributed to article mention)
      expect(result.score).toBeGreaterThan(0);
    });

    it('should classify DECLINING stage correctly', async () => {
      const entity = {
        ...baseEntity,
        mentionCount: 100,
        firstSeenAt: new Date('2020-01-01'),
      };
      mockFindUniqueOrThrow.mockResolvedValue(entity);
      // Recent mentions: 5, Previous: 20 -> growth = (5-20)/20*100 = -75%
      mockMentionCount.mockResolvedValueOnce(5).mockResolvedValueOnce(20);

      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      // Negative npm downloads growth
      mockExternalMetricFindMany.mockResolvedValue([
        { source: 'NPM_DOWNLOADS', value: 50000, measuredAt: fifteenDaysAgo },
        {
          source: 'NPM_DOWNLOADS',
          value: 100000,
          measuredAt: fortyFiveDaysAgo,
        },
        { source: 'GITHUB_STARS', value: 3000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 4000, measuredAt: fortyFiveDaysAgo },
      ]);

      const result = await service.calculateScore('entity-1');

      // articleMentionGrowth < -10 AND (npmDownloads < 0 OR githubStars < 0)
      expect(result.stage).toBe('DECLINING');
    });

    it('should classify EMERGING stage correctly', async () => {
      // Entity first seen recently (< 90 days)
      const recentEntity = {
        ...baseEntity,
        mentionCount: 5,
        firstSeenAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      };
      mockFindUniqueOrThrow.mockResolvedValue(recentEntity);
      // Positive but moderate growth: (8-5)/5*100 = 60% -- wait, needs to be <= RISING_ARTICLE_GROWTH (20)
      // (11-10)/10*100 = 10%
      mockMentionCount.mockResolvedValueOnce(11).mockResolvedValueOnce(10);
      mockExternalMetricFindMany.mockResolvedValue([]);

      const result = await service.calculateScore('entity-1');

      expect(result.stage).toBe('EMERGING');
    });

    it('should classify RISING stage correctly', async () => {
      const entity = {
        ...baseEntity,
        mentionCount: 30,
        firstSeenAt: new Date('2024-01-01'), // Not recent
      };
      mockFindUniqueOrThrow.mockResolvedValue(entity);
      // Article growth > 20%: (15-10)/10*100 = 50%
      mockMentionCount.mockResolvedValueOnce(15).mockResolvedValueOnce(10);

      const now = Date.now();
      const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000);

      // External growth > 10%
      mockExternalMetricFindMany.mockResolvedValue([
        { source: 'GITHUB_STARS', value: 6000, measuredAt: fifteenDaysAgo },
        { source: 'GITHUB_STARS', value: 5000, measuredAt: fortyFiveDaysAgo },
        { source: 'NPM_DOWNLOADS', value: 120000, measuredAt: fifteenDaysAgo },
        {
          source: 'NPM_DOWNLOADS',
          value: 100000,
          measuredAt: fortyFiveDaysAgo,
        },
      ]);

      const result = await service.calculateScore('entity-1');

      // articleMentionGrowth > 20 AND (githubStarsGrowth > 10 OR npmDownloadsGrowth > 10)
      expect(result.stage).toBe('RISING');
    });

    it('should classify ESTABLISHED stage correctly', async () => {
      const entity = {
        ...baseEntity,
        mentionCount: 100, // >= ESTABLISHED_MENTION_COUNT (50)
        firstSeenAt: new Date('2020-01-01'),
      };
      mockFindUniqueOrThrow.mockResolvedValue(entity);
      // Low article growth: (11-10)/10*100 = 10% (< 20 = RISING_ARTICLE_GROWTH)
      mockMentionCount.mockResolvedValueOnce(11).mockResolvedValueOnce(10);
      mockExternalMetricFindMany.mockResolvedValue([]);

      const result = await service.calculateScore('entity-1');

      expect(result.stage).toBe('ESTABLISHED');
    });
  });

  describe('calculateAllScores', () => {
    it('should process all entities with mentionCount > 0', async () => {
      mockFindMany.mockResolvedValue([{ id: 'entity-1' }, { id: 'entity-2' }]);

      // For each entity: findUniqueOrThrow, 2x mentionCount, externalMetric
      const baseEntity = {
        id: 'entity-1',
        name: 'React',
        type: 'FRAMEWORK',
        mentionCount: 50,
        firstSeenAt: new Date('2020-01-01'),
      };

      mockFindUniqueOrThrow
        .mockResolvedValueOnce({ ...baseEntity, id: 'entity-1', name: 'React' })
        .mockResolvedValueOnce({
          ...baseEntity,
          id: 'entity-2',
          name: 'Vue',
        });

      mockMentionCount.mockResolvedValue(10);
      mockExternalMetricFindMany.mockResolvedValue([]);
      mockUpsert.mockResolvedValue({});

      const result = await service.calculateAllScores();

      expect(result.calculated).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { mentionCount: { gt: 0 } },
        select: { id: true },
      });
      expect(mockUpsert).toHaveBeenCalledTimes(2);
    });

    it('should handle individual entity errors gracefully', async () => {
      mockFindMany.mockResolvedValue([
        { id: 'entity-1' },
        { id: 'entity-2' },
        { id: 'entity-3' },
      ]);

      const baseEntity = {
        id: 'entity-1',
        name: 'React',
        type: 'FRAMEWORK',
        mentionCount: 50,
        firstSeenAt: new Date('2020-01-01'),
      };

      mockFindUniqueOrThrow
        .mockResolvedValueOnce(baseEntity)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          ...baseEntity,
          id: 'entity-3',
          name: 'Angular',
        });

      mockMentionCount.mockResolvedValue(10);
      mockExternalMetricFindMany.mockResolvedValue([]);
      mockUpsert.mockResolvedValue({});

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await service.calculateAllScores();

      expect(result.calculated).toBe(2);
      expect(result.errors).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should return { calculated: 0, errors: 0 } when no entities exist', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await service.calculateAllScores();

      expect(result).toEqual({ calculated: 0, errors: 0 });
    });
  });

  describe('getLatestScores', () => {
    const mockDate = new Date('2026-02-18');

    it('should return scores with pagination', async () => {
      mockTrendScoreFindFirst.mockResolvedValue({
        calculatedAt: mockDate,
      });

      const mockRecords = [
        {
          score: 85.5,
          articleMentionGrowth: 50,
          githubStarsGrowth: 20,
          npmDownloadsGrowth: 15,
          soQuestionsGrowth: 10,
          stage: 'RISING',
          calculatedAt: mockDate,
          entity: { id: 'entity-1', name: 'React', type: 'FRAMEWORK' },
        },
      ];

      mockTrendScoreFindMany.mockResolvedValue(mockRecords);
      mockTrendScoreCount.mockResolvedValue(1);

      const result = await service.getLatestScores({
        limit: 10,
        offset: 0,
      });

      expect(result.scores).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.scores[0]).toEqual({
        entityId: 'entity-1',
        entityName: 'React',
        entityType: 'FRAMEWORK',
        score: 85.5,
        components: {
          articleMentionGrowth: 50,
          githubStarsGrowth: 20,
          npmDownloadsGrowth: 15,
          soQuestionsGrowth: 10,
        },
        stage: 'RISING',
        calculatedAt: mockDate.toISOString(),
      });
    });

    it('should filter by stage', async () => {
      mockTrendScoreFindFirst.mockResolvedValue({
        calculatedAt: mockDate,
      });
      mockTrendScoreFindMany.mockResolvedValue([]);
      mockTrendScoreCount.mockResolvedValue(0);

      await service.getLatestScores({ stage: 'RISING' as never });

      expect(mockTrendScoreFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: 'RISING',
          }),
        })
      );
    });

    it('should return empty result when no scores exist', async () => {
      mockTrendScoreFindFirst.mockResolvedValue(null);

      const result = await service.getLatestScores();

      expect(result).toEqual({ scores: [], total: 0 });
    });

    it('should sort by score by default (desc)', async () => {
      mockTrendScoreFindFirst.mockResolvedValue({
        calculatedAt: mockDate,
      });
      mockTrendScoreFindMany.mockResolvedValue([]);
      mockTrendScoreCount.mockResolvedValue(0);

      await service.getLatestScores();

      expect(mockTrendScoreFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { score: 'desc' },
        })
      );
    });

    it('should sort by name when specified', async () => {
      mockTrendScoreFindFirst.mockResolvedValue({
        calculatedAt: mockDate,
      });
      mockTrendScoreFindMany.mockResolvedValue([]);
      mockTrendScoreCount.mockResolvedValue(0);

      await service.getLatestScores({ sort: 'name' });

      expect(mockTrendScoreFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { entity: { name: 'asc' } },
        })
      );
    });

    it('should cap limit at 100', async () => {
      mockTrendScoreFindFirst.mockResolvedValue({
        calculatedAt: mockDate,
      });
      mockTrendScoreFindMany.mockResolvedValue([]);
      mockTrendScoreCount.mockResolvedValue(0);

      await service.getLatestScores({ limit: 500 });

      expect(mockTrendScoreFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('getScoreHistory', () => {
    it('should return history within date range', async () => {
      const mockHistory = [
        {
          id: 'score-1',
          entityId: 'entity-1',
          score: 75,
          articleMentionGrowth: 30,
          githubStarsGrowth: 10,
          npmDownloadsGrowth: 15,
          soQuestionsGrowth: 5,
          stage: 'RISING',
          calculatedAt: new Date('2026-01-01'),
        },
        {
          id: 'score-2',
          entityId: 'entity-1',
          score: 80,
          articleMentionGrowth: 35,
          githubStarsGrowth: 12,
          npmDownloadsGrowth: 18,
          soQuestionsGrowth: 8,
          stage: 'RISING',
          calculatedAt: new Date('2026-02-01'),
        },
      ];

      mockTrendScoreFindMany.mockResolvedValue(mockHistory);

      const result = await service.getScoreHistory('entity-1', 90);

      expect(result).toHaveLength(2);
      expect(mockTrendScoreFindMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          calculatedAt: { gte: expect.any(Date) },
        },
        orderBy: { calculatedAt: 'asc' },
      });
    });

    it('should default to 90 days', async () => {
      mockTrendScoreFindMany.mockResolvedValue([]);

      await service.getScoreHistory('entity-1');

      const call = mockTrendScoreFindMany.mock.calls[0][0];
      const sinceDate = call.where.calculatedAt.gte as Date;
      const daysAgo = Math.round(
        (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysAgo).toBe(90);
    });

    it('should return empty array when no history exists', async () => {
      mockTrendScoreFindMany.mockResolvedValue([]);

      const result = await service.getScoreHistory('entity-1');

      expect(result).toEqual([]);
    });
  });
});
