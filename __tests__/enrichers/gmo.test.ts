/**
 * GMOContentEnricher テスト
 */

import { GMOContentEnricher } from '../../lib/enrichers/gmo';

describe('GMOContentEnricher', () => {
  let enricher: GMOContentEnricher;

  beforeEach(() => {
    enricher = new GMOContentEnricher();
  });

  describe('canHandle', () => {
    it('GMOのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://developers.gmo.jp/cultures/68790/')).toBe(true);
      expect(enricher.canHandle('https://developers.gmo.jp/technology/12345/')).toBe(true);
    });

    it('GMO以外のURLを拒否すること', () => {
      expect(enricher.canHandle('https://developers.freee.co.jp/entry/some-article')).toBe(false);
      expect(enricher.canHandle('https://example.com/article')).toBe(false);
      expect(enricher.canHandle('https://tech.smarthr.jp/entry/2025/08/08')).toBe(false);
    });
  });

  describe('enrich', () => {
    it('モックHTMLから正しくコンテンツを抽出できること', () => {
      // モックHTMLサンプル（500文字以上のコンテンツを確保）
      const mockHtml = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <header>Header content</header>
            <main>
              <article>
                <div class="entry-content">
                  <p>これはテスト記事の本文です。GMO開発者ブログのコンテンツエンリッチャーのテストを行っています。</p>
                  <p>GMOインターネットグループでは、インターネットインフラ事業を中心に、様々な技術的チャレンジに取り組んでいます。</p>
                  <p>クラウドサービスの開発から、ドメイン管理システム、決済プラットフォームまで、幅広い分野で技術革新を推進しています。</p>
                  <p>マイクロサービスアーキテクチャの採用により、各サービスを独立して開発・デプロイすることが可能になりました。これにより、開発効率が大幅に向上しています。</p>
                  <p>また、コンテナ技術やKubernetesを活用することで、スケーラブルで信頼性の高いシステムを構築しています。インフラの自動化により、運用コストも削減できています。</p>
                  <p>セキュリティ面では、最新の暗号化技術や認証プロトコルを採用し、お客様のデータを安全に保護しています。定期的なセキュリティ監査も実施しています。</p>
                  <p>DevOpsの文化を推進し、継続的インテグレーション・継続的デリバリーを実践しています。開発チームと運用チームの連携も強化されています。</p>
                  <p>技術的な内容も含めることで、実際のブログ記事に近い形でテストを行います。これにより、エンリッチャーの品質を保証することができます。</p>
                </div>
              </article>
            </main>
            <footer>Footer content</footer>
          </body>
        </html>
      `;

      // fetchWithRetryをモック化
      const originalFetchWithRetry = (enricher as any).fetchWithRetry;
      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(mockHtml);

      // テスト実行
      return enricher.enrich('https://developers.gmo.jp/test-article').then(content => {
        expect(content).not.toBeNull();
        expect(content!.length).toBeGreaterThan(500);
        expect(content).toContain('テスト記事の本文');
        expect(content).toContain('GMO開発者ブログ');
        expect(content).not.toContain('Header content');
        expect(content).not.toContain('Footer content');
      });
    });

    it('コンテンツが不足している場合はnullを返すこと', () => {
      const shortHtml = `
        <html>
          <body>
            <div class="entry-content">
              <p>短いコンテンツ。</p>
            </div>
          </body>
        </html>
      `;

      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(shortHtml);

      return enricher.enrich('https://developers.gmo.jp/short-article').then(content => {
        expect(content).toBeNull();
      });
    });

    it('フェッチエラー時はnullを返すこと', () => {
      (enricher as any).fetchWithRetry = jest.fn().mockRejectedValue(new Error('Network error'));

      return enricher.enrich('https://developers.gmo.jp/error-article').then(content => {
        expect(content).toBeNull();
      });
    });
  });
});