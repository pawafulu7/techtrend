/**
 * AWSEnricher テスト
 */

import { AWSEnricher } from '../../lib/enrichers/aws';

describe('AWSEnricher', () => {
  let enricher: AWSEnricher;

  beforeEach(() => {
    enricher = new AWSEnricher();
  });

  describe('canHandle', () => {
    it('AWSのURLを正しく判定できること', () => {
      expect(enricher.canHandle('https://aws.amazon.com/blogs/compute/new-feature')).toBe(true);
      expect(enricher.canHandle('https://aws.amazon.com/jp/blogs/news/article')).toBe(true);
      expect(enricher.canHandle('https://aws.amazon.com/about-aws/whats-new/2025/01/feature')).toBe(true);
      expect(enricher.canHandle('https://www.aws.amazon.com/blogs/article')).toBe(true);
    });

    it('AWS以外のURLを拒否すること', () => {
      expect(enricher.canHandle('https://cloud.google.com/blog/article')).toBe(false);
      expect(enricher.canHandle('https://azure.microsoft.com/blog')).toBe(false);
      expect(enricher.canHandle('https://example.com/article')).toBe(false);
    });

    it('ホスト名のサブストリング攻撃を防ぐこと', () => {
      // aws.amazon.comを含むが異なるホスト
      expect(enricher.canHandle('https://fake-aws.amazon.com.evil.com/blog')).toBe(false);
      expect(enricher.canHandle('https://aws.amazon.com.phishing.site/article')).toBe(false);
      expect(enricher.canHandle('https://notaws.amazon.com/blog')).toBe(false);
      expect(enricher.canHandle('http://aws.amazon.com.localhost:8080/article')).toBe(false);
    });

    it('不正なURLを安全に処理すること', () => {
      expect(enricher.canHandle('not-a-url')).toBe(false);
      expect(enricher.canHandle('')).toBe(false);
      expect(enricher.canHandle('javascript:alert(1)')).toBe(false);
      expect(enricher.canHandle('file:///etc/passwd')).toBe(false);
    });
  });

  describe('enrich', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    // fetchをモック化するためのヘルパー
    const mockFetch = (html: string, status = 200) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: status === 200,
        status,
        text: jest.fn().mockResolvedValue(html),
      } as any);
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('AWS Blogの記事から正しくコンテンツを抽出できること', () => {
      const mockHtml = `
        <html>
          <head>
            <title>AWS Blog Post</title>
            <meta property="og:image" content="https://aws.amazon.com/image.jpg" />
          </head>
          <body>
            <header>Navigation</header>
            <main>
              <article>
                <div class="blog-post-content">
                  <p>This is a comprehensive AWS blog post about new features in Amazon EC2.</p>
                  <p>Amazon Web Services (AWS) continues to innovate and provide new capabilities for developers and organizations worldwide.</p>
                  <p>Today, we're excited to announce several new features that will help you build more scalable and resilient applications.</p>
                  <p>The new EC2 instance types offer improved performance and cost efficiency. These instances are optimized for compute-intensive workloads.</p>
                  <p>With enhanced networking capabilities, you can achieve up to 100 Gbps of network performance, enabling faster data transfer between instances.</p>
                  <p>Additionally, the new instances support the latest generation of Intel and AMD processors, providing better performance per dollar.</p>
                  <p>We've also improved the Auto Scaling service with predictive scaling capabilities that use machine learning to forecast traffic patterns.</p>
                  <p>This feature helps you maintain optimal performance while minimizing costs by automatically adjusting capacity based on predicted demand.</p>
                  <p>Security enhancements include improved encryption options and integration with AWS Key Management Service for better key rotation.</p>
                  <p>The new features are available in all AWS regions starting today. You can start using them immediately through the AWS Management Console.</p>
                </div>
              </article>
            </main>
            <footer>AWS Footer</footer>
          </body>
        </html>
      `;

      mockFetch(mockHtml);

      return enricher.enrich('https://aws.amazon.com/blogs/compute/test-article').then(result => {
        expect(result).not.toBeNull();
        expect(result!.content).not.toBeNull();
        expect(result!.content!.length).toBeGreaterThan(500);
        expect(result!.content).toContain('AWS blog post');
        expect(result!.content).toContain('Amazon EC2');
        expect(result!.content).not.toContain('Navigation');
        expect(result!.content).not.toContain('AWS Footer');
        expect(result!.thumbnail).toBe('https://aws.amazon.com/image.jpg');
      });
    });

    it('What\'s Newの記事から正しくコンテンツを抽出できること', () => {
      const mockHtml = `
        <html>
          <body>
            <div class="whatsnew-content">
              <p>AWS announces a new feature for Amazon RDS that enables automated database backups with point-in-time recovery.</p>
              <p>This feature provides continuous backups of your database, allowing you to restore to any point within your retention period.</p>
              <p>The automated backups are stored in Amazon S3 and are encrypted using AWS Key Management Service (KMS) keys.</p>
              <p>You can configure the backup retention period from 1 to 35 days, depending on your compliance and recovery requirements.</p>
              <p>The feature supports all RDS database engines including MySQL, PostgreSQL, MariaDB, Oracle, and SQL Server.</p>
              <p>Point-in-time recovery allows you to restore your database to any second during your retention period, up to the last 5 minutes.</p>
              <p>This capability is essential for disaster recovery and helps meet regulatory compliance requirements for data retention.</p>
              <p>The feature is now available in all commercial AWS regions at no additional charge for backup storage up to the size of your database.</p>
            </div>
          </body>
        </html>
      `;

      mockFetch(mockHtml);

      return enricher.enrich('https://aws.amazon.com/about-aws/whats-new/test').then(result => {
        expect(result).not.toBeNull();
        expect(result!.content).not.toBeNull();
        expect(result!.content!.length).toBeGreaterThan(500);
        expect(result!.content).toContain('Amazon RDS');
        expect(result!.content).toContain('automated database backups');
      });
    });

    it('複数のセレクタを試して段落を収集できること', () => {
      const mockHtml = `
        <html>
          <body>
            <div class="some-other-container">
              <p>Amazon Web Services introduces new capabilities for serverless computing with AWS Lambda.</p>
              <p>The new features include improved cold start performance and support for container images up to 10 GB.</p>
              <p>Lambda now supports provisioned concurrency, which keeps functions initialized and ready to respond immediately.</p>
              <p>This eliminates cold start latency for critical applications that require consistent performance.</p>
              <p>The container image support allows developers to package and deploy Lambda functions as container images.</p>
              <p>This makes it easier to use existing container tooling and workflows with serverless applications.</p>
              <p>Additionally, Lambda now integrates with Amazon EFS, enabling functions to access shared file systems.</p>
              <p>These enhancements make Lambda more suitable for a wider range of workloads including ML inference and data processing.</p>
              <p>The new features are available in all regions where Lambda is supported, with pricing based on usage.</p>
              <p>To get started, visit the Lambda console or use the AWS CLI to create functions with these new capabilities.</p>
            </div>
          </body>
        </html>
      `;

      mockFetch(mockHtml);

      return enricher.enrich('https://aws.amazon.com/blogs/test-fallback').then(result => {
        expect(result).not.toBeNull();
        expect(result!.content).not.toBeNull();
        expect(result!.content!.length).toBeGreaterThan(500);
        expect(result!.content).toContain('AWS Lambda');
        expect(result!.content).toContain('serverless computing');
      });
    });

    it('コンテンツが不足している場合はnullを返すこと', () => {
      const shortHtml = `
        <html>
          <body>
            <div class="blog-post-content">
              <p>Short content.</p>
            </div>
          </body>
        </html>
      `;

      mockFetch(shortHtml);

      return enricher.enrich('https://aws.amazon.com/blogs/short-article').then(result => {
        expect(result).toBeNull();
      });
    });

    it('HTTPエラー時はnullを返すこと', () => {
      mockFetch('', 404);

      return enricher.enrich('https://aws.amazon.com/blogs/not-found').then(result => {
        expect(result).toBeNull();
      });
    });

    it('フェッチエラー時はnullを返すこと', () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      return enricher.enrich('https://aws.amazon.com/blogs/error-article').then(result => {
        expect(result).toBeNull();
      });
    });

    it('画像URLを正しく正規化できること', () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:image" content="/static/images/blog-image.jpg" />
          </head>
          <body>
            <div class="blog-post-content">
              <p>Amazon Web Services (AWS) is the world's most comprehensive and broadly adopted cloud platform.</p>
              <p>AWS offers over 200 fully featured services from data centers globally, serving millions of customers.</p>
              <p>From startups to large enterprises and government agencies, organizations trust AWS to power their infrastructure.</p>
              <p>The platform provides computing power, database storage, content delivery, and other functionality.</p>
              <p>AWS helps businesses scale and grow by providing on-demand access to computing resources and services.</p>
              <p>With pay-as-you-go pricing, organizations can avoid upfront capital expenses and scale as needed.</p>
              <p>The global infrastructure includes multiple regions and availability zones for high availability.</p>
              <p>AWS continues to innovate with new services and features being added regularly to meet customer needs.</p>
            </div>
          </body>
        </html>
      `;

      mockFetch(mockHtml);

      return enricher.enrich('https://aws.amazon.com/blogs/test-image').then(result => {
        expect(result).not.toBeNull();
        expect(result!.thumbnail).toBe('https://aws.amazon.com/static/images/blog-image.jpg');
      });
    });

    it('タイムアウト時はnullを返すこと', () => {
      // AbortErrorをシミュレート
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      return enricher.enrich('https://aws.amazon.com/blogs/timeout-test').then(result => {
        expect(result).toBeNull();
      });
    });

    it('fetchがタイムアウト設定を含むことを確認', async () => {
      const mockHtml = `
        <html>
          <body>
            <div class="blog-post-content">
              <p>${'A'.repeat(600)}</p>
            </div>
          </body>
        </html>
      `;

      // fetchのモックを作成してsignalパラメータを検証
      global.fetch = jest.fn().mockImplementation((url, options) => {
        // AbortSignalが渡されていることを確認
        expect(options.signal).toBeDefined();
        expect(options.signal).toBeInstanceOf(AbortSignal);
        
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockHtml),
        });
      });

      await enricher.enrich('https://aws.amazon.com/blogs/signal-test');
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://aws.amazon.com/blogs/signal-test',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('getRateLimit', () => {
    it('レート制限が1500ミリ秒であること', () => {
      const rateLimit = (enricher as any).getRateLimit();
      expect(rateLimit).toBe(1500);
    });
  });

  describe('getMinContentLength', () => {
    it('最小コンテンツ長が500文字であること', () => {
      const minLength = (enricher as any).getMinContentLength();
      expect(minLength).toBe(500);
    });
  });
});