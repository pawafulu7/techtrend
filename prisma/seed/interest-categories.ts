/**
 * Interest Categories Seed
 *
 * Seeds InterestCategory and TagCategoryMapping tables.
 * Run: npx tsx prisma/seed/interest-categories.ts
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import {
  INTEREST_CATEGORIES,
  isGenericTag,
} from '../../lib/personalization/constants';
import { TagNormalizer } from '../../lib/services/tag-normalizer';

const prisma = createPrismaClient();

/**
 * Build a normalized pattern map for efficient matching
 * Maps normalized tag names to their category slugs
 */
function buildNormalizedPatternMap(): Map<string, string[]> {
  const patternMap = new Map<string, string[]>();

  for (const category of INTEREST_CATEGORIES) {
    for (const pattern of category.tagPatterns) {
      // Normalize the pattern using TagNormalizer
      const normalized = TagNormalizer.normalize(pattern);
      const normalizedName = normalized.name.toLowerCase();

      const existing = patternMap.get(normalizedName) || [];
      if (!existing.includes(category.slug)) {
        existing.push(category.slug);
        patternMap.set(normalizedName, existing);
      }

      // Also add the original pattern (lowercase) for direct matches
      const originalLower = pattern.toLowerCase();
      if (originalLower !== normalizedName) {
        const existingOriginal = patternMap.get(originalLower) || [];
        if (!existingOriginal.includes(category.slug)) {
          existingOriginal.push(category.slug);
          patternMap.set(originalLower, existingOriginal);
        }
      }
    }
  }

  return patternMap;
}

async function seedInterestCategories() {
  console.log('Seeding interest categories...');

  // Upsert categories
  for (const category of INTEREST_CATEGORIES) {
    await prisma.interestCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        icon: category.icon,
        sortOrder: category.sortOrder,
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        icon: category.icon,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });
    console.log(`  Created/updated category: ${category.slug}`);
  }

  console.log(`Seeded ${INTEREST_CATEGORIES.length} categories`);
}

async function seedTagCategoryMappings() {
  console.log('Seeding tag-category mappings...');

  // Get all categories
  const categories = await prisma.interestCategory.findMany();
  const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));

  // Get all existing tags
  const existingTags = await prisma.tag.findMany({
    select: { id: true, name: true },
  });

  console.log(`  Found ${existingTags.length} existing tags`);

  // Build normalized pattern map for efficient matching
  const patternMap = buildNormalizedPatternMap();

  const mappingsToCreate: { tagId: string; categoryId: string }[] = [];
  let skippedGeneric = 0;

  for (const tag of existingTags) {
    // Skip generic tags
    if (isGenericTag(tag.name)) {
      skippedGeneric++;
      continue;
    }

    // Normalize the tag name using TagNormalizer
    const normalized = TagNormalizer.normalize(tag.name);
    const normalizedName = normalized.name.toLowerCase();
    const originalLower = tag.name.toLowerCase();

    // Find matching categories (check both normalized and original)
    const matchedSlugs = new Set<string>();

    // Check normalized name
    const normalizedMatches = patternMap.get(normalizedName);
    if (normalizedMatches) {
      normalizedMatches.forEach((slug) => matchedSlugs.add(slug));
    }

    // Check original name (for cases where normalization differs)
    if (originalLower !== normalizedName) {
      const originalMatches = patternMap.get(originalLower);
      if (originalMatches) {
        originalMatches.forEach((slug) => matchedSlugs.add(slug));
      }
    }

    // Create mappings for all matched categories
    for (const slug of matchedSlugs) {
      const categoryId = categoryMap.get(slug);
      if (!categoryId) continue;

      mappingsToCreate.push({
        tagId: tag.id,
        categoryId: categoryId,
      });
    }
  }

  // Bulk create mappings (skip duplicates)
  if (mappingsToCreate.length > 0) {
    await prisma.tagCategoryMapping.createMany({
      data: mappingsToCreate,
      skipDuplicates: true,
    });
  }

  console.log(`  Skipped ${skippedGeneric} generic tags`);
  console.log(`  Created ${mappingsToCreate.length} tag-category mappings`);
}

async function printStats() {
  const categoryCount = await prisma.interestCategory.count();
  const mappingCount = await prisma.tagCategoryMapping.count();
  const tagCount = await prisma.tag.count();

  console.log('\n--- Statistics ---');
  console.log(`Interest Categories: ${categoryCount}`);
  console.log(`Tag-Category Mappings: ${mappingCount}`);
  console.log(`Total Tags: ${tagCount}`);

  // Mappings per category
  const mappingsPerCategory = await prisma.tagCategoryMapping.groupBy({
    by: ['categoryId'],
    _count: { tagId: true },
  });

  const categories = await prisma.interestCategory.findMany({
    select: { id: true, slug: true },
  });
  const categoryIdToSlug = new Map(categories.map((c) => [c.id, c.slug]));

  console.log('\nMappings per category:');
  for (const item of mappingsPerCategory) {
    const slug = categoryIdToSlug.get(item.categoryId) || 'unknown';
    console.log(`  ${slug}: ${item._count.tagId} tags`);
  }
}

async function main() {
  console.log('=== Interest Categories Seed ===\n');

  await seedInterestCategories();
  await seedTagCategoryMappings();
  await printStats();

  console.log('\n=== Seed completed ===');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
