import { Source } from '@prisma/client';
import { createFetcher } from '../../lib/fetchers/index';

// Mock rss-parser to prevent actual network calls
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({ items: [] }),
  }));
});

// Mock node-fetch to prevent actual network calls
jest.mock('node-fetch', () => jest.fn());

describe('createFetcher - Japanese Corporate Tech Blogs', () => {
  const createMockSource = (name: string, id: string, type: string = 'rss'): Source => ({
    id,
    name,
    type,
    url: `https://example.com/${id}/feed`,
    enabled: true,
    groupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('Individual Japanese corporate blog sources', () => {
    it.each([
      ['DeNA Engineering', 'dena_tech_blog', 'DeNAFetcher'],
      ['SmartHR Tech Blog', 'smarthr_tech_blog', 'SmartHRFetcher'],
      ['LY Corporation Tech Blog', 'lycorp_tech_blog', 'LYCorpFetcher'],
      ['Mercari Engineering', 'mercari_tech_blog', 'MercariFetcher'],
      ['Sansan Builders Box', 'sansan_tech_blog', 'SansanFetcher'],
      ['ZOZO TECH BLOG', 'zozo_tech_blog', 'ZOZOFetcher'],
      ['Hatena Developer Blog', 'hatena_tech_blog', 'HatenaFetcher'],
      ['Money Forward Developers Blog', 'moneyforward_tech_blog', 'MoneyForwardFetcher'],
      ['freee Developers Hub', 'freee_tech_blog', 'FreeeFetcher'],
      ['Cookpad Tech Life', 'cookpad_tech_blog', 'CookpadFetcher'],
      ['CyberAgent Developers Blog', 'cyberagent_tech_blog', 'CyberAgentFetcher'],
      ['GMO Developers', 'gmo_tech_blog', 'GMOFetcher'],
    ])('should create fetcher for "%s"', (name, id, expectedFetcherName) => {
      const source = createMockSource(name, id);
      const fetcher = createFetcher(source);

      expect(fetcher).toBeDefined();
      expect(fetcher.constructor.name).toBe(expectedFetcherName);
    });

    it('should create PepaboFetcher for Japanese source name', () => {
      const source = createMockSource('ペパボテックブログ', 'pepabo_tech_blog');
      const fetcher = createFetcher(source);

      expect(fetcher).toBeDefined();
      expect(fetcher.constructor.name).toBe('PepaboFetcher');
    });
  });

  describe('Hatena Blog Dev (Corporate Tech Blog Aggregator)', () => {
    it('should create HatenaBlogDevFetcher for source name in Japanese', () => {
      const source = createMockSource('企業技術ブログ', 'hatena_blog_dev', 'SCRAPING');
      const fetcher = createFetcher(source);

      expect(fetcher).toBeDefined();
      expect(fetcher.constructor.name).toBe('HatenaBlogDevFetcher');
    });

    it('should throw error for legacy source name "Hatena Blog Dev"', () => {
      const source = createMockSource('Hatena Blog Dev', 'hatena_blog_dev_legacy', 'SCRAPING');

      expect(() => createFetcher(source)).toThrow('Unsupported source: Hatena Blog Dev');
    });
  });

  describe('Error handling', () => {
    it('should throw error for unknown source', () => {
      const source = createMockSource('Unknown Corporate Blog', 'unknown_corp');

      expect(() => createFetcher(source)).toThrow('Unsupported source: Unknown Corporate Blog');
    });
  });
});
