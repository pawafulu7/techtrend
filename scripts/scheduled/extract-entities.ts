/**
 * Entity Extraction Batch Script
 *
 * Extracts technology entities and relations from articles that have
 * summaries but no ArticleTechMention records yet.
 *
 * Usage:
 *   npx tsx scripts/scheduled/extract-entities.ts
 *
 * Exit codes:
 *   0 - All articles processed successfully, nothing to process, OR success rate >= 90%
 *   1 - Partial success with success rate below 90%
 *   2 - Fatal error (could not start or complete) or total extraction failure (0 successes)
 */

import { PrismaClient } from '@prisma/client';
import pLimit from 'p-limit';
import {
  setPrisma,
  saveProcessingStatus,
} from '../utils/processing-status';
import { LLMExtractionPipeline } from '@/lib/ai/extraction/llm-extraction-pipeline';
import {
  EntityExtractor,
  ExtractionResultSummary,
} from '@/lib/ai/extraction/entity-extractor';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TechRelationService } from '@/lib/services/tech-relation-service';

// =============================================================================
// Config
// =============================================================================

const PROCESS_NAME = 'entity-extraction';
const BATCH_CONCURRENCY = 3;
const DELAY_BETWEEN_ITEMS_MS = 2000; // Gemini rate limiting
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_AGE_DAYS = 7;

// =============================================================================
// Main
// =============================================================================

async function extractEntities(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const prisma = new PrismaClient();
  setPrisma(prisma);

  try {
    // Query articles with summaries but NO ArticleTechMention records
    const parsedBatchSize = parseInt(process.env.ENTITY_EXTRACTION_BATCH_SIZE ?? '', 10);
    const batchSize = Number.isNaN(parsedBatchSize) ? DEFAULT_BATCH_SIZE : parsedBatchSize;

    const parsedMaxAge = parseInt(process.env.ENTITY_EXTRACTION_MAX_AGE_DAYS ?? '', 10);
    const maxAgeDays = Number.isNaN(parsedMaxAge) ? DEFAULT_MAX_AGE_DAYS : parsedMaxAge;
    const cutoffDate = new Date(
      Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    );

    const articles = await prisma.article.findMany({
      where: {
        summary: { not: null },
        techMentions: { none: {} },
        createdAt: { gte: cutoffDate },
      },
      select: {
        id: true,
        title: true,
        summary: true,
      },
      orderBy: { createdAt: 'desc' },
      take: batchSize,
    });

    const articlesWithSummary = articles.filter(
      (a): a is typeof a & { summary: string } => a.summary !== null
    );

    if (articlesWithSummary.length === 0) {
      console.log('[entity-extraction] No articles to process');
      await saveProcessingStatus(PROCESS_NAME, 0, 'success', {
        message: 'No articles to process',
      });
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(
      `[entity-extraction] Found ${articlesWithSummary.length} articles to process (last ${maxAgeDays} days)`
    );

    // Initialize services
    const pipeline = new LLMExtractionPipeline();
    const entityService = new TechEntityService(prisma);
    const relationService = new TechRelationService(prisma);
    const extractor = new EntityExtractor(
      pipeline,
      entityService,
      relationService
    );

    // Process with concurrency limit and delay
    const limit = pLimit(BATCH_CONCURRENCY);
    const results: ExtractionResultSummary[] = [];

    const tasks = articlesWithSummary.map((article, index) =>
      limit(async () => {
        let result: ExtractionResultSummary;
        try {
          result = await extractor.extractFromArticle({
            id: article.id,
            title: article.title,
            summary: article.summary,
          });
        } catch (error) {
          result = {
            articleId: article.id,
            success: false,
            entitiesResolved: 0,
            relationsCreated: 0,
            mentionsCreated: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        if (result.success) {
          console.log(
            `  [OK] ${article.title.substring(0, 60)}... ` +
              `(entities: ${result.entitiesResolved}, relations: ${result.relationsCreated}, mentions: ${result.mentionsCreated})`
          );
        } else {
          console.error(
            `  [FAIL] ${article.title.substring(0, 60)}... - ${result.error}`
          );
        }

        results.push(result);

        // Rate limiting delay (skip for the last item)
        if (index < articlesWithSummary.length - 1) {
          await delay(DELAY_BETWEEN_ITEMS_MS);
        }

        return result;
      })
    );

    await Promise.allSettled(tasks);

    // Summarize
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const totalEntities = results.reduce(
      (sum, r) => sum + r.entitiesResolved,
      0
    );
    const totalRelations = results.reduce(
      (sum, r) => sum + r.relationsCreated,
      0
    );
    const totalMentions = results.reduce(
      (sum, r) => sum + r.mentionsCreated,
      0
    );

    console.log(
      `\n[entity-extraction] Complete: ${succeeded}/${articles.length} succeeded, ${failed} failed`
    );
    console.log(
      `  Entities: ${totalEntities}, Relations: ${totalRelations}, Mentions: ${totalMentions}`
    );

    // Save processing status
    const status =
      failed === 0 ? 'success' : succeeded === 0 ? 'failed' : 'partial';
    await saveProcessingStatus(PROCESS_NAME, succeeded, status, {
      total: articlesWithSummary.length,
      succeeded,
      failed,
      totalEntities,
      totalRelations,
      totalMentions,
    });

    // Refresh entity statistics (mentionCount, firstSeenAt, lastSeenAt)
    // Always run -- even with 0 new mentions, existing stats may need recovery
    try {
      console.log('\n[entity-extraction] Refreshing entity statistics...');
      await entityService.refreshAllStats();
      console.log('[entity-extraction] Entity statistics updated.');
    } catch (statsError) {
      console.error('[entity-extraction] Failed to refresh entity statistics:', statsError);
    }

    return { processed: articlesWithSummary.length, succeeded, failed };
  } finally {
    await prisma.$disconnect();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Entry point
// =============================================================================

if (require.main === module) {
  extractEntities()
    .then(({ processed, succeeded, failed }) => {
      if (processed === 0 || failed === 0) {
        process.exit(0); // Success or nothing to do
      } else {
        const successRate = succeeded / processed;
        console.log(
          `[entity-extraction] Success rate: ${(successRate * 100).toFixed(1)}% (${succeeded}/${processed})`
        );
        if (successRate >= 0.9) {
          process.exit(0); // High success rate, treat as success
        } else if (succeeded > 0) {
          process.exit(1); // Partial success below threshold
        } else {
          process.exit(2); // Total failure
        }
      }
    })
    .catch((error) => {
      console.error(
        '[entity-extraction] Fatal error:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(2);
    });
}

export { extractEntities };
