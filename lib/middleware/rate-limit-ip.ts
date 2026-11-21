import { isIPv4, isIPv6 } from 'node:net';

/**
 * IP 単位のレート制限で、数える単位にする IP を返す
 *
 * IPv6 は /64 に丸める。アドレスごとに数えると、送り手は同じ /64 の中でアドレスを変えるだけで
 * 制限を外せるため（/56 や /48 を持つ送り手は、/64 の数だけ枠を持てる）。IPv4 を埋め込んだ IPv6
 * （::ffff:192.0.2.1）は IPv4 として数える。IP として読めない値は 'unknown' にまとめ、
 * 値を変えて枠を増やしたり、長いキーを作らせたりしない
 */
export function toRateLimitIP(ip: string): string {
  if (isIPv4(ip)) return ip;

  // ゾーン ID（fe80::1%eth0）は URL として読めないので外す
  const address = ip.split('%')[0] ?? ip;
  if (!isIPv6(address)) return 'unknown';

  // URL の正規化で、大文字・先頭の 0・埋め込みの IPv4 の書き方の違いを揃える
  const canonical = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const groups = expandIPv6(canonical);

  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [high, low] = [groups[6] ?? 0, groups[7] ?? 0];
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }

  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/**
 * リクエストのヘッダーから、IP 単位のレート制限で数える IP を返す
 *
 * NextRequest の `ip` は Next.js 15 で削除された（node_modules/next/dist/docs/01-app/02-guides/
 * upgrading/version-15.md の「NextRequest Geolocation」）ので、x-forwarded-for の先頭を使う。
 * x-forwarded-for は、信頼できるプロキシが上書きする前提で使っている。Vercel は送り手の値を捨てて
 * 接続元の IP で上書きする（https://vercel.com/docs/headers/request-headers の x-forwarded-for）。
 * 上書きするプロキシを置かずに公開すると、ヘッダーを変えるだけで制限を外せる
 *
 * IPv6 は /64 に丸め、IP として読めない値は unknown にまとめて数える（toRateLimitIP）
 */
export function clientIPFromHeaders(headers: Headers): string {
  return toRateLimitIP(
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  );
}

/** 正規化済みの IPv6（'2001:db8::1'）を 8 つの 16 ビットの値に広げる */
function expandIPv6(canonical: string): number[] {
  const toNumbers = (part: string) =>
    part === '' ? [] : part.split(':').map((g) => Number.parseInt(g, 16));

  if (!canonical.includes('::')) return toNumbers(canonical);

  const [head = '', tail = ''] = canonical.split('::');
  const left = toNumbers(head);
  const right = toNumbers(tail);
  return [
    ...left,
    ...Array<number>(8 - left.length - right.length).fill(0),
    ...right,
  ];
}
