/**
 * lib/api/cache-headers.ts のテスト（issue #647）
 *
 * Basic 認証ゲートが有効なときは公開キャッシュヘッダの代わりに private, no-store を返す。
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

function setGate(value: string | undefined) {
  if (value === undefined) {
    delete process.env.BASIC_AUTH_ENABLED;
  } else {
    process.env.BASIC_AUTH_ENABLED = value;
  }
  resetEnvCache();
}

describe('publicCacheHeaders', () => {
  const original = process.env.BASIC_AUTH_ENABLED;

  afterEach(() => {
    setGate(original);
  });

  // env.ts は空白のみを undefined にするので、'' や '  ' は未設定と同じ扱いになる
  it.each([[undefined], ['false'], [' FALSE '], ['']])(
    'returns the given public headers when the gate is off (BASIC_AUTH_ENABLED=%p)',
    (value) => {
      setGate(value);

      expect(publicCacheHeaders(OPTIONS)).toEqual({
        'Cache-Control': OPTIONS.cacheControl,
        'CDN-Cache-Control': OPTIONS.cdnCacheControl,
      });
    }
  );

  it('omits CDN-Cache-Control when it is not given and the gate is off', () => {
    setGate(undefined);

    expect(publicCacheHeaders({ cacheControl: 'public, max-age=300' })).toEqual({
      'Cache-Control': 'public, max-age=300',
    });
  });

  // 不正な値はゲートが misconfigured（503）として扱う。ここでは公開キャッシュを許さない
  it.each([['true'], [' TRUE '], ['yes'], ['1']])(
    'returns private, no-store when the gate may be on (BASIC_AUTH_ENABLED=%p)',
    (value) => {
      setGate(value);

      expect(publicCacheHeaders(OPTIONS)).toEqual({
        'Cache-Control': GATED_CACHE_CONTROL,
        'CDN-Cache-Control': GATED_CDN_CACHE_CONTROL,
      });
      expect(
        publicCacheHeaders({ cacheControl: 'public, max-age=300' })
      ).toEqual({
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
      });
    }
  );
});

describe('applyPublicCacheHeaders', () => {
  const original = process.env.BASIC_AUTH_ENABLED;

  afterEach(() => {
    setGate(original);
  });

  it('overwrites existing cache headers on the Headers object', () => {
    setGate('true');
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
    setGate(undefined);
    const headers = new Headers();

    applyPublicCacheHeaders(headers, OPTIONS);

    expect(headers.get('Cache-Control')).toBe(OPTIONS.cacheControl);
    expect(headers.get('CDN-Cache-Control')).toBe(OPTIONS.cdnCacheControl);
  });
});
