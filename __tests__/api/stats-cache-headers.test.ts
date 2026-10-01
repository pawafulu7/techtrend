/**
 * /api/stats のキャッシュヘッダ（issue #647）
 *
 * 本番で、ゲートを通過した /api/stats が CDN-Cache-Control: max-age=600 のまま
 * Vercel のエッジにキャッシュされていた（proxy の no-store より route の値が残る）。
 * ゲートが有効なときは route 自身が private, no-store を返すことを確かめる。
 */
const mockStatsCacheGet = jest.fn();

jest.mock('@/lib/cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: (...args: unknown[]) => mockStatsCacheGet(...args),
    set: jest.fn(),
  })),
}));

jest.mock('@/lib/middleware/with-rate-limit', () => ({
  withRateLimit: jest.fn((_key: string, handler: unknown) => handler),
}));

import { resetEnvCache } from '@/lib/config/env';
import { GET } from '@/app/api/stats/route';

const CACHED_STATS = {
  overview: { total: 10, last7Days: 3, last30Days: 8, averagePerDay: 0.3 },
  sources: [],
  daily: [],
  tags: [],
};

function setGate(value: string | undefined) {
  if (value === undefined) {
    delete process.env.BASIC_AUTH_ENABLED;
  } else {
    process.env.BASIC_AUTH_ENABLED = value;
  }
  resetEnvCache();
}

describe('/api/stats cache headers (issue #647)', () => {
  const original = process.env.BASIC_AUTH_ENABLED;

  beforeEach(() => {
    mockStatsCacheGet.mockReset();
    mockStatsCacheGet.mockResolvedValue(CACHED_STATS);
  });

  afterEach(() => {
    setGate(original);
  });

  it('returns public, shared-cacheable headers when the gate is off', async () => {
    setGate(undefined);

    const response = await (GET as () => Promise<Response>)();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    );
    expect(response.headers.get('CDN-Cache-Control')).toBe('max-age=600');
  });

  it('returns private, no-store when the gate is on', async () => {
    setGate('true');

    const response = await (GET as () => Promise<Response>)();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
  });
});
