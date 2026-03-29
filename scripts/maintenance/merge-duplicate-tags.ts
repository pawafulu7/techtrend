/**
 * Merge Duplicate Tags Script
 *
 * Purpose: Merge duplicate tags (same name, different IDs) into a single canonical tag
 * Target: Approximately 2,942 duplicate tag groups
 *
 * Merge Rules:
 *   1. The tag with the most article associations becomes the canonical tag
 *   2. If tied, the lexicographically smallest ID wins
 *   3. Category is inherited from canonical tag, or from duplicates if canonical has none
 *
 * Usage:
 *   npx ts-node scripts/maintenance/merge-duplicate-tags.ts [--dry-run] [--batch-size=100]
 *
 * Options:
 *   --dry-run     Show what would be merged without actually merging
 *   --batch-size  Number of duplicate groups to process per batch (default: 100)
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface MergeOptions {
  dryRun: boolean;
  batchSize: number;
}

interface DuplicateGroup {
  name: string;
  ids: string[];
}

interface TagStats {
  id: string;
  category: string | null;
  article_count: bigint;
}

async function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  // Use COLLATE "C" (binary) to bypass potentially corrupt index
  // Single query: group by name with binary collation and aggregate IDs
  const rows = await prisma.$queryRaw<{ name: string; ids: string[] }[]>`
    SELECT name COLLATE "C" as name, json_agg(id ORDER BY id ASC) as ids
    FROM "Tag"
    GROUP BY name COLLATE "C"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;

  return rows;
}

async function getTagStats(tagIds: string[]): Promise<TagStats[]> {
  return prisma.$queryRaw<TagStats[]>`
    SELECT t.id, t.category, COUNT(at."A") as article_count
    FROM "Tag" t
    LEFT JOIN "_ArticleToTag" at ON at."B" = t.id
    WHERE t.id = ANY(${tagIds})
    GROUP BY t.id, t.category
    ORDER BY article_count DESC, t.id ASC
  `;
}

interface MergeResult {
  canonicalId: string;
  mergedCount: number;
  articlesReassigned: number;
  categoryInherited: boolean;
  skipped: boolean;
}

async function mergeGroup(
  group: DuplicateGroup,
  dryRun: boolean
): Promise<MergeResult> {
  const stats = await getTagStats(group.ids);

  // Skip if no tags found (already deleted by cleanup-unused-tags)
  if (stats.length === 0) {
    return {
      canonicalId: '',
      mergedCount: 0,
      articlesReassigned: 0,
      categoryInherited: false,
      skipped: true,
    };
  }

  // Skip if only one tag remains (no merge needed)
  if (stats.length === 1) {
    return {
      canonicalId: stats[0].id,
      mergedCount: 0,
      articlesReassigned: 0,
      categoryInherited: false,
      skipped: true,
    };
  }

  const canonicalId = stats[0].id;
  // Use stats to get duplicateIds (safer than group.ids which may contain deleted tags)
  const duplicateIds = stats.slice(1).map((s) => s.id);

  if (dryRun) {
    // Count articles that would be reassigned
    const reassignCount = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "A") as count
      FROM "_ArticleToTag"
      WHERE "B" = ANY(${duplicateIds})
      AND "A" NOT IN (
        SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${canonicalId}
      )
    `;

    const categoryInherited =
      !stats[0].category && stats.some((s) => s.category !== null);

    return {
      canonicalId,
      mergedCount: duplicateIds.length,
      articlesReassigned: Number(reassignCount[0]?.count ?? 0),
      categoryInherited,
      skipped: false,
    };
  }

  // Execute merge in transaction
  return prisma.$transaction(async (tx) => {
    // 1. Reassign article associations to canonical tag (avoid duplicates)
    const reassignResult = await tx.$executeRaw`
      INSERT INTO "_ArticleToTag" ("A", "B")
      SELECT DISTINCT "A", ${canonicalId}::text
      FROM "_ArticleToTag"
      WHERE "B" = ANY(${duplicateIds}::text[])
      AND "A" NOT IN (
        SELECT "A" FROM "_ArticleToTag" WHERE "B" = ${canonicalId}::text
      )
      ON CONFLICT DO NOTHING
    `;

    // 2. Migrate category mappings (if any)
    await tx.$executeRaw`
      INSERT INTO "TagCategoryMapping" (id, "tagId", "categoryId", "createdAt")
      SELECT gen_random_uuid()::text, ${canonicalId}::text, "categoryId", NOW()
      FROM "TagCategoryMapping"
      WHERE "tagId" = ANY(${duplicateIds}::text[])
      AND "categoryId" NOT IN (
        SELECT "categoryId" FROM "TagCategoryMapping" WHERE "tagId" = ${canonicalId}::text
      )
      ON CONFLICT DO NOTHING
    `;

    // 3. Delete old category mappings
    await tx.tagCategoryMapping.deleteMany({
      where: { tagId: { in: duplicateIds } },
    });

    // 4. Delete old article associations
    await tx.$executeRaw`
      DELETE FROM "_ArticleToTag" WHERE "B" = ANY(${duplicateIds}::text[])
    `;

    // 5. Inherit category if canonical has none
    let categoryInherited = false;
    if (!stats[0].category) {
      const inheritFrom = stats.find((s) => s.category !== null);
      if (inheritFrom) {
        await tx.tag.update({
          where: { id: canonicalId },
          data: { category: inheritFrom.category },
        });
        categoryInherited = true;
      }
    }

    // 6. Delete duplicate tags
    await tx.tag.deleteMany({
      where: { id: { in: duplicateIds } },
    });

    return {
      canonicalId,
      mergedCount: duplicateIds.length,
      articlesReassigned: reassignResult,
      categoryInherited,
      skipped: false,
    };
  });
}

async function mergeDuplicateTags(options: MergeOptions): Promise<void> {
  const { dryRun, batchSize } = options;

  console.log('='.repeat(60));
  console.log('Duplicate Tags Merge Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Batch Size: ${batchSize}`);
  console.log('');

  try {
    // Get all duplicate groups
    const duplicateGroups = await getDuplicateGroups();
    console.log(`Found ${duplicateGroups.length} duplicate tag groups`);

    if (duplicateGroups.length === 0) {
      console.log('No duplicate tags found. Exiting.');
      return;
    }

    // Show top duplicates
    console.log('\nTop 10 duplicate groups:');
    duplicateGroups.slice(0, 10).forEach((group, i) => {
      console.log(`  ${i + 1}. "${group.name}" - ${group.ids.length} duplicates`);
    });

    if (dryRun) {
      // Process all groups to gather statistics
      let totalDuplicates = 0;
      let totalArticlesToReassign = 0;
      let categoriesInherited = 0;
      let skippedGroups = 0;

      console.log('\nAnalyzing all groups...');

      for (let i = 0; i < duplicateGroups.length; i += batchSize) {
        const batch = duplicateGroups.slice(i, i + batchSize);
        process.stdout.write(
          `\r  Progress: ${Math.min(i + batchSize, duplicateGroups.length)}/${duplicateGroups.length}`
        );

        for (const group of batch) {
          const result = await mergeGroup(group, true);
          if (result.skipped) {
            skippedGroups++;
            continue;
          }
          totalDuplicates += result.mergedCount;
          totalArticlesToReassign += result.articlesReassigned;
          if (result.categoryInherited) categoriesInherited++;
        }
      }

      console.log('\n\nDry Run Summary:');
      console.log(`  Duplicate groups found: ${duplicateGroups.length}`);
      console.log(`  Groups to skip (already cleaned): ${skippedGroups}`);
      console.log(`  Groups to merge: ${duplicateGroups.length - skippedGroups}`);
      console.log(`  Total duplicates to remove: ${totalDuplicates}`);
      console.log(`  Articles to reassign: ${totalArticlesToReassign}`);
      console.log(`  Categories to inherit: ${categoriesInherited}`);
      console.log('\nDry run complete. Use without --dry-run to execute.');
      return;
    }

    // Process in batches
    let totalMerged = 0;
    let totalArticlesReassigned = 0;
    let totalCategoriesInherited = 0;
    let skippedGroups = 0;
    let errors = 0;

    for (let i = 0; i < duplicateGroups.length; i += batchSize) {
      const batch = duplicateGroups.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(duplicateGroups.length / batchSize);

      console.log(`\nProcessing batch ${batchNum}/${totalBatches}...`);

      for (const group of batch) {
        try {
          const result = await mergeGroup(group, false);
          if (result.skipped) {
            skippedGroups++;
            continue;
          }
          totalMerged += result.mergedCount;
          totalArticlesReassigned += result.articlesReassigned;
          if (result.categoryInherited) totalCategoriesInherited++;
        } catch (error) {
          console.error(`  Error merging "${group.name}":`, error);
          errors++;
        }
      }

      console.log(
        `  Batch complete. Running total: ${totalMerged} tags merged`
      );
    }

    console.log('\n' + '='.repeat(60));
    console.log('Merge Summary');
    console.log('='.repeat(60));
    console.log(`Duplicate groups found: ${duplicateGroups.length}`);
    console.log(`Groups skipped (already cleaned): ${skippedGroups}`);
    console.log(`Total duplicate tags removed: ${totalMerged}`);
    console.log(`Articles reassigned: ${totalArticlesReassigned}`);
    console.log(`Categories inherited: ${totalCategoriesInherited}`);
    console.log(`Errors: ${errors}`);

    if (errors === 0) {
      console.log('\nMerge completed successfully!');
    } else {
      console.log(`\nMerge completed with ${errors} errors.`);
    }
  } catch (error) {
    console.error('Error during merge:', error);
    throw error;
  }
}

function parseArgs(): MergeOptions {
  const args = process.argv.slice(2);
  let dryRun = false;
  let batchSize = 100;

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
    await mergeDuplicateTags(options);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
