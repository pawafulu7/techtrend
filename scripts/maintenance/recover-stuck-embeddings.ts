/**
 * Recover Stuck Embedding Jobs
 *
 * This script identifies and resets EmbeddingJob records that are stuck in
 * PROCESSING status due to worker timeouts or crashes.
 *
 * Usage:
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be reset without making changes
 *   --verbose    Show detailed information about stuck jobs
 *   -v           Alias for --verbose
 *   --age=N      Consider jobs stuck if older than N minutes (default: 60)
 *
 * Examples:
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts --dry-run --verbose
 *   npx tsx scripts/maintenance/recover-stuck-embeddings.ts --age=30 --verbose
 */

import { prisma } from '@/lib/prisma';

interface Options {
  ageMinutes: number;
  dryRun: boolean;
  verbose: boolean;
}

interface RecoveryResult {
  found: number;
  reset: number;
  skipped: number;
}

function parseArgs(args: string[]): Options {
  const ageArg = args.find((a) => a.startsWith('--age='));
  const ageMinutes = ageArg ? parseInt(ageArg.split('=')[1], 10) : 60;

  return {
    ageMinutes: isNaN(ageMinutes) || ageMinutes < 1 ? 60 : ageMinutes,
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

async function recoverStuckEmbeddings(options: Options): Promise<RecoveryResult> {
  const cutoffTime = new Date(Date.now() - options.ageMinutes * 60 * 1000);

  console.log(`[recover-stuck-embeddings] Starting recovery process`);
  console.log(`  Age threshold: ${options.ageMinutes} minutes`);
  console.log(`  Cutoff time: ${cutoffTime.toISOString()}`);
  console.log(`  Dry run: ${options.dryRun}`);
  console.log('');

  // Find stuck jobs (PROCESSING status older than threshold)
  const stuckJobs = await prisma.embeddingJob.findMany({
    where: {
      status: 'PROCESSING',
      queuedAt: { lt: cutoffTime },
    },
    include: {
      article: { select: { id: true, title: true } },
    },
    orderBy: { queuedAt: 'asc' },
  });

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
    console.log('[DRY RUN] Would reset these jobs to PENDING status');
    return { found: stuckJobs.length, reset: 0, skipped: 0 };
  }

  // Filter jobs that haven't exceeded max attempts
  const jobsToReset = stuckJobs.filter((job) => job.attempts < job.maxAttempts);
  const skippedJobs = stuckJobs.length - jobsToReset.length;

  if (skippedJobs > 0) {
    console.log(`Skipping ${skippedJobs} job(s) that exceeded max attempts`);
  }

  if (jobsToReset.length === 0) {
    console.log('No jobs eligible for reset (all exceeded max attempts)');
    return { found: stuckJobs.length, reset: 0, skipped: skippedJobs };
  }

  // Reset jobs to PENDING
  const result = await prisma.embeddingJob.updateMany({
    where: {
      id: { in: jobsToReset.map((j) => j.id) },
      status: 'PROCESSING', // Safety check: still PROCESSING
    },
    data: {
      status: 'PENDING',
      error: null,
      // Note: Do NOT reset attempts to prevent infinite retry loops
    },
  });

  console.log(`\nReset ${result.count} job(s) to PENDING status`);

  return {
    found: stuckJobs.length,
    reset: result.count,
    skipped: skippedJobs,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    const result = await recoverStuckEmbeddings(options);

    console.log('\n--- Summary ---');
    console.log(JSON.stringify(result, null, 2));

    // Exit code:
    // 0 = success (jobs reset or no stuck jobs)
    // 1 = found stuck jobs but none were reset (dry-run or all skipped)
    const exitCode = result.reset > 0 || result.found === 0 ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error('Error during recovery:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
