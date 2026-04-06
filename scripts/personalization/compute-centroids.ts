#!/usr/bin/env npx tsx
/**
 * Compute Category Centroids
 *
 * Batch script to compute and update centroid embeddings for interest categories.
 *
 * Usage:
 *   npx tsx scripts/personalization/compute-centroids.ts [options]
 *
 * Options:
 *   --dry-run           Don't write to database, just show what would happen
 *   --category <id>     Compute centroid for a single category
 *   --embedding-key     Embedding key to use (default: summary)
 *   --model             Model name (default: text-embedding-3-small)
 *   --version           Embedding version (default: 1)
 *   --stats             Show current centroid statistics only
 *
 * Examples:
 *   npx tsx scripts/personalization/compute-centroids.ts
 *   npx tsx scripts/personalization/compute-centroids.ts --dry-run
 *   npx tsx scripts/personalization/compute-centroids.ts --category cm123abc
 *   npx tsx scripts/personalization/compute-centroids.ts --stats
 */

import { CentroidService } from '../../lib/personalization/centroid-service';
import { prisma } from '../../lib/prisma';
import { RedisCache } from '../../lib/cache/redis-cache';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIOptions {
  dryRun: boolean;
  categoryId?: string;
  embeddingKey: string;
  model: string;
  version: number;
  statsOnly: boolean;
}

/**
 * Require a value for an option, exit with error if missing
 */
function requireOptionValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith('-')) {
    console.error(`Error: ${option} requires a value`);
    printHelp();
    process.exit(1);
  }
  return value;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    embeddingKey: 'summary',
    model: 'text-embedding-3-small',
    version: 1,
    statsOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--stats':
        options.statsOnly = true;
        break;
      case '--category':
        options.categoryId = requireOptionValue('--category', args[++i]);
        break;
      case '--embedding-key':
        options.embeddingKey = requireOptionValue('--embedding-key', args[++i]);
        break;
      case '--model':
        options.model = requireOptionValue('--model', args[++i]);
        break;
      case '--version': {
        const value = requireOptionValue('--version', args[++i]);
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
          console.error(`Error: --version must be a number, got: ${value}`);
          process.exit(1);
        }
        options.version = parsed;
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break; // Explicit break to avoid fallthrough warning
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Compute Category Centroids

Usage:
  npx tsx scripts/personalization/compute-centroids.ts [options]

Options:
  --dry-run           Don't write to database, just show what would happen
  --category <id>     Compute centroid for a single category
  --embedding-key     Embedding key to use (default: summary)
  --model             Model name (default: text-embedding-3-small)
  --version           Embedding version (default: 1)
  --stats             Show current centroid statistics only
  --help, -h          Show this help message

Examples:
  npx tsx scripts/personalization/compute-centroids.ts
  npx tsx scripts/personalization/compute-centroids.ts --dry-run
  npx tsx scripts/personalization/compute-centroids.ts --category cm123abc
  npx tsx scripts/personalization/compute-centroids.ts --stats
`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  const service = new CentroidService();

  console.log('=== Compute Category Centroids ===\n');

  // Stats only mode
  if (options.statsOnly) {
    const stats = await service.getCentroidStats();
    console.log('Current Centroid Statistics:');
    console.log(`  Total categories: ${stats.totalCategories}`);
    console.log(`  With centroid: ${stats.categoriesWithCentroid}`);
    console.log(`  Without centroid: ${stats.categoriesWithoutCentroid}`);
    if (stats.oldestCentroid) {
      console.log(`  Oldest: ${stats.oldestCentroid.toISOString()}`);
    }
    if (stats.newestCentroid) {
      console.log(`  Newest: ${stats.newestCentroid.toISOString()}`);
    }
    return;
  }

  // Show configuration
  console.log('Configuration:');
  console.log(`  Dry run: ${options.dryRun}`);
  console.log(`  Embedding key: ${options.embeddingKey}`);
  console.log(`  Model: ${options.model}`);
  console.log(`  Version: ${options.version}`);
  if (options.categoryId) {
    console.log(`  Category: ${options.categoryId}`);
  }
  console.log('');

  // Compute centroids
  const startTime = Date.now();

  if (options.categoryId) {
    // Single category
    const result = await service.computeCategoryCentroid(options.categoryId, {
      dryRun: options.dryRun,
      embeddingKey: options.embeddingKey,
      model: options.model,
      version: options.version,
    });

    console.log('\nResult:');
    console.log(`  Category: ${result.categoryId}`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Sample count: ${result.sampleCount ?? 0}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  } else {
    // All categories
    const results = await service.computeAllCentroids({
      dryRun: options.dryRun,
      embeddingKey: options.embeddingKey,
      model: options.model,
      version: options.version,
    });

    // Results now include slug, no need for separate query
    console.log('\nResults:');
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`  Successful: ${successful.length}/${results.length}`);

    for (const result of results) {
      const slug = result.slug ?? 'unknown';
      const status = result.success ? '✓' : '✗';
      const samples = result.sampleCount ?? 0;
      console.log(`    ${status} ${slug}: ${samples} articles`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }

    if (failed.length > 0) {
      console.log(`\n  Failed categories: ${failed.length}`);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`\nCompleted in ${elapsed}ms`);

  // Invalidate centroid and personalization caches after successful computation
  if (!options.dryRun && !options.statsOnly) {
    try {
      const centroidCache = new RedisCache({ ttl: 3600, namespace: 'personalization' });
      await centroidCache.invalidatePattern('centroids:*');
      await centroidCache.invalidatePattern('ids:*');
      console.log('Centroid and personalization caches invalidated');
    } catch (e) {
      console.warn('Cache invalidation failed (non-fatal):', e);
    }
  }

  // Show final stats
  const finalStats = await service.getCentroidStats();
  console.log('\nFinal Statistics:');
  console.log(`  Categories with centroid: ${finalStats.categoriesWithCentroid}/${finalStats.totalCategories}`);
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
