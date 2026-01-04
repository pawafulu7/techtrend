/**
 * Diff Summary Batch Script
 *
 * Generates weekly diff summaries for all categories.
 * Intended to run weekly via GitHub Actions (Monday 02:00 JST).
 *
 * Usage:
 *   npx tsx scripts/ai/generate-diff-summaries.ts [options]
 *
 * Options:
 *   --week YYYY-Www        Target ISO week (default: current week)
 *   --category <slug>      Generate for specific category only
 *   --dry-run              Show what would be generated without calling LLM
 *   --concurrency <n>      Number of parallel API calls (default: 3)
 */

import { prisma } from '@/lib/prisma';
import {
  getDiffSummaryService,
  getISOWeek,
  getPreviousISOWeek,
} from '@/lib/ai/diff-summary';
import {
  SOURCE_CATEGORIES,
  SourceCategoryId,
} from '@/lib/constants/source-categories';

interface ParsedArgs {
  week: string;
  category?: SourceCategoryId;
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let week = getISOWeek(new Date());
  let category: SourceCategoryId | undefined;
  let dryRun = false;
  let concurrency = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && args[i + 1]) {
      const weekArg = args[i + 1];
      if (/^\d{4}-W\d{2}$/.test(weekArg)) {
        week = weekArg;
      } else {
        console.warn(`Warning: Invalid --week format "${weekArg}". Using default.`);
      }
      i++;
    } else if (args[i] === '--category' && args[i + 1]) {
      const cat = args[i + 1] as SourceCategoryId;
      if (SOURCE_CATEGORIES[cat]) {
        category = cat;
      } else {
        console.warn(`Warning: Unknown category "${args[i + 1]}". Processing all.`);
      }
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (n > 0 && n <= 10) {
        concurrency = n;
      }
      i++;
    }
  }

  return { week, category, dryRun, concurrency };
}

async function main() {
  const { week, category, dryRun, concurrency } = parseArgs();
  const baseline = getPreviousISOWeek(week);

  console.log('=== Diff Summary Generation ===');
  console.log(`Current Period: ${week}`);
  console.log(`Baseline Period: ${baseline}`);
  console.log(`Category: ${category || 'ALL'}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would generate diff summaries for:');
    const categories = category
      ? [category]
      : (Object.keys(SOURCE_CATEGORIES) as SourceCategoryId[]);
    for (const cat of categories) {
      const info = SOURCE_CATEGORIES[cat];
      console.log(`  - ${cat}: ${info.name} (${info.sourceIds.length} sources)`);
    }
    console.log('');
    console.log('[DRY RUN] No API calls made.');
    return;
  }

  try {
    const service = getDiffSummaryService();

    if (category) {
      // Single category
      console.log(`Generating for category: ${category}`);
      const result = await service.generateForCategory(category, week, baseline);

      if (result.success) {
        console.log(`✓ ${category}: Success`);
        if (result.data) {
          console.log(`  Changes: ${result.data.changes.length}`);
          console.log(`  Unchanged: ${result.data.unchanged.length}`);
        }
      } else {
        console.error(`✗ ${category}: ${result.error}`);
        process.exit(1);
      }
    } else {
      // All categories
      console.log('Generating for all categories...\n');
      const results = await service.generateForAllCategories(week, baseline);

      console.log('\n=== Results ===');
      console.log(`Total: ${results.total}`);
      console.log(`Successful: ${results.successful}`);
      console.log(`Failed: ${results.failed}`);
      console.log('');

      for (const result of results.results) {
        if (result.success) {
          const changeCount = result.data?.changes.length ?? 0;
          console.log(`✓ ${result.categorySlug}: ${changeCount} changes`);
        } else {
          console.log(`✗ ${result.categorySlug}: ${result.error}`);
        }
      }

      if (results.failed > 0) {
        console.error(`\nWarning: ${results.failed} categories failed.`);
        // Don't exit with error code for partial failures
      }
    }

    console.log(`\nCompleted at: ${new Date().toISOString()}`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
