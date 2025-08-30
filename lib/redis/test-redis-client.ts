import { IRedisClient } from './interfaces';

interface StoredValue {
  value: string;
  expires?: Date;
}

/**
 * In-memory Redis client implementation for testing
 * Provides a fully functional Redis-like interface without external dependencies
 */
export class TestRedisClient implements IRedisClient {
  private store = new Map<string, StoredValue>();
  private connected = true;

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    this.checkConnection();
    const item = this.store.get(key);
    
    if (!item) return null;
    
    // Check expiration
    if (item.expires && new Date() > item.expires) {
      this.store.delete(key);
      return null;
    }
    
    return item.value;
  }

  /**
   * Set value with key
   */
  async set(key: string, value: string): Promise<string> {
    this.checkConnection();
    this.store.set(key, { value });
    return 'OK';
  }

  /**
   * Set value with expiration
   */
  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.checkConnection();
    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + seconds);
    this.store.set(key, { value, expires });
    return 'OK';
  }

  /**
   * Delete one or more keys
   */
  async del(keys: string | string[]): Promise<number> {
    this.checkConnection();
    const keysArray = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;
    
    for (const key of keysArray) {
      if (this.store.delete(key)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<number> {
    this.checkConnection();
    const item = this.store.get(key);
    
    if (!item) return 0;
    
    // Check expiration
    if (item.expires && new Date() > item.expires) {
      this.store.delete(key);
      return 0;
    }
    
    return 1;
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, seconds: number): Promise<number> {
    this.checkConnection();
    const item = this.store.get(key);
    
    if (!item) return 0;
    
    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + seconds);
    item.expires = expires;
    
    return 1;
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    this.checkConnection();
    const item = this.store.get(key);
    
    if (!item) return -2; // Key doesn't exist
    if (!item.expires) return -1; // Key exists but has no expiration
    
    const now = new Date();
    const ttl = Math.floor((item.expires.getTime() - now.getTime()) / 1000);
    
    if (ttl <= 0) {
      this.store.delete(key);
      return -2;
    }
    
    return ttl;
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    this.checkConnection();
    const regex = this.patternToRegex(pattern);
    const result: string[] = [];
    
    for (const [key, item] of this.store.entries()) {
      // Check expiration
      if (item.expires && new Date() > item.expires) {
        this.store.delete(key);
        continue;
      }
      
      if (regex.test(key)) {
        result.push(key);
      }
    }
    
    return result;
  }

  /**
   * Ping the server
   */
  async ping(): Promise<string> {
    this.checkConnection();
    return 'PONG';
  }

  /**
   * Close connection
   */
  async quit(): Promise<void> {
    this.connected = false;
    this.store.clear();
  }

  /**
   * Get multiple values at once
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    this.checkConnection();
    const result: (string | null)[] = [];
    
    for (const key of keys) {
      result.push(await this.get(key));
    }
    
    return result;
  }

  /**
   * Set multiple values at once
   */
  async mset(data: Record<string, string>): Promise<string> {
    this.checkConnection();
    
    for (const [key, value] of Object.entries(data)) {
      this.store.set(key, { value });
    }
    
    return 'OK';
  }

  /**
   * Clear all data (test utility)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get all data (test utility)
   */
  getAll(): Map<string, StoredValue> {
    // Clean up expired items first
    const now = new Date();
    for (const [key, item] of this.store.entries()) {
      if (item.expires && now > item.expires) {
        this.store.delete(key);
      }
    }
    return new Map(this.store);
  }

  /**
   * Set connection status (test utility)
   */
  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  /**
   * Check if connected
   */
  private checkConnection(): void {
    if (!this.connected) {
      throw new Error('Redis client is not connected');
    }
  }

  /**
   * Convert Redis pattern to RegExp
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape special regex characters except * and ?
    let regex = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    // Replace Redis wildcards with regex equivalents
    regex = regex.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${regex}$`);
  }

  /**
   * Simulate connection delay (test utility)
   */
  async simulateDelay(ms: number = 10): Promise<void> {
    const start = Date.now();
    // Ensure we wait at least the requested duration
    await new Promise(resolve => setTimeout(resolve, ms));
    const elapsed = Date.now() - start;
    if (elapsed < ms) {
      await new Promise(resolve => setTimeout(resolve, ms - elapsed));
    }
  }

  /**
   * Get store size (test utility)
   */
  size(): number {
    // Clean up expired items first
    const now = new Date();
    for (const [key, item] of this.store.entries()) {
      if (item.expires && now > item.expires) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    this.checkConnection();
    const item = this.store.get(`${key}:${field}`);
    if (!item) return null;
    return item.value;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    this.checkConnection();
    this.store.set(`${key}:${field}`, { value });
    return 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.checkConnection();
    const result: Record<string, string> = {};
    const prefix = `${key}:`;
    
    for (const [k, item] of this.store.entries()) {
      if (k.startsWith(prefix)) {
        const field = k.substring(prefix.length);
        result[field] = item.value;
      }
    }
    
    return result;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.checkConnection();
    let deleted = 0;
    
    for (const field of fields) {
      if (this.store.delete(`${key}:${field}`)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  async hexists(key: string, field: string): Promise<number> {
    this.checkConnection();
    return this.store.has(`${key}:${field}`) ? 1 : 0;
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    this.checkConnection();
    const list = this.getList(key);
    list.unshift(...values.reverse());
    this.setList(key, list);
    return list.length;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    this.checkConnection();
    const list = this.getList(key);
    list.push(...values);
    this.setList(key, list);
    return list.length;
  }

  async lpop(key: string): Promise<string | null> {
    this.checkConnection();
    const list = this.getList(key);
    const value = list.shift();
    if (value === undefined) return null;
    this.setList(key, list);
    return value;
  }

  async rpop(key: string): Promise<string | null> {
    this.checkConnection();
    const list = this.getList(key);
    const value = list.pop();
    if (value === undefined) return null;
    this.setList(key, list);
    return value;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.checkConnection();
    const list = this.getList(key);
    if (stop < 0) {
      stop = list.length + stop;
    }
    return list.slice(start, stop + 1);
  }

  async llen(key: string): Promise<number> {
    this.checkConnection();
    const list = this.getList(key);
    return list.length;
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    this.checkConnection();
    const set = this.getSet(key);
    let added = 0;
    
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    
    this.setSet(key, set);
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.checkConnection();
    const set = this.getSet(key);
    let removed = 0;
    
    for (const member of members) {
      if (set.delete(member)) {
        removed++;
      }
    }
    
    this.setSet(key, set);
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    this.checkConnection();
    const set = this.getSet(key);
    return Array.from(set);
  }

  async sismember(key: string, member: string): Promise<number> {
    this.checkConnection();
    const set = this.getSet(key);
    return set.has(member) ? 1 : 0;
  }

  async scard(key: string): Promise<number> {
    this.checkConnection();
    const set = this.getSet(key);
    return set.size;
  }

  // Sorted Set operations
  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    let added = 0;
    
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = String(args[i + 1]);
      if (!sortedSet.has(member)) {
        added++;
      }
      sortedSet.set(member, score);
    }
    
    this.setSortedSet(key, sortedSet);
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    let removed = 0;
    
    for (const member of members) {
      if (sortedSet.delete(member)) {
        removed++;
      }
    }
    
    this.setSortedSet(key, sortedSet);
    return removed;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    const sorted = Array.from(sortedSet.entries())
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);
    
    if (stop < 0) {
      stop = sorted.length + stop;
    }
    
    return sorted.slice(start, stop + 1);
  }

  async zscore(key: string, member: string): Promise<string | null> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    const score = sortedSet.get(member);
    return score !== undefined ? String(score) : null;
  }

  async zcard(key: string): Promise<number> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    return sortedSet.size;
  }

  // Scan operations
  async scan(_cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
    this.checkConnection();
    const keys = await this.keys('*');
    return ['0', keys.slice(0, 10)];
  }

  async hscan(key: string, _cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
    this.checkConnection();
    const all = await this.hgetall(key);
    const result: string[] = [];
    
    for (const [field, value] of Object.entries(all)) {
      result.push(field, value);
    }
    
    return ['0', result];
  }

  async sscan(key: string, _cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
    this.checkConnection();
    const members = await this.smembers(key);
    return ['0', members];
  }

  async zscan(key: string, _cursor: string, ..._args: unknown[]): Promise<[string, string[]]> {
    this.checkConnection();
    const sortedSet = this.getSortedSet(key);
    const result: string[] = [];
    
    for (const [member, score] of sortedSet.entries()) {
      result.push(member, String(score));
    }
    
    return ['0', result];
  }

  // Database operations
  async flushdb(): Promise<string> {
    this.checkConnection();
    this.store.clear();
    return 'OK';
  }

  async flushall(): Promise<string> {
    this.checkConnection();
    this.store.clear();
    return 'OK';
  }

  // Helper methods for complex data types
  private getList(key: string): string[] {
    const item = this.store.get(`list:${key}`);
    if (!item) return [];
    try {
      return JSON.parse(item.value);
    } catch {
      return [];
    }
  }

  private setList(key: string, list: string[]): void {
    if (list.length === 0) {
      this.store.delete(`list:${key}`);
    } else {
      this.store.set(`list:${key}`, { value: JSON.stringify(list) });
    }
  }

  private getSet(key: string): Set<string> {
    const item = this.store.get(`set:${key}`);
    if (!item) return new Set();
    try {
      return new Set(JSON.parse(item.value));
    } catch {
      return new Set();
    }
  }

  private setSet(key: string, set: Set<string>): void {
    if (set.size === 0) {
      this.store.delete(`set:${key}`);
    } else {
      this.store.set(`set:${key}`, { value: JSON.stringify(Array.from(set)) });
    }
  }

  private getSortedSet(key: string): Map<string, number> {
    const item = this.store.get(`zset:${key}`);
    if (!item) return new Map();
    try {
      return new Map(JSON.parse(item.value));
    } catch {
      return new Map();
    }
  }

  private setSortedSet(key: string, sortedSet: Map<string, number>): void {
    if (sortedSet.size === 0) {
      this.store.delete(`zset:${key}`);
    } else {
      this.store.set(`zset:${key}`, { value: JSON.stringify(Array.from(sortedSet.entries())) });
    }
  }
}
