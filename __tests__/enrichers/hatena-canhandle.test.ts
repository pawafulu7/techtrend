import { HatenaContentEnricher } from '@/lib/enrichers/hatena';

describe('HatenaContentEnricher.canHandle', () => {
  let enricher: HatenaContentEnricher;

  beforeEach(() => {
    enricher = new HatenaContentEnricher();
  });

  describe('Hatena domains', () => {
    it('should return true for hatena.ne.jp domain', () => {
      expect(enricher.canHandle('https://b.hatena.ne.jp/entry/...')).toBe(true);
      expect(enricher.canHandle('https://developer.hatena.ne.jp/...')).toBe(true);
    });

    it('should return true for hatenablog.com domain', () => {
      expect(enricher.canHandle('https://example.hatenablog.com/entry/...')).toBe(true);
    });

    it('should return true for hatenablog.jp domain', () => {
      expect(enricher.canHandle('https://example.hatenablog.jp/entry/...')).toBe(true);
    });
  });

  describe('Non-Hatena domains', () => {
    it('should return false for personal blog', () => {
      expect(enricher.canHandle('https://sdomi.pl/weblog/26-nobody-here-is-free-of-sin/')).toBe(false);
    });

    it('should return false for GitHub', () => {
      expect(enricher.canHandle('https://github.com/user/repo')).toBe(false);
    });

    it('should return false for other domains', () => {
      expect(enricher.canHandle('https://www.wsj.com/article')).toBe(false);
      expect(enricher.canHandle('https://openai.com/blog/...')).toBe(false);
      expect(enricher.canHandle('https://example.com/page')).toBe(false);
    });
  });

  describe('Invalid URLs', () => {
    it('should return false for invalid URL', () => {
      expect(enricher.canHandle('invalid-url')).toBe(false);
      expect(enricher.canHandle('not a url')).toBe(false);
      expect(enricher.canHandle('')).toBe(false);
    });
  });
});
