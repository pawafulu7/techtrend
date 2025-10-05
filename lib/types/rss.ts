import { z } from 'zod';

/**
 * RSS Item Schema Definition
 *
 * Defines the structure of RSS feed items with flexible field support.
 * Uses Zod for runtime validation and type inference.
 *
 * Design principles:
 * - passthrough() allows unknown fields (RSS spec flexibility)
 * - Requires at least title or link (core RSS fields)
 * - Lightweight validation (safeParse for performance)
 */
export const RSSItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),

  // Content fields (multiple formats supported by rss-parser)
  content: z.string().optional(),
  contentEncoded: z.string().optional(),
  'content:encoded': z.string().optional(),
  contentSnippet: z.string().optional(),
  description: z.string().optional(),

  // Author fields (multiple formats)
  author: z.string().optional(),
  dcCreator: z.string().optional(),
  creator: z.string().optional(),
  'dc:creator': z.string().optional(),
  'itunes:author': z.string().optional(),

  // Tags
  categories: z.array(z.string()).optional(),

  // Metadata
  guid: z.string().optional(),
  isoDate: z.string().optional(),
}).passthrough().refine(
  (item) => item.title || item.link,
  { message: 'RSS item must have at least title or link' }
);

/**
 * RSS Item Type
 *
 * Inferred from RSSItemSchema for type-safe usage.
 */
export type RSSItem = z.infer<typeof RSSItemSchema>;

// Parse result cache for performance optimization
const parseCache = new WeakMap<object, { success: boolean; data?: RSSItem; error?: z.ZodError }>();

/**
 * Type guard for RSS items
 *
 * Uses Zod's safeParse for lightweight validation with caching.
 * Logs validation failures for debugging feed issues.
 *
 * @param item - Unknown item to validate
 * @returns true if item conforms to RSSItem schema
 */
export function isRSSItem(item: unknown): item is RSSItem {
  if (typeof item !== 'object' || item === null) return false;

  // Check cache to avoid re-parsing
  if (parseCache.has(item)) {
    return parseCache.get(item)!.success;
  }

  const result = RSSItemSchema.safeParse(item);

  if (!result.success) {
    // Log validation failure for debugging
    console.debug('RSS item validation failed:', result.error.flatten());
  }

  parseCache.set(item, {
    success: result.success,
    data: result.data,
    error: result.error,
  });

  return result.success;
}

/**
 * Get validated RSS item (avoids re-parsing)
 *
 * Internal helper that retrieves cached parse result.
 *
 * @param item - Unknown item to validate
 * @returns Validated RSSItem or undefined
 */
function getValidatedItem(item: unknown): RSSItem | undefined {
  if (typeof item !== 'object' || item === null) return undefined;

  const cached = parseCache.get(item);
  if (cached?.success) return cached.data;

  const result = RSSItemSchema.safeParse(item);
  parseCache.set(item, {
    success: result.success,
    data: result.data,
    error: result.error,
  });

  return result.success ? result.data : undefined;
}

/**
 * Extract content from RSS item
 *
 * Attempts to retrieve content from multiple possible fields.
 * Priority: contentEncoded > content:encoded > content > description > contentSnippet
 *
 * @param item - Unknown item to extract content from
 * @returns Content string or undefined if not available
 */
export function getContentFromItem(item: unknown): string | undefined {
  const validated = getValidatedItem(item);
  if (!validated) return undefined;

  return validated.contentEncoded
    || validated['content:encoded']
    || validated.content
    || validated.description
    || validated.contentSnippet;
}

/**
 * Extract author from RSS item
 *
 * Attempts to retrieve author from multiple possible fields.
 * Priority: author > dcCreator > creator > dc:creator > itunes:author
 *
 * @param item - Unknown item to extract author from
 * @returns Author string or undefined if not available
 */
export function getAuthorFromItem(item: unknown): string | undefined {
  const validated = getValidatedItem(item);
  if (!validated) return undefined;

  return validated.author
    || validated.dcCreator
    || validated.creator
    || validated['dc:creator']
    || validated['itunes:author'];
}

/**
 * Extract tags from RSS item
 *
 * Retrieves categories array from RSS item.
 *
 * @param item - Unknown item to extract tags from
 * @returns Array of tag strings, empty array if not available
 */
export function getTagsFromItem(item: unknown): string[] {
  const validated = getValidatedItem(item);
  if (!validated) return [];

  return validated.categories || [];
}

/**
 * Extract thumbnail from RSS item
 *
 * Attempts to retrieve thumbnail URL from extended fields.
 * Supports multiple formats: enclosure, media:content, media:thumbnail, itunes:image
 * Priority: enclosure.url > media:content > media:thumbnail > itunes:image
 *
 * @param item - Unknown item to extract thumbnail from
 * @returns Thumbnail URL or undefined if not available
 */
export function getThumbnailFromItem(item: unknown): string | undefined {
  const validated = getValidatedItem(item);
  if (!validated) return undefined;

  // Access extended fields that may not be in the base schema
  const itemAny = validated as any;

  // Handle enclosure (can be array or single object)
  if (itemAny.enclosure) {
    const enclosure = Array.isArray(itemAny.enclosure)
      ? itemAny.enclosure[0]
      : itemAny.enclosure;

    if (enclosure?.url && typeof enclosure.url === 'string') {
      return enclosure.url;
    }
  }

  // Check media:content
  if (itemAny['media:content']?.['@_url'] && typeof itemAny['media:content']['@_url'] === 'string') {
    return itemAny['media:content']['@_url'];
  }

  // Check media:thumbnail
  if (itemAny['media:thumbnail']?.['@_url'] && typeof itemAny['media:thumbnail']['@_url'] === 'string') {
    return itemAny['media:thumbnail']['@_url'];
  }

  // Check itunes:image
  if (itemAny['itunes:image']) {
    // Can be string or object with href
    if (typeof itemAny['itunes:image'] === 'string') {
      return itemAny['itunes:image'];
    }
    if (itemAny['itunes:image']?.href && typeof itemAny['itunes:image'].href === 'string') {
      return itemAny['itunes:image'].href;
    }
  }

  return undefined;
}
