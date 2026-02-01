/**
 * ContentEnricherFactory Characterization Tests (Snapshot)
 *
 * Purpose: Capture current behavior to detect unintended changes during refactoring.
 * These tests use snapshots to record the current enricher factory behavior.
 *
 * @see lib/enrichers/index.ts
 */

import { ContentEnricherFactory } from '../../lib/enrichers';

// Mock fetch globally with proper cleanup
const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('ContentEnricherFactory Characterization Tests', () => {
  let factory: ContentEnricherFactory;

  beforeEach(() => {
    factory = new ContentEnricherFactory();
    jest.clearAllMocks();
  });

  describe('getSupportedDomains - domain registry', () => {
    it('returns all supported domains', () => {
      const domains = factory.getSupportedDomains();
      expect(domains).toMatchSnapshot('supported-domains');
    });

    it('domain count is stable', () => {
      const count = factory.getEnricherCount();
      expect({ enricherCount: count }).toMatchSnapshot('enricher-count');
    });
  });

  describe('getEnricher - enricher selection', () => {
    const testUrls = [
      // Specific domain enrichers
      'https://developers.gmo.jp/blog/2024/01/test-article',
      'https://developers.freee.co.jp/entry/test-article',
      'https://zenn.dev/user/articles/test-article',
      'https://thinkit.co.jp/article/12345',

      // Generic enricher (hatena pattern)
      'https://techblog.example.com/entry/2024/01/test',
      'https://unknown-domain.com/article/test',

      // Edge cases
      'https://sub.zenn.dev/articles/test',
      'http://developers.gmo.jp/blog/test', // http instead of https
    ];

    it.each(testUrls)(
      'selects appropriate enricher for %s',
      (url) => {
        const enricher = factory.getEnricher(url);
        expect({
          url,
          enricherExists: !!enricher,
          enricherType: enricher?.constructor.name ?? 'none',
        }).toMatchSnapshot();
      }
    );
  });

  describe('trySequential - sequential enrichment', () => {
    beforeEach(() => {
      // Reset fetch mock
      (global.fetch as jest.Mock).mockReset();
    });

    it('returns null for invalid URL', async () => {
      const result = await factory.trySequential('not-a-valid-url');
      // Explicit assertion: invalid URLs should return null
      expect(result).toBeNull();
      expect({ input: 'invalid-url', result }).toMatchSnapshot('invalid-url-result');
    }, 30000); // Extended timeout for retry logic

    it('handles fetch failure gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Explicit assertion: should not throw, should return null
      const result = await factory.trySequential('https://example.com/article');
      expect(result).toBeNull();
      expect({
        scenario: 'fetch-failure',
        resultIsNull: result === null,
      }).toMatchSnapshot('fetch-failure-result');
    }, 30000); // Extended timeout for retry logic

    it('processes HTML response', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test Article Title</title>
          <meta property="og:description" content="Test description">
        </head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is the article content.</p>
          </article>
        </body>
        </html>
      `;

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockHtml),
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const result = await factory.trySequential('https://techblog.example.com/entry/test');

      // Note: With minimal mock HTML, enricher may reject as "thin content"
      // This characterization test captures the current behavior
      expect({
        scenario: 'valid-html-response',
        hasResult: result !== null,
        resultKeys: result ? Object.keys(result).sort() : [],
        result: result,
      }).toMatchSnapshot('valid-html-result');
    });
  });

  describe('enricher registration - factory state', () => {
    it('factory state is consistent across instances', () => {
      const factory1 = new ContentEnricherFactory();
      const factory2 = new ContentEnricherFactory();

      expect({
        factory1Domains: factory1.getSupportedDomains().sort(),
        factory2Domains: factory2.getSupportedDomains().sort(),
        domainsMatch:
          JSON.stringify(factory1.getSupportedDomains().sort()) ===
          JSON.stringify(factory2.getSupportedDomains().sort()),
      }).toMatchSnapshot('factory-consistency');
    });

    it('enricher count matches domain count', () => {
      const domains = factory.getSupportedDomains();
      const count = factory.getEnricherCount();

      // Note: count may differ from domains.length due to wildcard (*) handling
      expect({
        domainCount: domains.length,
        enricherCount: count,
        hasWildcard: domains.includes('*'),
      }).toMatchSnapshot('domain-enricher-count-relationship');
    });
  });
});
