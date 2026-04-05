/**
 * Tag Service
 *
 * Provides safe tag creation/retrieval operations that prevent duplicate tags.
 * Uses upsert pattern instead of createMany to avoid race conditions.
 */

import { Prisma, Tag } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { TagNormalizer } from './tag-normalizer';

export interface TagServiceOptions {
  /** Maximum number of tags to process in a single call */
  maxTags?: number;
  /** Whether to normalize tag names before processing */
  normalize?: boolean;
}

const DEFAULT_OPTIONS: Required<TagServiceOptions> = {
  maxTags: 10,
  normalize: true,
};

interface NormalizedTag {
  name: string;
  category?: string;
}

/**
 * Get or create tags safely using upsert pattern.
 * This prevents duplicate tags even under concurrent requests.
 *
 * @param tagNames - Array of tag names to get or create
 * @param options - Optional configuration
 * @returns Array of Tag objects (existing or newly created)
 */
export async function getOrCreateTags(
  tagNames: string[],
  options?: TagServiceOptions,
  tx?: Prisma.TransactionClient
): Promise<Tag[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  // Normalize and deduplicate
  let processedTags: NormalizedTag[];
  if (opts.normalize) {
    processedTags = TagNormalizer.normalizeTags(tagNames);
  } else {
    // Just deduplicate without full normalization
    const seen = new Set<string>();
    processedTags = tagNames
      .filter((name) => {
        const trimmed = name.trim();
        if (!trimmed || seen.has(trimmed)) return false;
        seen.add(trimmed);
        return true;
      })
      .map((name) => ({ name: name.trim() }));
  }

  // Limit number of tags
  if (processedTags.length > opts.maxTags) {
    processedTags = processedTags.slice(0, opts.maxTags);
  }

  if (processedTags.length === 0) {
    return [];
  }

  if (tx) {
    // Use provided transaction client — sequential upserts
    const tags: Tag[] = [];
    for (const tag of processedTags) {
      const result = await tx.tag.upsert({
        where: { name: tag.name },
        create: { name: tag.name, category: tag.category || null },
        update: {},
      });
      tags.push(result);
    }
    return tags;
  }

  // Use upsert in a transaction to prevent race conditions
  const tags = await prisma.$transaction(
    processedTags.map((tag) =>
      prisma.tag.upsert({
        where: { name: tag.name },
        create: { name: tag.name, category: tag.category || null },
        update: {}, // No updates needed, just return existing
      })
    )
  );

  return tags;
}

/**
 * Get or create tags with category inference.
 * Categories are inferred from TagNormalizer rules.
 *
 * @param tagNames - Array of tag names to get or create
 * @param options - Optional configuration
 * @returns Array of Tag objects with categories set if inferable
 */
export async function getOrCreateTagsWithCategory(
  tagNames: string[],
  options?: TagServiceOptions
): Promise<Tag[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!tagNames || tagNames.length === 0) {
    return [];
  }

  // Always use normalization to get categories
  const normalizedTags = TagNormalizer.normalizeTags(tagNames);

  // Limit number of tags
  const limitedTags = normalizedTags.slice(0, opts.maxTags);

  if (limitedTags.length === 0) {
    return [];
  }

  // Use upsert in a transaction
  const tags = await prisma.$transaction(
    limitedTags.map((tag) =>
      prisma.tag.upsert({
        where: { name: tag.name },
        create: {
          name: tag.name,
          category: tag.category || null,
        },
        update: {}, // Keep existing data, don't overwrite
      })
    )
  );

  return tags;
}

/**
 * Get tag IDs for connecting to articles.
 * This is a convenience wrapper that returns just the IDs.
 *
 * @param tagNames - Array of tag names
 * @param options - Optional configuration
 * @returns Array of tag IDs for use in Prisma connect
 */
export async function getTagIdsForConnect(
  tagNames: string[],
  options?: TagServiceOptions,
  tx?: Prisma.TransactionClient
): Promise<{ id: string }[]> {
  const tags = await getOrCreateTags(tagNames, options, tx);
  return tags.map((tag) => ({ id: tag.id }));
}

/**
 * Normalize tag names without creating them.
 * Useful for pre-processing before batch operations.
 *
 * @param tagNames - Array of tag names to normalize
 * @returns Array of normalized, deduplicated tag names
 */
export function normalizeTagNames(tagNames: string[]): string[] {
  const normalized = TagNormalizer.normalizeTags(tagNames);
  return normalized.map((t) => t.name);
}

export const TagService = {
  getOrCreateTags,
  getOrCreateTagsWithCategory,
  getTagIdsForConnect,
  normalizeTagNames,
};

export default TagService;
