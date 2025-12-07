import { ArxivAIEnricher } from '../../lib/enrichers/arxiv-ai';
import { BaseContentEnricher } from '../../lib/enrichers/base';

// Sample HTML fixtures
const sampleHtmlContent = `
<!DOCTYPE html>
<html>
<head><title>Test Paper</title></head>
<body>
<section id="S1">
  <h2>1 Introduction</h2>
  <p>This is the introduction section of the paper. It contains important background information about the research topic and motivation.</p>
</section>
<section id="S2">
  <h2>2 Methodology</h2>
  <p>This section describes the methodology used in the research. We propose a novel approach using <math>x = y + z</math> formula.</p>
</section>
<section id="S3">
  <h2>3 Results</h2>
  <p>Our experiments show significant improvements over baseline methods. The results demonstrate the effectiveness of our approach.</p>
</section>
<section id="S4">
  <h2>4 Conclusion</h2>
  <p>In conclusion, this paper presents a new method for solving the problem. Future work includes extending the approach to other domains.</p>
</section>
</body>
</html>
`;

const sampleAbstractHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Paper Title</title>
  <meta name="citation_arxiv_id" content="2412.01234">
</head>
<body>
<h1 class="title">Title: Test Paper Title</h1>
<div class="authors">Authors: John Doe, Jane Smith</div>
<blockquote class="abstract">
  Abstract: This is a test abstract for an arXiv paper. It describes the main contributions and findings of the research.
  The paper presents a novel approach to solving complex problems in machine learning and artificial intelligence.
  Our method achieves state-of-the-art results on multiple benchmark datasets, demonstrating significant improvements
  over previous approaches. We also provide theoretical analysis and empirical evaluation of our proposed technique.
</blockquote>
</body>
</html>
`;

describe('ArxivAIEnricher', () => {
  let enricher: ArxivAIEnricher;

  beforeEach(() => {
    enricher = new ArxivAIEnricher();
  });

  describe('canHandle - URL validation', () => {
    describe('accepts valid arXiv URLs', () => {
      const validUrls = [
        'https://arxiv.org/abs/2412.01234',
        'https://www.arxiv.org/abs/2412.01234',
        'https://arxiv.org/abs/2412.01234v1',
        'https://arxiv.org/abs/2412.01234v2',
        'https://arxiv.org/pdf/2412.01234',
        'https://arxiv.org/html/2412.01234v1',
      ];

      test.each(validUrls)('valid URL: %s', (url) => {
        expect(enricher.canHandle(url)).toBe(true);
      });
    });

    describe('rejects non-arXiv URLs', () => {
      const invalidUrls = [
        'https://example.com/abs/2412.01234',
        'https://evil.com/arxiv.org',
        'https://arxiv.org.evil.com/abs/123',
        'https://google.com',
        'http://localhost:3000',
        // Note: ftp://arxiv.org is accepted by isUrlFromDomain as it only checks domain
        'not-a-url',
        '',
      ];

      test.each(invalidUrls)('invalid URL: %s', (url) => {
        expect(enricher.canHandle(url)).toBe(false);
      });
    });
  });

  describe('extractArxivIdFromUrl - arXiv ID extraction', () => {
    // Access private method for testing
    const extractId = (url: string): string | null => {
      return (enricher as any).extractArxivIdFromUrl(url);
    };

    describe('extracts ID from various URL patterns', () => {
      const testCases = [
        { url: 'https://arxiv.org/abs/2412.01234', expected: '2412.01234' },
        { url: 'https://arxiv.org/abs/2412.01234v1', expected: '2412.01234' },
        { url: 'https://arxiv.org/abs/2412.01234v2', expected: '2412.01234' },
        { url: 'https://arxiv.org/pdf/2412.01234', expected: '2412.01234' },
        { url: 'https://arxiv.org/html/2412.01234v1', expected: '2412.01234' },
        { url: 'https://www.arxiv.org/abs/2312.12345', expected: '2312.12345' },
        { url: 'https://arxiv.org/abs/2401.00001?context=cs.AI', expected: '2401.00001' },
        // arXiv: prefix format in URL (e.g., search results, external references)
        { url: 'https://arxiv.org/search?query=arXiv:2412.01234', expected: '2412.01234' },
      ];

      test.each(testCases)('$url -> $expected', ({ url, expected }) => {
        expect(extractId(url)).toBe(expected);
      });
    });

    describe('returns null for invalid inputs', () => {
      const invalidInputs = [
        'https://example.com/abs/2412.01234',
        'https://arxiv.org/list/cs.AI',
        'https://arxiv.org/',
        'not-a-url',
        '',
      ];

      test.each(invalidInputs)('invalid input: %s', (input) => {
        expect(extractId(input)).toBeNull();
      });
    });
  });

  describe('extractFullContent - HTML content extraction', () => {
    // Access private method for testing
    const extractContent = (html: string): string => {
      return (enricher as any).extractFullContent(html);
    };

    test('extracts target sections (Introduction, Methodology, Results, Conclusion)', () => {
      const content = extractContent(sampleHtmlContent);

      expect(content).toContain('Introduction');
      expect(content).toContain('introduction section');
      expect(content).toContain('Methodology');
      expect(content).toContain('Results');
      expect(content).toContain('Conclusion');
    });

    test('replaces math elements with [MATH] placeholder', () => {
      const content = extractContent(sampleHtmlContent);

      expect(content).toContain('[MATH]');
      expect(content).not.toContain('<math>');
      expect(content).not.toContain('</math>');
    });

    test('removes script and style tags', () => {
      const htmlWithScript = `
        <section>
          <h2>1 Introduction</h2>
          <script>alert('xss')</script>
          <p>Test content that is long enough to be extracted by the enricher system. This paragraph needs to be at least one hundred characters long for the extraction logic to work properly. Adding more text here to ensure we meet that requirement.</p>
          <style>.hidden { display: none; }</style>
        </section>
      `;
      const content = extractContent(htmlWithScript);

      expect(content).not.toContain('alert');
      expect(content).not.toContain('<script>');
      expect(content).not.toContain('<style>');
      expect(content).toContain('Test content');
    });

    test('normalizes whitespace', () => {
      const htmlWithWhitespace = `
        <section>
          <h2>1 Introduction</h2>
          <p>Text   with    multiple     spaces and enough content to pass the minimum length check. This sentence needs to be much longer than one hundred characters so that the extraction logic will include this section in the output.</p>
        </section>
      `;
      const content = extractContent(htmlWithWhitespace);

      expect(content).not.toContain('   ');
      expect(content).toContain('Text with multiple spaces');
    });

    test('returns empty string for HTML without target sections', () => {
      const htmlNoSections = `
        <div>
          <h2>Random Header</h2>
          <p>Some random content</p>
        </div>
      `;
      const content = extractContent(htmlNoSections);

      // Should fallback to main/article extraction, but since there's none, returns empty
      expect(content).toBe('');
    });

    test('falls back to main/article when no target sections exist', () => {
      // Long enough content (>500 chars) in article without section tags
      const longContent = 'This is the main article content that discusses various topics. '.repeat(20);
      const htmlWithArticle = `
        <article>
          <h1>Paper Title</h1>
          <p>${longContent}</p>
        </article>
      `;
      const content = extractContent(htmlWithArticle);

      // Should extract content from article as fallback
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('main article content');
    });

    test('enforces maximum content length', () => {
      // Create HTML with very long sections
      const longSection = 'A'.repeat(40000);
      const longHtml = `
        <section>
          <h2>Introduction</h2>
          <p>${longSection}</p>
        </section>
      `;
      const content = extractContent(longHtml);

      // Should be limited to around 32000 characters (maxTotalLength in implementation)
      expect(content.length).toBeLessThanOrEqual(33000);
    });
  });

  describe('enrich - integration tests', () => {
    // Reset mocks after each test
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('uses HTML version when available', async () => {
      // Mock fetchWithRetry on BaseContentEnricher prototype
      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/html/')) {
          return sampleHtmlContent;
        }
        return sampleAbstractHtml;
      });
      jest.spyOn(BaseContentEnricher.prototype, 'fetchWithRetry').mockImplementation(mockFetch);

      const result = await enricher.enrich('https://arxiv.org/abs/2412.01234');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Introduction');
      expect(result?.content).toContain('Methodology');
      expect(result?.content).toContain('Conclusion');
    });

    test('includes metadata when HTML version is used', async () => {
      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/html/')) {
          return sampleHtmlContent;
        }
        return sampleAbstractHtml;
      });
      jest.spyOn(BaseContentEnricher.prototype, 'fetchWithRetry').mockImplementation(mockFetch);

      const result = await enricher.enrich('https://arxiv.org/abs/2412.01234');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Title:');
      expect(result?.content).toContain('arXiv ID:');
    });

    test('falls back to abstract when HTML version fails (404)', async () => {
      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/html/')) {
          throw new Error('404 Not Found');
        }
        return sampleAbstractHtml;
      });
      jest.spyOn(BaseContentEnricher.prototype, 'fetchWithRetry').mockImplementation(mockFetch);

      const result = await enricher.enrich('https://arxiv.org/abs/2412.01234');

      expect(result).not.toBeNull();
      expect(result?.content).toContain('Abstract');
    });

    test('falls back when HTML content is insufficient (less than 500 chars)', async () => {
      const insufficientHtml = `
        <section>
          <h2>1 Introduction</h2>
          <p>Short text that is not enough.</p>
        </section>
      `;

      const mockFetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('/html/')) {
          return insufficientHtml;
        }
        return sampleAbstractHtml;
      });
      jest.spyOn(BaseContentEnricher.prototype, 'fetchWithRetry').mockImplementation(mockFetch);

      const result = await enricher.enrich('https://arxiv.org/abs/2412.01234');

      expect(result).not.toBeNull();
      // Should have fallen back to abstract
      expect(result?.content).toContain('Abstract');
    });

    test('returns null when all extraction fails', async () => {
      jest
        .spyOn(BaseContentEnricher.prototype, 'fetchWithRetry')
        .mockRejectedValue(new Error('Network error'));

      const result = await enricher.enrich('https://arxiv.org/abs/2412.01234');

      expect(result).toBeNull();
    });

    test('returns null for non-arXiv URLs', async () => {
      // Mock to ensure test is deterministic (no actual network request)
      // enrichFromAbstract is called as fallback, but fails to extract content
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      jest.spyOn(BaseContentEnricher.prototype, 'fetchWithRetry').mockImplementation(mockFetch);

      const result = await enricher.enrich('https://example.com/paper');

      // Should return null because enrichFromAbstract fails
      expect(result).toBeNull();
      // Verify mock was called (via enrichFromAbstract fallback)
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Security considerations', () => {
    test('rejects URLs with malicious patterns', () => {
      const maliciousUrls = [
        'https://arxiv.org.evil.com/abs/2412.01234',
        'https://evil.com/redirect?url=https://arxiv.org/abs/2412.01234',
        'javascript:alert("xss")',
        'file:///etc/passwd',
      ];

      maliciousUrls.forEach((url) => {
        expect(enricher.canHandle(url)).toBe(false);
      });
    });

    test('sanitizes HTML content to prevent XSS', () => {
      const xssHtml = `
        <section>
          <h2>Introduction</h2>
          <p>Test<script>alert('xss')</script></p>
          <img src="x" onerror="alert('xss')">
          <a href="javascript:alert('xss')">link</a>
        </section>
      `;

      const content = (enricher as any).extractFullContent(xssHtml);

      expect(content).not.toContain('<script>');
      expect(content).not.toContain('onerror');
      expect(content).not.toContain('javascript:');
    });
  });
});
