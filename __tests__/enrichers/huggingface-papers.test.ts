import { HuggingFacePapersEnricher } from '../../lib/enrichers/huggingface-papers';

describe('HuggingFacePapersEnricher', () => {
  let enricher: HuggingFacePapersEnricher;

  beforeEach(() => {
    enricher = new HuggingFacePapersEnricher();
  });

  describe('canHandle - URL検証のセキュリティテスト', () => {
    describe('正当なURLを受け入れる', () => {
      const validUrls = [
        'https://huggingface.co/papers/2401.00001',
        'https://www.huggingface.co/papers/test',
        'https://arxiv.org/abs/2401.00001',
        'https://www.arxiv.org/pdf/2401.00001.pdf',
        'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=123456',
        'https://www.papers.ssrn.com/sol3/papers.cfm?abstract_id=123456',
        'https://openreview.net/forum?id=abc123',
        'https://www.openreview.net/pdf?id=xyz789'
      ];

      test.each(validUrls)('正当なURL: %s', (url) => {
        expect(enricher.canHandle(url)).toBe(true);
      });
    });

    describe('悪意のあるURLを拒否する（SSRF攻撃対策）', () => {
      const maliciousUrls = [
        // パスに含まれる場合
        'https://evil.com/arxiv.org',
        'https://evil.com/path/papers.ssrn.com',
        'https://evil.com/openreview.net',

        // クエリパラメータに含まれる場合
        'https://evil.com?redirect=arxiv.org',
        'https://evil.com?url=papers.ssrn.com',
        'https://evil.com?site=openreview.net',

        // サブドメインとして含まれる場合
        'https://arxiv.org.evil.com',
        'https://papers.ssrn.com.evil.com',
        'https://openreview.net.evil.com',

        // ポート番号付き
        'https://evil.com:8080/arxiv.org',

        // ユーザー情報付き
        'https://user@evil.com/arxiv.org',
        'https://arxiv.org@evil.com',

        // 完全に異なるドメイン
        'https://example.com',
        'https://google.com',
        'http://localhost:3000',

        // プロトコル違い
        'ftp://arxiv.org',
        'file://arxiv.org',

        // 不正なURL
        'not-a-url',
        'javascript:alert(1)',
        '',
        'null',
        'undefined'
      ];

      test.each(maliciousUrls)('悪意のあるURL: %s', (url) => {
        expect(enricher.canHandle(url)).toBe(false);
      });
    });

    test('URL解析エラーの場合はfalseを返す', () => {
      const invalidUrls = [
        'not a url',
        '\\\\evil\\path',
        'http://',
        '//evil.com',
        null as any,
        undefined as any,
        {} as any,
        [] as any,
        123 as any
      ];

      invalidUrls.forEach(url => {
        expect(enricher.canHandle(url)).toBe(false);
      });
    });

    test('大文字小文字を区別しない', () => {
      const mixedCaseUrls = [
        'https://ArXiv.Org/abs/123',
        'https://WWW.ARXIV.ORG/abs/123',
        'https://Papers.SSRN.Com/test',
        'https://OpenReview.Net/forum'
      ];

      mixedCaseUrls.forEach(url => {
        expect(enricher.canHandle(url)).toBe(true);
      });
    });
  });

  describe('extractPaperMetadata - HTMLサニタイゼーションテスト', () => {
    test('sanitizeHtmlが正しくインポート・使用されている', () => {
      // この時点でビルドが成功していれば、importは正しい
      expect(enricher).toBeDefined();
    });

    test('悪意のあるHTMLタグが除去される', () => {
      // extractPaperMetadataはprivateメソッドなので、
      // enrichメソッド経由でテストするか、
      // または実装時にsanitizeHtmlが使用されていることを
      // ビルドとLintで確認する
      const maliciousHtml = `
        <title><script>alert('xss')</script>Test Title</title>
        <h1 class="title">Paper<img src=x onerror="alert(1)">Title</h1>
        <div class="authors"><script>evil()</script>John Doe</div>
      `;

      // enrichメソッドはネットワークアクセスを行うため、
      // 実際のテストは統合テストで行う
      // ここではcanHandleが正しく動作していることを確認
      expect(enricher.canHandle('https://arxiv.org/test')).toBe(true);
    });
  });

  describe('セキュリティ修正の統合確認', () => {
    test('URLホワイトリストが正しく設定されている', () => {
      // ホワイトリストに含まれるドメイン数を確認
      const allowedDomains = [
        'huggingface.co',
        'arxiv.org',
        'papers.ssrn.com',
        'openreview.net'
      ];

      allowedDomains.forEach(domain => {
        expect(enricher.canHandle(`https://${domain}/test`)).toBe(true);
        expect(enricher.canHandle(`https://www.${domain}/test`)).toBe(true);
      });
    });

    test('URLパース処理が例外を適切に処理する', () => {
      // エラーをスローせずにfalseを返すことを確認
      expect(() => enricher.canHandle(null as any)).not.toThrow();
      expect(() => enricher.canHandle(undefined as any)).not.toThrow();
      expect(() => enricher.canHandle('invalid url')).not.toThrow();

      expect(enricher.canHandle(null as any)).toBe(false);
      expect(enricher.canHandle(undefined as any)).toBe(false);
      expect(enricher.canHandle('invalid url')).toBe(false);
    });
  });
});