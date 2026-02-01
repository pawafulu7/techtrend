import {
  normalizeUrl,
  normalizeTitle,
  calculateSimilarity,
  isArticleDuplicate,
} from '@/lib/utils/url-normalizer';

describe('url-normalizer', () => {
  describe('normalizeUrl', () => {
    it('should remove UTM parameters', () => {
      const url =
        'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=test';
      expect(normalizeUrl(url)).toBe('https://example.com/article');
    });

    it('should remove multiple tracking parameters', () => {
      const url =
        'https://example.com/article?fbclid=abc123&gclid=xyz789&ref=homepage';
      expect(normalizeUrl(url)).toBe('https://example.com/article');
    });

    it('should remove trailing slash', () => {
      expect(normalizeUrl('https://example.com/article/')).toBe(
        'https://example.com/article'
      );
    });

    it('should keep root path slash', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('should remove www prefix', () => {
      expect(normalizeUrl('https://www.example.com/article')).toBe(
        'https://example.com/article'
      );
    });

    it('should convert http to https', () => {
      expect(normalizeUrl('http://example.com/article')).toBe(
        'https://example.com/article'
      );
    });

    it('should remove hash fragments', () => {
      expect(normalizeUrl('https://example.com/article#section1')).toBe(
        'https://example.com/article'
      );
    });

    it('should handle Medium tracking params', () => {
      const url = 'https://medium.com/article?gi=abc123&sk=xyz789';
      expect(normalizeUrl(url)).toBe('https://medium.com/article');
    });

    it('should preserve non-tracking query params', () => {
      const url = 'https://example.com/search?q=test&page=2';
      expect(normalizeUrl(url)).toBe(
        'https://example.com/search?q=test&page=2'
      );
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      expect(normalizeUrl(invalidUrl)).toBe(invalidUrl);
    });

    it('should remove default ports', () => {
      expect(normalizeUrl('https://example.com:443/article')).toBe(
        'https://example.com/article'
      );
      expect(normalizeUrl('http://example.com:80/article')).toBe(
        'https://example.com/article'
      );
    });
  });

  describe('normalizeTitle', () => {
    it('should lowercase and remove brackets', () => {
      expect(normalizeTitle('[Article] Title Here')).toBe('article title here');
    });

    it('should normalize Japanese brackets', () => {
      expect(normalizeTitle('【重要】タイトル')).toBe('重要 タイトル');
    });

    it('should convert colons and dashes to spaces', () => {
      expect(normalizeTitle('Title: Subtitle - Part 1')).toBe(
        'title subtitle part 1'
      );
    });

    it('should normalize multiple spaces', () => {
      expect(normalizeTitle('Title    with   spaces')).toBe(
        'title with spaces'
      );
    });

    it('should handle empty string', () => {
      expect(normalizeTitle('')).toBe('');
    });

    it('should handle Japanese parentheses', () => {
      expect(normalizeTitle('タイトル（サブタイトル）')).toBe(
        'タイトル サブタイトル'
      );
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
    });

    it('should return 0 for completely different strings', () => {
      expect(calculateSimilarity('abc', 'xyz')).toBe(0);
    });

    it('should return high similarity for similar strings', () => {
      const similarity = calculateSimilarity('hello world', 'hello worlds');
      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should handle empty strings', () => {
      expect(calculateSimilarity('', '')).toBe(1.0);
      expect(calculateSimilarity('hello', '')).toBe(0);
    });
  });

  describe('isArticleDuplicate', () => {
    it('should detect same article with different UTM params', () => {
      expect(
        isArticleDuplicate(
          'https://example.com/article?utm_source=dev',
          'My Article',
          'https://example.com/article?utm_source=hackernoon',
          'My Article'
        )
      ).toBe(true);
    });

    it('should detect same article with www difference', () => {
      expect(
        isArticleDuplicate(
          'https://www.example.com/article',
          'My Article',
          'https://example.com/article',
          'My Article'
        )
      ).toBe(true);
    });

    it('should detect similar titles on different domains', () => {
      expect(
        isArticleDuplicate(
          'https://dev.to/user/article',
          'Building a REST API with Node.js',
          'https://hackernoon.com/other-article',
          'Building a REST API with NodeJS'
        )
      ).toBe(true);
    });

    it('should detect same title with different brackets (with lower threshold)', () => {
      // 括弧は除去されるが、中のテキスト（Tutorial）は残るため
      // プレフィックス付き記事の検出には低い閾値（0.6）が必要
      expect(
        isArticleDuplicate(
          'https://site1.com/a',
          '[Tutorial] How to Build APIs',
          'https://site2.com/b',
          'How to Build APIs',
          0.6 // プレフィックス差異を許容する閾値
        )
      ).toBe(true);
    });

    it('should detect same title with minimal differences', () => {
      // 括弧なしの微小な差異はデフォルト閾値（0.85）で検出可能
      expect(
        isArticleDuplicate(
          'https://site1.com/a',
          'How to Build REST APIs',
          'https://site2.com/b',
          'How to Build REST API' // 末尾のsが欠落
        )
      ).toBe(true);
    });

    it('should not match completely different articles', () => {
      expect(
        isArticleDuplicate(
          'https://example.com/article1',
          'Introduction to Python',
          'https://example.com/article2',
          'Advanced JavaScript Patterns'
        )
      ).toBe(false);
    });

    it('should handle empty URLs gracefully', () => {
      expect(isArticleDuplicate('', 'Same Title', '', 'Same Title')).toBe(true);
    });

    it('should respect custom similarity threshold', () => {
      // With high threshold, similar but not identical titles should not match
      expect(
        isArticleDuplicate(
          'https://a.com/1',
          'Building REST APIs',
          'https://b.com/2',
          'Building GraphQL APIs',
          0.95
        )
      ).toBe(false);

      // With lower threshold, they might match
      expect(
        isArticleDuplicate(
          'https://a.com/1',
          'Building REST APIs',
          'https://b.com/2',
          'Building REST API',
          0.8
        )
      ).toBe(true);
    });
  });
});
