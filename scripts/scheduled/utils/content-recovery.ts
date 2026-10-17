/**
 * 毎時の収集（collect-feeds.ts）で、本文の無い既存記事に後から本文が入ったときの扱い。
 *
 * 本文が無いときに付いた skipReason（CONTENT_FETCH_FAILED など）を残すと、本文があるのに
 * 要約の対象から外れたままになる。本文が入ったら印を戻し、ID 指定の要約（newArticleIds）に積む。
 */
import { Prisma, SkipReason } from '@/lib/prisma-exports';
import { prisma } from '@/lib/prisma';
import { validateArticleContent } from '@/lib/services/summary/summary-orchestrator';

/**
 * 本文の有無と無関係の恒久的なスキップ理由。本文が入っても戻さない。
 * ID 指定の generateSummaries は skipReason: null を要求しないため、戻すと恒久スキップの
 * 記事が生成経路に入ってしまう
 */
const PERMANENT_SKIP_REASONS: SkipReason[] = [SkipReason.PDF, SkipReason.SLIDE];

/**
 * 要約まわりを戻す内容。enrich-thin-content.ts の本文回復時と同じ流儀。
 * 一覧は summaryComputedAt で要約済みかを見るので、これも戻す（残すと、要約を消した記事が
 * 要約の無いまま一覧に出る）
 */
export const SUMMARY_RESET = {
  skipReason: null,
  summaryError: null,
  summary: null,
  detailedSummary: null,
  summaryVersion: 0,
  summaryComputedAt: null,
} satisfies Prisma.ArticleUpdateManyMutationInput;

/** 表示・保存してよいサムネイル URL か（http / https だけ） */
export function isValidThumbnailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * エンリッチャーで本文を回復したときに、要約まわりを戻す内容。PDF / SLIDE は戻さない（null）。
 * skipReason が null で summaryError だけ残るケース（一時的な要約失敗）も戻すため truthy 判定はしない
 */
export function summaryResetOnContentRecovery(
  skipReason: SkipReason | null
): typeof SUMMARY_RESET | null {
  return skipReason !== null && PERMANENT_SKIP_REASONS.includes(skipReason)
    ? null
    : SUMMARY_RESET;
}

/**
 * フィード本文で、本文の無い既存記事を補う。補えたら true を返す。
 *
 * 並行実行中の他ソースが既に本文を確定させていないことを CAS で確認してから反映する（existing は
 * バッチ先頭の一括取得時点のスナップショットで古い可能性があるため。エンリッチャー自己修復経路と
 * 同一の保護方式）。
 *
 * 補えた記事のうち、要約が無く、本文が要約に足りる長さなら、本文が無いことで付いた印を戻して
 * summaryQueue に積む。要約がある記事は戻さない（短い本文で作り直そうとして失敗すると、要約を
 * 消したまま戻せなくなる）。PDF / SLIDE も戻さない。どちらも DB の条件で判定し、取得時点の
 * スナップショットには頼らない
 */
export async function fillExistingContentFromFeed(
  existing: { id: string; thumbnail: string | null },
  article: { content: string; thumbnail?: string },
  summaryQueue: string[]
): Promise<boolean> {
  const { count } = await prisma.article.updateMany({
    where: {
      id: existing.id,
      OR: [{ contentLength: null }, { contentLength: 0 }],
    },
    data: {
      content: article.content,
      thumbnail: isValidThumbnailUrl(article.thumbnail)
        ? article.thumbnail
        : existing.thumbnail,
      contentUpdatedAt: new Date(),
    },
  });
  if (count === 0) return false;

  if (!validateArticleContent({ content: article.content }).valid) return true;

  const { count: resetCount } = await prisma.article.updateMany({
    where: {
      id: existing.id,
      OR: [{ summary: null }, { summary: '' }],
      AND: [
        {
          OR: [
            { skipReason: null },
            { skipReason: { notIn: PERMANENT_SKIP_REASONS } },
          ],
        },
      ],
    },
    data: SUMMARY_RESET,
  });
  if (resetCount > 0) summaryQueue.push(existing.id);
  return true;
}
