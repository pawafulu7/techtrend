/**
 * 興味の分野の一覧
 */

import { PrismaClient } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import type { InterestCategoryWithCount } from './types';

/**
 * 有効な分野を表示順（sortOrder の昇順）に返す
 */
export async function getActiveInterestCategories(
  db: PrismaClient = prisma
): Promise<InterestCategoryWithCount[]> {
  return db.interestCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      icon: true,
      sortOrder: true,
      isActive: true,
    },
  });
}
