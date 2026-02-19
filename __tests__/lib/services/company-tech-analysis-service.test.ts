/**
 * CompanyTechAnalysisService Tests
 */

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock implementations
const mockSourceGroupFindMany = jest.fn();
const mockSourceGroupFindUnique = jest.fn();
const mockArticleCount = jest.fn();
const mockArticleGroupBy = jest.fn();
const mockSourceFindMany = jest.fn();
const mockMentionGroupBy = jest.fn();
const mockMentionFindMany = jest.fn();
const mockTechEntityFindMany = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn(() => ({
      sourceGroup: {
        findMany: mockSourceGroupFindMany,
        findUnique: mockSourceGroupFindUnique,
      },
      article: {
        count: mockArticleCount,
        groupBy: mockArticleGroupBy,
      },
      source: {
        findMany: mockSourceFindMany,
      },
      articleTechMention: {
        groupBy: mockMentionGroupBy,
        findMany: mockMentionFindMany,
      },
      techEntity: {
        findMany: mockTechEntityFindMany,
      },
    })),
    TechEntityType: {
      FRAMEWORK: 'FRAMEWORK',
      LANGUAGE: 'LANGUAGE',
      TOOL: 'TOOL',
      CONCEPT: 'CONCEPT',
      PLATFORM: 'PLATFORM',
      LIBRARY: 'LIBRARY',
    },
  };
});

import { PrismaClient } from '@prisma/client';
import {
  CompanyTechAnalysisService,
  CompanyNotFoundError,
} from '@/lib/services/company-tech-analysis-service';

describe('CompanyTechAnalysisService', () => {
  let service: CompanyTechAnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    const prisma = new PrismaClient();
    service = new CompanyTechAnalysisService(prisma);
  });

  describe('getMatrix', () => {
    it('should generate company x technology matrix', async () => {
      // Step 1: SourceGroups with sources having articles
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 2 } },
        { id: 'group-2', name: 'Meta', _count: { sources: 1 } },
      ]);

      // Article counts per group (groupBy by sourceId)
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 30 } },
        { sourceId: 'src-2', _count: { id: 20 } },
        { sourceId: 'src-3', _count: { id: 30 } },
      ]);

      // Source -> Group mapping
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
        { id: 'src-2', groupId: 'group-1' },
        { id: 'src-3', groupId: 'group-2' },
      ]);

      // Step 2: Mention aggregates
      mockMentionGroupBy.mockResolvedValueOnce([
        { entityId: 'entity-react', _count: { id: 10 } },
        { entityId: 'entity-ts', _count: { id: 5 } },
      ]);

      // Step 3: Tech entity details
      mockTechEntityFindMany.mockResolvedValue([
        { id: 'entity-react', name: 'React', type: 'FRAMEWORK' },
        { id: 'entity-ts', name: 'TypeScript', type: 'LANGUAGE' },
      ]);

      // Raw mentions for per-company breakdown
      mockMentionFindMany.mockResolvedValue([
        {
          entityId: 'entity-react',
          article: { source: { groupId: 'group-1' } },
        },
        {
          entityId: 'entity-react',
          article: { source: { groupId: 'group-1' } },
        },
        {
          entityId: 'entity-react',
          article: { source: { groupId: 'group-2' } },
        },
        {
          entityId: 'entity-react',
          article: { source: { groupId: 'group-2' } },
        },
        {
          entityId: 'entity-ts',
          article: { source: { groupId: 'group-1' } },
        },
        {
          entityId: 'entity-ts',
          article: { source: { groupId: 'group-1' } },
        },
        {
          entityId: 'entity-ts',
          article: { source: { groupId: 'group-1' } },
        },
      ]);

      const result = await service.getMatrix();

      expect(result.companies).toHaveLength(2);
      expect(result.companies[0].name).toBe('Google'); // Higher article count first
      expect(result.technologies).toHaveLength(2);
      expect(result.matrix.length).toBeGreaterThan(0);

      // Check matrix entries exist for company-entity pairs with >= 2 mentions
      const googleReact = result.matrix.find(
        (m) => m.companyGroupId === 'group-1' && m.entityId === 'entity-react'
      );
      expect(googleReact).toBeDefined();
      expect(googleReact!.mentionCount).toBe(2);
    });

    it('should filter by minMentions', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);

      // With minMentions = 5, having filter applies
      mockMentionGroupBy.mockResolvedValueOnce([
        { entityId: 'entity-1', _count: { id: 6 } },
      ]);

      mockTechEntityFindMany.mockResolvedValue([
        { id: 'entity-1', name: 'React', type: 'FRAMEWORK' },
      ]);

      mockMentionFindMany.mockResolvedValue([
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'entity-1', article: { source: { groupId: 'group-1' } } },
      ]);

      const result = await service.getMatrix({ minMentions: 5 });

      expect(mockMentionGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          having: { id: { _count: { gte: 5 } } },
        })
      );
      expect(result.technologies).toHaveLength(1);
    });

    it('should respect companyLimit', async () => {
      // Return 3 companies but limit to 2
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'A', _count: { sources: 1 } },
        { id: 'group-2', name: 'B', _count: { sources: 1 } },
        { id: 'group-3', name: 'C', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 50 } },
        { sourceId: 'src-2', _count: { id: 30 } },
        { sourceId: 'src-3', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
        { id: 'src-2', groupId: 'group-2' },
        { id: 'src-3', groupId: 'group-3' },
      ]);

      mockMentionGroupBy.mockResolvedValueOnce([]);

      const result = await service.getMatrix({ companyLimit: 2 });

      expect(result.companies).toHaveLength(2);
      expect(result.companies[0].articleCount).toBe(50);
      expect(result.companies[1].articleCount).toBe(30);
    });

    it('should respect techLimit', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);

      // 3 entities but limit to 1
      mockMentionGroupBy.mockResolvedValueOnce([
        { entityId: 'e1', _count: { id: 10 } },
        { entityId: 'e2', _count: { id: 5 } },
        { entityId: 'e3', _count: { id: 3 } },
      ]);

      mockTechEntityFindMany.mockResolvedValue([
        { id: 'e1', name: 'React', type: 'FRAMEWORK' },
      ]);

      mockMentionFindMany.mockResolvedValue([
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
      ]);

      const result = await service.getMatrix({ techLimit: 1 });

      // Only top 1 entity by mention count should be returned
      expect(result.technologies).toHaveLength(1);
      expect(result.technologies[0].name).toBe('React');
    });

    it('should filter by entityTypes', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);

      mockMentionGroupBy.mockResolvedValueOnce([
        { entityId: 'e1', _count: { id: 5 } },
      ]);

      mockTechEntityFindMany.mockResolvedValue([
        { id: 'e1', name: 'React', type: 'FRAMEWORK' },
      ]);

      mockMentionFindMany.mockResolvedValue([
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
      ]);

      await service.getMatrix({ entityTypes: ['FRAMEWORK'] as any });

      // First groupBy call should include entity type filter
      expect(mockMentionGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity: { type: { in: ['FRAMEWORK'] } },
          }),
        })
      );
    });

    it('should return empty result when no companies have articles', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Empty', _count: { sources: 0 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);

      const result = await service.getMatrix();

      expect(result).toEqual({
        companies: [],
        technologies: [],
        matrix: [],
      });
    });

    it('should return empty technologies when no mentions meet threshold', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);
      mockMentionGroupBy.mockResolvedValueOnce([]); // No aggregates

      const result = await service.getMatrix();

      expect(result.companies).toHaveLength(1);
      expect(result.technologies).toEqual([]);
      expect(result.matrix).toEqual([]);
    });

    it('should skip mentions with null groupId', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        { id: 'group-1', name: 'Google', _count: { sources: 1 } },
      ]);
      mockArticleGroupBy.mockResolvedValue([
        { sourceId: 'src-1', _count: { id: 10 } },
      ]);
      mockSourceFindMany.mockResolvedValue([
        { id: 'src-1', groupId: 'group-1' },
      ]);
      mockMentionGroupBy.mockResolvedValueOnce([
        { entityId: 'e1', _count: { id: 3 } },
      ]);
      mockTechEntityFindMany.mockResolvedValue([
        { id: 'e1', name: 'React', type: 'FRAMEWORK' },
      ]);

      // Include mentions with null groupId
      mockMentionFindMany.mockResolvedValue([
        { entityId: 'e1', article: { source: { groupId: null } } },
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
        { entityId: 'e1', article: { source: { groupId: 'group-1' } } },
      ]);

      const result = await service.getMatrix();

      // Only group-1 mentions should be counted (2), meeting minMentions=2
      const entry = result.matrix.find(
        (m) => m.companyGroupId === 'group-1' && m.entityId === 'e1'
      );
      expect(entry).toBeDefined();
      expect(entry!.mentionCount).toBe(2);
    });
  });

  describe('getCompanyTimeline', () => {
    it('should return monthly technology timeline', async () => {
      mockSourceGroupFindUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Google',
      });

      mockMentionFindMany.mockResolvedValue([
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2026-01-15') },
        },
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2026-01-20') },
        },
        {
          entityId: 'e2',
          entity: { id: 'e2', name: 'TypeScript' },
          article: { publishedAt: new Date('2026-02-10') },
        },
      ]);

      const result = await service.getCompanyTimeline('group-1', 6);

      expect(result.company.groupId).toBe('group-1');
      expect(result.company.name).toBe('Google');
      expect(result.timeline).toHaveLength(2); // Jan and Feb

      const jan = result.timeline.find((t) => t.month === '2026-01');
      expect(jan).toBeDefined();
      expect(jan!.entities).toHaveLength(1);
      expect(jan!.entities[0].name).toBe('React');
      expect(jan!.entities[0].count).toBe(2);

      const feb = result.timeline.find((t) => t.month === '2026-02');
      expect(feb).toBeDefined();
      expect(feb!.entities[0].name).toBe('TypeScript');
    });

    it('should sort months chronologically', async () => {
      mockSourceGroupFindUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Google',
      });

      mockMentionFindMany.mockResolvedValue([
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2026-02-01') },
        },
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2025-12-01') },
        },
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2026-01-01') },
        },
      ]);

      const result = await service.getCompanyTimeline('group-1');

      expect(result.timeline[0].month).toBe('2025-12');
      expect(result.timeline[1].month).toBe('2026-01');
      expect(result.timeline[2].month).toBe('2026-02');
    });

    it('should throw CompanyNotFoundError for non-existent groupId', async () => {
      mockSourceGroupFindUnique.mockResolvedValue(null);

      await expect(service.getCompanyTimeline('nonexistent')).rejects.toThrow(
        CompanyNotFoundError
      );

      await expect(service.getCompanyTimeline('nonexistent')).rejects.toThrow(
        'Company (SourceGroup) not found: nonexistent'
      );
    });

    it('should skip mentions with null publishedAt', async () => {
      mockSourceGroupFindUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Google',
      });

      mockMentionFindMany.mockResolvedValue([
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: null },
        },
        {
          entityId: 'e1',
          entity: { id: 'e1', name: 'React' },
          article: { publishedAt: new Date('2026-01-15') },
        },
      ]);

      const result = await service.getCompanyTimeline('group-1');

      expect(result.timeline).toHaveLength(1);
      expect(result.timeline[0].entities[0].count).toBe(1);
    });

    it('should return empty timeline when no mentions', async () => {
      mockSourceGroupFindUnique.mockResolvedValue({
        id: 'group-1',
        name: 'Google',
      });

      mockMentionFindMany.mockResolvedValue([]);

      const result = await service.getCompanyTimeline('group-1');

      expect(result.timeline).toEqual([]);
    });
  });

  describe('getCompanyList', () => {
    it('should return companies sorted by articleCount descending', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        {
          id: 'group-1',
          name: 'Google',
          sources: [{ _count: { articles: 30 } }, { _count: { articles: 20 } }],
        },
        {
          id: 'group-2',
          name: 'Meta',
          sources: [{ _count: { articles: 60 } }],
        },
        {
          id: 'group-3',
          name: 'Apple',
          sources: [{ _count: { articles: 10 } }],
        },
      ]);

      const result = await service.getCompanyList();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Meta'); // 60 articles
      expect(result[0].articleCount).toBe(60);
      expect(result[1].name).toBe('Google'); // 50 articles
      expect(result[1].articleCount).toBe(50);
      expect(result[2].name).toBe('Apple'); // 10 articles
    });

    it('should exclude companies with zero articles', async () => {
      mockSourceGroupFindMany.mockResolvedValue([
        {
          id: 'group-1',
          name: 'Google',
          sources: [{ _count: { articles: 10 } }],
        },
        {
          id: 'group-2',
          name: 'Empty',
          sources: [{ _count: { articles: 0 } }],
        },
      ]);

      const result = await service.getCompanyList();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Google');
    });

    it('should return empty array when no groups exist', async () => {
      mockSourceGroupFindMany.mockResolvedValue([]);

      const result = await service.getCompanyList();

      expect(result).toEqual([]);
    });
  });
});
