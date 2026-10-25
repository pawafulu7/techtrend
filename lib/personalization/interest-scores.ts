/**
 * 記事の興味の分野の点数（ArticleInterestScore）
 *
 * 点数は、記事の要約の埋め込みと分野の重心（centroid-service.ts）の cos 類似度。
 * しきい値以上の組だけを持ち、ホームの「興味の分野で絞り込む」とダイジェストの「あなたへのおすすめ」が使う。
 * 埋め込みを作ったとき（article-embedding-pipeline.ts）に 1 記事ずつ書き、重心を作り直したとき
 * （scripts/scheduled/refresh-personalization.ts）に全記事を書き直す。
 * 要約を消して埋め込みが消えると、外部キーの CASCADE で点数も消える
 */

import { Prisma, PrismaClient } from '@/lib/prisma-exports';
import { env } from '@/lib/config/env';

/**
 * 分野に入るとみなす点数の下限。開発 DB の直近 7 日の記事（技術者向けは 1 日約 290 件）で、この値の付近の記事は
 * おおむね分野に合い、1 日あたり AI/ML 73・Security 40・Cloud 17・DevOps 15・Frontend 9・Database 5・Backend 3 件。
 * 0.25 まで下げると合わない記事が目立った。
 * prisma/migrations/20261025090000_add_article_interest_score の初期データも同じ値で作っている
 */
export const INTEREST_SCORE_THRESHOLD = 0.3;

/**
 * 重心と点数に使う埋め込み（記事の要約の埋め込み）。モデルと版は、埋め込みを書くワーカー
 * （article-embedding-pipeline.ts）と同じ設定を使う（ずれると新しい記事に点数が付かない）
 */
export function getInterestEmbedding(): {
  key: 'summary';
  model: string;
  version: number;
} {
  return {
    key: 'summary',
    model: env.RAG_ACTIVE_MODEL || 'text-embedding-3-small',
    version: env.RAG_ACTIVE_VERSION,
  };
}

/**
 * 点数を書く処理どうしのロック（pg_advisory_xact_lock のキー）。全記事の書き直しは排他、1 記事の書き直しは
 * 共有で取る。取らないと、全記事の書き直しの途中に 1 記事の書き直しが前の重心で点数を書き、
 * 新しい重心ではしきい値を下回る組が次の書き直しまで残る
 */
const INTEREST_SCORE_LOCK = Prisma.sql`hashtext('ArticleInterestScore')`;

/**
 * 点数を書く SELECT（"articleId", "categoryId", "embeddingId", score）。
 * 有効な分野のうち、重心のあるものだけを使う。重心がゼロのベクトルだと cos が NaN になり、
 * PostgreSQL では NaN がどの数より大きく並んでしきい値を通るので除く
 */
function scoreRows(articleFilter: Prisma.Sql): Prisma.Sql {
  const { key, model, version } = getInterestEmbedding();
  return Prisma.sql`
    SELECT "articleId", "categoryId", "embeddingId", score
    FROM (
      SELECT
        e."articleId",
        c.id AS "categoryId",
        e.id AS "embeddingId",
        1 - (e.embedding <=> c."centroidEmbedding") AS score
      FROM "ArticleEmbedding" e
      CROSS JOIN "InterestCategory" c
      WHERE e."embeddingKey" = ${key}::text::"EmbeddingKey"
        AND e.model = ${model}
        AND e.version = ${version}
        AND c."isActive" = true
        AND c."centroidEmbedding" IS NOT NULL
        ${articleFilter}
    ) s
    WHERE s.score >= ${INTEREST_SCORE_THRESHOLD}
      AND s.score <> 'NaN'::float8
  `;
}

/**
 * 点数を書く INSERT。マイグレーションの初期データなどと同じ組がありうるので、既にある組は上書きする
 */
function insertScores(articleFilter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "ArticleInterestScore" ("articleId", "categoryId", "embeddingId", score)
    ${scoreRows(articleFilter)}
    ON CONFLICT ("articleId", "categoryId")
    DO UPDATE SET "embeddingId" = EXCLUDED."embeddingId", score = EXCLUDED.score
  `;
}

/**
 * 1 記事の点数を書き直す（埋め込みを作り直したとき）。書いた組の数を返す
 */
export async function refreshInterestScoresForArticle(
  db: PrismaClient,
  articleId: string
): Promise<number> {
  const [, , inserted] = await db.$transaction([
    // 戻り値が void の関数は $queryRaw で受け取れないので $executeRaw で呼ぶ
    db.$executeRaw`SELECT pg_advisory_xact_lock_shared(${INTEREST_SCORE_LOCK})`,
    db.$executeRaw`DELETE FROM "ArticleInterestScore" WHERE "articleId" = ${articleId}`,
    db.$executeRaw(insertScores(Prisma.sql`AND e."articleId" = ${articleId}`)),
  ]);
  return inserted;
}

/**
 * 全記事の点数を書き直す処理のロックを取る。重心を読む前に、重心の更新と同じトランザクションで呼ぶ
 */
export async function lockInterestScores(
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INTEREST_SCORE_LOCK})`;
}

/**
 * 全記事の点数を書き直す（重心を作り直したとき）。lockInterestScores と重心の更新の後に、
 * 同じトランザクションで呼ぶ。書いた組の数を返す
 */
export async function refreshAllInterestScores(
  tx: Prisma.TransactionClient
): Promise<number> {
  await tx.$executeRaw`DELETE FROM "ArticleInterestScore"`;
  return tx.$executeRaw(insertScores(Prisma.empty));
}
