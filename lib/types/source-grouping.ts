/**
 * Source Grouping Types
 *
 * Plain Object types (no Prisma dependency) for client-server communication.
 * These types can be safely imported by client components.
 */

/**
 * Source Group (Plain Object)
 *
 * Serializable representation of SourceGroup for client components.
 * Does not depend on @prisma/client types.
 */
export interface SourceGroupPlain {
  id: string;
  name: string;
  type: string;
  ordering: number;
}

/**
 * Grouped Sources
 *
 * Sources grouped by their SourceGroup.
 * Can be safely imported by client components.
 */
export interface GroupedSources {
  group: SourceGroupPlain;
  sources: Array<{ id: string; name: string }>;
}
