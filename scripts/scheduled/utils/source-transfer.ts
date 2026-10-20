/**
 * 毎時の収集（collect-feeds.ts）で、既存記事を、同じ URL を取った出し手のソースへ付け替える。
 * 付け替えるかの判定は lib/fetchers/source-transfer.ts（arXiv の fetcher も使う）。
 */
import { prisma } from '@/lib/prisma';
import { shouldTransferSource } from '@/lib/fetchers/source-transfer';

/**
 * 付け替えが要る記事なら付け替え、付け替えたかを返す。
 *
 * existing はバッチ先頭の一括取得時点のスナップショットで古いことがあるので、読んだ時点の sourceId の
 * ままのときだけ書き換える（同じ実行で別の出し手が先に付け替えていたら、上書きしない）。
 * 品質スコアはソース名で重みが変わるので、次の採点の対象に戻す
 * （scripts/scheduled/manage-quality-scores.ts は qualityScoreComputedAt が null の記事を採点する）
 */
export async function transferSourceIfNeeded(
  existing: { id: string; sourceId: string },
  sourceId: string
): Promise<boolean> {
  if (!shouldTransferSource(existing.sourceId, sourceId)) return false;
  const { count } = await prisma.article.updateMany({
    where: { id: existing.id, sourceId: existing.sourceId },
    data: { sourceId, qualityScoreComputedAt: null },
  });
  return count > 0;
}
