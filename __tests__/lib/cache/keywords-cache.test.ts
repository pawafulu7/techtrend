/**
 * 急上昇の集計のキャッシュの無効化（lib/cache/keywords-cache.ts）。
 * 記事の非表示・ソースの切り替え・技術以外の判定の後に呼ぶので、Redis の失敗で呼び出し元を
 * 失敗にしない（ソースを登録するスクリプトが、DB の登録の後に失敗で終わらないように）。
 */
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import {
  KeywordsCache,
  TRENDING_SERIES_CACHE_KEY,
} from '@/lib/cache/keywords-cache';

describe('KeywordsCache.invalidateTrending', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('急上昇の集計のキーだけを消す（集計中のロックは残す）', async () => {
    const cache = new KeywordsCache();
    const del = jest.spyOn(cache, 'delete').mockResolvedValue(true);

    await cache.invalidateTrending();

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(TRENDING_SERIES_CACHE_KEY);
  });

  it('キーは名前空間つき（e2e が消すキーと同じ。generateKey の上書きで名前空間が落ちないこと）', () => {
    const cache = new KeywordsCache() as unknown as {
      generateKey(key: string): string;
    };
    expect(cache.generateKey(TRENDING_SERIES_CACHE_KEY)).toBe(
      '@techtrend/cache:keywords:trending-series:v1'
    );
  });

  it('Redis の失敗でも例外を投げない', async () => {
    const cache = new KeywordsCache();
    jest
      .spyOn(cache, 'delete')
      .mockRejectedValue(new Error('Command timed out'));

    await expect(cache.invalidateTrending()).resolves.toBeUndefined();
  });
});
