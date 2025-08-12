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
      // モックHTMLサンプル
      const mockHtml = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <header>Header content</header>
            <main>
              <article>
                <div class="entry-content">
                  <p>これはテスト記事の本文です。</p>
                  <p>GMO開発者ブログのコンテンツエンリッチャーのテストを行っています。</p>
                  <p>十分な長さのコンテンツが取得できることを確認します。</p>
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                  <p>この文章は500文字以上になるように作成されています。</p>
                  <p>さらに追加のコンテンツを記載することで、エンリッチャーが適切に動作することを確認できます。</p>
                  <p>技術的な内容も含めることで、実際のブログ記事に近い形でテストを行います。</p>
                  <p>これにより、エンリッチャーの品質を保証することができます。</p>
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