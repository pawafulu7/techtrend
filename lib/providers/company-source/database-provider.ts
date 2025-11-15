import { prisma } from '@/lib/database';
import type { CompanySource, CompanySourceProvider } from './interface';

const sourceInclude = {
  group: { select: { id: true, type: true } },
  tagAssignments: {
    select: {
      tag: {
        select: { id: true, name: true },
      },
    },
  },
} as const;

function toCompanySource(row: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  groupId: string | null;
  group?: { id: string; type: string } | null;
  tagAssignments: Array<{ tag: { id: string; name: string } }>;
}): CompanySource {
  return {
    id: row.id,
    name: row.name,
    siteUrl: row.url,
    isActive: row.enabled,
    categoryId: row.groupId ?? undefined,
    metadata: {
      groupType: row.group?.type,
    },
  };
}

/**
 * Database company source provider (Phase 2 prototype)
 * Returns company sources from database using Source.groupId
 */
export class DatabaseCompanySourceProvider implements CompanySourceProvider {
  async getSources(): Promise<CompanySource[]> {
    const rows = await prisma.source.findMany({
      where: {
        enabled: true,
        groupId: { not: null },
        group: { type: 'company_blog' },
      },
      include: sourceInclude,
      orderBy: { name: 'asc' },
    });

    return rows.map(toCompanySource);
  }

  async getSourcesByCategory(categoryId: string): Promise<CompanySource[]> {
    if (!categoryId) return [];

    const rows = await prisma.source.findMany({
      where: {
        enabled: true,
        groupId: categoryId,
      },
      include: sourceInclude,
      orderBy: { name: 'asc' },
    });

    return rows.map(toCompanySource);
  }

  /**
   * Get sources by tag ID (optional method for tag-based filtering)
   */
  async getSourcesByTag(tagId: string): Promise<CompanySource[]> {
    if (!tagId) return [];

    const rows = await prisma.source.findMany({
      where: {
        enabled: true,
        tagAssignments: { some: { tagId } },
      },
      include: sourceInclude,
      orderBy: { name: 'asc' },
    });

    return rows.map(toCompanySource);
  }
}
