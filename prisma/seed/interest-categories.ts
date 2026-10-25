/**
 * Interest Categories Seed
 *
 * Seeds InterestCategory and TagCategoryMapping tables.
 * Run: npx tsx prisma/seed/interest-categories.ts
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { INTEREST_CATEGORIES } from '../../lib/personalization/constants';
import { syncTagCategoryMappings } from '../../lib/personalization/tag-category-mapping';

const prisma = createPrismaClient();

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
  const { created, deleted } = await syncTagCategoryMappings(prisma);
  console.log(
    `  Created ${created} and deleted ${deleted} tag-category mappings`
  );
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
