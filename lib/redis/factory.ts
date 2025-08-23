import { IRedisClient, IRedisClientFactory, IRedisConfig, IRedisService } from './interfaces';
import { IoRedisClient } from './ioredis-client';
import { RedisService } from './redis-service';

// Lazy-loaded test client class
let TestRedisClient: (new () => IRedisClient) | null = null;

/**
 * Factory for creating Redis clients based on environment
 */
export class RedisClientFactory implements IRedisClientFactory {
  private static instance: RedisClientFactory;
  private testClient: IRedisClient | null = null;

  private constructor() {}

  static getInstance(): RedisClientFactory {
    if (!RedisClientFactory.instance) {
      RedisClientFactory.instance = new RedisClientFactory();
    }
    return RedisClientFactory.instance;
  }

  /**
   * Create a Redis client based on current environment
   */
  createClient(config?: IRedisConfig): IRedisClient {
    if (process.env.NODE_ENV === 'test') {
      // In test environment, use test client (will be loaded by test setup)
      if (!this.testClient) {
        if (!TestRedisClient) {
          // This should only happen in test environment
          // The actual implementation will be loaded by test setup
          throw new Error('TestRedisClient not loaded. Make sure test setup is properly configured.');
        }
        this.testClient = new TestRedisClient();
      }
      return this.testClient;
    }

    // In production/development, return IoRedis client
    return new IoRedisClient(config);
  }

  /**
   * Create a Redis service with client
   */
  createService(config?: IRedisConfig): IRedisService {
    const client = this.createClient(config);
    return new RedisService(client);
  }

  /**
   * Clear test client data (for test cleanup)
   */
  clearTestData(): void {
    if (this.testClient && 'clear' in this.testClient) {
      const testClient = this.testClient as { clear: () => void };
      testClient.clear();
    }
  }

  /**
   * Reset factory (mainly for tests)
   */
  reset(): void {
    this.testClient = null;
  }
}

// Singleton instance
let redisService: IRedisService | null = null;

/**
 * Get the global Redis service instance
 */
export function getRedisService(): IRedisService {
  if (!redisService) {
    const factory = RedisClientFactory.getInstance();
    redisService = factory.createService();
  }
  return redisService;
}

/**
 * Close Redis connection and reset service
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisService) {
    await redisService.disconnect();
    redisService = null;
  }
}

/**
 * Create a custom Redis service (for specific use cases)
 */
export function createRedisService(config?: IRedisConfig): IRedisService {
  const factory = RedisClientFactory.getInstance();
  return factory.createService(config);
}

/**
 * Load test client for test environment
 * This should be called in test setup
 */
export async function loadTestClient(): Promise<void> {
  if (process.env.NODE_ENV === 'test' && !TestRedisClient) {
    // Dynamically import the test client
    const testModule = await import('./test-redis-client');
    TestRedisClient = testModule.TestRedisClient;
  }
}