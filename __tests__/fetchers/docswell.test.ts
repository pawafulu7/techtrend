import { DocswellFetcher } from '../../lib/fetchers/docswell';
import { Source } from '@/lib/prisma-exports';
import * as cheerio from 'cheerio';

// Mock fetch
global.fetch = jest.fn();

describe('DocswellFetcher', () => {
  let fetcher: DocswellFetcher;
  let mockSource: Source;

  beforeEach(() => {
    mockSource = {
      id: 'test-docswell-id',
      name: 'Docswell',
      url: 'https://www.docswell.com',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    fetcher = new DocswellFetcher(mockSource);
    jest.clearAllMocks();
  });

  describe('validateThumbnailUrl', () => {
    // Access private method for testing
    const validateThumbnailUrl = (url: string | undefined): string | undefined => {
      return (fetcher as any).validateThumbnailUrl(url);
    };

    describe('valid URLs', () => {
      it('should accept valid docswell.com thumbnail URLs with jpg', () => {
        const url = 'https://docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept valid docswell.com thumbnail URLs with jpeg', () => {
        const url = 'https://docswell.com/slides/thumbnail.jpeg';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept valid docswell.com thumbnail URLs with png', () => {
        const url = 'https://docswell.com/slides/thumbnail.png';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept valid docswell.com thumbnail URLs with webp', () => {
        const url = 'https://docswell.com/slides/thumbnail.webp';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept valid docswell.com thumbnail URLs with gif', () => {
        const url = 'https://docswell.com/slides/thumbnail.gif';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept protocol-relative URLs and normalize them', () => {
        const url = '//bcdn.docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBe('https://bcdn.docswell.com/slides/thumbnail.jpg');
      });

      it('should accept URLs with width parameter', () => {
        const url = 'https://docswell.com/slides/image?width=800';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept URLs with image extension and query parameters', () => {
        const url = 'https://docswell.com/slides/thumbnail.jpg?v=123';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept www.docswell.com URLs', () => {
        const url = 'https://www.docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should accept bcdn.docswell.com URLs', () => {
        const url = 'https://bcdn.docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBe(url);
      });
    });

    describe('invalid URLs - text rejection', () => {
      it('should reject "1K Views" text', () => {
        expect(validateThumbnailUrl('1K Views')).toBeUndefined();
      });

      it('should reject "1.3K Views" text', () => {
        expect(validateThumbnailUrl('1.3K Views')).toBeUndefined();
      });

      it('should reject "100 Views" text', () => {
        expect(validateThumbnailUrl('100 Views')).toBeUndefined();
      });

      it('should reject arbitrary text', () => {
        expect(validateThumbnailUrl('some random text')).toBeUndefined();
      });
    });

    describe('invalid URLs - protocol rejection', () => {
      it('should reject non-https URLs', () => {
        const url = 'http://docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject ftp URLs', () => {
        const url = 'ftp://docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject data: URLs', () => {
        const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject javascript: URLs', () => {
        const url = 'javascript:alert(1)';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject blob: URLs', () => {
        const url = 'blob:https://example.com/uuid';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject file: URLs', () => {
        const url = 'file:///etc/passwd';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject vbscript: URLs', () => {
        const url = 'vbscript:msgbox("XSS")';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject uppercase protocol variants', () => {
        expect(validateThumbnailUrl('JAVASCRIPT:alert(1)')).toBeUndefined();
        expect(validateThumbnailUrl('JavaScript:alert(1)')).toBeUndefined();
        expect(validateThumbnailUrl('VBSCRIPT:msgbox("XSS")')).toBeUndefined();
        expect(validateThumbnailUrl('DATA:image/png;base64,xyz')).toBeUndefined();
      });
    });

    describe('invalid URLs - host rejection', () => {
      it('should reject non-docswell hosts', () => {
        const url = 'https://evil.com/image.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject spoofed paths', () => {
        const url = 'https://evil.com/docswell/x.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject subdomain spoofing', () => {
        const url = 'https://docswell.com.evil.com/image.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject similar-looking domains', () => {
        const url = 'https://docswel1.com/image.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });
    });

    describe('invalid URLs - extension rejection', () => {
      it('should reject URLs without valid image extension or width parameter', () => {
        const url = 'https://docswell.com/slides/document.pdf';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject URLs with no extension', () => {
        const url = 'https://docswell.com/slides/thumbnail';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject URLs with invalid extension', () => {
        const url = 'https://docswell.com/slides/thumbnail.txt';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });
    });

    describe('invalid URLs - userinfo rejection', () => {
      it('should reject URLs with username', () => {
        const url = 'https://user@docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });

      it('should reject URLs with username and password', () => {
        const url = 'https://user:pass@docswell.com/slides/thumbnail.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(validateThumbnailUrl('')).toBeUndefined();
      });

      it('should handle undefined', () => {
        expect(validateThumbnailUrl(undefined)).toBeUndefined();
      });

      it('should handle malformed URLs', () => {
        expect(validateThumbnailUrl('not a url at all')).toBeUndefined();
      });

      it('should handle URLs with fragments', () => {
        const url = 'https://docswell.com/slides/thumbnail.jpg#fragment';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should handle URLs with multiple query parameters', () => {
        const url = 'https://docswell.com/slides/thumbnail.jpg?v=123&width=800';
        expect(validateThumbnailUrl(url)).toBe(url);
      });

      it('should handle whitespace-trimmed URLs', () => {
        const url = '  https://docswell.com/slides/thumbnail.jpg  ';
        expect(validateThumbnailUrl(url)).toBe('https://docswell.com/slides/thumbnail.jpg');
      });

      it('should reject URLs exceeding max length (2048 chars)', () => {
        const url = 'https://docswell.com/' + 'a'.repeat(2048) + '.jpg';
        expect(validateThumbnailUrl(url)).toBeUndefined();
      });
    });
  });

  describe('findValidThumbnailImg', () => {
    // Access private method for testing
    const findValidThumbnailImg = (html: string): string | undefined => {
      const $ = cheerio.load(html);
      const $div = $.root();
      return (fetcher as any).findValidThumbnailImg($div, $);
    };

    describe('with alt="slide-thumbnail"', () => {
      it('should find img with alt="slide-thumbnail"', () => {
        const html = `
          <div>
            <img src="https://docswell.com/first.jpg" alt="other" />
            <img src="https://docswell.com/slide.jpg" alt="slide-thumbnail" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/slide.jpg');
      });

      it('should prioritize alt="slide-thumbnail" over other images', () => {
        const html = `
          <div>
            <img src="https://docswell.com/first.jpg" alt="first" />
            <img src="https://docswell.com/second.jpg" alt="second" />
            <img src="https://docswell.com/slide.jpg" alt="slide-thumbnail" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/slide.jpg');
      });

      it('should skip invalid alt="slide-thumbnail" and fallback', () => {
        const html = `
          <div>
            <img src="https://evil.com/bad.jpg" alt="slide-thumbnail" />
            <img src="https://docswell.com/good.jpg" alt="other" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/good.jpg');
      });
    });

    describe('fallback to first valid img', () => {
      it('should return first valid img when no alt="slide-thumbnail"', () => {
        const html = `
          <div>
            <img src="https://docswell.com/first.jpg" alt="image" />
            <img src="https://docswell.com/second.jpg" alt="image" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/first.jpg');
      });

      it('should skip invalid images and return first valid one', () => {
        const html = `
          <div>
            <img src="https://evil.com/bad1.jpg" alt="bad" />
            <img src="data:image/png;base64,xyz" alt="bad" />
            <img src="https://docswell.com/good.jpg" alt="good" />
            <img src="https://docswell.com/second.jpg" alt="also-good" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/good.jpg');
      });

      it('should skip images with "Views" text', () => {
        const html = `
          <div>
            <img src="1K Views" alt="bad" />
            <img src="1.3K Views" alt="bad" />
            <img src="https://docswell.com/good.jpg" alt="good" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/good.jpg');
      });

      it('should handle protocol-relative URLs', () => {
        const html = `
          <div>
            <img src="//bcdn.docswell.com/slide.jpg" alt="slide" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://bcdn.docswell.com/slide.jpg');
      });
    });

    describe('empty or invalid elements', () => {
      it('should return undefined for empty div', () => {
        const html = '<div></div>';
        expect(findValidThumbnailImg(html)).toBeUndefined();
      });

      it('should return undefined when no valid images', () => {
        const html = `
          <div>
            <img src="https://evil.com/bad.jpg" />
            <img src="data:image/png;base64,xyz" />
            <img src="javascript:alert(1)" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBeUndefined();
      });

      it('should return undefined when all images are text', () => {
        const html = `
          <div>
            <img src="1K Views" />
            <img src="100 Views" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBeUndefined();
      });

      it('should handle missing src attribute', () => {
        const html = `
          <div>
            <img alt="no-src" />
            <img src="https://docswell.com/good.jpg" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/good.jpg');
      });
    });

    describe('complex scenarios', () => {
      it('should handle nested elements', () => {
        const html = `
          <div>
            <div>
              <a>
                <img src="https://docswell.com/nested.jpg" alt="slide-thumbnail" />
              </a>
            </div>
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/nested.jpg');
      });

      it('should handle multiple alt="slide-thumbnail" and return first valid', () => {
        const html = `
          <div>
            <img src="https://evil.com/bad.jpg" alt="slide-thumbnail" />
            <img src="https://docswell.com/good.jpg" alt="slide-thumbnail" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/good.jpg');
      });

      it('should handle images with width parameter', () => {
        const html = `
          <div>
            <img src="https://docswell.com/image?width=800" alt="slide-thumbnail" />
          </div>
        `;
        expect(findValidThumbnailImg(html)).toBe('https://docswell.com/image?width=800');
      });
    });
  });

  describe('fetch', () => {
    it('should return articles and errors structure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <div class="grid">
                <div>
                  <a href="/s/test-slide">
                    <h3>Test Presentation</h3>
                    <img src="https://docswell.com/thumb.jpg" alt="slide-thumbnail" />
                  </a>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      const result = await fetcher.fetch();

      expect(result).toHaveProperty('articles');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.articles)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should handle fetch errors gracefully', async () => {
      // Use mockRejectedValue (not Once) to handle retry attempts
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await fetcher.fetch();

      expect(result.articles).toEqual([]);
      expect(result.errors).toHaveLength(1);
      // Error message may vary depending on retry logic and how error is captured
      expect(result.errors[0]).toBeInstanceOf(Error);
    });
  });
});
