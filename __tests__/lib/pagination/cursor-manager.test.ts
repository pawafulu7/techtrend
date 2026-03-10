import {
  CursorManager,
  type CursorPayload,
} from '@/lib/pagination/cursor-manager';

function makeCursor(overrides?: Partial<CursorPayload>): CursorPayload {
  return {
    sortBy: 'id',
    sortOrder: 'desc',
    values: {},
    limit: 10,
    version: 1,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('CursorManager', () => {
  let manager: CursorManager;

  beforeEach(() => {
    manager = new CursorManager({ secret: 'test-secret' });
  });

  describe('validateFilters', () => {
    it('should return true when both filters are undefined/falsy', () => {
      expect(manager.validateFilters(makeCursor(), undefined as any)).toBe(
        true
      );
    });

    it('should return false when only cursor filters exist', () => {
      expect(
        manager.validateFilters(
          makeCursor({ filters: { source: 'rss' } }),
          undefined as any
        )
      ).toBe(false);
    });

    it('should return false when only current filters exist', () => {
      expect(manager.validateFilters(makeCursor(), { source: 'rss' })).toBe(
        false
      );
    });

    it('should return true for identical filters', () => {
      expect(
        manager.validateFilters(
          makeCursor({ filters: { source: 'rss', tag: 'ai' } }),
          { source: 'rss', tag: 'ai' }
        )
      ).toBe(true);
    });

    it('should return true for same filters with different key order', () => {
      expect(
        manager.validateFilters(
          makeCursor({ filters: { source: 'rss', tag: 'ai' } }),
          { tag: 'ai', source: 'rss' }
        )
      ).toBe(true);
    });

    it('should return false when filter values differ', () => {
      expect(
        manager.validateFilters(makeCursor({ filters: { source: 'rss' } }), {
          source: 'atom',
        })
      ).toBe(false);
    });

    it('should return false when filter key counts differ', () => {
      expect(
        manager.validateFilters(makeCursor({ filters: { source: 'rss' } }), {
          source: 'rss',
          tag: 'ai',
        })
      ).toBe(false);
    });

    it('should handle empty filter objects', () => {
      expect(manager.validateFilters(makeCursor({ filters: {} }), {})).toBe(
        true
      );
    });
  });
});
