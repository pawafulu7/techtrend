/**
 * DistributedLock テスト
 * release()がatomicなLuaスクリプト（eval）を使用することを検証
 */

import { DistributedLock } from '@/lib/cache/distributed-lock';

// evalメソッドを含むモックRedis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  eval: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
};

describe('DistributedLock', () => {
  let lock: DistributedLock;

  beforeEach(() => {
    Object.values(mockRedis).forEach((fn) => (fn as jest.Mock).mockClear());
    lock = new DistributedLock();
    // privateフィールドを直接差し替え
    (lock as any).redis = mockRedis;
  });

  describe('release()', () => {
    it('トークンが一致する場合trueを返す（eval結果が1）', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await lock.release('test-key', 'test-token');

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get", KEYS[1])'),
        1,
        'lock:test-key',
        'test-token'
      );
    });

    it('トークンが一致しない場合falseを返す（eval結果が0）', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await lock.release('test-key', 'wrong-token');

      expect(result).toBe(false);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    });

    it('evalを使用し、get+delの非アトミックパターンを使わない', async () => {
      mockRedis.eval.mockResolvedValue(1);

      await lock.release('test-key', 'test-token');

      // evalが呼ばれ、get/delは呼ばれないこと
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('Redisエラー時にfalseを返す', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection error'));

      const result = await lock.release('test-key', 'test-token');

      expect(result).toBe(false);
    });
  });

  describe('acquire()', () => {
    it('SET NX成功時にトークンを返す', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      const token = await lock.acquire('test-key');

      expect(token).toBeTruthy();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'lock:test-key',
        expect.any(String),
        'EX',
        30,
        'NX'
      );
    });

    it('SET NX失敗時にnullを返す', async () => {
      mockRedis.set.mockResolvedValueOnce(null);

      const token = await lock.acquire('test-key');

      expect(token).toBeNull();
    });
  });
});
