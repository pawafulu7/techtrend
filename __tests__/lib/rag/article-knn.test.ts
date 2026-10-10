/**
 * @jest-environment node
 */

import { buildArticleKnnQuery, runArticleKnn } from '@/lib/rag/article-knn';
import { ITERATIVE_KNN_SETTINGS_SQL } from '@/lib/personalization/filters/stage1-knn';
import { env } from '@/lib/config/env';
import { ENABLED_SOURCE_SQL } from '../../helpers/sql-fragments';

const params = {
  vectorString: '[0.1,0.2,0.3]',
  excludeArticleId: 'article-1',
  model: 'text-embedding-3-small',
  version: 1,
  topK: 20,
  similarityThreshold: 0.5,
};

/** Prisma.Sql の SQL 文（`$1` 形式のプレースホルダ。空白を詰める） */
function sqlText(query: { text: string }): string {
  return query.text.replace(/\s+/g, ' ');
}

/** 設定とクエリを db ではなく tx 側で受ける Prisma のモック */
function createDb(rows: unknown[] = []) {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue(rows),
  };
  const db = {
    $executeRawUnsafe: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { db, tx };
}

describe('article-knn', () => {
  describe('buildArticleKnnQuery', () => {
    it('距離で並べ替えて上位 k 件を読む（類似度の式で並べ替えると HNSW を使えない）', () => {
      const sql = sqlText(buildArticleKnnQuery(params));

      expect(sql).toMatch(/e\.embedding <=> \$\d+::vector AS distance/);
      expect(sql).toMatch(/ORDER BY distance LIMIT \$\d+/);
      expect(sql).not.toMatch(/ORDER BY similarity/);
      expect(sql).toContain(`e."embeddingKey" = 'summary'::"EmbeddingKey"`);
    });

    it('ベクトルは 1 回だけ送る（約 18KB あるため）', () => {
      const query = buildArticleKnnQuery(params);

      expect(
        query.values.filter((value) => value === params.vectorString)
      ).toHaveLength(1);
    });

    it('外側では並べ替えない（計画の固定で Sort が JIT を起こすため。並べ替えは取得後）', () => {
      const sql = sqlText(buildArticleKnnQuery(params));

      expect(sql.slice(sql.indexOf(') nn'))).not.toContain('ORDER BY');
    });

    it('非表示・無効なソース・自分自身・モデルの条件を kNN の中で掛ける', () => {
      const query = buildArticleKnnQuery(params);
      const sql = sqlText(query);
      const inner = sql.slice(
        sql.indexOf('FROM "ArticleEmbedding" e'),
        sql.indexOf(') nn')
      );

      expect(inner).toContain('a."isHidden" = false');
      expect(inner).toContain(`a."sourceId" ${ENABLED_SOURCE_SQL}`);
      expect(inner).toMatch(/a\.id != \$\d+/);
      expect(inner).toMatch(/e\.model = \$\d+/);
      expect(inner).toMatch(/e\.version = \$\d+/);
      expect(query.values).toEqual(
        expect.arrayContaining([
          params.vectorString,
          params.excludeArticleId,
          params.model,
          params.version,
          params.topK,
        ])
      );
    });

    it('閾値は kNN の外で掛ける（中に入れると閾値に届かない記事で読み続ける）', () => {
      const query = buildArticleKnnQuery(params);
      const sql = sqlText(query);
      const outer = sql.slice(sql.indexOf(') nn'));

      expect(outer).toMatch(/WHERE 1 - nn\.distance >= \$\d+/);
      expect(sql.slice(0, sql.indexOf(') nn'))).not.toContain('>=');
      expect(query.values).toContain(params.similarityThreshold);
    });
  });

  describe('runArticleKnn', () => {
    it('Stage 1 と同じ設定と kNN を、同じ tx で設定→kNN の順に実行する', async () => {
      const { db, tx } = createDb();

      await runArticleKnn(db as never, params);

      expect(db.$transaction).toHaveBeenCalledTimes(1);
      // 関係グラフの並列呼び出しで、トランザクションの既定の 2 秒で接続待ちが切れないように
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: Math.max(env.DB_POOL_TIMEOUT * 1000, 2000),
      });
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        ITERATIVE_KNN_SETTINGS_SQL
      );
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(
        tx.$queryRaw.mock.invocationCallOrder[0]
      );
      expect(db.$queryRaw).not.toHaveBeenCalled();
      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('公開日の文字列を Date に戻す', async () => {
      const { db } = createDb([
        {
          articleId: 'article-2',
          title: 'Related',
          summary: null,
          translatedTitle: null,
          publishedAt: '2026-10-01T00:00:00.000Z',
          sourceId: 'source-1',
          qualityScore: 80,
          sourceName: 'Source',
          thumbnail: null,
          embeddingKey: 'summary',
          similarity: 0.8,
          tags: [],
        },
      ]);

      const results = await runArticleKnn(db as never, params);

      expect(results[0].publishedAt).toEqual(
        new Date('2026-10-01T00:00:00.000Z')
      );
    });

    it('類似度の高い順に並べ替える（relaxed_order では距離の順が前後し得る）', async () => {
      const row = (articleId: string, similarity: number) => ({
        articleId,
        title: articleId,
        summary: null,
        translatedTitle: null,
        publishedAt: '2026-10-01T00:00:00.000Z',
        sourceId: 'source-1',
        qualityScore: 80,
        sourceName: 'Source',
        thumbnail: null,
        embeddingKey: 'summary',
        similarity,
        tags: [],
      });
      const { db } = createDb([row('b', 0.7), row('a', 0.9), row('c', 0.6)]);

      const results = await runArticleKnn(db as never, params);

      expect(results.map((r) => r.articleId)).toEqual(['a', 'b', 'c']);
    });

    it('設定が失敗したら kNN を実行せずに投げる', async () => {
      const { db, tx } = createDb();
      tx.$executeRawUnsafe.mockRejectedValueOnce(
        new Error('set_config failed')
      );

      await expect(runArticleKnn(db as never, params)).rejects.toThrow(
        'set_config failed'
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
