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
      // モックHTMLサンプル（500文字以上のコンテンツを確保）
      const mockHtml = `
        <html>
          <head><title>freee Test Article</title></head>
          <body>
            <header>Header navigation</header>
            <main>
              <article>
                <div class="article-content">
                  <h1>freee開発者ブログテスト記事</h1>
                  <p>これはfreee開発者ブログのテスト記事です。コンテンツエンリッチャーが適切に動作することを確認します。</p>
                  <p>freeeでは、会計システムやマイクロサービスアーキテクチャについて発信しています。クラウド会計ソフトの開発において、様々な技術的チャレンジに取り組んでいます。</p>
                  <p>APIの設計やシステムの最適化に関する技術的な内容も含まれます。RESTful APIの設計原則から、GraphQLの導入まで、幅広いトピックを扱っています。</p>
                  <p>マイクロサービスアーキテクチャの採用により、スケーラブルで保守性の高いシステムを構築しています。各サービスは独立してデプロイ可能で、障害の影響を最小限に抑えることができます。</p>
                  <p>データベースの設計においては、正規化とパフォーマンスのバランスを考慮しています。インデックスの最適化やクエリのチューニングも重要な課題です。</p>
                  <p>セキュリティ面では、OAuth 2.0やJWTを使用した認証・認可の仕組みを実装しています。ユーザーデータの保護は最優先事項です。</p>
                  <p>CI/CDパイプラインの構築により、継続的なデリバリーを実現しています。テストの自動化やコードレビューのプロセスも確立されています。</p>
                  <p>freeeの技術ブログでは、これらの実務で役立つ情報を定期的に発信しています。エンジニアの成長と技術コミュニティへの貢献を目指しています。</p>
                </div>
              </article>
            </main>
            <footer>Footer links</footer>
          </body>
        </html>
      `;

      // fetchWithRetryをモック化
      const _originalFetchWithRetry = (enricher as any).fetchWithRetry;
      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(mockHtml);

      // テスト実行
      return enricher.enrich('https://developers.freee.co.jp/entry/test-article').then(result => {
        expect(result).not.toBeNull();
        expect(result!.content.length).toBeGreaterThan(500);
        expect(result!.content).toContain('freee開発者ブログテスト記事');
        expect(result!.content).toContain('会計システム');
        expect(result!.content).not.toContain('Header navigation');
        expect(result!.content).not.toContain('Footer links');
      });
    });

    it('フォールバック処理が動作すること', () => {
      // プライマリセレクタにマッチしないHTML（500文字以上を確保）
      const fallbackHtml = `
        <html>
          <body>
            <main>
              <div class="container">
                <h1>フォールバックテスト</h1>
                <p>プライマリセレクタにマッチしない場合のテストです。mainタグやcontainerクラスから取得できることを確認します。</p>
                <p>フォールバック処理は、複数のセレクタを試行することで、様々なHTMLパターンに対応できるように設計されています。</p>
                <p>この仕組みにより、サイトの構造が変更されても、一定の耐久性を持ってコンテンツを抽出することが可能です。</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
                <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                <p>フォールバック処理が正しく動作することを確認します。この処理により、様々なサイト構造に対して柔軟に対応することができます。</p>
              </div>
            </main>
          </body>
        </html>
      `;

      (enricher as any).fetchWithRetry = jest.fn().mockResolvedValue(fallbackHtml);

      return enricher.enrich('https://developers.freee.co.jp/entry/fallback-test').then(result => {
        expect(result).not.toBeNull();
        expect(result!.content.length).toBeGreaterThan(500);
        expect(result!.content).toContain('フォールバックテスト');
        expect(result!.content).toContain('プライマリセレクタにマッチしない');
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

      return enricher.enrich('https://developers.freee.co.jp/entry/short-article').then(result => {
        expect(result).toBeNull();
      });
    });

    it('フェッチエラー時はnullを返すこと', () => {
      (enricher as any).fetchWithRetry = jest.fn().mockRejectedValue(new Error('Connection timeout'));

      return enricher.enrich('https://developers.freee.co.jp/entry/error-article').then(result => {
        expect(result).toBeNull();
      });
    });
  });
});