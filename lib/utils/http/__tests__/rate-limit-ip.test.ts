import { toRateLimitIP } from '../rate-limit-ip';

describe('toRateLimitIP', () => {
  it('returns IPv4 unchanged', () => {
    expect(toRateLimitIP('203.0.113.7')).toBe('203.0.113.7');
  });

  it.each([
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    // 大文字・先頭の 0 の書き方が違っても同じ /64
    ['2001:0DB8:0001:0002:0000:0000:0000:0001', '2001:db8:1:2::/64'],
    // 省略が /64 の境界をまたぐ
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
  ])('rounds IPv6 %s to its /64', (ip, expected) => {
    expect(toRateLimitIP(ip)).toBe(expected);
  });

  it('separates different /64 prefixes', () => {
    expect(toRateLimitIP('2001:db8:1:2::1')).not.toBe(
      toRateLimitIP('2001:db8:1:3::1')
    );
  });

  it.each(['::ffff:192.0.2.1', '::FFFF:c000:0201', '0:0:0:0:0:ffff:192.0.2.1'])(
    'treats IPv4-mapped IPv6 %s as IPv4',
    (ip) => {
      expect(toRateLimitIP(ip)).toBe('192.0.2.1');
    }
  );

  it.each(['unknown', '', 'not-an-ip', '999.1.1.1'])(
    'returns a value that is not an IP unchanged (%s)',
    (value) => {
      expect(toRateLimitIP(value)).toBe(value);
    }
  );
});
