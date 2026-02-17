/**
 * TechRelationService Tests
 *
 * Tests for relation upsert, graph traversal, and strength recalculation.
 */

import { TechRelationType } from '@prisma/client';
import { TechRelationService } from '../../lib/services/tech-relation-service';

// --- Mock Prisma Client ---

function createMockPrisma() {
  return {
    techRelation: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    techRelationEvidence: {
      upsert: jest.fn(),
      count: jest.fn(),
    },
    techEntity: {
      findMany: jest.fn(),
    },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

describe('TechRelationService', () => {
  let mockPrisma: MockPrisma;
  let service: TechRelationService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TechRelationService(mockPrisma as any);
  });

  // -------------------------------------------------------------------------
  // upsertRelation
  // -------------------------------------------------------------------------
  describe('upsertRelation', () => {
    const baseData = {
      sourceEntityId: 'e1',
      targetEntityId: 'e2',
      relationType: TechRelationType.DEPENDS_ON,
      articleId: 'a1',
    };

    it('should create a new relation with evidence', async () => {
      const relation = { id: 'r1', ...baseData, strength: 1 };
      mockPrisma.techRelation.upsert.mockResolvedValue(relation);
      mockPrisma.techRelationEvidence.upsert.mockResolvedValue({});
      mockPrisma.techRelationEvidence.count.mockResolvedValue(1);
      mockPrisma.techRelation.update.mockResolvedValue({});
      mockPrisma.techRelation.findUniqueOrThrow.mockResolvedValue({
        ...relation,
        strength: 1,
      });

      const result = await service.upsertRelation(baseData);

      expect(mockPrisma.techRelation.upsert).toHaveBeenCalledWith({
        where: {
          sourceEntityId_targetEntityId_relationType: {
            sourceEntityId: 'e1',
            targetEntityId: 'e2',
            relationType: 'DEPENDS_ON',
          },
        },
        create: {
          sourceEntityId: 'e1',
          targetEntityId: 'e2',
          relationType: 'DEPENDS_ON',
          strength: 1,
        },
        update: {},
      });

      expect(mockPrisma.techRelationEvidence.upsert).toHaveBeenCalledWith({
        where: {
          relationId_articleId: { relationId: 'r1', articleId: 'a1' },
        },
        create: { relationId: 'r1', articleId: 'a1' },
        update: {},
      });

      expect(result.strength).toBe(1);
    });

    it('should add evidence to existing relation and recalculate strength', async () => {
      const relation = { id: 'r1', strength: 1 };
      mockPrisma.techRelation.upsert.mockResolvedValue(relation);
      mockPrisma.techRelationEvidence.upsert.mockResolvedValue({});
      mockPrisma.techRelationEvidence.count.mockResolvedValue(3);
      mockPrisma.techRelation.update.mockResolvedValue({});
      mockPrisma.techRelation.findUniqueOrThrow.mockResolvedValue({
        ...relation,
        strength: 3,
      });

      const result = await service.upsertRelation({
        ...baseData,
        articleId: 'a3',
      });

      // Strength should be recalculated (3 evidence articles)
      expect(mockPrisma.techRelation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { strength: 3 },
      });
      expect(result.strength).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // getRelationsForEntity
  // -------------------------------------------------------------------------
  describe('getRelationsForEntity', () => {
    it('should return direct relations (depth=1)', async () => {
      const relations = [
        {
          id: 'r1',
          sourceEntityId: 'e1',
          targetEntityId: 'e2',
          relationType: 'DEPENDS_ON',
        },
        {
          id: 'r2',
          sourceEntityId: 'e3',
          targetEntityId: 'e1',
          relationType: 'ALTERNATIVE',
        },
      ];
      const nodes = [
        { id: 'e1', name: 'React' },
        { id: 'e2', name: 'ReactDOM' },
        { id: 'e3', name: 'Vue' },
      ];

      mockPrisma.techRelation.findMany.mockResolvedValue(relations);
      mockPrisma.techEntity.findMany.mockResolvedValue(nodes);

      const result = await service.getRelationsForEntity('e1', 1);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(mockPrisma.techRelation.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.techRelation.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { sourceEntityId: { in: ['e1'] } },
            { targetEntityId: { in: ['e1'] } },
          ],
        },
      });
    });

    it('should traverse two levels (depth=2)', async () => {
      // First level: e1 -> e2
      const firstLevelRelations = [
        { id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' },
      ];
      // Second level: e2 -> e3
      const secondLevelRelations = [
        { id: 'r2', sourceEntityId: 'e2', targetEntityId: 'e3' },
      ];

      mockPrisma.techRelation.findMany
        .mockResolvedValueOnce(firstLevelRelations)
        .mockResolvedValueOnce(secondLevelRelations);

      const allNodes = [
        { id: 'e1', name: 'React' },
        { id: 'e2', name: 'ReactDOM' },
        { id: 'e3', name: 'Preact' },
      ];
      mockPrisma.techEntity.findMany.mockResolvedValue(allNodes);

      const result = await service.getRelationsForEntity('e1', 2);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(mockPrisma.techRelation.findMany).toHaveBeenCalledTimes(2);

      // Second call should use newly discovered node ids
      expect(mockPrisma.techRelation.findMany).toHaveBeenNthCalledWith(2, {
        where: {
          OR: [
            { sourceEntityId: { in: ['e2'] } },
            { targetEntityId: { in: ['e2'] } },
          ],
        },
      });
    });

    it('should not duplicate edges across depth levels', async () => {
      // Both levels return the same relation
      const relation = { id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' };
      mockPrisma.techRelation.findMany
        .mockResolvedValueOnce([relation])
        .mockResolvedValueOnce([relation]);
      mockPrisma.techEntity.findMany.mockResolvedValue([
        { id: 'e1' },
        { id: 'e2' },
      ]);

      const result = await service.getRelationsForEntity('e1', 2);

      // Should only have 1 edge despite appearing at both levels
      expect(result.edges).toHaveLength(1);
    });

    it('should return only the root node when no relations exist', async () => {
      mockPrisma.techRelation.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.findMany.mockResolvedValue([
        { id: 'e1', name: 'Lonely' },
      ]);

      const result = await service.getRelationsForEntity('e1');

      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
    });

    it('should default depth to 1', async () => {
      mockPrisma.techRelation.findMany.mockResolvedValue([]);
      mockPrisma.techEntity.findMany.mockResolvedValue([{ id: 'e1' }]);

      await service.getRelationsForEntity('e1');

      // Should only query once (depth=1)
      expect(mockPrisma.techRelation.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // recalculateStrength
  // -------------------------------------------------------------------------
  describe('recalculateStrength', () => {
    it('should set strength to evidence count', async () => {
      mockPrisma.techRelationEvidence.count.mockResolvedValue(5);
      mockPrisma.techRelation.update.mockResolvedValue({});

      await service.recalculateStrength('r1');

      expect(mockPrisma.techRelationEvidence.count).toHaveBeenCalledWith({
        where: { relationId: 'r1' },
      });
      expect(mockPrisma.techRelation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { strength: 5 },
      });
    });

    it('should set strength to 0 when no evidence exists', async () => {
      mockPrisma.techRelationEvidence.count.mockResolvedValue(0);
      mockPrisma.techRelation.update.mockResolvedValue({});

      await service.recalculateStrength('r1');

      expect(mockPrisma.techRelation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { strength: 0 },
      });
    });
  });
});
