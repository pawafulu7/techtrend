/**
 * Centroid Service
 *
 * 興味の分野の重心を作り直し、全記事の点数（interest-scores.ts）を書き直す。
 * scripts/scheduled/refresh-personalization.ts が週に 1 回呼ぶ。
 *
 * 重心は「分野の記事（分野に対応付けたタグを持つ記事）の要約の埋め込みの平均」から
 * 「全記事の要約の埋め込みの平均」を引いたもの。分野の記事の平均どうしは cos が 0.79〜0.96 と近く
 * （記事の多くが AI の話題で、どの分野の平均も全記事の平均に寄る）、分野の区別が付かなかった。
 * 全記事の平均を引くと最大 0.71 になる。埋め込みは長さ 1 にそろっているので、
 * cos で比べた順は「全記事の平均を引いた記事の埋め込み」との内積の順と同じになる
 */

import { PrismaClient } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  getInterestEmbedding,
  lockInterestScores,
  refreshAllInterestScores,
} from './interest-scores';

/** 重心の更新と全記事の点数の書き直しを 1 つのトランザクションで行うときの上限（開発 DB の 12 万記事で約 8 秒） */
const REFRESH_TRANSACTION_TIMEOUT_MS = 120_000;

/** 分野ごとの重心の計算結果 */
export interface CentroidRefreshCategoryResult {
  categoryId: string;
  slug: string;
  /** 重心の計算に使った記事の数。0 なら重心を消す（その分野には点数が付かない） */
  sampleCount: number;
}

export interface CentroidRefreshResult {
  categories: CentroidRefreshCategoryResult[];
  /** 書き直した点数の組の数 */
  scoreCount: number;
}

/** 重心の計算の SQL の結果 */
type RawCentroidRow = {
  category_id: string;
  centroid: string;
  sample_count: bigint;
};

export class CentroidService {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * 有効な分野の重心を作り直し、全記事の点数を書き直す。
   * 点数は重心から計算するので、両方を同じトランザクションで書く（途中で失敗したら両方とも前のまま）。
   * どの分野にも記事が無いときは、何も変えずに例外を投げる
   */
  async refreshCentroidsAndScores(): Promise<CentroidRefreshResult> {
    const { key, model, version } = getInterestEmbedding();

    return this.db.$transaction(
      async (tx) => {
        // 1 記事ずつの点数の書き直し（埋め込みのワーカー）と重ならないようにする
        await lockInterestScores(tx);

        const categories = await tx.interestCategory.findMany({
          where: { isActive: true },
          select: { id: true, slug: true },
        });

        // 同じ記事が分野のタグを複数持っていても、分野ごとに 1 回だけ数える
        const rows = await tx.$queryRaw<RawCentroidRow[]>`
          WITH category_articles AS (
            SELECT DISTINCT ON (tcm."categoryId", ae."articleId")
              tcm."categoryId" AS category_id,
              ae.embedding
            FROM "TagCategoryMapping" tcm
            INNER JOIN "_ArticleToTag" at ON at."B" = tcm."tagId"
            INNER JOIN "ArticleEmbedding" ae ON ae."articleId" = at."A"
            WHERE ae."embeddingKey" = ${key}::text::"EmbeddingKey"
              AND ae.model = ${model}
              AND ae.version = ${version}
          ),
          all_articles AS (
            SELECT AVG(embedding) AS mean
            FROM "ArticleEmbedding"
            WHERE "embeddingKey" = ${key}::text::"EmbeddingKey"
              AND model = ${model}
              AND version = ${version}
          )
          SELECT
            category_id,
            (AVG(embedding) - (SELECT mean FROM all_articles))::text AS centroid,
            COUNT(*) AS sample_count
          FROM category_articles
          GROUP BY category_id
        `;
        const centroidByCategory = new Map(
          rows.map((row) => [row.category_id, row])
        );
        // どの分野にも記事が無いのは、対応付けや埋め込みの不調。重心と点数を消さずに前のまま残す
        if (
          categories.length > 0 &&
          categories.every(
            (category) =>
              Number(centroidByCategory.get(category.id)?.sample_count ?? 0) ===
              0
          )
        ) {
          throw new Error('No category centroid could be computed');
        }

        const results: CentroidRefreshCategoryResult[] = [];
        for (const category of categories) {
          const row = centroidByCategory.get(category.id);
          const sampleCount = row ? Number(row.sample_count) : 0;
          if (!row || sampleCount === 0) {
            // 前の重心を残すと、別の作り方（全記事の平均を引く前）の重心が残ることがあり、
            // その分野にほぼ全記事が入ってしまう
            logger.warn(
              { categoryId: category.id, slug: category.slug },
              'No articles found for category centroid; clearing the centroid'
            );
            await tx.$executeRaw`
              UPDATE "InterestCategory"
              SET "centroidEmbedding" = NULL, "centroidComputedAt" = NULL, "updatedAt" = NOW()
              WHERE id = ${category.id}
            `;
          } else {
            await tx.$executeRaw`
              UPDATE "InterestCategory"
              SET
                "centroidEmbedding" = ${row.centroid}::vector,
                "centroidComputedAt" = NOW(),
                "updatedAt" = NOW()
              WHERE id = ${category.id}
            `;
          }
          results.push({
            categoryId: category.id,
            slug: category.slug,
            sampleCount,
          });
        }

        const scoreCount = await refreshAllInterestScores(tx);

        logger.info(
          {
            updatedCount: results.filter((r) => r.sampleCount > 0).length,
            scoreCount,
          },
          'Category centroids and interest scores refreshed'
        );

        return { categories: results, scoreCount };
      },
      { timeout: REFRESH_TRANSACTION_TIMEOUT_MS }
    );
  }
}

export const centroidService = new CentroidService();
