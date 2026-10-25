// 解決した先が同じサイトかを判定するための、実在しないオリジン
const INTERNAL_ORIGIN = 'http://internal.invalid';

/**
 * 戻り先などに使う URL を、同じサイトの中のパスに解決する。外部に解決されるものは null。
 *
 * 文字列の前方一致（`startsWith('/') && !startsWith('//')`）では判定しない。
 * ブラウザは `\` を `/` と読み、タブや改行を取り除くので、`/\evil.example` は
 * https://evil.example/ になる。URL パーサで解決し、返すのも解決後のパスにする。
 * 解決後のパスが `//` で始まるもの（`/.//evil.example` など、ドットセグメントを除くと
 * `//evil.example` になる）も、ブラウザが外部のサイトとして読むので null にする。
 */
export function toInternalPath(raw: string): string | null {
  try {
    const resolved = new URL(raw, INTERNAL_ORIGIN);
    if (resolved.origin !== INTERNAL_ORIGIN) return null;
    if (resolved.pathname.startsWith('//')) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}
