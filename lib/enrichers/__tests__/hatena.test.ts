import { HatenaContentEnricher, HATENA_CUSTOM_DOMAINS } from '../hatena';

describe('HatenaContentEnricher', () => {
  const enricher = new HatenaContentEnricher();

  describe('canHandle - Hatena native domains', () => {
    it.each([
      'https://example.hatenablog.com/entry/123',
      'https://user.hatenablog.jp/entry',
      'https://hatenablog.com/foo',
      'https://b.hatena.ne.jp/entry',
    ])('should match %s', (url) => {
      expect(enricher.canHandle(url)).toBe(true);
    });
  });

  describe('canHandle - custom domain allowlist', () => {
    it.each(HATENA_CUSTOM_DOMAINS)(
      'should match custom domain %s',
      (domain) => {
        expect(enricher.canHandle(`https://${domain}/article/1`)).toBe(true);
      }
    );

    it('should NOT match subdomains of a custom-allowed domain', () => {
      // allowlist は厳密一致（完全一致のみ）
      expect(enricher.canHandle('https://sub.caddi.tech/entry')).toBe(false);
    });

    it('should NOT match unrelated domain', () => {
      expect(enricher.canHandle('https://example.com/article')).toBe(false);
    });

    it('should return false for invalid URL', () => {
      expect(enricher.canHandle('not-a-url')).toBe(false);
    });
  });

  describe('HATENA_CUSTOM_DOMAINS', () => {
    it('should exclude domains owned by dedicated enrichers', () => {
      // HatenaContentEnricher より前方に配置されている専用 enricher との重複は禁止
      const excluded = [
        'techblog.zozo.com',
        'techblog.recruit.co.jp',
        'tech.pepabo.com',
        'developer.hatenastaff.com',
      ];
      for (const d of excluded) {
        expect(HATENA_CUSTOM_DOMAINS).not.toContain(d);
      }
    });
  });
});
