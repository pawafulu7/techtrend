/**
 * Normalize query for cache key generation
 *
 * @param query - Raw query
 * @param options - Normalization options
 * @param options.preserveDot - If true, preserve ASCII dot (.) in query.
 *   Useful for article QA where version numbers (e.g., v1.0) should not collide.
 * @returns Normalized query
 *
 * @example
 * ```typescript
 * normalizeQuery('  React   Performance!  ')
 * // => 'react performance'
 *
 * normalizeQuery('v1.0 feature?', { preserveDot: true })
 * // => 'v1.0 feature'
 * ```
 */
export function normalizeQuery(
  query: string,
  options?: { preserveDot?: boolean }
): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');

  if (options?.preserveDot) {
    return normalized.replace(/[!?。、；：！？、]/g, '');
  }
  return normalized.replace(/[!?。、；：！？、.]/g, '');
}
