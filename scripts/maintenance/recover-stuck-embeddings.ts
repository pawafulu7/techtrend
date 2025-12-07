/**
 * Recover Stuck Embedding Jobs
 *
 * This script identifies and resets EmbeddingJob records that are stuck in
 * PROCESSING status due to worker timeouts or crashes.
 *
 * Uses EmbeddingScheduler.recoverStuckJobs() for the core recovery logic,
 * with additional CLI options for verbose output and dry-run mode.
 *
 * Usage:
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be reset without making changes
 *   --verbose    Show detailed information about stuck jobs
 *   -v           Alias for --verbose
 *   --age=N      Consider jobs stuck if older than N minutes (default: 60)
 *   --limit=N    Maximum jobs to reset per run (default: 100)
 *
 * Examples:
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts --dry-run --verbose
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts --age=30 --verbose
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts --age=30 --limit=50
 */

import { prisma } from '@/lib/prisma';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';

interface Options {
  ageMinutes: number;
  limit: number;
  dryRun: boolean;
  verbose: boolean;
}

interface RecoveryResult {
  found: number;
  reset: number;
  skipped: number;
  oldestAgeMinutes?: number;
}

function parseArgs(args: string[]): Options {
  const ageArg = args.find((a) => a.startsWith('--age='));
  const ageMinutes = ageArg ? parseInt(ageArg.split('=')[1], 10) : 60;

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

  return {
    ageMinutes: isNaN(ageMinutes) || ageMinutes < 1 ? 60 : ageMinutes,
    limit: isNaN(limit) || limit < 1 ? 100 : limit,
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

async function getStuckJobsForDisplay(ageMinutes: number, limit: number) {
  const cutoffTime = new Date(Date.now() - ageMinutes * 60 * 1000);

  return prisma.embeddingJob.findMany({
    where: {
      status: 'PROCESSING',
      queuedAt: { lt: cutoffTime },
    },
    include: {
      article: { select: { id: true, title: true } },
    },
    orderBy: { queuedAt: 'asc' },
    take: limit,
  });
}

async function recoverStuckEmbeddings(options: Options): Promise<RecoveryResult> {
  const cutoffTime = new Date(Date.now() - options.ageMinutes * 60 * 1000);

  console.log(`[recover-stuck-embeddings] Starting recovery process`);
  console.log(`  Age threshold: ${options.ageMinutes} minutes`);
  console.log(`  Batch limit: ${options.limit}`);
  console.log(`  Cutoff time: ${cutoffTime.toISOString()}`);
  console.log(`  Dry run: ${options.dryRun}`);
  console.log('');

  // Get stuck jobs for display (verbose mode or dry-run)
  if (options.verbose || options.dryRun) {
    const stuckJobs = await getStuckJobsForDisplay(options.ageMinutes, options.limit);

    console.log(`Found ${stuckJobs.length} stuck job(s)`);

    if (stuckJobs.length === 0) {
      console.log('No stuck jobs to recover.');
      return { found: 0, reset: 0, skipped: 0 };
    }

    if (options.verbose) {
      console.log('\nStuck jobs:');
      for (const job of stuckJobs) {
        const title = job.article?.title?.substring(0, 60) || '(no article)';
        const age = Math.round((Date.now() - job.queuedAt.getTime()) / 60000);
        console.log(`  - Job ${job.id}`);
        console.log(`    Article: "${title}${title.length >= 60 ? '...' : ''}"`);
        console.log(`    Queued: ${job.queuedAt.toISOString()} (${age} min ago)`);
        console.log(`    Attempts: ${job.attempts}/${job.maxAttempts}`);
        if (job.error) {
          console.log(`    Last error: ${job.error.substring(0, 100)}`);
        }
        console.log('');
      }
    }

    if (options.dryRun) {
      // Calculate what would be reset
      const jobsToReset = stuckJobs.filter((job) => job.attempts < job.maxAttempts);
      const skipped = stuckJobs.length - jobsToReset.length;

      console.log('[DRY RUN] Would reset these jobs to PENDING status');
      console.log(`  Eligible for reset: ${jobsToReset.length}`);
      console.log(`  Would skip (max attempts exceeded): ${skipped}`);

      return {
        found: stuckJobs.length,
        reset: 0,
        skipped,
        oldestAgeMinutes: stuckJobs.length > 0
          ? Math.round((Date.now() - stuckJobs[0].queuedAt.getTime()) / 60000)
          : undefined,
      };
    }
  }

  // Use EmbeddingScheduler for actual recovery
  const scheduler = new EmbeddingScheduler();
  const result = await scheduler.recoverStuckJobs(options.ageMinutes, options.limit);

  console.log(`\nReset ${result.reset} job(s) to PENDING status`);
  if (result.skipped > 0) {
    console.log(`Skipped ${result.skipped} job(s) that exceeded max attempts`);
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  let exitCode = 0;

  try {
    const result = await recoverStuckEmbeddings(options);

    console.log('\n--- Summary ---');
    console.log(JSON.stringify(result, null, 2));

    // Exit code:
    // 0 = success (jobs reset or no stuck jobs)
    // 1 = found stuck jobs but none were reset (dry-run or all skipped)
    exitCode = result.reset > 0 || result.found === 0 ? 0 : 1;
  } catch (error) {
    console.error('Error during recovery:', error);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

main();
