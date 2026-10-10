/**
 * articleDetailCache の関連記事
 *
 * - getRelatedArticles（タグでの関連記事。埋め込みの関連記事が無いときの代替）
 *   issue #688: 無効化したソースの記事を関連記事に出さない。条件そのものの正しさは
 *   __tests__/lib/database/enabled-source-filter.db.test.ts がテスト DB で確かめる。
 *   ここでは、このクエリが条件を使っていることを確かめる。
 * - getEmbeddingRelatedArticles（埋め込みでの関連記事の Redis キャッシュ）
 */
// article-detail-cache は './redis-cache' を相対パスで読むので、同じ実ファイルを相対パスで差し替える
jest.mock('../../../lib/cache/redis-cache', () => ({
  RedisCache: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { articleDetailCache } from '@/lib/cache/article-detail-cache';
import { ENABLED_SOURCE_SQL, sqlFragmentsOf } from '../../helpers/sql-fragments';

// lib/prisma は jest.setup.node.js がモックした PrismaClient（= prismaMock）を返す
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prismaMock } = require('../../../test/utils/prisma-mock');

describe('articleDetailCache.getRelatedArticles', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it('無効化したソースの記事を除く（issue #688）', async () => {
    await articleDetailCache.getRelatedArticles('article-1', ['tag-1']);

    // DB に問い合わせたことを確かめる（届かないと条件の検査が素通りする）
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(
      sqlFragmentsOf(prismaMock.$queryRaw.mock.calls[0], { afterAnd: true })
    ).toContainEqual(
      expect.stringContaining(`a."sourceId" ${ENABLED_SOURCE_SQL}`)
    );
  });
});

describe('articleDetailCache.getEmbeddingRelatedArticles', () => {
  // articleDetailCache を import したときに作られた RedisCache のモック
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { RedisCache } = require('../../../lib/cache/redis-cache');
  const redis = RedisCache.mock.results[0].value as {
    get: jest.Mock;
    set: jest.Mock;
  };

  const result = {
    articleId: 'article-2',
    title: 'Related',
    summary: null,
    translatedTitle: null,
    similarity: 0.8,
    publishedAt: new Date('2026-10-01T00:00:00.000Z'),
    sourceId: 'source-1',
    embeddingKey: 'summary',
  };

  beforeEach(() => {
    redis.get.mockReset();
    redis.get.mockResolvedValue(null);
    redis.set.mockReset();
    redis.set.mockResolvedValue(undefined);
  });

  it('キャッシュにあれば検索せず、JSON で文字列になった公開日を Date に戻す', async () => {
    redis.get.mockResolvedValueOnce([
      { ...result, publishedAt: '2026-10-01T00:00:00.000Z' },
    ]);
    const fetcher = jest.fn();

    const results = await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(results).toEqual([result]);
    expect(results[0].publishedAt).toBeInstanceOf(Date);
  });

  it('無ければ検索して保存する。キーは記事ごとの無効化（related:<記事ID>:*）に乗る', async () => {
    const fetcher = jest.fn().mockResolvedValue([result]);

    const results = await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([result]);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^related:article-1:/),
      [result]
    );
    expect(redis.get.mock.calls[0][0]).toBe(redis.set.mock.calls[0][0]);
  });

  it('件数ごとに別のキーにする', async () => {
    const fetcher = jest.fn().mockResolvedValue([result]);

    await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      5,
      fetcher
    );
    await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(redis.set.mock.calls[0][0]).not.toBe(redis.set.mock.calls[1][0]);
  });

  it('0 件は保存しない（埋め込みの生成待ちの記事が、生成後も空のままにならないように）', async () => {
    const fetcher = jest.fn().mockResolvedValue([]);

    const results = await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(results).toEqual([]);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('形の合わない値（壊れた値・形を変える前の値）は使わずに検索する', async () => {
    redis.get.mockResolvedValueOnce([{ foo: 1 }, null]);
    const fetcher = jest.fn().mockResolvedValue([result]);

    const results = await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([result]);
  });

  it('キャッシュにある空の配列は使わずに検索する', async () => {
    redis.get.mockResolvedValueOnce([]);
    const fetcher = jest.fn().mockResolvedValue([result]);

    const results = await articleDetailCache.getEmbeddingRelatedArticles(
      'article-1',
      20,
      fetcher
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toEqual([result]);
  });
});
