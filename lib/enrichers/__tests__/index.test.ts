import { ContentEnricherFactory } from '../index';

describe('ContentEnricherFactory', () => {
  let factory: ContentEnricherFactory;

  beforeEach(() => {
    factory = new ContentEnricherFactory();
  });

  describe('getEnricher', () => {
    it('should return StackOverflowEnricher for Stack Overflow URLs', () => {
      const enricher = factory.getEnricher(
        'https://stackoverflow.blog/2024/01/article'
      );

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('StackOverflowEnricher');
    });

    it('should return GitHubBlogEnricher for GitHub blog URLs', () => {
      const enricher = factory.getEnricher(
        'https://github.blog/2024/01/article'
      );

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('GitHubBlogEnricher');
    });

    it('should return CloudflareBlogEnricher for Cloudflare blog URLs', () => {
      const enricher = factory.getEnricher(
        'https://blog.cloudflare.com/article'
      );

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('CloudflareBlogEnricher');
    });

    it('should return ZennApiEnricher for Zenn article URLs', () => {
      const enricher = factory.getEnricher(
        'https://zenn.dev/user/articles/sample'
      );

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('ZennApiEnricher');
    });

    it('should return MoneyForwardContentEnricher for Money Forward URLs', () => {
      const enricher = factory.getEnricher(
        'https://moneyforward-dev.jp/entry/2024/01/01/article'
      );

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('MoneyForwardContentEnricher');
    });

    it('should return GenericContentEnricher as fallback for unknown URLs', () => {
      const enricher = factory.getEnricher('https://unknown-site.com/article');

      expect(enricher).not.toBeNull();
      expect(enricher?.constructor.name).toBe('GenericContentEnricher');
    });

    it('should handle multiple enrichers for same domain correctly', () => {
      // Test that the first matching enricher is returned
      const gmoenricher = factory.getEnricher(
        'https://developers.gmo.jp/article'
      );
      expect(gmoenricher?.constructor.name).toBe('GMOContentEnricher');

      const freeenricher = factory.getEnricher(
        'https://developers.freee.co.jp/article'
      );
      expect(freeenricher?.constructor.name).toBe('FreeeContentEnricher');
    });
  });

  describe('getEnricherCount', () => {
    it('should return the correct number of enrichers', () => {
      const count = factory.getEnricherCount();

      // Based on the current implementation, we have 23 enrichers
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(30);
    });
  });

  describe('getSupportedDomains', () => {
    it('should return list of supported domains', () => {
      const domains = factory.getSupportedDomains();

      expect(domains).toContain('developers.gmo.jp');
      expect(domains).toContain('developers.freee.co.jp');
      expect(domains).toContain('zenn.dev');
      expect(domains).toContain('thinkit.co.jp');
      expect(domains).toContain('*'); // HatenaContentEnricher supports all
    });

    it('should include all primary domains', () => {
      const domains = factory.getSupportedDomains();

      expect(Array.isArray(domains)).toBe(true);
      expect(domains.length).toBeGreaterThan(0);
    });
  });

  describe('enricher ordering', () => {
    it('should prioritize specific enrichers over generic ones', () => {
      // The HatenaContentEnricher is last in the list as it handles all URLs
      // More specific enrichers should be matched first
      const specificUrl = 'https://zenn.dev/article';
      const enricher = factory.getEnricher(specificUrl);

      // Should get ZennContentEnricher, not HatenaContentEnricher
      expect(enricher?.constructor.name).toBe('ZennContentEnricher');
      expect(enricher?.constructor.name).not.toBe('HatenaContentEnricher');
    });
  });

  describe('enricher URL matching', () => {
    const testCases = [
      { url: 'https://developers.gmo.jp/123', expected: 'GMOContentEnricher' },
      {
        url: 'https://developers.freee.co.jp/entry',
        expected: 'FreeeContentEnricher',
      },
      {
        url: 'https://zenn.dev/user/articles/abc',
        expected: 'ZennApiEnricher',
      },
      {
        url: 'https://thinkit.co.jp/article/123',
        expected: 'ThinkITContentEnricher',
      },
      // { url: 'https://ai.googleblog.com/post', expected: 'GoogleAIEnricher' }, // TODO: Fix enricher
      {
        url: 'https://developers.googleblog.com/post',
        expected: 'GoogleDevEnricher',
      },
      {
        url: 'https://huggingface.co/blog/post',
        expected: 'HuggingFaceEnricher',
      },
      {
        url: 'https://www.infoq.com/jp/articles/test',
        expected: 'InfoQEnricher',
      },
      {
        url: 'https://www.publickey1.jp/blog/24/test',
        expected: 'PublickeyEnricher',
      },
      {
        url: 'https://stackoverflow.blog/2024/01/test',
        expected: 'StackOverflowEnricher',
      },
      {
        url: 'https://techblog.zozo.com/entry/test',
        expected: 'ZOZOContentEnricher',
      },
      // { url: 'https://blog.recruit.co.jp/rtc/test', expected: 'RecruitContentEnricher' }, // TODO: Fix enricher
      {
        url: 'https://developer.hatenastaff.com/entry',
        expected: 'HatenaDeveloperContentEnricher',
      },
      {
        url: 'https://tech.pepabo.com/2024/01/test',
        expected: 'PepaboContentEnricher',
      },
      {
        url: 'https://buildersbox.corp-sansan.com/entry',
        expected: 'SansanContentEnricher',
      },
      {
        url: 'https://moneyforward-dev.jp/entry/test',
        expected: 'MoneyForwardContentEnricher',
      },
      {
        url: 'https://github.blog/2024-01-test',
        expected: 'GitHubBlogEnricher',
      },
      {
        url: 'https://blog.cloudflare.com/test',
        expected: 'CloudflareBlogEnricher',
      },
      {
        url: 'https://hacks.mozilla.org/2024/01/test',
        expected: 'MozillaHacksEnricher',
      },
      // { url: 'https://news.ycombinator.com/item?id=123', expected: 'HackerNewsEnricher' }, // TODO: Fix enricher
      {
        url: 'https://netflixtechblog.com/test',
        expected: 'MediumEngineeringEnricher',
      },
      {
        url: 'https://www.anthropic.com/news/test-article',
        expected: 'AnthropicNewsEnricher',
      },
      {
        url: 'https://www.anthropic.com/mars',
        expected: 'AnthropicNewsEnricher',
      },
      {
        url: 'https://claude.com/blog/test-post',
        expected: 'ClaudeBlogEnricher',
      },
    ];

    test.each(testCases)(
      'should return $expected for $url',
      ({ url, expected }) => {
        const enricher = factory.getEnricher(url);
        expect(enricher?.constructor.name).toBe(expected);
      }
    );
  });

  describe('HatenaContentEnricher custom domain allowlist', () => {
    it.each([
      'https://tech.every.tv/article',
      'https://caddi.tech/entry/123',
      'https://tech.gunosy.io/entry/2024',
      'https://mackerel.io/blog/entry',
      'https://tech.askul.co.jp/article',
      'https://blogs.networld.co.jp/entry',
      'https://tech.nri-net.com/post',
      'https://tech.talentx.co.jp/entry',
      'https://blog.serverworks.co.jp/article',
      'https://developer.so-tech.co.jp/entry',
    ])('should return HatenaContentEnricher for custom domain %s', (url) => {
      const enricher = factory.getEnricher(url);
      expect(enricher?.constructor.name).toBe('HatenaContentEnricher');
    });

    // 専用 enricher 管轄ドメインは Hatena ではなく各専用 enricher が返ることを確認
    // (HatenaContentEnricher は factory 内で後方に配置されているため、先行する専用 enricher が優先される)
    it.each([
      {
        url: 'https://techblog.zozo.com/entry/test',
        expected: 'ZOZOContentEnricher',
      },
      {
        url: 'https://tech.pepabo.com/2024/01/test',
        expected: 'PepaboContentEnricher',
      },
      {
        url: 'https://developer.hatenastaff.com/entry',
        expected: 'HatenaDeveloperContentEnricher',
      },
    ])(
      'should prefer dedicated enricher over Hatena for $url',
      ({ url, expected }) => {
        const enricher = factory.getEnricher(url);
        expect(enricher?.constructor.name).toBe(expected);
      }
    );

    it('should NOT match unknown domain as Hatena', () => {
      const enricher = factory.getEnricher(
        'https://example-unknown.com/article'
      );
      expect(enricher?.constructor.name).toBe('GenericContentEnricher');
    });
  });

  describe('getEnricher - sourceId-based dispatch', () => {
    it('should return HatenaContentEnricher for allowlist-未登録独自ドメイン when sourceId=hatena_blog_dev', () => {
      const enricher = factory.getEnricher(
        'https://blog.g-gen.co.jp/entry/next-26-keynote-day-1',
        'hatena_blog_dev'
      );
      expect(enricher?.constructor.name).toBe('HatenaContentEnricher');
    });

    it('should return GenericContentEnricher for allowlist-未登録独自ドメイン when sourceId is absent', () => {
      // sourceId なしでは allowlist 未登録ドメインは Generic にフォールスルー（従来挙動）
      const enricher = factory.getEnricher(
        'https://blog.g-gen.co.jp/entry/next-26-keynote-day-1'
      );
      expect(enricher?.constructor.name).toBe('GenericContentEnricher');
    });

    it('should prefer dedicated enricher over Hatena even when sourceId=hatena_blog_dev', () => {
      // sourceId='hatena_blog_dev' でも ZOZO 等の専用 enricher が先に評価される
      // （実運用で hatena_blog_dev が ZOZO ドメインを収集することはないが、順序不変性の確認）
      const enricher = factory.getEnricher(
        'https://techblog.zozo.com/entry/test',
        'hatena_blog_dev'
      );
      expect(enricher?.constructor.name).toBe('ZOZOContentEnricher');
    });
  });

  describe('AnthropicNewsEnricher boundary', () => {
    it('should NOT match /newsroom path', () => {
      const enricher = factory.getEnricher(
        'https://www.anthropic.com/newsroom/press-release'
      );
      expect(enricher?.constructor.name).not.toBe('AnthropicNewsEnricher');
    });

    it('should NOT match /about path on anthropic.com', () => {
      const enricher = factory.getEnricher('https://www.anthropic.com/about');
      expect(enricher?.constructor.name).not.toBe('AnthropicNewsEnricher');
    });
  });
});
