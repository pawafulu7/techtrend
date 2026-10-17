/**
 * 毎時の収集（collect-feeds.ts）で、本文の無い既存記事に後から本文が入ったときの扱い。
 *
 * 本文が無いときに付いた skipReason（CONTENT_FETCH_FAILED など）を残すと、本文があるのに
 * 要約の対象から外れたままになる。本文が入ったら印を戻し、ID 指定の要約（newArticleIds）に積む。
 * 要約まわりをどう戻すかの判定は summary-reset.ts。
 */
import { prisma } from '@/lib/prisma';
import { validateArticleContent } from '@/lib/services/summary/summary-orchestrator';
import { PERMANENT_SKIP_REASONS, SUMMARY_RESET } from './summary-reset';

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
 * フィード本文で、本文の無い既存記事を補う。補えたら true を返す。
 *
 * 並行実行中の他ソースが既に本文を確定させていないことを CAS で確認してから反映する（existing は
 * バッチ先頭の一括取得時点のスナップショットで古い可能性があるため。エンリッチャー自己修復経路と
 * 同一の保護方式）。
 *
 * 補えた記事のうち、要約が無く、本文が要約に足りる長さなら、本文が無いことで付いた印を戻して
 * summaryQueue に積む。要約がある記事は戻さない（短い本文で作り直そうとして失敗すると、要約を
 * 消したまま戻せなくなる）。PDF / SLIDE も戻さない。どちらも DB の条件で判定し、取得時点の
 * スナップショットには頼らない。
 *
 * 本文の書き込みと印の戻しは1つのトランザクションで行う。本文だけが書かれて印が残ると、
 * 次の収集は本文があるので補完せず、要約の対象（skipReason が NULL）にも入らないまま残るため
 */
export async function fillExistingContentFromFeed(
  existing: { id: string; thumbnail: string | null },
  article: { content: string; thumbnail?: string },
  summaryQueue: string[]
): Promise<boolean> {
  const resetSummary = validateArticleContent({ content: article.content }).valid;

  const { filled, reset } = await prisma.$transaction(async (tx) => {
    const { count } = await tx.article.updateMany({
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
    if (count === 0 || !resetSummary) {
      return { filled: count > 0, reset: false };
    }

    const { count: resetCount } = await tx.article.updateMany({
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
    return { filled: true, reset: resetCount > 0 };
  });

  // 積むのはコミットの後（トランザクションが失敗したら積まない）
  if (reset) summaryQueue.push(existing.id);
  return filled;
}
