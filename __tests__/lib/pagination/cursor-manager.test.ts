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
      expect(manager.validateFilters(makeCursor(), undefined)).toBe(true);
    });

    it('should return false when only cursor filters exist', () => {
      expect(
        manager.validateFilters(
          makeCursor({ filters: { source: 'rss' } }),
          undefined
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

  describe('decodeCursor', () => {
    const encodeBase64Url = (value: string) =>
      Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    const decodeBase64Url = (value: string) => {
      const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(base64 + padding, 'base64').toString();
    };

    it('accepts legacy 16-char signatures', () => {
      const cursor = manager.encodeCursor({
        sortBy: 'id',
        sortOrder: 'desc',
        values: { id: 10 },
        limit: 10,
      });

      const signedPayload = decodeBase64Url(cursor);
      const dot = signedPayload.indexOf('.');
      const legacyCursor = encodeBase64Url(
        `${signedPayload.slice(0, 16)}.${signedPayload.slice(dot + 1)}`
      );

      expect(manager.decodeCursor(legacyCursor)).not.toBeNull();
    });

    it('rejects expired cursors', () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      try {
        const expiringManager = new CursorManager({
          secret: 'test-secret',
          maxAge: 1,
          version: 2,
        });
        const cursor = expiringManager.encodeCursor({
          sortBy: 'id',
          sortOrder: 'desc',
          values: { id: 10 },
          limit: 10,
        });

        spy.mockReturnValue(1_700_000_002_000);
        expect(expiringManager.decodeCursor(cursor)).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });

    it('rejects unknown versions', () => {
      const v3Manager = new CursorManager({
        secret: 'test-secret',
        version: 3,
      });
      const cursor = v3Manager.encodeCursor({
        sortBy: 'id',
        sortOrder: 'desc',
        values: { id: 10 },
        limit: 10,
      });

      expect(manager.decodeCursor(cursor)).toBeNull();
    });
  });
});
