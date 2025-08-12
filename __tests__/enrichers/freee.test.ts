/**
 * FreeeContentEnricher テスト
 */

import { FreeeContentEnricher } from '../../lib/enrichers/freee';

describe('FreeeContentEnricher', () => {
  let enricher: FreeeContentEnricher;

  beforeEach(() => {
    enricher = new FreeeContentEnricher();
  });

  describe('canHandle', () => {
    it('freeeのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://developers.freee.co.jp/entry/event-kobe-20250820')).toBe(true);
      expect(enricher.canHandle('https://developers.freee.co.jp/entry/jasst-25-niigata')).toBe(true);
    });

    it('freee以外のURLを拒否すること', () => {
      expect(enricher.canHandle('https://developers.gmo.jp/cultures/68790/')).toBe(false);
      expect(enricher.canHandle('https://example.com/article')).toBe(false);
      expect(enricher.canHandle('https://tech.smarthr.jp/entry/2025/08/08')).toBe(false);
    });
  });

  describe('enrich', () => {
    it('モックHTMLから正しくコンテンツを抽出できること', () => {
      // モックHTMLサンプル
      const mockHtml = `
        <html>
          <head><title>freee Test Article</title></head>
          <body>
            <header>Header navigation</header>
            <main>
              <article>
                <div class="article-content">
                  <h1>freee開発者ブログテスト記事</h1>
                  <p>これはfreee開発者ブログのテスト記事です。</p>
                  <p>コンテンツエンリッチャーが適切に動作することを確認します。</p>
                  <p>freeeでは、会計システムやマイクロサービスアーキテクチャについて発信しています。</p>
                  <p>APIの設計やシステムの最適化に関する技術的な内容も含まれます。</p>
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                  <p>十分な長さのコンテンツを確保するため、追加のテキストを記載します。</p>
                  <p>これにより、500文字以上のコンテンツが取得できることを確認できます。</p>
                  <p>freeeの技術ブログでは、実務で役立つ情報を発信しています。</p>
                </div>
              </article>
            </main>
            <footer>Footer links</footer>
          </body>
        </html>
      `;

      // fetchWithRetryをモック化
      const originalFetchWithRetry = (enricher as any).fetchWithRetry;
      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(mockHtml);

      // テスト実行
      return enricher.enrich('https://developers.freee.co.jp/entry/test-article').then(content => {
        expect(content).not.toBeNull();
        expect(content!.length).toBeGreaterThan(500);
        expect(content).toContain('freee開発者ブログテスト記事');
        expect(content).toContain('会計システム');
        expect(content).not.toContain('Header navigation');
        expect(content).not.toContain('Footer links');
      });
    });

    it('フォールバック処理が動作すること', () => {
      // プライマリセレクタにマッチしないHTML
      const fallbackHtml = `
        <html>
          <body>
            <main>
              <div class="container">
                <h1>フォールバックテスト</h1>
                <p>プライマリセレクタにマッチしない場合のテストです。</p>
                <p>mainタグやcontainerクラスから取得できることを確認します。</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
                <p>十分な長さのコンテンツを確保するための追加テキストです。</p>
                <p>フォールバック処理が正しく動作することを確認します。</p>
              </div>
            </main>
          </body>
        </html>
      `;

      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(fallbackHtml);

      return enricher.enrich('https://developers.freee.co.jp/entry/fallback-test').then(content => {
        expect(content).not.toBeNull();
        expect(content!.length).toBeGreaterThan(500);
        expect(content).toContain('フォールバックテスト');
        expect(content).toContain('プライマリセレクタにマッチしない');
      });
    });

    it('コンテンツが不足している場合はnullを返すこと', () => {
      const shortHtml = `
        <html>
          <body>
            <article class="article-content">
              <p>短い。</p>
            </article>
          </body>
        </html>
      `;

      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(shortHtml);

      return enricher.enrich('https://developers.freee.co.jp/entry/short-article').then(content => {
        expect(content).toBeNull();
      });
    });

    it('フェッチエラー時はnullを返すこと', () => {
      (enricher as any).fetchWithRetry = jest.fn().mockRejectedValue(new Error('Connection timeout'));

      return enricher.enrich('https://developers.freee.co.jp/entry/error-article').then(content => {
        expect(content).toBeNull();
      });
    });
  });
});