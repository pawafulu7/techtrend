/**
 * 記事に内容が近い記事の kNN（関連記事・関係グラフ。pgvector の部分 HNSW）
 *
 * 類似度の式で並べ替えて閾値で絞る厳密な検索は HNSW を使えず、summary の埋め込みを全件読む
 * （開発 DB の 11.6 万件で 4 秒、本番の初回は 42 秒かかった）。ここでは距離で並べ替えて上位 k 件を
 * HNSW から読み、閾値はその外で掛ける。HNSW は近似なので、厳密な検索と同じ結果になる保証はない
 * （開発 DB の 20 記事では、上位 20 件が 364 件中 364 件一致した）。
 *
 * 非表示・無効なソース・自分自身・モデルの条件は kNN の中で掛け、iterative scan で条件に合う行を
 * k 件まで読み進める。閾値を中に入れると、閾値を満たす行が k 件に満たない記事で
 * `hnsw.max_scan_tuples` まで読み続けるので、外に置く。
 * 設定は Stage 1 と同じ（`ITERATIVE_KNN_SETTINGS_SQL`）で、クエリと同じトランザクションに掛ける。
 * pgvector 0.8 未満（iterative scan が無い）では使わない（呼び出し側が厳密な検索を使う）
 *
 * 並べ替えは SQL ではなく取得後に行う。relaxed_order の iterative scan は距離の順が前後し得るが、
 * 外側の `ORDER BY distance` は内側の並びで満たされたとみなされて省かれる。省かれないように
 * MATERIALIZED CTE で並べ直すと、計画の固定（enable_sort=off）で Sort のコストが跳ね上がり、
 * JIT のコンパイルに 100〜180ms かかる（開発 DB。JIT を切ると 3.5ms）。返すのは最大 k 件なので、
 * JS で並べ替える
 */

import { PrismaClient, Prisma } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';
import { enabledSourceSql } from '@/lib/database/enabled-source-filter';
import { ITERATIVE_KNN_SETTINGS_SQL } from '@/lib/personalization/filters/stage1-knn';
import type { SearchResult } from './vector-search-service';

export type ArticleKnnParams = {
  /** 基準の記事の埋め込み（`[v1,v2,...]`） */
  vectorString: string;
  /** 基準の記事（結果から除く） */
  excludeArticleId: string;
  model: string;
  version: number;
  topK: number;
  similarityThreshold: number;
};

/** Prisma の interactive transaction の maxWait の既定値 */
const PRISMA_DEFAULT_MAX_WAIT_MS = 2000;

/** timestamptz は Date で返るが、型の上では文字列も受けて Date にそろえる（既存の検索と同じ扱い） */
type RawArticleKnnRow = Omit<SearchResult, 'publishedAt'> & {
  publishedAt: Date | string;
};

/** kNN のクエリを組み立てる（実行はしない） */
export function buildArticleKnnQuery(params: ArticleKnnParams): Prisma.Sql {
  const {
    vectorString,
    excludeArticleId,
    model,
    version,
    topK,
    similarityThreshold,
  } = params;

  return Prisma.sql`
    SELECT
      nn."articleId",
      nn.title,
      nn.summary,
      nn."translatedTitle",
      nn."publishedAt",
      nn."sourceId",
      nn."qualityScore",
      s.name AS "sourceName",
      nn.thumbnail,
      nn."embeddingKey",
      1 - nn.distance AS similarity,
      COALESCE(tags.tag_list, '[]'::jsonb) AS tags
    FROM (
      SELECT
        a.id AS "articleId",
        a.title,
        a.summary,
        a."translatedTitle",
        a."publishedAt",
        a."sourceId",
        a."qualityScore",
        a.thumbnail,
        e."embeddingKey",
        e.embedding <=> ${vectorString}::vector AS distance
      FROM "ArticleEmbedding" e
      INNER JOIN "Article" a ON a.id = e."articleId"
      WHERE e."embeddingKey" = 'summary'::"EmbeddingKey"
        AND e.model = ${model}
        AND e.version = ${version}
        AND a."isHidden" = false
        AND ${enabledSourceSql()}
        AND a.id != ${excludeArticleId}
      -- 別名で並べる（式をもう一度書くと、約 18KB のベクトルを 2 回送る。どちらも部分 HNSW を使う）
      ORDER BY distance
      LIMIT ${topK}
    ) nn
    LEFT JOIN "Source" s ON s.id = nn."sourceId"
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name)) AS tag_list
      FROM "_ArticleToTag" at
      JOIN "Tag" t ON t.id = at."B"
      WHERE at."A" = nn."articleId"
    ) tags ON TRUE
    WHERE 1 - nn.distance >= ${similarityThreshold}
  `;
}

/**
 * kNN を実行する。設定とクエリは同じトランザクション（同じ接続）で流す。
 * 関係グラフの 2 階層目は記事ごとに並列で呼ぶ（API は 150 件まで受け付ける）ので、接続を待つ時間は
 * トランザクションの既定（2 秒）ではなく、トランザクションを使わないクエリと同じプールの待ち時間にする。
 * ただし既定より短くはしない（DB_POOL_TIMEOUT=0 は pg では無制限だが、Prisma は maxWait=0 を受け付けない）
 */
export async function runArticleKnn(
  db: PrismaClient,
  params: ArticleKnnParams
): Promise<SearchResult[]> {
  const rows = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(ITERATIVE_KNN_SETTINGS_SQL);
      return tx.$queryRaw<RawArticleKnnRow[]>(buildArticleKnnQuery(params));
    },
    {
      maxWait: Math.max(env.DB_POOL_TIMEOUT * 1000, PRISMA_DEFAULT_MAX_WAIT_MS),
    }
  );

  return rows
    .map((row) => ({ ...row, publishedAt: new Date(row.publishedAt) }))
    .sort((a, b) => b.similarity - a.similarity);
}
