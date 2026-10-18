/**
 * SSRF Guard
 *
 * lib/utils/url/url-validator.ts の関数群は URL 文字列を静的にパースするだけで、
 * DNS 解決を一切行わない。そのため攻撃者が保有するドメインの A/AAAA レコードを
 * 内部 IP（例: 10.0.0.5, 169.254.169.254 のクラウドメタデータ等）に向けるだけで
 * 容易に迂回できてしまい、SSRF 対策としては機能しない。
 *
 * このモジュールは実際に DNS 解決を行い、解決された「全ての」IP アドレスを
 * ループバック/プライベート/リンクローカル等のレンジと突き合わせて拒否する。
 * IPv4-mapped IPv6（例: ::ffff:10.0.0.5）も Node.js 標準の `net.BlockList` が
 * 内部で自動的にアンラップして判定するため、追加のパース処理は不要。
 *
 * 想定利用箇所（Issue #633）:
 * - lib/utils/url/safe-redirect.ts の fetchWithValidatedRedirects（lib/enrichers の記事ページの
 *   取得はすべてこれを通る。転送の各段でこの関数を呼ぶ）
 *
 * フィード投稿者が任意ドメインの URL を持ち込める経路（Hacker News / Lobsters /
 * はてなブックマーク由来の記事で、既知ドメイン allowlist を持つ専用 enricher に
 * 一致しなかったもの）から、内部ネットワークやクラウドメタデータサービスへの
 * リクエストを防ぐことが目的。
 *
 * スコープ外:
 * - undici custom dispatcher による TOCTOU / DNS rebinding 対策（自分で DNS を持つ攻撃者が、
 *   検証のときと接続のときに違う答えを返すと迂回できる。GitHub のホスト型ランナーで届く
 *   価値の高い宛先が見当たらないため入れていない。実行環境を self-hosted のランナーや
 *   AWS（IMDSv1）に移すとき、enrichment を API から呼ぶときは先に入れる）
 *
 * @module ssrf-guard
 */

import dns from 'dns';
import { BlockList } from 'net';
import logger from '@/lib/logger';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export type SsrfRejectionReason =
  | 'invalid_url'
  | 'disallowed_protocol'
  | 'dns_resolution_failed'
  | 'dns_no_addresses'
  | 'forbidden_ip_range';

/** SSRF ガードによる拒否を表す例外 */
export class SsrfGuardError extends Error {
  readonly reason: SsrfRejectionReason;

  constructor(message: string, reason: SsrfRejectionReason) {
    super(message);
    this.name = 'SsrfGuardError';
    this.reason = reason;
  }
}

// 拒否対象の IP レンジ（IPv4 / IPv6）。モジュールロード時に一度だけ構築する。
const forbiddenRanges = new BlockList();

// ループバック
forbiddenRanges.addSubnet('127.0.0.0', 8, 'ipv4');
forbiddenRanges.addSubnet('::1', 128, 'ipv6');

// プライベート
forbiddenRanges.addSubnet('10.0.0.0', 8, 'ipv4');
forbiddenRanges.addSubnet('172.16.0.0', 12, 'ipv4');
forbiddenRanges.addSubnet('192.168.0.0', 16, 'ipv4');
forbiddenRanges.addSubnet('fc00::', 7, 'ipv6'); // IPv6 ULA

// リンクローカル（169.254.169.254 のクラウドメタデータサービスを含む）
forbiddenRanges.addSubnet('169.254.0.0', 16, 'ipv4');
forbiddenRanges.addSubnet('fe80::', 10, 'ipv6');

// 「このネットワーク」（0.0.0.0 を含む）・未指定
forbiddenRanges.addSubnet('0.0.0.0', 8, 'ipv4');
forbiddenRanges.addAddress('::', 'ipv6');

// キャリアグレード NAT の共有アドレス（クラウドの内部サービスが置かれることがある）
forbiddenRanges.addSubnet('100.64.0.0', 10, 'ipv4');

// Azure の WireServer（GitHub のホスト型ランナーは Azure の VM）
forbiddenRanges.addAddress('168.63.129.16', 'ipv4');

// ベンチマーク用・マルチキャスト・予約（255.255.255.255 のブロードキャストを含む）
forbiddenRanges.addSubnet('198.18.0.0', 15, 'ipv4');
forbiddenRanges.addSubnet('224.0.0.0', 4, 'ipv4');
forbiddenRanges.addSubnet('240.0.0.0', 4, 'ipv4');

// IPv4 を埋め込む IPv6: IPv4 互換（::a.b.c.d）・6to4・Teredo
forbiddenRanges.addSubnet('::', 96, 'ipv6');
forbiddenRanges.addSubnet('2002::', 16, 'ipv6');
forbiddenRanges.addSubnet('2001::', 32, 'ipv6');

// NAT64（64:ff9b::/96）は丸ごとは拒否しない。IPv6 だけのネットワークでは、すべての IPv4 の
// サイトがこの範囲に解決されるため。下位32ビットの IPv4 を取り出して IPv4 の範囲で調べる
const nat64Prefix = new BlockList();
nat64Prefix.addSubnet('64:ff9b::', 96, 'ipv6');

/**
 * DNS 解決を含む、出力先 URL の SSRF 安全性検証。
 *
 * 1. http:/https: 以外のスキームを拒否
 * 2. ホスト名を `dns.promises.lookup(hostname, { all: true })` で解決し、
 *    全ての解決先 IP をプライベート/ループバック/リンクローカル等のレンジと照合
 * 3. DNS 解決に失敗した場合は fail-closed（拒否）
 *
 * 検証に成功した場合は何も返さない（void）。失敗した場合は必ず {@link SsrfGuardError}
 * を throw する。呼び出し側は既存のエラーハンドリング（リトライループ・!response.ok
 * 判定）と整合する形で catch すること（詳細は base.ts / generic.ts の適用箇所を参照）。
 *
 * @param urlString 検証対象の URL
 * @param context ログに含める追加コンテキスト（呼び出し元の enricher 名等）
 * @throws {SsrfGuardError} 検証に失敗した場合
 */
export async function assertPublicHttpUrl(
  urlString: string,
  context?: Record<string, unknown>
): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    logRejection(urlString, 'invalid_url', context);
    throw new SsrfGuardError(`Invalid URL: ${urlString}`, 'invalid_url');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    logRejection(urlString, 'disallowed_protocol', {
      protocol: url.protocol,
      ...context,
    });
    throw new SsrfGuardError(
      `Disallowed protocol "${url.protocol}" for ${urlString}`,
      'disallowed_protocol'
    );
  }

  // IPv6 リテラルは URL.hostname が "[::1]" のように brackets を含むため
  // dns.lookup に渡す前に除去する（brackets 付きのままだと ENOTFOUND になる）
  const hostname = stripBrackets(url.hostname);

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (error) {
    logRejection(urlString, 'dns_resolution_failed', {
      hostname,
      errorMessage: error instanceof Error ? error.message : String(error),
      ...context,
    });
    throw new SsrfGuardError(
      `DNS resolution failed for host "${hostname}"`,
      'dns_resolution_failed'
    );
  }

  if (addresses.length === 0) {
    logRejection(urlString, 'dns_no_addresses', { hostname, ...context });
    throw new SsrfGuardError(
      `DNS resolution returned no addresses for host "${hostname}"`,
      'dns_no_addresses'
    );
  }

  for (const { address, family } of addresses) {
    const type = family === 6 ? 'ipv6' : 'ipv4';
    const embeddedIpv4 = type === 'ipv6' ? nat64EmbeddedIpv4(address) : null;
    if (
      forbiddenRanges.check(address, type) ||
      (embeddedIpv4 !== null && forbiddenRanges.check(embeddedIpv4, 'ipv4'))
    ) {
      logRejection(urlString, 'forbidden_ip_range', {
        hostname,
        address,
        ...context,
      });
      throw new SsrfGuardError(
        `Resolved address "${address}" for host "${hostname}" is in a forbidden IP range`,
        'forbidden_ip_range'
      );
    }
  }
}

/** NAT64（64:ff9b::/96）のアドレスなら、下位32ビットの IPv4 を返す。それ以外は null */
function nat64EmbeddedIpv4(address: string): string | null {
  if (!nat64Prefix.check(address, 'ipv6')) return null;
  const groups = expandIpv6(address);
  if (!groups) return null;
  const [high, low] = [groups[6], groups[7]];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/** IPv6 のアドレスを16ビットずつ8つの数に展開する（末尾が a.b.c.d の形も扱う）。不正なら null */
function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase();
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const octets = dotted[2].split('.').map(Number);
    if (octets.some((o) => o > 255)) return null;
    text = `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const [head, tail, ...rest] = text.split('::');
  if (rest.length > 0) return null;
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (tail === undefined ? missing !== 0 : missing < 1) return null;
  const all = [...headGroups, ...Array(tail === undefined ? 0 : missing).fill('0'), ...tailGroups];
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.some(Number.isNaN) ? null : groups;
}

function stripBrackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function logRejection(
  url: string,
  reason: SsrfRejectionReason,
  details?: Record<string, unknown>
): void {
  logger.warn(
    { url, reason, ...details },
    '[SsrfGuard] Blocked outbound request'
  );
}
