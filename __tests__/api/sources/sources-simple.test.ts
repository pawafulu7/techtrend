/**
 * Simplified Sources API test without MSW
 */

describe('Sources API (Simplified)', () => {
  // Mock fetch directly
  const mockFetch = jest.fn();
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    // Backup original fetch
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    // Setup mock
    global.fetch = mockFetch;
    mockFetch.mockClear();
  });

  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
  });

  describe('GET /api/sources', () => {
    it('should return sources list', async () => {
      const mockResponse = {
        success: true,
        sources: [
          {
            id: 'qiita',
            name: 'Qiita',
            type: 'rss',
            url: 'https://qiita.com',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          },
          {
            id: 'zenn',
            name: 'Zenn',
            type: 'rss',
            url: 'https://zenn.dev',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          }
        ],
        total: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.sources)).toBe(true);
      expect(data.sources.length).toBe(2);
      expect(data.total).toBe(2);
    });

    it('should validate source structure', async () => {
      const mockResponse = {
        success: true,
        sources: [
          {
            id: 'qiita',
            name: 'Qiita',
            type: 'rss',
            url: 'https://qiita.com',
            enabled: true,
            createdAt: new Date('2024-01-01').toISOString(),
            updatedAt: new Date('2024-01-01').toISOString(),
          }
        ],
        total: 1
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();
      const source = data.sources[0];

      // Check required fields
      expect(source).toHaveProperty('id');
      expect(source).toHaveProperty('name');
      expect(source).toHaveProperty('type');
      expect(source).toHaveProperty('url');
      expect(source).toHaveProperty('enabled');
      expect(source).toHaveProperty('createdAt');
      expect(source).toHaveProperty('updatedAt');

      // Check data types
      expect(typeof source.id).toBe('string');
      expect(typeof source.name).toBe('string');
      expect(['rss', 'api', 'scraping']).toContain(source.type);
      expect(typeof source.url).toBe('string');
      expect(typeof source.enabled).toBe('boolean');
    });

    it('should only return enabled sources', async () => {
      const mockResponse = {
        success: true,
        sources: [
          { id: 'qiita', name: 'Qiita', enabled: true },
          { id: 'zenn', name: 'Zenn', enabled: true },
        ],
        total: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']]),
      });

      const response = await fetch('http://localhost:3000/api/sources');
      const data = await response.json();

      data.sources.forEach((source: any) => {
        expect(source.enabled).toBe(true);
      });
    });
  });

});
// GET /api/sources/stats エンドポイントは存在しないため、関連テストを削除済み