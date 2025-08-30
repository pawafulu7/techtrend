import Redis from 'ioredis';
import { getRedisService, closeRedisConnection as closeRedisServiceConnection } from './factory';
import { IoRedisClient } from './ioredis-client';

let redisClient: Redis | null = null;

/**
 * Get Redis client - backward compatibility wrapper
 * New code should use getRedisService() from factory.ts
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    // In test environment, create a proxy that delegates to the test client
    if (process.env.NODE_ENV === 'test') {
      const service = getRedisService();
      
      // Create a proxy that mimics ioredis interface
      redisClient = new Proxy({} as Redis, {
        get(target, prop) {
          const client = service.client;
          
          // Map common methods
          if (prop === 'ping') return () => client.ping();
          if (prop === 'get') return (key: string) => client.get(key);
          if (prop === 'set') {
            // Support both simple set and set with expiry
            return (key: string, value: string, exMode?: string, ttl?: number) => {
              if (exMode === 'EX' && ttl) {
                return client.setex(key, ttl, value);
              }
              return client.set(key, value);
            };
          }
          if (prop === 'setex') return (key: string, seconds: number, value: string) => client.setex(key, seconds, value);
          if (prop === 'del') return (...keys: string[]) => client.del(keys.length === 1 ? keys[0] : keys);
          if (prop === 'exists') return (key: string) => client.exists(key);
          if (prop === 'expire') return (key: string, seconds: number) => client.expire(key, seconds);
          if (prop === 'ttl') return (key: string) => client.ttl(key);
          if (prop === 'keys') return (pattern: string) => client.keys(pattern);
          if (prop === 'quit') return () => client.quit();
          
          // Event emitter methods (no-op in test)
          if (prop === 'on' || prop === 'once' || prop === 'off' || prop === 'emit') {
            return () => {};
          }
          
          // Connection methods
          if (prop === 'connect') return () => Promise.resolve();
          if (prop === 'disconnect') return () => client.quit();
          
          // Default - pass-through
          return (target as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey];
        }
      });
    } else {
      // Production: Use IoRedisClient directly
      const ioRedisClient = new IoRedisClient();
      redisClient = ioRedisClient.getInternalClient();
    }
  }

  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    // If it's a real Redis client, quit it
    if (redisClient.quit && typeof redisClient.quit === 'function') {
      await redisClient.quit();
    }
    redisClient = null;
  }
  
  // Also close the service connection
  await closeRedisServiceConnection();
}

// Export redis instance for backward compatibility with tests
// Use lazy initialization to avoid immediate execution
export const redis = (() => {
  let _instance: Redis | null = null;
  return new Proxy({} as Redis, {
    get(target, prop) {
      if (!_instance) {
        _instance = getRedisClient();
      }
      return (_instance as unknown as Record<PropertyKey, unknown>)[prop as PropertyKey];
    }
  });
})();
