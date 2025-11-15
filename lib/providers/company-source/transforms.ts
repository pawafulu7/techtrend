/**
 * Company Source Transforms
 *
 * Shared utilities for converting Prisma Source to CompanySource.
 */

import type { CompanySource } from './interface';

/**
 * Prisma include for company source queries
 */
export const sourceInclude = {
  group: { select: { id: true, type: true } },
  tagAssignments: {
    select: {
      tag: {
        select: { id: true, name: true },
      },
    },
  },
  _count: {
    select: { articles: true },
  },
} as const;

/**
 * Convert Prisma Source row to CompanySource
 */
export function toCompanySource(row: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  groupId: string | null;
  group?: { id: string; type: string } | null;
  tagAssignments: Array<{ tag: { id: string; name: string } }>;
  _count?: { articles: number };
}): CompanySource {
  return {
    id: row.id,
    name: row.name,
    siteUrl: row.url,
    isActive: row.enabled,
    categoryId: row.groupId ?? undefined,
    metadata: {
      groupType: row.group?.type,
      articleCount: row._count?.articles,
    },
  };
}
