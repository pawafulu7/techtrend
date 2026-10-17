/**
 * 記事の本文を補った・差し替えたときに、要約まわりをどう戻すか（DB に触らない判定だけ）。
 *
 * 毎時の収集（collect-feeds.ts・content-recovery.ts）と保守スクリプト（enrich-single-article.ts・
 * enrich-corporate-blog-content.ts・re-enrich-content.ts）で同じ扱いにする。
 */
import { Prisma, SkipReason } from '@/lib/prisma-exports';
import { isHighQuality } from '@/lib/enrichers/strategies/quality';

/**
 * 本文の有無と無関係の恒久的なスキップ理由。本文が入っても戻さない。
 * ID 指定の generateSummaries は skipReason: null を要求しないため、戻すと恒久スキップの
 * 記事が生成経路に入ってしまう
 */
export const PERMANENT_SKIP_REASONS: SkipReason[] = [
  SkipReason.PDF,
  SkipReason.SLIDE,
];

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

function isPermanentSkipReason(skipReason: SkipReason | null): boolean {
  return skipReason !== null && PERMANENT_SKIP_REASONS.includes(skipReason);
}

/**
 * エンリッチ済みコンテンツが保存に足る品質かを判定する。
 * 新規保存経路（500文字以上は無条件、250-499文字は isHighQuality 必須）と
 * 同一基準を、既存記事の自己修復経路・保守スクリプトでも適用するための共通ヘルパー。
 */
export function isAcceptableEnrichedContent(content: string): boolean {
  return content.length >= 500 || (content.length >= 250 && isHighQuality(content));
}

/**
 * エンリッチャーで本文を回復したときに、要約まわりを戻す内容。PDF / SLIDE は戻さない（null）。
 * skipReason が null で summaryError だけ残るケース（一時的な要約失敗）も戻すため truthy 判定はしない
 */
export function summaryResetOnContentRecovery(
  skipReason: SkipReason | null
): typeof SUMMARY_RESET | null {
  return isPermanentSkipReason(skipReason) ? null : SUMMARY_RESET;
}

/**
 * 保守スクリプトで本文を取り直したときの、要約まわりの更新内容。
 * - PDF / SLIDE は何も戻さない
 * - それ以外は、旧本文から作った要約を消す（新しい本文と食い違うため）
 * - 本文が原因の skipReason・summaryError は、新しい本文が保存の基準（isAcceptableEnrichedContent）を
 *   満たすときだけ消す。基準なしで消すと、要約の対象に戻っても本文が短すぎて THIN_CONTENT が
 *   付き直す往復になる
 */
export function summaryUpdatesForReplacedContent(
  skipReason: SkipReason | null,
  content: string
): Prisma.ArticleUpdateManyMutationInput {
  if (isPermanentSkipReason(skipReason)) return {};
  if (isAcceptableEnrichedContent(content)) return SUMMARY_RESET;
  return {
    summary: null,
    detailedSummary: null,
    summaryVersion: 0,
    summaryComputedAt: null,
  };
}
