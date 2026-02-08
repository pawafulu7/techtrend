import { LayeredCache } from '@/lib/cache/layered-cache';

describe('LayeredCache cache key generation', () => {
  const cache = Object.create(LayeredCache.prototype) as any;

  it('should include sortOrder in basic cache keys', () => {
    const ascKey = cache.generateBasicKey({
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateBasicKey({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateBasicKey({ sortBy: 'publishedAt' });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });

  it('should include sortOrder in user cache keys', () => {
    const ascKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateUserKey({
      userId: 'user-1',
      readFilter: 'read',
      sortBy: 'publishedAt',
    });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });

  it('should include sortBy in count cache keys', () => {
    const publishedAtKey = cache.generateCountKey({ sortBy: 'publishedAt' });
    const createdAtKey = cache.generateCountKey({ sortBy: 'createdAt' });
    const defaultKey = cache.generateCountKey({});

    expect(publishedAtKey).not.toBe(createdAtKey);
    expect(publishedAtKey).toContain('sortBy:publishedAt');
    expect(createdAtKey).toContain('sortBy:createdAt');
    expect(defaultKey).toBe(publishedAtKey);
  });

  it('should include sortOrder in search cache keys', () => {
    const ascKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
      sortOrder: 'asc',
    });
    const descKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    const defaultKey = cache.generateSearchKey({
      search: 'foo bar',
      sortBy: 'publishedAt',
    });

    expect(ascKey).not.toBe(descKey);
    expect(ascKey).toContain('sortOrder:asc');
    expect(descKey).toContain('sortOrder:desc');
    expect(defaultKey).toBe(descKey);
  });
});
