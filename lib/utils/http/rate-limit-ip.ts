import { isIPv6 } from 'node:net';

/**
 * IP 単位のレート制限で、数える単位にする IP を返す
 *
 * IPv6 は /64 に丸める。1 回線に /64 が割り当てられるのが普通で、アドレスごとに数えると
 * 送り手は /64 の中でアドレスを変えるだけで制限を外せるため。IPv4 を埋め込んだ IPv6
 * （::ffff:192.0.2.1）は IPv4 として数える。IP として読めない値（'unknown' など）はそのまま返す
 */
export function toRateLimitIP(ip: string): string {
  // ゾーン ID（fe80::1%eth0）は URL として読めないので外す
  const address = ip.split('%')[0] ?? ip;
  if (!isIPv6(address)) return ip;

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
