import { Redis } from 'ioredis';
import { hasUnlink, safeUnlink } from '../redis';

describe('Redis Type Extensions', () => {
  describe('hasUnlink', () => {
    test('should return true when unlink method exists', () => {
      const mockRedis = {
        unlink: jest.fn(),
      } as unknown as Redis;

      expect(hasUnlink(mockRedis)).toBe(true);
    });

    test('should return false when unlink method does not exist', () => {
      const mockRedis = {} as Redis;
      expect(hasUnlink(mockRedis)).toBe(false);
    });

    test('should return false when unlink is not a function', () => {
      const mockRedis = {
        unlink: 'not a function',
      } as unknown as Redis;

      expect(hasUnlink(mockRedis)).toBe(false);
    });
  });

  describe('safeUnlink', () => {
    test('should use unlink when available', async () => {
      const unlinkMock = jest.fn().mockResolvedValue(3);
      const mockRedis = {
        unlink: unlinkMock,
      } as unknown as Redis;

      const result = await safeUnlink(mockRedis, 'key1', 'key2', 'key3');

      expect(result).toBe(3);
      expect(unlinkMock).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    test('should fallback to del when unlink not available', async () => {
      const delMock = jest.fn().mockResolvedValue(2);
      const mockRedis = {
        del: delMock,
      } as unknown as Redis;

      const result = await safeUnlink(mockRedis, 'key1', 'key2');

      expect(result).toBe(2);
      expect(delMock).toHaveBeenCalledWith('key1', 'key2');
    });

    test('should return 0 for empty keys array', async () => {
      const mockRedis = {
        unlink: jest.fn(),
        del: jest.fn(),
      } as unknown as Redis;

      const result = await safeUnlink(mockRedis);

      expect(result).toBe(0);
      expect(mockRedis.unlink).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    test('should handle single key', async () => {
      const unlinkMock = jest.fn().mockResolvedValue(1);
      const mockRedis = {
        unlink: unlinkMock,
      } as unknown as Redis;

      const result = await safeUnlink(mockRedis, 'single-key');

      expect(result).toBe(1);
      expect(unlinkMock).toHaveBeenCalledWith('single-key');
    });

    test('should propagate errors', async () => {
      const unlinkMock = jest.fn().mockRejectedValue(new Error('Redis error'));
      const mockRedis = {
        unlink: unlinkMock,
      } as unknown as Redis;

      await expect(safeUnlink(mockRedis, 'key1')).rejects.toThrow('Redis error');
    });
  });
});
