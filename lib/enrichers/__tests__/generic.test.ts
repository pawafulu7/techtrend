/**
 * GenericContentEnricher tests
 *
 * Issue #633 (SSRF guard) のリグレッション防止:
 * GenericContentEnricher は ContentEnricherFactory の最終フォールバックであり、
 * 未知ドメイン URL（フィード投稿者が持ち込める Hacker News / Lobsters / はてな
 * ブックマーク経由の記事）が最終的に到達する enricher のため、SSRF guard が
 * 最も効いていなければならない箇所である。このファイル作成以前、
 * lib/enrichers/__tests__/ 配下に generic.ts 専用のテストは存在しなかった。
 *
 * dns.promises.lookup は jest.setup.node.js でグローバルにモックされている
 * （デフォルトでは公開IP 203.0.113.10 を返す）。危険なURLを検証するテストのみ
 * mockResolvedValueOnce で私設/内部IPに上書きする。
 */

import dns from 'dns';
import { GenericContentEnricher } from '../generic';
import logger from '@/lib/logger';

const mockLookup = dns.promises.lookup as jest.Mock;

describe('GenericContentEnricher - SSRF guard integration (Issue #633)', () => {
  let enricher: GenericContentEnricher;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    enricher = new GenericContentEnricher();
    originalFetch = global.fetch;
    mockLookup.mockReset();
    mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('危険なURLの拒否', () => {
    it('プライベートIP(10.0.0.0/8)に解決されるURLはnullを返し、fetchを一切呼ばない', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      const result = await enricher.enrich(
        'https://attacker-controlled.example/'
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('クラウドメタデータIP(169.254.169.254)に解決されるURLはnullを返し、fetchを一切呼ばない', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      const result = await enricher.enrich(
        'https://attacker-controlled.example/'
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('ループバック(127.0.0.1)に解決されるURLはリトライせずnullを返す', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      const result = await enricher.enrich(
        'https://attacker-controlled.example/'
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      // maxRetries=2 だが、SSRFガードで即座に失敗するためDNS lookupは1回のみ
      expect(mockLookup).toHaveBeenCalledTimes(1);
    });

    it('file: スキームのURLはDNS解決すら行わずnullを返す', async () => {
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;

      const result = await enricher.enrich('file:///etc/passwd');

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('拒否時はエラーログを残す', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
      global.fetch = jest.fn() as unknown as typeof global.fetch;
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      await enricher.enrich('https://attacker-controlled.example/');

      // ssrf-guard 自身の warn ログ（理由付き）
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'forbidden_ip_range',
          url: 'https://attacker-controlled.example/',
        }),
        '[SsrfGuard] Blocked outbound request'
      );
      // generic.ts 側のエラーログ
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://attacker-controlled.example/',
        }),
        '[GenericEnricher] URL rejected by SSRF guard'
      );

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('正当なURLは通過する（回帰）', () => {
    const buildHtml = (title: string) => `
      <!DOCTYPE html>
      <html>
        <head><title>${title}</title></head>
        <body>
          <article>
            <h1>${title}</h1>
            <p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}</p>
          </article>
        </body>
      </html>
    `;

    it.each([
      'https://zenn.dev/user/articles/sample',
      'https://github.com/example/repo',
      'https://aws.amazon.com/blogs/compute/example-article',
    ])(
      '%s は公開IPに解決される場合、SSRFガードを通過してコンテンツを取得できる',
      async (url) => {
        mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          url,
          text: async () => buildHtml('Representative Domain Article'),
        }) as unknown as typeof global.fetch;

        const result = await enricher.enrich(url);

        expect(result).not.toBeNull();
        expect(result?.content).toContain('Representative Domain Article');
      }
    );
  });
});
