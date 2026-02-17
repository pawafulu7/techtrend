/**
 * Entity Extractor
 *
 * Extracts technology entities and their relationships from articles
 * using LLM (Gemini) and persists them via TechEntityService / TechRelationService.
 *
 * Design:
 * - Uses the existing LLMExtractionPipeline for Gemini calls + retry logic
 * - Parse failures are isolated and never affect existing summary generation
 * - Idempotent: re-running on the same article produces the same result
 */

import { logger } from '@/lib/logger';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TechRelationService } from '@/lib/services/tech-relation-service';
import {
  LLMExtractionPipeline,
  ExtractionOptions,
} from './llm-extraction-pipeline';
import {
  entityExtractionConfig,
  EntityExtractionOutput,
  ExtractedEntity,
  ExtractedRelation,
  ExtractedMention,
} from './prompts/entity-extraction-prompt';
import {
  TechEntityType,
  TechRelationType,
  MentionSentiment,
} from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface ArticleInput {
  id: string;
  title: string;
  summary: string;
}

export interface ExtractionResultSummary {
  articleId: string;
  success: boolean;
  entitiesResolved: number;
  relationsCreated: number;
  mentionsCreated: number;
  error?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const VALID_ENTITY_TYPES = new Set<string>(Object.values(TechEntityType));

const VALID_RELATION_TYPES = new Set<string>(Object.values(TechRelationType));

const VALID_SENTIMENTS = new Set<string>(Object.values(MentionSentiment));

function isValidEntityType(type: string): type is TechEntityType {
  return VALID_ENTITY_TYPES.has(type);
}

function isValidRelationType(type: string): type is TechRelationType {
  return VALID_RELATION_TYPES.has(type);
}

function isValidSentiment(sentiment: string): sentiment is MentionSentiment {
  return VALID_SENTIMENTS.has(sentiment);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MAX_CONTEXT_LENGTH = 200;

// =============================================================================
// EntityExtractor
// =============================================================================

export class EntityExtractor {
  constructor(
    private pipeline: LLMExtractionPipeline,
    private entityService: TechEntityService,
    private relationService: TechRelationService
  ) {}

  /**
   * Extract entities, relations, and mentions from a single article.
   * All errors are caught and returned in the result (never thrown).
   */
  async extractFromArticle(
    article: ArticleInput,
    options?: ExtractionOptions
  ): Promise<ExtractionResultSummary> {
    const result: ExtractionResultSummary = {
      articleId: article.id,
      success: false,
      entitiesResolved: 0,
      relationsCreated: 0,
      mentionsCreated: 0,
    };

    try {
      // 1. Call Gemini via LLMExtractionPipeline
      const extractionResult =
        await this.pipeline.extract<EntityExtractionOutput>(
          { title: article.title, summary: article.summary },
          entityExtractionConfig,
          options
        );

      if (!extractionResult.success || !extractionResult.data) {
        result.error = extractionResult.error || 'Extraction returned no data';
        logger.warn(
          { articleId: article.id, error: result.error },
          'Entity extraction failed for article'
        );
        return result;
      }

      const data = extractionResult.data;

      // 2. Persist entities
      const entityNameToId = new Map<string, string>();
      for (const rawEntity of data.entities) {
        try {
          const entityId = await this.persistEntity(rawEntity);
          entityNameToId.set(rawEntity.name, entityId);
          result.entitiesResolved++;
        } catch (error) {
          logger.warn(
            {
              articleId: article.id,
              entityName: rawEntity.name,
              error: errorMessage(error),
            },
            'Failed to persist entity'
          );
        }
      }

      // 3. Persist relations
      for (const rawRelation of data.relations ?? []) {
        try {
          const created = await this.persistRelation(
            rawRelation,
            entityNameToId,
            article.id
          );
          if (created) result.relationsCreated++;
        } catch (error) {
          logger.warn(
            {
              articleId: article.id,
              source: rawRelation.source,
              target: rawRelation.target,
              error: errorMessage(error),
            },
            'Failed to persist relation'
          );
        }
      }

      // 4. Persist mentions
      for (const rawMention of data.mentions ?? []) {
        try {
          const created = await this.persistMention(
            rawMention,
            entityNameToId,
            article.id
          );
          if (created) result.mentionsCreated++;
        } catch (error) {
          logger.warn(
            {
              articleId: article.id,
              entityName: rawMention.entity,
              error: errorMessage(error),
            },
            'Failed to persist mention'
          );
        }
      }

      // LLM extraction succeeded. Mark success=true if:
      // - Any entities/relations/mentions were persisted, OR
      // - The LLM returned empty results (extraction itself succeeded, just nothing to extract)
      const llmReturnedEmpty =
        data.entities.length === 0 &&
        (data.relations ?? []).length === 0 &&
        (data.mentions ?? []).length === 0;
      result.success =
        llmReturnedEmpty ||
        result.entitiesResolved > 0 ||
        result.relationsCreated > 0 ||
        result.mentionsCreated > 0;
      return result;
    } catch (error) {
      result.error = errorMessage(error);
      logger.error(
        { articleId: article.id, error: result.error },
        'Unexpected error during entity extraction'
      );
      return result;
    }
  }

  /**
   * Find or create an entity and return its ID.
   */
  private async persistEntity(raw: ExtractedEntity): Promise<string> {
    if (!isValidEntityType(raw.type)) {
      throw new Error(`Invalid entity type: ${raw.type}`);
    }

    const externalIds: Record<string, string> = {};
    if (raw.github) externalIds.github = raw.github;
    if (raw.npm) externalIds.npm = raw.npm;
    if (raw.pypi) externalIds.pypi = raw.pypi;

    const entity = await this.entityService.findOrCreate({
      name: raw.name,
      type: raw.type,
      aliases: raw.aliases ?? [],
      externalIds:
        Object.keys(externalIds).length > 0 ? externalIds : undefined,
    });

    return entity.id;
  }

  /**
   * Persist a relation between two entities.
   * Both source and target must have been resolved to entity IDs already.
   */
  private async persistRelation(
    raw: ExtractedRelation,
    entityNameToId: Map<string, string>,
    articleId: string
  ): Promise<boolean> {
    if (!isValidRelationType(raw.type)) {
      throw new Error(`Invalid relation type: ${raw.type}`);
    }

    const sourceId = entityNameToId.get(raw.source);
    const targetId = entityNameToId.get(raw.target);

    if (!sourceId || !targetId) {
      // One side was not extracted / failed to persist - skip silently
      logger.debug(
        { source: raw.source, target: raw.target },
        'Skipping relation: source or target entity not found'
      );
      return false;
    }

    await this.relationService.upsertRelation({
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationType: raw.type,
      articleId,
    });
    return true;
  }

  /**
   * Persist a mention link between an article and an entity.
   */
  private async persistMention(
    raw: ExtractedMention,
    entityNameToId: Map<string, string>,
    articleId: string
  ): Promise<boolean> {
    const entityId = entityNameToId.get(raw.entity);
    if (!entityId) {
      // Entity was not extracted / failed - skip silently
      logger.debug(
        { entityName: raw.entity },
        'Skipping mention: entity not found'
      );
      return false;
    }

    const sentiment: MentionSentiment = isValidSentiment(raw.sentiment ?? '')
      ? (raw.sentiment as MentionSentiment)
      : 'NEUTRAL';

    await this.entityService.addMention({
      articleId,
      entityId,
      context: raw.context?.slice(0, MAX_CONTEXT_LENGTH),
      sentiment,
    });
    return true;
  }
}
