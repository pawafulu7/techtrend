/**
 * Source Grouping Utilities (Server-side)
 *
 * Provides grouping functionality based on SourceGroup schema.
 * Can use Prisma because it runs on server only.
 */

import { prisma } from '@/lib/prisma';
import type { GroupedSources } from '@/lib/types/source-grouping';

/**
 * Group sources by their SourceGroup
 *
 * Server-side only (uses Prisma).
 * Converts Prisma SourceGroup to Plain Object for client safety.
 *
 * @param sources - Sources with groupId
 * @returns Grouped sources with Plain Object types
 */
export async function groupSourcesByGroupId(
  sources: Array<{ id: string; name: string; groupId?: string | null }>
): Promise<GroupedSources[]> {
  // Extract unique groupIds
  const groupIds = Array.from(
    new Set(sources.map(s => s.groupId).filter((id): id is string => id != null))
  );

  if (groupIds.length === 0) return [];

  // Fetch SourceGroup information from database
  const groups = await prisma.sourceGroup.findMany({
    where: { id: { in: groupIds } },
    orderBy: { ordering: 'asc' },
  });


  // Group sources by groupId
  const grouped = new Map<string, Array<{ id: string; name: string }>>();
  sources.forEach(source => {
    if (source.groupId) {
      const groupSources = grouped.get(source.groupId) || [];
      groupSources.push({ id: source.id, name: source.name });
      grouped.set(source.groupId, groupSources);
    }
  });

  // Convert Prisma SourceGroup to Plain Object
  const result: GroupedSources[] = groups.map(group => ({
    group: {
      id: group.id,
      name: group.name,
      type: group.type,
      ordering: group.ordering,
    },
    sources: grouped.get(group.id) || [],
  }));

  // Filter out empty groups (CodexMCP recommendation)
  return result.filter(g => g.sources.length > 0);
}
