/**
 * TechRelation Service
 *
 * Manages technology entity relationships and their evidence.
 * Supports graph traversal with configurable depth.
 */

import {
  PrismaClient,
  TechEntity,
  TechRelation,
  TechRelationType,
} from '@prisma/client';

export interface UpsertRelationData {
  sourceEntityId: string;
  targetEntityId: string;
  relationType: TechRelationType;
  articleId: string;
}

export interface GraphData {
  nodes: TechEntity[];
  edges: TechRelation[];
}

export class TechRelationService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Upsert a relation with evidence.
   * Creates the relation if it doesn't exist, then adds the article as evidence.
   */
  async upsertRelation(data: UpsertRelationData): Promise<TechRelation> {
    return this.prisma.$transaction(async (tx) => {
      // Upsert the relation
      const relation = await tx.techRelation.upsert({
        where: {
          sourceEntityId_targetEntityId_relationType: {
            sourceEntityId: data.sourceEntityId,
            targetEntityId: data.targetEntityId,
            relationType: data.relationType,
          },
        },
        create: {
          sourceEntityId: data.sourceEntityId,
          targetEntityId: data.targetEntityId,
          relationType: data.relationType,
          strength: 1,
        },
        update: {},
      });

      // Add evidence (idempotent via unique constraint)
      await tx.techRelationEvidence.upsert({
        where: {
          relationId_articleId: {
            relationId: relation.id,
            articleId: data.articleId,
          },
        },
        create: {
          relationId: relation.id,
          articleId: data.articleId,
        },
        update: {},
      });

      // Recalculate strength after adding evidence
      const count = await tx.techRelationEvidence.count({
        where: { relationId: relation.id },
      });

      await tx.techRelation.update({
        where: { id: relation.id },
        data: { strength: count },
      });

      // Return updated relation
      return tx.techRelation.findUniqueOrThrow({
        where: { id: relation.id },
      });
    });
  }

  /**
   * Get graph data (nodes + edges) for an entity.
   * @param entityId - The entity to start from
   * @param depth - 1 for direct relations, 2 for two levels (default: 1)
   */
  async getRelationsForEntity(
    entityId: string,
    depth: number = 1
  ): Promise<GraphData> {
    const visitedNodeIds = new Set<string>([entityId]);
    const allEdges: TechRelation[] = [];
    let currentIds = [entityId];

    for (let d = 0; d < depth; d++) {
      if (currentIds.length === 0) break;

      const relations = await this.prisma.techRelation.findMany({
        where: {
          OR: [
            { sourceEntityId: { in: currentIds } },
            { targetEntityId: { in: currentIds } },
          ],
        },
      });

      const nextIds: string[] = [];
      const edgeIdSet = new Set(allEdges.map((e) => e.id));

      for (const rel of relations) {
        // Avoid duplicate edges (O(1) lookup with Set)
        if (!edgeIdSet.has(rel.id)) {
          edgeIdSet.add(rel.id);
          allEdges.push(rel);
        }

        // Collect new node IDs for next depth level
        for (const id of [rel.sourceEntityId, rel.targetEntityId]) {
          if (!visitedNodeIds.has(id)) {
            visitedNodeIds.add(id);
            nextIds.push(id);
          }
        }
      }

      currentIds = nextIds;
    }

    // Fetch all node entities
    const nodes = await this.prisma.techEntity.findMany({
      where: {
        id: { in: Array.from(visitedNodeIds) },
      },
    });

    return { nodes, edges: allEdges };
  }

  /**
   * Recalculate relation strength based on evidence count.
   * Strength = number of articles supporting the relation.
   */
  async recalculateStrength(relationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.techRelationEvidence.count({
        where: { relationId },
      });

      await tx.techRelation.update({
        where: { id: relationId },
        data: { strength: count },
      });
    });
  }
}
