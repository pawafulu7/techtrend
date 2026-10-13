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
