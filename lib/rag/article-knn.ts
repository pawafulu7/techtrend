/**
 * 記事に内容が近い記事の kNN（関連記事・関係グラフ。pgvector の部分 HNSW）
 *
 * 類似度の式で並べ替えて閾値で絞る厳密な検索は HNSW を使えず、summary の埋め込みを全件読む
 * （開発 DB の 11.6 万件で 4 秒、本番の初回は 42 秒かかった）。ここでは DB 関数
 * `related_articles_knn`（prisma/migrations/20261010150000_add_related_articles_knn_function）を呼ぶ。
 * 関数は距離で並べて上位 k 件を部分 HNSW から読み、閾値はその外で掛ける。計画の固定・HNSW の設定・
 * 基準の記事の埋め込みの取得を関数の中に持つので、往復は 1 回で済む。HNSW は近似なので、厳密な検索と
 * 同じ結果になる保証はない（設定と一致率は関数のコメントを参照）。
 * pgvector 0.8 未満（iterative scan が無い）では使わない（呼び出し側が厳密な検索を使う）
 *
 * 並べ替えは取得後に行う。relaxed_order の iterative scan は距離の順が前後し得るが、関数の中で
 * 並べ直すと、計画の固定（enable_sort=off）の Sort になる。返すのは最大 k 件なので JS で並べる
 */

import { PrismaClient, Prisma } from '@/lib/prisma-exports';
import type { SearchResult } from './vector-search-service';

export type ArticleKnnParams = {
  /** 基準の記事（結果から除く。埋め込みは関数の中で引く） */
  articleId: string;
  model: string;
  version: number;
  topK: number;
  similarityThreshold: number;
};

/** timestamptz は Date で返るが、型の上では文字列も受けて Date にそろえる（既存の検索と同じ扱い） */
type RawArticleKnnRow = Omit<SearchResult, 'publishedAt'> & {
  publishedAt: Date | string;
};

/** kNN のクエリを組み立てる（実行はしない）。引数の型は関数の定義に合わせて明示する */
export function buildArticleKnnQuery(params: ArticleKnnParams): Prisma.Sql {
  const { articleId, model, version, topK, similarityThreshold } = params;

  return Prisma.sql`
    SELECT * FROM related_articles_knn(
      ${articleId}::text,
      ${model}::text,
      ${version}::integer,
      ${topK}::integer,
      ${similarityThreshold}::double precision
    )
  `;
}

/** kNN を実行する（1 回の往復。トランザクションは使わない） */
export async function runArticleKnn(
  db: PrismaClient,
  params: ArticleKnnParams
): Promise<SearchResult[]> {
  const rows = await db.$queryRaw<RawArticleKnnRow[]>(
    buildArticleKnnQuery(params)
  );

  return rows
    .map((row) => ({ ...row, publishedAt: new Date(row.publishedAt) }))
    .sort((a, b) => b.similarity - a.similarity);
}
