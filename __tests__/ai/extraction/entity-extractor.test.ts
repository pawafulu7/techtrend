/**
 * Entity Extractor Tests
 *
 * Tests entity extraction pipeline with mocked LLMExtractionPipeline
 * and mocked TechEntityService / TechRelationService.
 */

import {
  EntityExtractor,
  ArticleInput,
} from '@/lib/ai/extraction/entity-extractor';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TechRelationService } from '@/lib/services/tech-relation-service';
import {
  EntityExtractionOutput,
  EntityExtractionOutputSchema,
} from '@/lib/ai/extraction/prompts/entity-extraction-prompt';

// =============================================================================
// Mocks
// =============================================================================

// Mock LLMExtractionPipeline
jest.mock('@/lib/ai/extraction/llm-extraction-pipeline', () => {
  return {
    LLMExtractionPipeline: jest.fn().mockImplementation(() => ({
      extract: jest.fn(),
      getModelVersion: jest.fn().mockReturnValue('gemini-2.5-flash-lite'),
    })),
  };
});

// Mock TechEntityService
jest.mock('@/lib/services/tech-entity-service', () => {
  return {
    TechEntityService: jest.fn().mockImplementation(() => ({
      findOrCreate: jest.fn(),
      addMention: jest.fn(),
    })),
  };
});

// Mock TechRelationService
jest.mock('@/lib/services/tech-relation-service', () => {
  return {
    TechRelationService: jest.fn().mockImplementation(() => ({
      upsertRelation: jest.fn(),
    })),
  };
});

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// =============================================================================
// Test Data
// =============================================================================

const SAMPLE_ARTICLE: ArticleInput = {
  id: 'article-001',
  title: 'Next.js 16 introduces React Server Components improvements',
  summary:
    'Next.js 16 brings major improvements to React Server Components, including better streaming support and integration with Turbopack.',
};

const SAMPLE_EXTRACTION_OUTPUT: EntityExtractionOutput = {
  entities: [
    {
      name: 'Next.js',
      type: 'FRAMEWORK',
      aliases: ['nextjs', 'Next'],
      github: 'vercel/next.js',
      npm: 'next',
    },
    {
      name: 'React',
      type: 'LIBRARY',
      aliases: ['reactjs'],
    },
    {
      name: 'Turbopack',
      type: 'TOOL',
      aliases: [],
      github: 'vercel/turbo',
    },
  ],
  relations: [
    { source: 'Next.js', target: 'React', type: 'DEPENDS_ON' },
    { source: 'Next.js', target: 'Turbopack', type: 'INTEGRATES_WITH' },
  ],
  mentions: [
    {
      entity: 'Next.js',
      sentiment: 'POSITIVE',
      context: 'Next.js 16 brings major improvements to RSC',
    },
    {
      entity: 'React',
      sentiment: 'NEUTRAL',
      context: 'React Server Components improvements',
    },
    {
      entity: 'Turbopack',
      sentiment: 'POSITIVE',
      context: 'integration with Turbopack',
    },
  ],
};

// =============================================================================
// Tests
// =============================================================================

describe('EntityExtractor', () => {
  let extractor: EntityExtractor;
  let mockPipeline: jest.Mocked<LLMExtractionPipeline>;
  let mockEntityService: jest.Mocked<TechEntityService>;
  let mockRelationService: jest.Mocked<TechRelationService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPipeline =
      new LLMExtractionPipeline() as jest.Mocked<LLMExtractionPipeline>;
    mockEntityService =
      new TechEntityService(null as never) as jest.Mocked<TechEntityService>;
    mockRelationService =
      new TechRelationService(
        null as never
      ) as jest.Mocked<TechRelationService>;

    extractor = new EntityExtractor(
      mockPipeline,
      mockEntityService,
      mockRelationService
    );
  });

  describe('successful extraction', () => {
    beforeEach(() => {
      // Setup pipeline to return successful result
      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: SAMPLE_EXTRACTION_OUTPUT,
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      // Setup entity service to return IDs
      let entityCounter = 0;
      mockEntityService.findOrCreate.mockImplementation(async (data) => {
        entityCounter++;
        return {
          id: `entity-${entityCounter}`,
          name: data.name,
          type: data.type,
          aliases: data.aliases ?? [],
          description: null,
          externalIds: data.externalIds ?? null,
          firstSeenAt: null,
          lastSeenAt: null,
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      mockEntityService.addMention.mockResolvedValue(undefined);

      mockRelationService.upsertRelation.mockResolvedValue({
        id: 'rel-1',
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-2',
        relationType: 'DEPENDS_ON',
        strength: 1,
        detectedAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should extract entities, relations, and mentions from article', async () => {
      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(true);
      expect(result.articleId).toBe('article-001');
      expect(result.entitiesResolved).toBe(3);
      expect(result.relationsCreated).toBe(2);
      expect(result.mentionsCreated).toBe(3);
      expect(result.error).toBeUndefined();
    });

    it('should call pipeline.extract with correct input', async () => {
      await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(mockPipeline.extract).toHaveBeenCalledTimes(1);
      expect(mockPipeline.extract).toHaveBeenCalledWith(
        { title: SAMPLE_ARTICLE.title, summary: SAMPLE_ARTICLE.summary },
        expect.objectContaining({ promptVersion: '1.0' }),
        undefined
      );
    });

    it('should call findOrCreate for each entity with correct data', async () => {
      await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(mockEntityService.findOrCreate).toHaveBeenCalledTimes(3);
      expect(mockEntityService.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Next.js',
          type: 'FRAMEWORK',
          aliases: ['nextjs', 'Next'],
          externalIds: { github: 'vercel/next.js', npm: 'next' },
        })
      );
    });

    it('should call upsertRelation for each relation', async () => {
      await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(mockRelationService.upsertRelation).toHaveBeenCalledTimes(2);
    });

    it('should call addMention for each mention', async () => {
      await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(mockEntityService.addMention).toHaveBeenCalledTimes(3);
      expect(mockEntityService.addMention).toHaveBeenCalledWith(
        expect.objectContaining({
          articleId: 'article-001',
          sentiment: 'POSITIVE',
        })
      );
    });
  });

  describe('malformed JSON response', () => {
    it('should return failure when pipeline returns unsuccessful result', async () => {
      mockPipeline.extract.mockResolvedValue({
        success: false,
        data: null,
        error: 'Failed to parse JSON from LLM response',
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse JSON');
      expect(result.entitiesResolved).toBe(0);
      expect(result.relationsCreated).toBe(0);
      expect(result.mentionsCreated).toBe(0);
    });

    it('should return failure when pipeline returns null data', async () => {
      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: null,
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Extraction returned no data');
    });
  });

  describe('empty article / no entities found', () => {
    it('should succeed with zero counts when no entities extracted', async () => {
      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: { entities: [], relations: [], mentions: [] },
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(true);
      expect(result.entitiesResolved).toBe(0);
      expect(result.relationsCreated).toBe(0);
      expect(result.mentionsCreated).toBe(0);
    });
  });

  describe('duplicate entity handling (idempotent)', () => {
    it('should handle findOrCreate returning existing entity', async () => {
      // Simulate the same entity being returned for all calls
      const existingEntity = {
        id: 'existing-entity-1',
        name: 'Next.js',
        type: 'FRAMEWORK' as const,
        aliases: ['nextjs'],
        description: null,
        externalIds: null,
        firstSeenAt: null,
        lastSeenAt: null,
        mentionCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: {
          entities: [
            { name: 'Next.js', type: 'FRAMEWORK', aliases: ['nextjs'] },
          ],
          relations: [],
          mentions: [
            {
              entity: 'Next.js',
              sentiment: 'NEUTRAL',
              context: 'mentioned again',
            },
          ],
        },
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      mockEntityService.findOrCreate.mockResolvedValue(existingEntity);
      mockEntityService.addMention.mockResolvedValue(undefined);

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(true);
      expect(result.entitiesResolved).toBe(1);
      expect(result.mentionsCreated).toBe(1);
      // findOrCreate handles deduplication internally
      expect(mockEntityService.findOrCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('partial failure isolation', () => {
    it('should continue processing when one entity fails to persist', async () => {
      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: SAMPLE_EXTRACTION_OUTPUT,
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      let callCount = 0;
      mockEntityService.findOrCreate.mockImplementation(async (data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('DB constraint violation');
        }
        return {
          id: `entity-${callCount}`,
          name: data.name,
          type: data.type,
          aliases: data.aliases ?? [],
          description: null,
          externalIds: null,
          firstSeenAt: null,
          lastSeenAt: null,
          mentionCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      mockEntityService.addMention.mockResolvedValue(undefined);
      mockRelationService.upsertRelation.mockResolvedValue({
        id: 'rel-1',
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-3',
        relationType: 'INTEGRATES_WITH',
        strength: 1,
        detectedAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      // Should still succeed overall - partial extraction is OK
      expect(result.success).toBe(true);
      // 2 out of 3 entities persisted
      expect(result.entitiesResolved).toBe(2);
      // Next.js→React skipped (React failed), Next.js→Turbopack created
      expect(result.relationsCreated).toBe(1);
      // Only mentions for Next.js and Turbopack (React skipped)
      expect(result.mentionsCreated).toBe(2);
    });

    it('should skip relations when source or target entity is missing', async () => {
      // Only one entity extracted successfully
      mockPipeline.extract.mockResolvedValue({
        success: true,
        data: {
          entities: [
            { name: 'Next.js', type: 'FRAMEWORK', aliases: [] },
          ],
          relations: [
            // This relation references "React" which was not in entities
            { source: 'Next.js', target: 'React', type: 'DEPENDS_ON' },
          ],
          mentions: [],
        },
        modelVersion: 'gemini-2.5-flash-lite',
        promptVersion: '1.0',
      });

      mockEntityService.findOrCreate.mockResolvedValue({
        id: 'entity-1',
        name: 'Next.js',
        type: 'FRAMEWORK',
        aliases: [],
        description: null,
        externalIds: null,
        firstSeenAt: null,
        lastSeenAt: null,
        mentionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(true);
      expect(result.entitiesResolved).toBe(1);
      // Relation should be skipped because target "React" has no ID
      expect(result.relationsCreated).toBe(0);
      expect(mockRelationService.upsertRelation).not.toHaveBeenCalled();
    });
  });

  describe('unexpected errors', () => {
    it('should catch and return unexpected errors without throwing', async () => {
      mockPipeline.extract.mockRejectedValue(new Error('Network timeout'));

      const result = await extractor.extractFromArticle(SAMPLE_ARTICLE);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.entitiesResolved).toBe(0);
    });
  });
});

describe('EntityExtractionOutputSchema', () => {
  it('should accept null values for github/npm/pypi fields', () => {
    const input = {
      entities: [{ name: 'TestLib', type: 'FRAMEWORK', aliases: [], github: null, npm: null, pypi: null }],
      relations: [],
      mentions: [],
    };
    const result = EntityExtractionOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should map unknown entity types to valid enums via fallback', () => {
    const input = {
      entities: [{ name: 'GPT-4', type: 'MODEL', aliases: [] }],
      relations: [],
      mentions: [],
    };
    const result = EntityExtractionOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entities[0].type).toBe('CONCEPT');
    }
  });

  it('should map unknown relation types to valid enums via fallback', () => {
    const input = {
      entities: [],
      relations: [{ source: 'A', target: 'B', type: 'USES' }],
      mentions: [],
    };
    const result = EntityExtractionOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relations[0].type).toBe('DEPENDS_ON');
    }
  });

  it('should preserve valid entity types', () => {
    const input = {
      entities: [{ name: 'React', type: 'FRAMEWORK', aliases: ['react'] }],
      relations: [],
      mentions: [],
    };
    const result = EntityExtractionOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entities[0].type).toBe('FRAMEWORK');
    }
  });

  it('should preserve valid relation types', () => {
    const input = {
      entities: [],
      relations: [{ source: 'A', target: 'B', type: 'DEPENDS_ON' }],
      mentions: [],
    };
    const result = EntityExtractionOutputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relations[0].type).toBe('DEPENDS_ON');
    }
  });
});
