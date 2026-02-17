/**
 * TechEntityService Tests
 *
 * Uses manual Prisma mocks to test entity CRUD, alias-aware lookup,
 * mention tracking, and stats refresh.
 */

import { TechEntityType, MentionSentiment } from '@prisma/client';
import { TechEntityService } from '../../lib/services/tech-entity-service';

// --- Mock Prisma Client ---

function createMockPrisma() {
  return {
    techEntity: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    articleTechMention: {
      upsert: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('TechEntityService', () => {
  let mockPrisma: MockPrisma;
  let service: TechEntityService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TechEntityService(mockPrisma as any);
  });

  // -------------------------------------------------------------------------
  // findOrCreate
  // -------------------------------------------------------------------------
  describe('findOrCreate', () => {
    const baseData = {
      name: 'React',
      type: TechEntityType.FRAMEWORK,
    };

    it('should return existing entity found by name', async () => {
      const existing = { id: 'e1', name: 'React', type: 'FRAMEWORK' };
      mockPrisma.techEntity.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreate(baseData);

      expect(result).toEqual(existing);
      expect(mockPrisma.techEntity.findUnique).toHaveBeenCalledWith({
        where: { name: 'React' },
      });
      expect(mockPrisma.techEntity.create).not.toHaveBeenCalled();
    });

    it('should return existing entity found by alias', async () => {
      const existing = {
        id: 'e2',
        name: 'React.js',
        type: 'FRAMEWORK',
        aliases: ['React', 'ReactJS'],
      };
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(existing);

      const result = await service.findOrCreate(baseData);

      expect(result).toEqual(existing);
      expect(mockPrisma.techEntity.findFirst).toHaveBeenCalledWith({
        where: { aliases: { has: 'React' } },
      });
      expect(mockPrisma.techEntity.create).not.toHaveBeenCalled();
    });

    it('should create new entity when not found by name or alias', async () => {
      const created = {
        id: 'e3',
        name: 'React',
        type: 'FRAMEWORK',
        aliases: ['ReactJS'],
        description: 'A UI library',
      };
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(null);
      mockPrisma.techEntity.create.mockResolvedValue(created);

      const result = await service.findOrCreate({
        ...baseData,
        aliases: ['ReactJS'],
        description: 'A UI library',
      });

      expect(result).toEqual(created);
      expect(mockPrisma.techEntity.create).toHaveBeenCalledWith({
        data: {
          name: 'React',
          type: 'FRAMEWORK',
          aliases: ['ReactJS'],
          description: 'A UI library',
          externalIds: undefined,
        },
      });
    });

    it('should create with externalIds when provided', async () => {
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(null);
      mockPrisma.techEntity.create.mockResolvedValue({ id: 'e4' });

      await service.findOrCreate({
        ...baseData,
        externalIds: { github: 'facebook/react' },
      });

      expect(mockPrisma.techEntity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          externalIds: { github: 'facebook/react' },
        }),
      });
    });

    it('should default aliases to empty array and description to null', async () => {
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(null);
      mockPrisma.techEntity.create.mockResolvedValue({ id: 'e5' });

      await service.findOrCreate(baseData);

      expect(mockPrisma.techEntity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aliases: [],
          description: null,
        }),
      });
    });
  });

  // -------------------------------------------------------------------------
  // findByName
  // -------------------------------------------------------------------------
  describe('findByName', () => {
    it('should return entity found by exact name', async () => {
      const entity = { id: 'e1', name: 'TypeScript' };
      mockPrisma.techEntity.findUnique.mockResolvedValue(entity);

      const result = await service.findByName('TypeScript');

      expect(result).toEqual(entity);
      expect(mockPrisma.techEntity.findFirst).not.toHaveBeenCalled();
    });

    it('should fall back to alias search when name not found', async () => {
      const entity = { id: 'e2', name: 'TypeScript', aliases: ['TS'] };
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(entity);

      const result = await service.findByName('TS');

      expect(result).toEqual(entity);
      expect(mockPrisma.techEntity.findFirst).toHaveBeenCalledWith({
        where: { aliases: { has: 'TS' } },
      });
    });

    it('should return null when not found by name or alias', async () => {
      mockPrisma.techEntity.findUnique.mockResolvedValue(null);
      mockPrisma.techEntity.findFirst.mockResolvedValue(null);

      const result = await service.findByName('NonExistent');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // search
  // -------------------------------------------------------------------------
  describe('search', () => {
    it('should search with query and default options', async () => {
      const entities = [{ id: 'e1', name: 'React', mentionCount: 10 }];
      mockPrisma.techEntity.findMany.mockResolvedValue(entities);
      mockPrisma.techEntity.count.mockResolvedValue(1);

      const result = await service.search('React');

      expect(result).toEqual({ entities, total: 1 });
      expect(mockPrisma.techEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { mentionCount: 'desc' },
        })
      );
    });

    it('should apply type filter', async () => {
      mockPrisma.techEntity.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.count.mockResolvedValue(0);

      await service.search('React', { type: TechEntityType.FRAMEWORK });

      const callArgs = mockPrisma.techEntity.findMany.mock.calls[0][0];
      expect(callArgs.where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'FRAMEWORK' }),
        ])
      );
    });

    it('should apply pagination', async () => {
      mockPrisma.techEntity.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.count.mockResolvedValue(50);

      await service.search('', { limit: 10, offset: 20 });

      expect(mockPrisma.techEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 })
      );
    });

    it('should sort by name when specified', async () => {
      mockPrisma.techEntity.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.count.mockResolvedValue(0);

      await service.search('', { sort: 'name' });

      expect(mockPrisma.techEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } })
      );
    });

    it('should sort by lastSeenAt when specified', async () => {
      mockPrisma.techEntity.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.count.mockResolvedValue(0);

      await service.search('', { sort: 'lastSeenAt' });

      expect(mockPrisma.techEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { lastSeenAt: 'desc' } })
      );
    });
  });

  // -------------------------------------------------------------------------
  // addMention
  // -------------------------------------------------------------------------
  describe('addMention', () => {
    it('should upsert a mention with default sentiment', async () => {
      mockPrisma.articleTechMention.upsert.mockResolvedValue({});

      await service.addMention({
        articleId: 'a1',
        entityId: 'e1',
      });

      expect(mockPrisma.articleTechMention.upsert).toHaveBeenCalledWith({
        where: {
          articleId_entityId: { articleId: 'a1', entityId: 'e1' },
        },
        create: {
          articleId: 'a1',
          entityId: 'e1',
          context: null,
          sentiment: 'NEUTRAL',
        },
        update: {},
      });
    });

    it('should upsert with provided context and sentiment', async () => {
      mockPrisma.articleTechMention.upsert.mockResolvedValue({});

      await service.addMention({
        articleId: 'a1',
        entityId: 'e1',
        context: 'React is great for building UIs',
        sentiment: MentionSentiment.POSITIVE,
      });

      expect(mockPrisma.articleTechMention.upsert).toHaveBeenCalledWith({
        where: {
          articleId_entityId: { articleId: 'a1', entityId: 'e1' },
        },
        create: {
          articleId: 'a1',
          entityId: 'e1',
          context: 'React is great for building UIs',
          sentiment: 'POSITIVE',
        },
        update: {
          context: 'React is great for building UIs',
          sentiment: 'POSITIVE',
        },
      });
    });

    it('should be idempotent for duplicate mentions', async () => {
      mockPrisma.articleTechMention.upsert.mockResolvedValue({});

      // Call twice with same data
      await service.addMention({ articleId: 'a1', entityId: 'e1' });
      await service.addMention({ articleId: 'a1', entityId: 'e1' });

      // Both should use upsert, no errors
      expect(mockPrisma.articleTechMention.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // refreshStats
  // -------------------------------------------------------------------------
  describe('refreshStats', () => {
    it('should update entity with aggregated mention stats', async () => {
      const minDate = new Date('2025-01-01');
      const maxDate = new Date('2026-02-01');

      mockPrisma.articleTechMention.aggregate.mockResolvedValue({
        _count: { id: 42 },
        _min: { createdAt: minDate },
        _max: { createdAt: maxDate },
      });
      mockPrisma.techEntity.update.mockResolvedValue({});

      await service.refreshStats('e1');

      expect(mockPrisma.articleTechMention.aggregate).toHaveBeenCalledWith({
        where: { entityId: 'e1' },
        _count: { id: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      });

      expect(mockPrisma.techEntity.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          mentionCount: 42,
          firstSeenAt: minDate,
          lastSeenAt: maxDate,
        },
      });
    });

    it('should handle entity with zero mentions', async () => {
      mockPrisma.articleTechMention.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _min: { createdAt: null },
        _max: { createdAt: null },
      });
      mockPrisma.techEntity.update.mockResolvedValue({});

      await service.refreshStats('e1');

      expect(mockPrisma.techEntity.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: {
          mentionCount: 0,
          firstSeenAt: null,
          lastSeenAt: null,
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // refreshAllStats
  // -------------------------------------------------------------------------
  describe('refreshAllStats', () => {
    it('should refresh stats for all entities', async () => {
      mockPrisma.techEntity.findMany.mockResolvedValue([
        { id: 'e1' },
        { id: 'e2' },
      ]);

      // Mock aggregate and update for each entity
      mockPrisma.articleTechMention.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _min: { createdAt: new Date() },
        _max: { createdAt: new Date() },
      });
      mockPrisma.techEntity.update.mockResolvedValue({});

      await service.refreshAllStats();

      expect(mockPrisma.techEntity.findMany).toHaveBeenCalledWith({
        select: { id: true },
      });
      expect(mockPrisma.articleTechMention.aggregate).toHaveBeenCalledTimes(2);
      expect(mockPrisma.techEntity.update).toHaveBeenCalledTimes(2);
    });
  });
});
