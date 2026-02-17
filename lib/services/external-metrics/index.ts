import { PrismaClient } from '@prisma/client';
import pLimit from 'p-limit';
import { logger } from '@/lib/logger';
import { MetricCollector, CollectionSummary } from './types';
import { GitHubCollector } from './github-collector';
import { NpmCollector } from './npm-collector';
import { PyPICollector } from './pypi-collector';
import { StackOverflowCollector } from './stackoverflow-collector';

export { GitHubCollector } from './github-collector';
export { NpmCollector } from './npm-collector';
export { PyPICollector } from './pypi-collector';
export { StackOverflowCollector } from './stackoverflow-collector';
export type {
  MetricCollector,
  MetricResult,
  CollectionSummary,
  ExternalIds,
} from './types';

/**
 * Orchestrates external metric collection across all collectors and entities.
 *
 * For each TechEntity, runs all applicable collectors and upserts results
 * to the ExternalMetric table. Uses p-limit for concurrency control.
 */
export class ExternalMetricsOrchestrator {
  private readonly concurrencyLimit: number;

  constructor(
    private prisma: PrismaClient,
    private collectors: MetricCollector[],
    concurrencyLimit = 5
  ) {
    this.concurrencyLimit = concurrencyLimit;
  }

  /**
   * Create an orchestrator with all default collectors.
   */
  static createDefault(prisma: PrismaClient): ExternalMetricsOrchestrator {
    return new ExternalMetricsOrchestrator(prisma, [
      new GitHubCollector(),
      new NpmCollector(),
      new PyPICollector(),
      new StackOverflowCollector(),
    ]);
  }

  /**
   * Collect metrics for all TechEntities.
   * Skips entities without externalIds.
   * Individual failures are logged but do not stop the batch.
   */
  async collectAll(): Promise<CollectionSummary> {
    const summary: CollectionSummary = { collected: 0, errors: 0, skipped: 0 };

    // Fetch all entities that have externalIds set
    const entities = await this.prisma.techEntity.findMany({
      where: {
        externalIds: { not: null },
      },
    });

    if (entities.length === 0) {
      logger.info(
        { context: 'ExternalMetrics' },
        'No entities with externalIds found. Skipping.'
      );
      return summary;
    }

    logger.info(
      {
        context: 'ExternalMetrics',
        entityCount: entities.length,
        collectorCount: this.collectors.length,
      },
      `Processing ${entities.length} entities with ${this.collectors.length} collectors`
    );

    const limit = pLimit(this.concurrencyLimit);

    // Build tasks: one per entity+collector combo where canCollect=true
    const tasks: Array<() => Promise<void>> = [];

    for (const entity of entities) {
      for (const collector of this.collectors) {
        if (!collector.canCollect(entity)) {
          summary.skipped++;
          continue;
        }

        tasks.push(async () => {
          try {
            const result = await collector.collect(entity);

            if (!result) {
              logger.warn(
                {
                  context: 'ExternalMetrics',
                  source: collector.source,
                  entityName: entity.name,
                },
                `Collector ${collector.source} returned null for ${entity.name}`
              );
              summary.skipped++;
              return;
            }

            // Upsert: use entityId + source + measuredAt as unique key
            // Since measuredAt varies, we use a date-truncated approach:
            // store one metric per entity+source per day
            const dayStart = new Date(result.measuredAt);
            dayStart.setUTCHours(0, 0, 0, 0);

            await this.prisma.externalMetric.upsert({
              where: {
                entityId_source_measuredAt: {
                  entityId: entity.id,
                  source: collector.source,
                  measuredAt: dayStart,
                },
              },
              update: {
                value: result.value,
              },
              create: {
                entityId: entity.id,
                source: collector.source,
                value: result.value,
                measuredAt: dayStart,
              },
            });

            summary.collected++;
          } catch (error) {
            logger.error(
              {
                context: 'ExternalMetrics',
                source: collector.source,
                entityName: entity.name,
                error: error instanceof Error ? error.message : String(error),
              },
              `Error collecting ${collector.source} for ${entity.name}`
            );
            summary.errors++;
          }
        });
      }
    }

    // Execute all tasks with concurrency limit
    await Promise.allSettled(tasks.map((task) => limit(task)));

    logger.info(
      {
        context: 'ExternalMetrics',
        collected: summary.collected,
        errors: summary.errors,
        skipped: summary.skipped,
      },
      `Done: collected=${summary.collected}, errors=${summary.errors}, skipped=${summary.skipped}`
    );

    return summary;
  }
}
