/**
 * @jest-environment node
 */

import { buildArticleKnnQuery, runArticleKnn } from '@/lib/rag/article-knn';

const params = {
  articleId: 'article-1',
  model: 'text-embedding-3-small',
  version: 1,
  topK: 10,
  similarityThreshold: 0.5,
};

/** Prisma.Sql の SQL 文（`$1` 形式のプレースホルダ。空白を詰める） */
function sqlText(query: { text: string }): string {
  return query.text.replace(/\s+/g, ' ').trim();
}

const row = (articleId: string, similarity: number) => ({
  articleId,
  title: articleId,
  summary: null,
  translatedTitle: null,
  publishedAt: new Date('2026-10-01T00:00:00.000Z'),
  sourceId: 'source-1',
  qualityScore: 80,
  sourceName: 'Source',
  thumbnail: null,
  embeddingKey: 'summary',
  similarity,
  tags: [],
});

function createDb(rows: unknown[] = []) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $transaction: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
}

describe('article-knn', () => {
  describe('buildArticleKnnQuery', () => {
    it('DB 関数を、定義どおりの型と順番の引数で呼ぶ', () => {
      const query = buildArticleKnnQuery(params);

      expect(sqlText(query)).toBe(
        'SELECT * FROM related_articles_knn( $1::text, $2::text, $3::integer, $4::integer, $5::double precision )'
      );
      expect(query.values).toEqual([
        params.articleId,
        params.model,
        params.version,
        params.topK,
        params.similarityThreshold,
      ]);
    });
  });

  describe('runArticleKnn', () => {
    it('1 回の問い合わせで済ませる（設定・トランザクションを送らない）', async () => {
      const db = createDb();

      await runArticleKnn(db as never, params);

      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('公開日を Date にそろえる（文字列で返っても）', async () => {
      const db = createDb([
        { ...row('article-2', 0.8), publishedAt: '2026-10-01T00:00:00.000Z' },
      ]);

      const results = await runArticleKnn(db as never, params);

      expect(results[0].publishedAt).toEqual(
        new Date('2026-10-01T00:00:00.000Z')
      );
    });

    it('類似度の高い順に並べ替える（relaxed_order では距離の順が前後し得る）', async () => {
      const db = createDb([row('b', 0.7), row('a', 0.9), row('c', 0.6)]);

      const results = await runArticleKnn(db as never, params);

      expect(results.map((r) => r.articleId)).toEqual(['a', 'b', 'c']);
    });

    it('問い合わせが失敗したら投げる（呼び出し側がタグの関連記事に切り替える）', async () => {
      const db = createDb();
      db.$queryRaw.mockRejectedValueOnce(new Error('function failed'));

      await expect(runArticleKnn(db as never, params)).rejects.toThrow(
        'function failed'
      );
    });
  });
});
