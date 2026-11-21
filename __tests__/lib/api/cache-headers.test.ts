/**
 * lib/api/cache-headers.ts のテスト（issue #647）
 *
 * サイトの入口が有効になりうるときは、公開キャッシュヘッダの代わりに private, no-store を返す。
 */
import { resetEnvCache } from '@/lib/config/env';
import {
  applyPublicCacheHeaders,
  publicCacheHeaders,
  GATED_CACHE_CONTROL,
  GATED_CDN_CACHE_CONTROL,
} from '@/lib/api/cache-headers';

const OPTIONS = {
  cacheControl: 'public, s-maxage=300, stale-while-revalidate=600',
  cdnCacheControl: 'max-age=600',
};

const GATE_ENV_NAMES = ['GATE_GOOGLE_ENABLED', 'BASIC_AUTH_ENABLED', 'VERCEL_ENV'] as const;
type GateEnvName = (typeof GATE_ENV_NAMES)[number];
const original = Object.fromEntries(
  GATE_ENV_NAMES.map((name) => [name, process.env[name]])
) as Record<GateEnvName, string | undefined>;

function setEnv(values: Partial<Record<GateEnvName, string>>) {
  for (const name of GATE_ENV_NAMES) {
    const value = name in values ? values[name] : original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetEnvCache();
}

function clearGateEnv(values: Partial<Record<GateEnvName, string>> = {}) {
  setEnv({
    GATE_GOOGLE_ENABLED: undefined,
    BASIC_AUTH_ENABLED: undefined,
    VERCEL_ENV: undefined,
    ...values,
  } as Partial<Record<GateEnvName, string>>);
}

afterEach(() => {
  setEnv({});
});

describe('publicCacheHeaders', () => {
  // env.ts は空白のみを undefined にするので、'' や '  ' は未設定と同じ扱いになる
  it.each([[undefined], ['false'], [' FALSE '], ['']])(
    'returns the given public headers when the gate is off (GATE_GOOGLE_ENABLED=%p)',
    (value) => {
      clearGateEnv({ GATE_GOOGLE_ENABLED: value } as Partial<Record<GateEnvName, string>>);

      expect(publicCacheHeaders(OPTIONS)).toEqual({
        'Cache-Control': OPTIONS.cacheControl,
        'CDN-Cache-Control': OPTIONS.cdnCacheControl,
      });
    }
  );

  it('omits CDN-Cache-Control when it is not given and the gate is off', () => {
    clearGateEnv();

    expect(publicCacheHeaders({ cacheControl: 'public, max-age=300' })).toEqual({
      'Cache-Control': 'public, max-age=300',
    });
  });

  // 不正な値は入口が misconfigured（503）として扱う。ここでは公開キャッシュを許さない
  it.each([
    ['GATE_GOOGLE_ENABLED=true', { GATE_GOOGLE_ENABLED: 'true' }],
    ['GATE_GOOGLE_ENABLED= TRUE ', { GATE_GOOGLE_ENABLED: ' TRUE ' }],
    ['GATE_GOOGLE_ENABLED=yes', { GATE_GOOGLE_ENABLED: 'yes' }],
    // Vercel の Production では未設定も有効とみなす
    ['VERCEL_ENV=production', { VERCEL_ENV: 'production' }],
    // Basic 認証の設定の残り（入口は 503 にする）
    ['BASIC_AUTH_ENABLED=true', { BASIC_AUTH_ENABLED: 'true' }],
    ['BASIC_AUTH_ENABLED=1', { BASIC_AUTH_ENABLED: '1' }],
  ] as const)('returns private, no-store when the gate may be on (%s)', (_label, values) => {
    clearGateEnv(values);

    expect(publicCacheHeaders(OPTIONS)).toEqual({
      'Cache-Control': GATED_CACHE_CONTROL,
      'CDN-Cache-Control': GATED_CDN_CACHE_CONTROL,
    });
    expect(publicCacheHeaders({ cacheControl: 'public, max-age=300' })).toEqual({
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
    });
  });

  it('allows public headers in Vercel production only when the gate is explicitly false', () => {
    clearGateEnv({ VERCEL_ENV: 'production', GATE_GOOGLE_ENABLED: 'false' });

    expect(publicCacheHeaders(OPTIONS)['Cache-Control']).toBe(OPTIONS.cacheControl);
  });
});

describe('applyPublicCacheHeaders', () => {
  it('overwrites existing cache headers on the Headers object', () => {
    clearGateEnv({ GATE_GOOGLE_ENABLED: 'true' });
    const headers = new Headers({
      'Cache-Control': 'public, max-age=999',
      'CDN-Cache-Control': 'max-age=999',
      'X-Other': 'kept',
    });

    applyPublicCacheHeaders(headers, OPTIONS);

    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(headers.get('X-Other')).toBe('kept');
  });

  it('sets the given public headers when the gate is off', () => {
    clearGateEnv();
    const headers = new Headers();

    applyPublicCacheHeaders(headers, OPTIONS);

    expect(headers.get('Cache-Control')).toBe(OPTIONS.cacheControl);
    expect(headers.get('CDN-Cache-Control')).toBe(OPTIONS.cdnCacheControl);
  });
});
