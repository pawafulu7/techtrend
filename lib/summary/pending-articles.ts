/**
 * 要約を作る対象の記事の選び方と、本文の判定を書き込む処理。
 *
 * generate（summary-manager.ts）・新着の確認（batch-processor.ts の checkNewArticles）・
 * missing（summary-orchestrator.ts）で同じ条件を使う。新着の確認と generate の条件がずれると、
 * 確認が「新着なし」を返して generate が黙って止まるため。
 */
import type { Prisma, PrismaClient, SkipReason } from '@/lib/prisma-exports';

/**
 * 要約が無く、skipReason も付いていない記事のうち、期間内に取り込んだか本文を更新した記事。
 *
 * 期間を公開日時（publishedAt）で切ると、公開から日が経って取り込まれた記事や、後から本文を
 * 回復した記事は、1回目の要約（記事 ID 指定）に失敗すると二度と再試行されない。
 * 本文を後から書かない経路（手動追加）は contentUpdatedAt が NULL なので、createdAt との OR にする。
 */
export function pendingSummaryWhere(
  days: number,
  now: Date = new Date()
): Prisma.ArticleWhereInput {
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return {
    OR: [{ summary: null }, { summary: '' }],
    skipReason: null,
    AND: [
      {
        OR: [{ createdAt: { gte: from } }, { contentUpdatedAt: { gte: from } }],
      },
    ],
  };
}

/** 期間の基準（取り込み日時）にそろえた並び順。新しく取り込んだ記事から処理する */
export const PENDING_SUMMARY_ORDER_BY: Prisma.ArticleOrderByWithRelationInput =
  { createdAt: 'desc' };

/**
 * 本文なし・本文不足の skipReason を書き込む。
 *
 * 記事を読んだ後に別の処理（毎時の収集の本文の補完・回復、記事の編集）が本文を書いていたら、
 * 古い判定で印を付けない。付けると、本文があるのに要約の対象から外れたままになる。
 * 本文の長さ（contentLength。DB のトリガーが CHAR_LENGTH(content) を保つ列）が読んだときと同じ
 * 記事だけを更新する。書き込む側の経路や時計に左右されないよう、時刻ではなく本文の状態で比べる。
 */
export async function recordContentSkipReasons(
  prisma: Pick<PrismaClient, 'article'>,
  articles: ReadonlyArray<{ id: string; contentLength: number | null }>,
  skipReason: SkipReason
): Promise<void> {
  await Promise.all(
    articles.map((article) =>
      prisma.article.updateMany({
        where: {
          id: article.id,
          OR: [{ summary: null }, { summary: '' }],
          contentLength: article.contentLength,
        },
        data: { skipReason, summaryError: null },
      })
    )
  );
}
