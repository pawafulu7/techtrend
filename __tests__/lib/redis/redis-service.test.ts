import { RedisService } from '@/lib/redis/redis-service';
import { TestRedisClient } from '@/lib/redis/test-redis-client';
import { IRedisClient } from '@/lib/redis/interfaces';

describe('RedisService', () => {
  let service: RedisService;
  let testClient: TestRedisClient;

  beforeEach(() => {
    testClient = new TestRedisClient();
    service = new RedisService(testClient);
  });

  afterEach(async () => {
    testClient.clear();
  });

  describe('Connection Management', () => {
    it('should check connection status', async () => {
      const isConnected = await service.isConnected();
      expect(isConnected).toBe(true);
    });

    it('should return false when disconnected', async () => {
      testClient.setConnected(false);
      const isConnected = await service.isConnected();
      expect(isConnected).toBe(false);
    });

    it('should connect successfully', async () => {
      await service.connect();
      const isConnected = await service.isConnected();
      expect(isConnected).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await service.connect();
      await service.disconnect();
      // After disconnect, the test client is cleared
      expect(testClient.size()).toBe(0);
    });
  });

  describe('JSON Operations', () => {
    it('should set and get JSON data', async () => {
      const testData = { name: 'test', value: 123, nested: { key: 'value' } };
      
      await service.setJSON('test:json', testData);
      const retrieved = await service.getJSON<typeof testData>('test:json');
      
      expect(retrieved).toEqual(testData);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await service.getJSON('non:existent');
      expect(retrieved).toBeNull();
    });

    it('should set JSON with TTL', async () => {
      const testData = { temp: 'data' };
      
      await service.setJSON('temp:json', testData, 60);
      
      const ttl = await testClient.ttl('temp:json');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should handle invalid JSON gracefully', async () => {
      // Manually set invalid JSON
      await testClient.set('invalid:json', 'not a json string');
      
      const retrieved = await service.getJSON('invalid:json');
      expect(retrieved).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple JSON values', async () => {
      const data1 = { id: 1, name: 'Item 1' };
      const data2 = { id: 2, name: 'Item 2' };
      
      await service.setJSON('item:1', data1);
      await service.setJSON('item:2', data2);
      
      const result = await service.getMultipleJSON<typeof data1>(['item:1', 'item:2', 'item:3']);
      
      expect(result.size).toBe(2);
      expect(result.get('item:1')).toEqual(data1);
      expect(result.get('item:2')).toEqual(data2);
      expect(result.has('item:3')).toBe(false);
    });

    it('should set multiple JSON values', async () => {
      const dataMap = new Map([
        ['batch:1', { value: 1 }],
        ['batch:2', { value: 2 }],
        ['batch:3', { value: 3 }],
      ]);
      
      await service.setMultipleJSON(dataMap);
      
      const result = await service.getMultipleJSON<{ value: number }>([
        'batch:1',
        'batch:2',
        'batch:3',
      ]);
      
      expect(result.size).toBe(3);
      expect(result.get('batch:1')).toEqual({ value: 1 });
      expect(result.get('batch:2')).toEqual({ value: 2 });
      expect(result.get('batch:3')).toEqual({ value: 3 });
    });

    it('should set multiple JSON values with TTL', async () => {
      const dataMap = new Map([
        ['ttl:1', { temp: 1 }],
        ['ttl:2', { temp: 2 }],
      ]);
      
      await service.setMultipleJSON(dataMap, 30);
      
      const ttl1 = await testClient.ttl('ttl:1');
      const ttl2 = await testClient.ttl('ttl:2');
      
      expect(ttl1).toBeGreaterThan(0);
      expect(ttl1).toBeLessThanOrEqual(30);
      expect(ttl2).toBeGreaterThan(0);
      expect(ttl2).toBeLessThanOrEqual(30);
    });
  });

  describe('Pattern Operations', () => {
    it('should clear keys by pattern', async () => {
      await service.setJSON('cache:user:1', { id: 1 });
      await service.setJSON('cache:user:2', { id: 2 });
      await service.setJSON('cache:post:1', { id: 1 });
      
      const deleted = await service.clearPattern('cache:user:*');
      
      expect(deleted).toBe(2);
      expect(await service.exists('cache:user:1')).toBe(false);
      expect(await service.exists('cache:user:2')).toBe(false);
      expect(await service.exists('cache:post:1')).toBe(true);
    });

    it('should return 0 when no keys match pattern', async () => {
      const deleted = await service.clearPattern('nonexistent:*');
      expect(deleted).toBe(0);
    });
  });

  describe('Utility Operations', () => {
    it('should check if key exists', async () => {
      await service.setJSON('exists:test', { data: 'test' });
      
      expect(await service.exists('exists:test')).toBe(true);
      expect(await service.exists('not:exists')).toBe(false);
    });

    it('should get TTL for a key', async () => {
      await service.setJSON('ttl:test', { data: 'test' }, 100);
      
      const ttl = await service.getTTL('ttl:test');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(100);
    });

    it('should return -2 for non-existent key TTL', async () => {
      const ttl = await service.getTTL('nonexistent');
      expect(ttl).toBe(-2);
    });

    it('should return -1 for key without expiration', async () => {
      await service.setJSON('no:ttl', { data: 'test' });
      
      const ttl = await service.getTTL('no:ttl');
      expect(ttl).toBe(-1);
    });

    it('should extend TTL for a key', async () => {
      await service.setJSON('extend:ttl', { data: 'test' }, 30);
      
      const extended = await service.extendTTL('extend:ttl', 60);
      expect(extended).toBe(true);
      
      const ttl = await service.getTTL('extend:ttl');
      expect(ttl).toBeGreaterThan(30);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should return false when extending TTL for non-existent key', async () => {
      const extended = await service.extendTTL('nonexistent', 60);
      expect(extended).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      const mockClient: IRedisClient = {
        ...testClient,
        ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };
      
      const errorService = new RedisService(mockClient);
      const isConnected = await errorService.isConnected();
      
      expect(isConnected).toBe(false);
    });

    it('should handle JSON parse errors', async () => {
      await testClient.set('bad:json', '{invalid json}');
      const result = await service.getJSON('bad:json');
      
      expect(result).toBeNull();
    });
  });
});