/**
 * app/api の Route Handler が公開キャッシュヘッダを直書きしていないことを確かめる（issue #647）
 *
 * Route Handler が自分で付けた Cache-Control / CDN-Cache-Control は、proxy.ts の
 * finalize の private, no-store に勝って最終応答に残る（2026-10-01 に本番で実測）。
 * 共有キャッシュ可能なヘッダは lib/api/cache-headers.ts 経由で付け、Basic 認証ゲートが
 * 有効なときは private, no-store に切り替える必要がある。
 *
 * 次の書き方を検出する（改行をまたいでもよい）。
 * - Cache-Control の値に public / s-maxage を含む文字列を直接渡す
 *   例: headers.set('Cache-Control', 'public, s-maxage=300') / { 'Cache-Control': 'public, max-age=60' }
 * - CDN-Cache-Control / Vercel-CDN-Cache-Control を route が直接設定する（値によらない）
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const API_DIR = path.join(ROOT, 'app/api');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const PUBLIC_CACHE_CONTROL =
  /['"`]Cache-Control['"`]\s*[,:]\s*['"`][^'"`]*\b(public|s-maxage)\b/gi;
const DIRECT_CDN_CACHE_CONTROL =
  /['"`](Vercel-)?CDN-Cache-Control['"`]\s*[,:]/gi;

function findViolations(source: string): number[] {
  const lines: number[] = [];
  for (const pattern of [PUBLIC_CACHE_CONTROL, DIRECT_CDN_CACHE_CONTROL]) {
    for (const match of source.matchAll(pattern)) {
      lines.push(source.slice(0, match.index).split('\n').length);
    }
  }
  return lines.sort((a, b) => a - b);
}

describe('public cache headers in app/api (issue #647)', () => {
  it('are only set through lib/api/cache-headers.ts', () => {
    const files = listSourceFiles(API_DIR);
    expect(files.length).toBeGreaterThan(50);

    const violations = files.flatMap((file) =>
      findViolations(readFileSync(file, 'utf-8')).map(
        (line) => `${path.relative(ROOT, file)}:${line}`
      )
    );
    expect(violations).toEqual([]);
  });

  // 検出器自体が機能していることを、わざと違反させた検体で確かめる
  it.each([
    ["response.headers.set('Cache-Control', 'public, s-maxage=300');"],
    [
      "response.headers.set(\n  'Cache-Control',\n  'public, s-maxage=300, stale-while-revalidate=600'\n);",
    ],
    [
      "return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=60' } });",
    ],
    ["response.headers.set('CDN-Cache-Control', 'max-age=600');"],
    ["headers: { 'Vercel-CDN-Cache-Control': 'max-age=600' },"],
  ])('detects a direct shared-cache header: %s', (source) => {
    expect(findViolations(source)).toHaveLength(1);
  });

  it.each([
    [
      "applyPublicCacheHeaders(response.headers, { cacheControl: 'public, max-age=300' });",
    ],
    [
      "...publicCacheHeaders({\n  cacheControl: isFallback\n    ? 'public, max-age=60'\n    : 'public, max-age=300',\n}),",
    ],
    [
      "response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');",
    ],
    ["export const GET = withRateLimit('public:stats', statsHandler);"],
  ])('does not flag allowed code: %s', (source) => {
    expect(findViolations(source)).toEqual([]);
  });
});
