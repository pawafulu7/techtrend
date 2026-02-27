import { TagCache } from '@/lib/cache/tag-cache';

jest.mock('@/lib/logger');

const createCacheStub = () => {
  const store = new Map<string, unknown>();

  return {
    getOrSet: jest.fn(async (key: string, fetcher: () => Promise<unknown>) => {
      if (store.has(key)) {
        return store.get(key);
      }
      const value = await fetcher();
      store.set(key, value);
      return value;
    }),
    getOrSetWithLock: jest.fn(
      async (key: string, fetcher: () => Promise<unknown>) => {
        if (store.has(key)) {
          return store.get(key);
        }
        const value = await fetcher();
        store.set(key, value);
        return value;
      }
    ),
    invalidatePattern: jest.fn(async () => {
      store.clear();
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
};

describe('TagCache', () => {
  let tagCache: TagCache;
  let cacheStub: ReturnType<typeof createCacheStub>;

  beforeEach(() => {
    jest.clearAllMocks();
    tagCache = new TagCache();
    cacheStub = createCacheStub();
    (tagCache as any).cache = cacheStub;
  });

  describe('invalidateTag', () => {
    it('should delete specific tag key', async () => {
      await tagCache.invalidateTag('tag-1');

      expect(cacheStub.delete).toHaveBeenCalledWith('tag:tag-1');
    });

    it('should delete all-tags aggregate key', async () => {
      await tagCache.invalidateTag('tag-1');

      expect(cacheStub.delete).toHaveBeenCalledWith('all-tags');
    });

    it('should invalidate popular-tags pattern', async () => {
      await tagCache.invalidateTag('tag-1');

      expect(cacheStub.invalidatePattern).toHaveBeenCalledWith(
        'popular-tags:*'
      );
    });

    it('should invalidate search pattern', async () => {
      await tagCache.invalidateTag('tag-1');

      expect(cacheStub.invalidatePattern).toHaveBeenCalledWith('search:*');
    });

    it('should NOT invalidate unrelated tag keys', async () => {
      // Pre-populate another tag in the store
      const store = new Map<string, unknown>();
      store.set('tag:other-id', { id: 'other-id', name: 'Other' });

      const localStub = createCacheStub();
      // Override delete to track which keys are deleted
      const deletedKeys: string[] = [];
      localStub.delete.mockImplementation(async (key: string) => {
        deletedKeys.push(key);
      });

      (tagCache as any).cache = localStub;
      await tagCache.invalidateTag('tag-1');

      // Should not delete tag:other-id
      expect(deletedKeys).not.toContain('tag:other-id');
      // Should delete tag:tag-1 and all-tags
      expect(deletedKeys).toContain('tag:tag-1');
      expect(deletedKeys).toContain('all-tags');
    });

    it('should NOT call invalidatePattern with wildcard *', async () => {
      await tagCache.invalidateTag('tag-1');

      // Should NOT do full clear (pattern '*')
      expect(cacheStub.invalidatePattern).not.toHaveBeenCalledWith('*');
    });

    it('should fallback to full invalidation on error', async () => {
      // delete rejects (caught by .catch(() => {})), but invalidatePattern
      // must reject to trigger the outer catch, then succeed for the fallback
      cacheStub.delete.mockRejectedValue(new Error('Redis error'));
      cacheStub.invalidatePattern
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockRejectedValueOnce(new Error('Redis error'))
        .mockResolvedValueOnce(undefined); // fallback invalidate('*') succeeds

      await tagCache.invalidateTag('tag-1');

      // After catch, it should call invalidate() which uses pattern '*'
      const calls = cacheStub.invalidatePattern.mock.calls;
      expect(calls[calls.length - 1][0]).toBe('*');
    });
  });

  describe('invalidate (full clear)', () => {
    it('should clear everything with wildcard pattern', async () => {
      await tagCache.invalidate();

      expect(cacheStub.invalidatePattern).toHaveBeenCalledWith('*');
    });
  });
});
