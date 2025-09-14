/**
 * Redis cache namespace constants
 * Centralized cache key prefixes to prevent key collisions
 */

/**
 * Main cache namespace prefix for the TechTrend application
 */
export const CACHE_NAMESPACE_PREFIX = '@techtrend/cache';

/**
 * Cache namespaces for different cache layers and domains
 */
export const CACHE_NAMESPACES = {
  // Article-related caches
  ARTICLES: `${CACHE_NAMESPACE_PREFIX}:articles`,
  ARTICLES_API: `${CACHE_NAMESPACE_PREFIX}:api:articles`,
  ARTICLES_LIGHTWEIGHT: `${CACHE_NAMESPACE_PREFIX}:api:lightweight`,
  ARTICLES_RELATED: `${CACHE_NAMESPACE_PREFIX}:related`,

  // Layer-based caches
  L1_PUBLIC: `${CACHE_NAMESPACE_PREFIX}:l1:public`,
  L2_USER: `${CACHE_NAMESPACE_PREFIX}:l2:user`,
  L3_SEARCH: `${CACHE_NAMESPACE_PREFIX}:l3:search`,

  // Feature-specific caches
  TAG_CLOUD: `${CACHE_NAMESPACE_PREFIX}:tagcloud`,
  STATS: `${CACHE_NAMESPACE_PREFIX}:stats`,
  POPULAR: `${CACHE_NAMESPACE_PREFIX}:popular`,

  // User-specific caches (non-namespaced for backward compatibility)
  USER: 'user',
  RECOMMENDATIONS: 'recommendations',
} as const;

/**
 * Cache TTL (Time To Live) constants in seconds
 */
export const CACHE_TTL = {
  /** Short-lived cache for frequently changing data (5 minutes) */
  SHORT: 300,

  /** Medium-lived cache for moderately stable data (10 minutes) */
  MEDIUM: 600,

  /** Long-lived cache for stable data (30 minutes) */
  LONG: 1800,

  /** Very long-lived cache for rarely changing data (1 hour) */
  VERY_LONG: 3600,

  /** Session cache (24 hours) */
  SESSION: 86400,
} as const;

/**
 * Helper function to create cache key patterns
 * @param namespace - The cache namespace
 * @param pattern - The pattern to append (optional)
 * @returns Formatted cache key pattern
 */
export function createCachePattern(namespace: string, pattern: string = '*'): string {
  return `${namespace}:${pattern}`;
}

/**
 * Helper function to create user-specific cache keys
 * @param userId - The user ID
 * @param type - The cache type (favorites, read_status, recommendations)
 * @returns Formatted user cache key
 */
export function createUserCacheKey(userId: string, type?: string): string {
  const baseKey = `${CACHE_NAMESPACES.USER}:${userId}`;
  return type ? `${baseKey}:${type}` : baseKey;
}

/**
 * Helper function to create L2 user cache keys
 * @param userId - The user ID
 * @param type - The cache type
 * @returns Formatted L2 user cache key
 */
export function createL2UserCacheKey(userId: string, type?: string): string {
  const baseKey = `${CACHE_NAMESPACES.L2_USER}:${userId}`;
  return type ? `${baseKey}:${type}` : baseKey;
}