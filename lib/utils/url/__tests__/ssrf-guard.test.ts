/**
 * ssrf-guard のユニットテスト
 *
 * dns.promises.lookup は jest.setup.node.js でグローバルにモックされている
 * （デフォルトでは公開IP 203.0.113.10 を返す）。このファイルでは各テストケースごとに
 * mockResolvedValue / mockRejectedValue で戻り値を上書きし、実 DNS には一切依存しない。
 */

import dns from 'dns';
import { assertPublicHttpUrl, SsrfGuardError } from '../ssrf-guard';

const mockLookup = dns.promises.lookup as jest.Mock;

describe('assertPublicHttpUrl', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  describe('許可ケース', () => {
    it('公開IPv4に解決される通常のドメインは許可される', async () => {
      mockLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);

      await expect(
        assertPublicHttpUrl('https://example.com/article')
      ).resolves.toBeUndefined();
      expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
    });

    it('公開IPv6に解決される通常のドメインは許可される', async () => {
      mockLookup.mockResolvedValue([{ address: '2001:db8::1', family: 6 }]);

      await expect(
        assertPublicHttpUrl('https://example.com/article')
      ).resolves.toBeUndefined();
    });

    it('解決された全アドレスが公開範囲であれば許可される（複数レコード）', async () => {
      mockLookup.mockResolvedValue([
        { address: '203.0.113.10', family: 4 },
        { address: '203.0.113.11', family: 4 },
      ]);

      await expect(
        assertPublicHttpUrl('https://example.com/article')
      ).resolves.toBeUndefined();
    });

    it('公開IPにマップされた IPv4-mapped IPv6 は許可される', async () => {
      mockLookup.mockResolvedValue([
        { address: '::ffff:203.0.113.10', family: 6 },
      ]);

      await expect(
        assertPublicHttpUrl('https://example.com/article')
      ).resolves.toBeUndefined();
    });
  });

  describe('拒否ケース - スキーム', () => {
    it.each([
      'file:///etc/passwd',
      'ftp://example.com/file',
      'gopher://example.com/',
      'data:text/plain;base64,aGVsbG8=',
    ])('%s のような非 http/https スキームは拒否される', async (url) => {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow(SsrfGuardError);
      // スキームチェックはDNS解決の前に行われ、無駄なDNS問い合わせをしない
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it('パース不能なURL文字列は拒否される', async () => {
      const error = await assertPublicHttpUrl('not a url').catch((e) => e);
      expect(error).toBeInstanceOf(SsrfGuardError);
      expect((error as SsrfGuardError).reason).toBe('invalid_url');
      expect(mockLookup).not.toHaveBeenCalled();
    });
  });

  describe('拒否ケース - DNS解決失敗 (fail-closed)', () => {
    it('DNS解決がrejectした場合は拒否される', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND nonexistent.example'));

      const error = await assertPublicHttpUrl(
        'https://nonexistent.example/'
      ).catch((e) => e);
      expect(error).toBeInstanceOf(SsrfGuardError);
      expect((error as SsrfGuardError).reason).toBe('dns_resolution_failed');
    });

    it('DNS解決結果が空配列の場合は拒否される', async () => {
      mockLookup.mockResolvedValue([]);

      const error = await assertPublicHttpUrl('https://example.com/').catch(
        (e) => e
      );
      expect(error).toBeInstanceOf(SsrfGuardError);
      expect((error as SsrfGuardError).reason).toBe('dns_no_addresses');
    });
  });

  describe('拒否ケース - 禁止IPレンジ', () => {
    it.each([
      ['ループバック 127.0.0.1', '127.0.0.1', 4],
      ['ループバック ::1', '::1', 6],
      ['プライベート 10.0.0.0/8', '10.1.2.3', 4],
      ['プライベート 172.16.0.0/12', '172.20.1.1', 4],
      ['プライベート 192.168.0.0/16', '192.168.1.1', 4],
      [
        'リンクローカル 169.254.0.0/16 (クラウドメタデータ)',
        '169.254.169.254',
        4,
      ],
      ['リンクローカル fe80::/10', 'fe80::1', 6],
      ['IPv6 ULA fc00::/7', 'fd12:3456:789a::1', 6],
      ['未指定 0.0.0.0', '0.0.0.0', 4],
      ['ブロードキャスト 255.255.255.255', '255.255.255.255', 4],
      ['未指定 ::', '::', 6],
    ])('%s に解決される場合は拒否される', async (_label, address, family) => {
      mockLookup.mockResolvedValue([{ address, family }]);

      const error = await assertPublicHttpUrl('https://evil.example/').catch(
        (e) => e
      );
      expect(error).toBeInstanceOf(SsrfGuardError);
      expect((error as SsrfGuardError).reason).toBe('forbidden_ip_range');
    });

    it('IPv4-mapped IPv6（ドット十進表記: ::ffff:10.0.0.5）は内側のIPv4として拒否される', async () => {
      mockLookup.mockResolvedValue([{ address: '::ffff:10.0.0.5', family: 6 }]);

      await expect(
        assertPublicHttpUrl('https://evil.example/')
      ).rejects.toThrow(SsrfGuardError);
    });

    it('IPv4-mapped IPv6（16進グループ表記: ::ffff:a00:5 = ::ffff:10.0.0.5）も拒否される', async () => {
      mockLookup.mockResolvedValue([{ address: '::ffff:a00:5', family: 6 }]);

      await expect(
        assertPublicHttpUrl('https://evil.example/')
      ).rejects.toThrow(SsrfGuardError);
    });

    it('複数レコードのうち1件でも禁止レンジに該当すれば拒否される', async () => {
      mockLookup.mockResolvedValue([
        { address: '203.0.113.10', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]);

      await expect(
        assertPublicHttpUrl('https://evil.example/')
      ).rejects.toThrow(SsrfGuardError);
    });
  });

  describe('IPリテラルホスト名', () => {
    it('http://10.0.0.5/ のようなIPv4リテラルホストも拒否される', async () => {
      // dns.lookup はIPリテラルに対してもそのまま同じIPを返すため、
      // 通常ドメインと同じ経路で判定できる（実装コメント参照）
      mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

      await expect(assertPublicHttpUrl('http://10.0.0.5/')).rejects.toThrow(
        SsrfGuardError
      );
      expect(mockLookup).toHaveBeenCalledWith('10.0.0.5', { all: true });
    });

    it('http://[::1]/ のようなIPv6リテラルは brackets を除去してDNS解決される', async () => {
      mockLookup.mockResolvedValue([{ address: '::1', family: 6 }]);

      await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(
        SsrfGuardError
      );
      // brackets付きのまま渡すと dns.lookup が ENOTFOUND になるため、
      // 除去されたホスト名で呼ばれていることを検証する
      expect(mockLookup).toHaveBeenCalledWith('::1', { all: true });
    });
  });
});
