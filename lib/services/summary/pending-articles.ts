/**
 * 要約を作る対象の記事の選び方と、本文の判定を書き込むときの条件。
 *
 * generate（summary-manager.ts）・新着の確認（batch-processor.ts の checkNewArticles）・
 * missing（summary-orchestrator.ts）で同じ条件を使う。新着の確認と generate の条件がずれると、
 * 確認が「新着なし」を返して generate が黙って止まるため。
 */
import type { Prisma } from '@/lib/prisma-exports';

/**
 * 要約が無く、skipReason も付いていない記事のうち、期間内に取り込んだか本文を更新した記事。
 *
 * 期間を公開日時（publishedAt）で切ると、公開から日が経って取り込まれた記事や、後から本文を
 * 回復した記事は、1回目の要約（記事 ID 指定）に失敗すると二度と再試行されない。
 * 本文を後から書かない経路（手動追加・POST /api/articles）は contentUpdatedAt が NULL なので、
 * createdAt との OR にする。
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

/**
 * 本文なし・本文不足の skipReason を書き込むときの条件。
 *
 * 記事を読んだ後に別の処理（毎時の収集の本文の補完・回復）が本文を書いていたら、古い判定で
 * skipReason を付けない。付けると、本文があるのに要約の対象から外れたままになる。
 * 本文を書く経路は contentUpdatedAt を進める（scripts/scheduled/collect-feeds.ts など）。
 */
export function contentUnchangedSinceWhere(
  readAt: Date
): Prisma.ArticleWhereInput {
  return {
    OR: [{ contentUpdatedAt: null }, { contentUpdatedAt: { lte: readAt } }],
  };
}
