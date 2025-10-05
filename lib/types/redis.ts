import { Redis } from 'ioredis';

/**
 * Redis Type Extensions
 *
 * Type-safe extensions for Redis client operations.
 * Addresses missing type definitions in ioredis package.
 */

/**
 * Redis with unlink method
 *
 * Extends Redis type to include the unlink method which is missing
 * from ioredis type definitions but exists in runtime.
 *
 * Note: Uses explicit any for Redis method compatibility.
 * The ioredis type definitions have complex overloads that make
 * strict typing impractical for the unlink method.
 */
export interface RedisWithUnlink extends Redis {
   
  unlink(...keys: any[]): Promise<number>;
}

/**
 * Type guard for Redis client with unlink method
 *
 * Checks if Redis client supports the unlink method.
 *
 * @param redis - Redis client to check
 * @returns true if Redis client has unlink method
 */
export function hasUnlink(redis: Redis): redis is RedisWithUnlink {
   
  return 'unlink' in redis && typeof (redis as any).unlink === 'function';
}

/**
 * Safe unlink operation
 *
 * Performs unlink operation with type safety and fallback.
 *
 * @param redis - Redis client
 * @param keys - Keys to unlink
 * @returns Number of keys removed, or 0 if unlink not supported
 */
export async function safeUnlink(redis: Redis, ...keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;

  if (hasUnlink(redis)) {
    return await redis.unlink(...keys);
  }

  // Fallback to del if unlink is not available
   
  return await (redis as any).del(...keys);
}
