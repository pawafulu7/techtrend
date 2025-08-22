/**
 * Redis Client Interface for Dependency Injection
 */
export interface IRedisClient {
  // Basic operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(key: string | string[]): Promise<number>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  
  // Connection management
  ping(): Promise<string>;
  quit(): Promise<void>;
  
  // Optional: Batch operations
  mget?(keys: string[]): Promise<(string | null)[]>;
  mset?(data: Record<string, string>): Promise<string>;
}

/**
 * Redis Service Interface for high-level operations
 */
export interface IRedisService {
  client: IRedisClient;
  isConnected(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Cache operations with JSON support
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T, ttl?: number): Promise<void>;
  
  // Batch operations
  clearPattern(pattern: string): Promise<number>;
}

/**
 * Configuration for Redis connection
 */
export interface IRedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  retryStrategy?: (times: number) => number | null;
  enableOfflineQueue?: boolean;
  connectTimeout?: number;
  maxRetriesPerRequest?: number;
}

/**
 * Factory interface for creating Redis clients
 */
export interface IRedisClientFactory {
  createClient(config?: IRedisConfig): IRedisClient;
}