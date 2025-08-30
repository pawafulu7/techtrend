import { IRedisClient, IRedisService } from './interfaces';

/**
 * Redis Service implementation with JSON support and high-level operations
 */
export class RedisService implements IRedisService {
  private connected: boolean = false;

  constructor(public client: IRedisClient) {}

  /**
   * Check if Redis connection is active
   */
  async isConnected(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      this.connected = pong === 'PONG';
      return this.connected;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Connect to Redis (implementation depends on client)
   */
  async connect(): Promise<void> {
    // Most Redis clients auto-connect on first operation
    // This method is here for explicit connection if needed
    const connected = await this.isConnected();
    if (!connected) {
      // Force connection by pinging
      await this.client.ping();
    }
    this.connected = true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  /**
   * Get JSON value from cache
   */
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (_error) {
      return null;
    }
  }

  /**
   * Set JSON value in cache with optional TTL
   */
  async setJSON<T>(key: string, value: T, ttl?: number): Promise<void> {
    const jsonString = JSON.stringify(value);
    
    if (ttl && ttl > 0) {
      await this.client.setex(key, ttl, jsonString);
    } else {
      await this.client.set(key, jsonString);
    }
  }

  /**
   * Clear all keys matching a pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) return 0;
    
    return await this.client.del(keys);
  }

  /**
   * Get multiple JSON values at once
   */
  async getMultipleJSON<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    
    // Use mget if available, otherwise fallback to individual gets
    if (this.client.mget) {
      const values = await this.client.mget(keys);
      keys.forEach((key, index) => {
        const value = values[index];
        if (value) {
          try {
            result.set(key, JSON.parse(value) as T);
          } catch (_error) {
          }
        }
      });
    } else {
      // Fallback to individual gets
      for (const key of keys) {
        const value = await this.getJSON<T>(key);
        if (value !== null) {
          result.set(key, value);
        }
      }
    }
    
    return result;
  }

  /**
   * Set multiple JSON values at once
   */
  async setMultipleJSON<T>(data: Map<string, T>, ttl?: number): Promise<void> {
    const entries = Array.from(data.entries());
    
    if (ttl && ttl > 0) {
      // With TTL, we need to use individual setex commands
      await Promise.all(
        entries.map(([key, value]) => this.setJSON(key, value, ttl))
      );
    } else if (this.client.mset) {
      // Without TTL, we can use mset if available
      const jsonData: Record<string, string> = {};
      entries.forEach(([key, value]) => {
        jsonData[key] = JSON.stringify(value);
      });
      await this.client.mset(jsonData);
    } else {
      // Fallback to individual sets
      await Promise.all(
        entries.map(([key, value]) => this.setJSON(key, value))
      );
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get remaining TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  /**
   * Extend TTL for a key
   */
  async extendTTL(key: string, seconds: number): Promise<boolean> {
    const result = await this.client.expire(key, seconds);
    return result === 1;
  }
}