/**
 * Tag Extraction Utility
 *
 * Provides common tag extraction, normalization, and deduplication logic
 * for use across fetchers and content processors.
 *
 * Design principles:
 * - Consistent normalization (trim, NFKC, whitespace collapse)
 * - Case-insensitive deduplication with first-win ordering
 * - Safe handling of undefined/null/empty inputs
 * - Length guardrails (2-50 characters)
 */

/** Minimum tag length (inclusive) */
const MIN_TAG_LENGTH = 2;

/** Maximum tag length (inclusive) */
const MAX_TAG_LENGTH = 50;

/** Characters to strip from the beginning of tags */
const LEADING_CHARS_TO_STRIP = /^[#@]+/;

/** Multiple whitespace pattern */
const MULTIPLE_WHITESPACE = /\s+/g;

/**
 * Tag normalization options
 */
export interface TagNormalizationOptions {
  /** Minimum tag length (default: 2) */
  minLength?: number;
  /** Maximum tag length (default: 50) */
  maxLength?: number;
  /** Whether to lowercase the tag (default: false to preserve original case) */
  lowercase?: boolean;
}

/**
 * Normalize a single tag string
 *
 * Processing steps:
 * 1. Trim whitespace
 * 2. NFKC normalization (full-width to half-width, etc.)
 * 3. Collapse multiple whitespace to single space
 * 4. Strip leading # and @ symbols
 * 5. Validate length (2-50 characters by default)
 *
 * @param tag - Raw tag string to normalize
 * @param options - Normalization options
 * @returns Normalized tag string, or null if invalid
 */
export function normalizeTag(
  tag: string,
  options: TagNormalizationOptions = {}
): string | null {
  const {
    minLength = MIN_TAG_LENGTH,
    maxLength = MAX_TAG_LENGTH,
    lowercase = false,
  } = options;

  if (!tag || typeof tag !== 'string') {
    return null;
  }

  // Trim and NFKC normalize (handles full-width characters)
  let normalized = tag.trim().normalize('NFKC');

  // Collapse multiple whitespace to single space
  normalized = normalized.replace(MULTIPLE_WHITESPACE, ' ');

  // Strip leading # and @ symbols
  normalized = normalized.replace(LEADING_CHARS_TO_STRIP, '');

  // Apply lowercase if requested
  if (lowercase) {
    normalized = normalized.toLowerCase();
  }

  // Validate length
  if (normalized.length < minLength || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

/**
 * Deduplicate tags with case-insensitive comparison
 *
 * Preserves the first occurrence of each tag (first-win ordering).
 * Original case is preserved in the output.
 *
 * @param tags - Array of tags to deduplicate
 * @returns Deduplicated array with original case preserved
 */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }

  return result;
}

/**
 * Extract and normalize tags from a categories array
 *
 * Common pattern used by RSS fetchers to extract tags from
 * the categories field of feed items.
 *
 * @param categories - Array of category strings (may contain empty/invalid entries)
 * @param options - Normalization options
 * @returns Array of normalized, deduplicated tags
 */
export function extractTagsFromCategories(
  categories: string[] | undefined | null,
  options: TagNormalizationOptions = {}
): string[] {
  if (!categories || !Array.isArray(categories)) {
    return [];
  }

  const normalized: string[] = [];

  for (const category of categories) {
    const tag = normalizeTag(category, options);
    if (tag !== null) {
      normalized.push(tag);
    }
  }

  return dedupeTags(normalized);
}

/**
 * Merge extracted tags with base tags
 *
 * Base tags are placed first, followed by extracted tags.
 * Duplicates are removed (base tags take precedence).
 *
 * @param extractedTags - Tags extracted from content
 * @param baseTags - Base/default tags to include
 * @returns Merged array with base tags first, deduplicated
 */
export function mergeWithBaseTags(
  extractedTags: string[],
  baseTags: string[]
): string[] {
  // Base tags first, then extracted tags
  const combined = [...baseTags, ...extractedTags];
  return dedupeTags(combined);
}

/**
 * Extract tags from text using keyword matching
 *
 * Simple keyword-based tag extraction for sources that don't
 * provide structured categories.
 *
 * @param text - Text to extract tags from
 * @param keywords - Keywords to match (case-insensitive)
 * @returns Array of matched keywords as tags
 */
export function extractTagsFromText(
  text: string,
  keywords: string[]
): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lowerText = text.toLowerCase();
  const matched: string[] = [];

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }

  return dedupeTags(matched);
}

/**
 * Options for extractTagsFromRSSItem
 */
export interface RSSTagExtractionOptions extends TagNormalizationOptions {
  /** Base tags to always include */
  baseTags?: string[];
  /** Additional keywords to extract from title/content */
  keywords?: string[];
  /** Whether to include title in keyword search */
  searchTitle?: boolean;
  /** Whether to include content in keyword search */
  searchContent?: boolean;
}

/**
 * Extract tags from an RSS item
 *
 * Combines multiple extraction strategies:
 * 1. Categories field extraction
 * 2. Keyword matching in title/content (if keywords provided)
 * 3. Base tags (if provided)
 *
 * @param item - RSS item object (must have categories, title, content fields)
 * @param options - Extraction options
 * @returns Array of extracted and normalized tags
 */
export function extractTagsFromRSSItem(
  item: {
    categories?: string[];
    title?: string;
    content?: string;
    contentSnippet?: string;
  } | null | undefined,
  options: RSSTagExtractionOptions = {}
): string[] {
  if (!item) {
    return options.baseTags ? [...options.baseTags] : [];
  }

  const {
    baseTags = [],
    keywords = [],
    searchTitle = true,
    searchContent = true,
    ...normOptions
  } = options;

  // Extract from categories
  const categoryTags = extractTagsFromCategories(item.categories, normOptions);

  // Extract from text using keywords
  let keywordTags: string[] = [];
  if (keywords.length > 0) {
    const textParts: string[] = [];
    if (searchTitle && item.title) {
      textParts.push(item.title);
    }
    if (searchContent) {
      if (item.content) textParts.push(item.content);
      if (item.contentSnippet) textParts.push(item.contentSnippet);
    }
    const combinedText = textParts.join(' ');
    keywordTags = extractTagsFromText(combinedText, keywords);
  }

  // Merge all tags: baseTags first, then categories, then keywords
  return mergeWithBaseTags([...categoryTags, ...keywordTags], baseTags);
}
