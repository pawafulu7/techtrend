import { CursorManager } from '@/lib/pagination/cursor-manager';

describe('CursorManager', () => {
  let manager: CursorManager;

  beforeEach(() => {
    manager = new CursorManager({ secret: 'test-secret' });
  });

  describe('validateFilters', () => {
    it('should return true when both filters are undefined/falsy', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
      };
      expect(manager.validateFilters(cursor, undefined as any)).toBe(true);
    });

    it('should return false when only cursor filters exist', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: { source: 'rss' },
      };
      expect(manager.validateFilters(cursor, undefined as any)).toBe(false);
    });

    it('should return false when only current filters exist', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
      };
      expect(manager.validateFilters(cursor, { source: 'rss' })).toBe(false);
    });

    it('should return true for identical filters', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: { source: 'rss', tag: 'ai' },
      };
      expect(
        manager.validateFilters(cursor, { source: 'rss', tag: 'ai' })
      ).toBe(true);
    });

    it('should return true for same filters with different key order', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: { source: 'rss', tag: 'ai' },
      };
      expect(
        manager.validateFilters(cursor, { tag: 'ai', source: 'rss' })
      ).toBe(true);
    });

    it('should return false when filter values differ', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: { source: 'rss' },
      };
      expect(manager.validateFilters(cursor, { source: 'atom' })).toBe(false);
    });

    it('should return false when filter key counts differ', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: { source: 'rss' },
      };
      expect(
        manager.validateFilters(cursor, { source: 'rss', tag: 'ai' })
      ).toBe(false);
    });

    it('should handle empty filter objects', () => {
      const cursor = {
        sortBy: 'id',
        sortOrder: 'desc' as const,
        values: {},
        limit: 10,
        version: 1,
        timestamp: Date.now(),
        filters: {},
      };
      expect(manager.validateFilters(cursor, {})).toBe(true);
    });
  });
});
