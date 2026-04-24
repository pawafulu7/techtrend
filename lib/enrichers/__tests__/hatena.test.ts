import {
  HatenaContentEnricher,
  HATENA_CUSTOM_DOMAINS,
  HATENA_BLOG_DEV_SOURCE_ID,
} from '../hatena';

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

  describe('canHandle - sourceId-based dispatch', () => {
    it('should match any URL when sourceId is hatena_blog_dev (allowlist未登録の独自ドメイン)', () => {
      expect(
        enricher.canHandle(
          'https://blog.g-gen.co.jp/entry/next-26-keynote-day-1',
          HATENA_BLOG_DEV_SOURCE_ID
        )
      ).toBe(true);
    });

    it('should match any URL when sourceId is hatena_blog_dev (techblog系)', () => {
      expect(
        enricher.canHandle(
          'https://techblog.ap-com.co.jp/entry/kiro-cli-2.0-release',
          HATENA_BLOG_DEV_SOURCE_ID
        )
      ).toBe(true);
    });

    it('should NOT match invalid URL even when sourceId is hatena_blog_dev (fetcher契約違反時の最小防御)', () => {
      // URL パース不可の場合は fetcher 側の異常として false を返し、
      // Generic へのフォールスルーを維持する
      expect(enricher.canHandle('not-a-url', HATENA_BLOG_DEV_SOURCE_ID)).toBe(
        false
      );
    });

    it('should fall back to URL-based check when sourceId is different', () => {
      expect(
        enricher.canHandle(
          'https://blog.g-gen.co.jp/entry/test',
          'some_other_source_id'
        )
      ).toBe(false);
    });

    it('should fall back to URL-based check when sourceId is undefined', () => {
      // 既存呼び出し（sourceId未指定）との後方互換
      expect(
        enricher.canHandle('https://example.hatenablog.com/entry/123')
      ).toBe(true);
      expect(enricher.canHandle('https://blog.g-gen.co.jp/entry/test')).toBe(
        false
      );
    });
  });

  describe('HATENA_BLOG_DEV_SOURCE_ID', () => {
    it('should be the expected constant value', () => {
      // collect-feeds.ts から渡される source.id と一致する必要がある
      expect(HATENA_BLOG_DEV_SOURCE_ID).toBe('hatena_blog_dev');
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
