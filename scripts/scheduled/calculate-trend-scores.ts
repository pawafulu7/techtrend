/**
 * Trend Score Calculation Batch Script
 *
 * Calculates trend scores for all tech entities with mentions,
 * then invalidates related Redis caches.
 *
 * Usage:
 *   npx tsx scripts/scheduled/calculate-trend-scores.ts
 *
 * Exit codes:
 *   0 - All entities processed successfully (or nothing to process)
 *   1 - Partial success (some entities failed)
 *   2 - Fatal error (could not start or complete)
 */

import { PrismaClient } from '@prisma/client';
import {
  shouldProcess,
  saveProcessingStatus,
  setPrisma,
} from '../utils/processing-status';
import { TechEntityService } from '@/lib/services/tech-entity-service';
import { TrendScoringService } from '@/lib/services/trend-scoring-service';
import { RedisCache } from '@/lib/cache/redis-cache';

// =============================================================================
// Config
// =============================================================================

const PROCESS_NAME = 'trend-score-calculation';
const INTERVAL_HOURS = 20; // Run roughly once a day

// =============================================================================
// Main
// =============================================================================

async function calculateTrendScores(): Promise<{
  calculated: number;
  errors: number;
}> {
  const prisma = new PrismaClient();
  setPrisma(prisma);

  console.log(`[${PROCESS_NAME}] Starting trend score calculation...`);

  try {
    // Check if enough time has passed since last run
    const needsProcessing = await shouldProcess(PROCESS_NAME, INTERVAL_HOURS);
    if (!needsProcessing) {
      console.log(
        `[${PROCESS_NAME}] Skipping: last run was less than ${INTERVAL_HOURS} hours ago`
      );
      return { calculated: 0, errors: 0 };
    }

    // Step 1: Refresh entity stats
    console.log(`[${PROCESS_NAME}] Step 1: Refreshing entity stats...`);
    const entityService = new TechEntityService(prisma);
    await entityService.refreshAllStats();
    console.log(`[${PROCESS_NAME}] Entity stats refreshed`);

    // Step 2: Calculate all scores
    console.log(`[${PROCESS_NAME}] Step 2: Calculating trend scores...`);
    const scoringService = new TrendScoringService(prisma);
    const result = await scoringService.calculateAllScores();

    console.log(
      `[${PROCESS_NAME}] Scores calculated: ${result.calculated} succeeded, ${result.errors} failed`
    );

    // Step 3: Invalidate Redis caches
    console.log(`[${PROCESS_NAME}] Step 3: Invalidating Redis caches...`);
    try {
      const cache = new RedisCache({ namespace: 'techtrend' });
      await Promise.all([
        cache.invalidatePattern('trend-scores:*'),
        cache.invalidatePattern('entity-trend:*'),
        cache.invalidatePattern('health:*'),
        cache.invalidatePattern('tech-radar'),
      ]);
      console.log(`[${PROCESS_NAME}] Redis caches invalidated`);
    } catch (cacheError) {
      // Cache invalidation failure is non-fatal
      console.warn(
        `[${PROCESS_NAME}] Warning: Redis cache invalidation failed:`,
        cacheError instanceof Error ? cacheError.message : String(cacheError)
      );
    }

    // Determine status based on results
    const status =
      result.errors > 0 && result.calculated > 0
        ? 'partial'
        : result.errors > 0 && result.calculated === 0
          ? 'failed'
          : 'success';

    await saveProcessingStatus(
      PROCESS_NAME,
      result.calculated,
      status as 'success' | 'failed' | 'partial',
      {
        calculated: result.calculated,
        errors: result.errors,
      }
    );

    console.log(
      `[${PROCESS_NAME}] Completed: calculated=${result.calculated}, errors=${result.errors}, status=${status}`
    );

    return result;
  } catch (error) {
    console.error(
      `[${PROCESS_NAME}] Fatal error:`,
      error instanceof Error ? error.message : String(error)
    );

    try {
      await saveProcessingStatus(PROCESS_NAME, 0, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (statusError) {
      console.error(
        `[${PROCESS_NAME}] Failed to save processing status:`,
        statusError instanceof Error
          ? statusError.message
          : String(statusError)
      );
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// =============================================================================
// Entry point
// =============================================================================

if (require.main === module) {
  // Graceful shutdown
  // shuttingDown flag: when a SIGINT/SIGTERM is received, the flag is set and
  // a 30-second timeout starts. The main calculateTrendScores() promise is
  // allowed to finish naturally within that window. If it does not, the process
  // is forcefully terminated with exit code 2. Currently the flag is not checked
  // inside calculateAllScores' per-entity loop; adding a cancellation signal
  // there is a future improvement if graceful mid-loop cancellation is needed.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${PROCESS_NAME}] Received ${signal}, shutting down gracefully...`);
    // Allow main process to complete with timeout
    setTimeout(() => {
      console.log(`[${PROCESS_NAME}] Forced shutdown after timeout`);
      process.exit(2);
    }, 30000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  calculateTrendScores()
    .then(({ calculated, errors }) => {
      if (errors === 0) {
        process.exit(0); // Success or nothing to do
      } else if (calculated > 0) {
        process.exit(1); // Partial success
      } else {
        process.exit(2); // Total failure
      }
    })
    .catch((error) => {
      console.error(
        `[${PROCESS_NAME}] Fatal error:`,
        error instanceof Error ? error.message : String(error)
      );
      process.exit(2);
    });
}

export { calculateTrendScores };
