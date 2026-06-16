/**
 * User Authentication Cache
 *
 * Redis-based caching layer for user authentication data.
 * Reduces database load during JWT token validation while
 * maintaining data freshness through short TTL.
 *
 * Key design decisions:
 * - 2-minute TTL (CodexMCP recommended for deleted user detection)
 * - Redis-only (no L1 cache to avoid invalidation issues across processes)
 * - Graceful degradation on cache failures
 */

import { getRedisService } from '@/lib/redis/factory';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Cached user authentication data
 *
 * Minimal set of fields needed for authentication decisions.
 * Does not include PII beyond what's already in the JWT.
 */
export interface UserAuthData {
  /** User role for authorization decisions */
  role: string;
  /** ISO date string if user is soft-deleted, null otherwise */
  deletedAt: string | null;
}

/**
 * Determine whether the given auth data represents an active admin.
 *
 * Pure helper shared by Server Component checks (admin-check.ts) and the
 * proxy maintenance gate, so the admin criteria (not deleted + role==='admin')
 * live in one place.
 */
export function isAdminAuthData(authData: UserAuthData | null): boolean {
  return !!authData && !authData.deletedAt && authData.role === 'admin';
}

/** Cache TTL in seconds (2 minutes as recommended by CodexMCP) */
const CACHE_TTL = 120;

/** Cache key prefix for namespacing */
const CACHE_PREFIX = 'auth:user:';

/**
 * Build cache key from user ID
 */
function buildCacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/**
 * Get user authentication data from cache or database
 *
 * Attempts to read from Redis cache first, falls back to database
 * if cache miss or error. Caches database results on successful fetch.
 *
 * @param userId - User ID to fetch
 * @returns User auth data if found, null if user doesn't exist
 *
 * @example
 * ```typescript
 * const authData = await getUserAuthData(userId);
 * if (!authData || authData.deletedAt) {
 *   // User is deleted or doesn't exist
 *   return null;
 * }
 * token.role = authData.role;
 * ```
 */
export async function getUserAuthData(
  userId: string
): Promise<UserAuthData | null> {
  const cacheKey = buildCacheKey(userId);

  // Try to read from cache
  try {
    const redisService = getRedisService();
    const cached = await redisService.getJSON<UserAuthData>(cacheKey);

    if (cached) {
      logger.debug({ userId }, 'User auth data cache hit');
      return cached;
    }
  } catch (error) {
    // Log but don't fail - cache is optional optimization
    logger.warn(
      { err: error, userId },
      'Redis cache read failed for user auth'
    );
  }

  // Cache miss - fetch from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, deletedAt: true },
  });

  if (!user) {
    logger.debug({ userId }, 'User not found in database');
    return null;
  }

  const data: UserAuthData = {
    role: user.role || 'user', // Default to 'user' if role is null
    deletedAt: user.deletedAt?.toISOString() || null,
  };

  // Write to cache (best-effort)
  try {
    const redisService = getRedisService();
    await redisService.setJSON(cacheKey, data, CACHE_TTL);
    logger.debug({ userId, ttl: CACHE_TTL }, 'User auth data cached');
  } catch (error) {
    logger.warn(
      { err: error, userId },
      'Redis cache write failed for user auth'
    );
  }

  return data;
}

/**
 * Invalidate cached user authentication data
 *
 * Should be called whenever user state changes that affects authentication:
 * - User is deleted (soft delete)
 * - User role changes
 * - User is restored from deleted state
 *
 * @param userId - User ID to invalidate
 *
 * @example
 * ```typescript
 * await prisma.user.update({
 *   where: { id: userId },
 *   data: { deletedAt: new Date() }
 * });
 * // Immediately invalidate cache after state change
 * await invalidateUserAuthCache(userId);
 * ```
 */
export async function invalidateUserAuthCache(userId: string): Promise<void> {
  const cacheKey = buildCacheKey(userId);

  try {
    const redisService = getRedisService();
    await redisService.client.del(cacheKey);
    logger.info({ userId }, 'User auth cache invalidated');
  } catch (error) {
    // Log error but don't throw - invalidation failure is non-critical
    // Cache will expire naturally within TTL
    logger.warn({ err: error, userId }, 'Redis cache invalidation failed');
  }
}

/**
 * Check if user is valid (exists and not deleted)
 *
 * Convenience method that combines cache lookup with validity check.
 *
 * @param userId - User ID to check
 * @returns true if user exists and is not deleted
 */
export async function isUserValid(userId: string): Promise<boolean> {
  const data = await getUserAuthData(userId);
  return data !== null && data.deletedAt === null;
}
