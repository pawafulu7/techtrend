/**
 * スキップ理由抽出ユーティリティ
 * 要約生成のエラーメッセージからskipReasonを抽出
 */

import type { SkipReason as PrismaSkipReason } from '@prisma/client';

export type SkipReason = PrismaSkipReason;

/**
 * エラーメッセージからスキップ理由を抽出
 * @param error エラーオブジェクトまたはメッセージ
 * @returns スキップ理由（NULL = 通常のエラー、スキップではない）
 */
export function extractSkipReason(error: unknown): SkipReason | null {
  const msg = error instanceof Error ? error.message : String(error);

  if (msg.includes('SKIP_GENERATION:PDF')) return 'PDF';
  if (msg.includes('SKIP_GENERATION:SLIDE')) return 'SLIDE';
  if (msg.includes('SKIP_GENERATION:THIN_CONTENT')) return 'THIN_CONTENT';
  if (msg.includes('QUALITY_FAILED')) return 'QUALITY_FAILED';
  if (msg.includes('Failed to fetch content') || msg.includes('CONTENT_FETCH_FAILED')) return 'CONTENT_FETCH_FAILED';

  return null;
}

/**
 * スキップ理由の日本語ラベルを取得
 * @param reason スキップ理由
 * @returns 日本語ラベル
 */
export function getSkipReasonLabel(reason: SkipReason): string {
  const labels: Record<SkipReason, string> = {
    'PDF': 'PDFファイル',
    'SLIDE': 'スライド資料',
    'THIN_CONTENT': 'コンテンツ不足',
    'CONTENT_FETCH_FAILED': 'コンテンツ取得失敗',
    'QUALITY_FAILED': '品質基準未達'
  };
  return labels[reason] || reason;
}
