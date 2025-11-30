/**
 * Interest Categories Seed
 *
 * Seeds InterestCategory and TagCategoryMapping tables.
 * Run: npx tsx prisma/seed/interest-categories.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  INTEREST_CATEGORIES,
  isGenericTag,
} from '../../lib/personalization/constants';

const prisma = new PrismaClient();

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

  let mappingCount = 0;
  let skippedGeneric = 0;

  for (const tag of existingTags) {
    // Skip generic tags
    if (isGenericTag(tag.name)) {
      skippedGeneric++;
      continue;
    }

    // Find matching categories for this tag
    const lowerTagName = tag.name.toLowerCase();

    for (const categoryDef of INTEREST_CATEGORIES) {
      const isMatch = categoryDef.tagPatterns.some(
        (pattern) => pattern.toLowerCase() === lowerTagName
      );

      if (isMatch) {
        const categoryId = categoryMap.get(categoryDef.slug);
        if (!categoryId) continue;

        // Upsert mapping
        await prisma.tagCategoryMapping.upsert({
          where: {
            tagId_categoryId: {
              tagId: tag.id,
              categoryId: categoryId,
            },
          },
          update: {},
          create: {
            tagId: tag.id,
            categoryId: categoryId,
          },
        });
        mappingCount++;
      }
    }
  }

  console.log(`  Skipped ${skippedGeneric} generic tags`);
  console.log(`  Created ${mappingCount} tag-category mappings`);
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
