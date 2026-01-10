/**
 * Cleanup Unused Tags Script
 *
 * Purpose: Delete tags that have no article associations
 * Target: Tags with 0 articles (approximately 4,584 tags)
 *
 * Usage:
 *   npx ts-node scripts/maintenance/cleanup-unused-tags.ts [--dry-run] [--batch-size=1000]
 *
 * Options:
 *   --dry-run     Show what would be deleted without actually deleting
 *   --batch-size  Number of tags to process per batch (default: 1000)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CleanupOptions {
  dryRun: boolean;
  batchSize: number;
}

interface UnusedTag {
  id: string;
  name: string;
}

async function getUnusedTags(): Promise<UnusedTag[]> {
  const unusedTags = await prisma.$queryRaw<UnusedTag[]>`
    SELECT t.id, t.name
    FROM "Tag" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "_ArticleToTag" at WHERE at."B" = t.id
    )
    ORDER BY t.id
  `;
  return unusedTags;
}

async function cleanupUnusedTags(options: CleanupOptions): Promise<void> {
  const { dryRun, batchSize } = options;

  console.log('='.repeat(60));
  console.log('Unused Tags Cleanup Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Batch Size: ${batchSize}`);
  console.log('');

  try {
    // Get all unused tags
    const unusedTags = await getUnusedTags();
    console.log(`Found ${unusedTags.length} unused tags`);

    if (unusedTags.length === 0) {
      console.log('No unused tags found. Exiting.');
      return;
    }

    if (dryRun) {
      // Show sample of tags to be deleted
      console.log('\nSample of tags that would be deleted:');
      unusedTags.slice(0, 20).forEach((tag, i) => {
        console.log(`  ${i + 1}. ${tag.name} (id: ${tag.id})`);
      });
      if (unusedTags.length > 20) {
        console.log(`  ... and ${unusedTags.length - 20} more`);
      }

      // Check TagCategoryMapping associations
      const mappingCount = await prisma.tagCategoryMapping.count({
        where: { tagId: { in: unusedTags.map((t) => t.id) } },
      });
      console.log(`\nTagCategoryMappings that would be deleted: ${mappingCount}`);

      console.log('\nDry run complete. Use without --dry-run to execute.');
      return;
    }

    // Process in batches
    let totalDeleted = 0;
    let totalMappingsDeleted = 0;

    for (let i = 0; i < unusedTags.length; i += batchSize) {
      const batch = unusedTags.slice(i, i + batchSize);
      const batchIds = batch.map((t) => t.id);

      console.log(
        `\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(unusedTags.length / batchSize)} (${batch.length} tags)...`
      );

      await prisma.$transaction(async (tx) => {
        // Delete TagCategoryMappings first (foreign key constraint)
        const mappingsDeleted = await tx.tagCategoryMapping.deleteMany({
          where: { tagId: { in: batchIds } },
        });
        totalMappingsDeleted += mappingsDeleted.count;

        // Delete tags
        const tagsDeleted = await tx.tag.deleteMany({
          where: { id: { in: batchIds } },
        });
        totalDeleted += tagsDeleted.count;

        console.log(
          `  Deleted ${tagsDeleted.count} tags, ${mappingsDeleted.count} mappings`
        );
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('Cleanup Summary');
    console.log('='.repeat(60));
    console.log(`Total tags deleted: ${totalDeleted}`);
    console.log(`Total category mappings deleted: ${totalMappingsDeleted}`);
    console.log('Cleanup completed successfully!');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}

function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  let dryRun = false;
  let batchSize = 1000;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!isNaN(value) && value > 0) {
        batchSize = value;
      }
    }
  }

  return { dryRun, batchSize };
}

async function main(): Promise<void> {
  const options = parseArgs();

  try {
    await cleanupUnusedTags(options);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
