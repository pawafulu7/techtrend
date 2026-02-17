import { GitHubCollector } from '@/lib/services/external-metrics/github-collector';
import { MetricSource } from '@prisma/client';
import { createEntity } from '../../helpers/create-entity';

// Mock global fetch
let originalFetch: typeof global.fetch;
const mockFetch = jest.fn();

beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('GitHubCollector', () => {
  let collector: GitHubCollector;

  beforeEach(() => {
    collector = new GitHubCollector();
    mockFetch.mockReset();
  });

  describe('source', () => {
    it('should be GITHUB_STARS', () => {
      expect(collector.source).toBe(MetricSource.GITHUB_STARS);
    });
  });

  describe('canCollect', () => {
    it('should return true when entity has github externalId', () => {
      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      expect(collector.canCollect(entity)).toBe(true);
    });

    it('should return false when entity has no externalIds', () => {
      const entity = createEntity({ externalIds: null });
      expect(collector.canCollect(entity)).toBe(false);
    });

    it('should return false when entity has externalIds without github key', () => {
      const entity = createEntity({ externalIds: { npm: 'react' } });
      expect(collector.canCollect(entity)).toBe(false);
    });

    it('should return false when github key is empty string', () => {
      const entity = createEntity({ externalIds: { github: '' } });
      expect(collector.canCollect(entity)).toBe(false);
    });
  });

  describe('collect', () => {
    it('should return star count on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stargazers_count: 225000 }),
      });

      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      const result = await collector.collect(entity);

      expect(result).not.toBeNull();
      expect(result!.value).toBe(225000);
      expect(result!.measuredAt).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/facebook/react',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should include Authorization header when GITHUB_TOKEN is set', async () => {
      const originalToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'test-token-123';

      try {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stargazers_count: 100 }),
        });

        const entity = createEntity({ externalIds: { github: 'facebook/react' } });
        await collector.collect(entity);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token-123',
            }),
          })
        );
      } finally {
        // Restore
        if (originalToken === undefined) {
          delete process.env.GITHUB_TOKEN;
        } else {
          process.env.GITHUB_TOKEN = originalToken;
        }
      }
    });

    it('should return null when entity has no github externalId', async () => {
      const entity = createEntity({ externalIds: null });
      const result = await collector.collect(entity);
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null on API error (non-200)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });

    it('should return null when response has no stargazers_count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'react', full_name: 'facebook/react' }),
      });

      const entity = createEntity({ externalIds: { github: 'facebook/react' } });
      const result = await collector.collect(entity);
      expect(result).toBeNull();
    });
  });
});
